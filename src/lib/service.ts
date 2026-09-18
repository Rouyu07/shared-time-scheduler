import { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { matches, hashToken, newToken, type Session } from "./auth";
import { createSchema, nameSchema, meetingSchema } from "./validation";
import {
  slotGrid,
  recommend,
  bestOf,
  wallInstant,
  type Rules,
} from "./scheduling";
import { z } from "zod";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const graph = {
  participants: {
    orderBy: { joinedAt: "asc" as const },
    include: { availabilities: true },
  },
  candidateTimes: { orderBy: { startAt: "asc" as const } },
  votes: true,
  comments: { orderBy: { createdAt: "asc" as const } },
  meeting: true,
} satisfies Prisma.ScheduleInclude;
type Full = Prisma.ScheduleGetPayload<{ include: typeof graph }>;
export const rulesOf = (s: Full): Rules => ({
  startDate: s.startDate.toISOString().slice(0, 10),
  endDate: s.endDate.toISOString().slice(0, 10),
  dailyStartTime: s.dailyStartTime.toISOString().slice(11, 16),
  dailyEndTime: s.dailyEndTime.toISOString().slice(11, 16),
  durationMinutes: s.durationMinutes,
  timezone: s.timezone,
});
export function resultsOf(s: Full) {
  return recommend(
    rulesOf(s),
    s.participants.map((p) => ({
      id: p.id,
      name: p.name,
      submitted: !!p.availabilitySubmittedAt,
      slots: p.availabilities.map((a) => a.startAt.toISOString()),
    })),
    s.expectedParticipants,
  );
}
function participantOf(s: Full, session: Session) {
  return s.participants.find((p) =>
    matches(session.participant, p.participantTokenHash),
  );
}
function requireParticipant(s: Full, session: Session) {
  const p = participantOf(s, session);
  if (!p)
    throw new AppError("請先加入排程；若已清除 Cookie，無法辨識原身分。", 401);
  return p;
}
function requireAdmin(s: Full, session: Session) {
  if (!matches(session.admin, s.adminTokenHash))
    throw new AppError("需要有效的管理連結或管理 Cookie。", 403);
}
function writable(s: Full) {
  if (s.status === "CONFIRMED" || s.status === "CANCELLED")
    throw new AppError("此排程已鎖定，無法再修改。", 409);
}
function collecting(s: Full) {
  if (s.status !== "COLLECTING")
    throw new AppError("已進入投票或排程結束，可行時間已鎖定。", 409);
  if (s.deadline && s.deadline <= new Date())
    throw new AppError("填寫截止時間已過。", 409);
}
export async function getSchedule(id: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id))
    throw new AppError("找不到排程。", 404);
  const s = await db.schedule.findUnique({
    where: { publicId: id },
    include: graph,
  });
  if (!s) throw new AppError("找不到排程。", 404);
  return s;
}
export function present(s: Full, session: Session) {
  const p = participantOf(s, session);
  const results = resultsOf(s);
  return {
    publicId: s.publicId,
    title: s.title,
    creatorName: s.creatorName,
    description: s.description,
    ...rulesOf(s),
    expectedParticipants: s.expectedParticipants,
    deadline: s.deadline?.toISOString() ?? null,
    status: s.status,
    votingClosedAt: s.votingClosedAt?.toISOString() ?? null,
    isAdmin: matches(session.admin, s.adminTokenHash),
    me: p
      ? {
          id: p.id,
          name: p.name,
          slots: p.availabilities.map((a) => a.startAt.toISOString()),
          submitted: !!p.availabilitySubmittedAt,
          submittedAt: p.availabilitySubmittedAt?.toISOString() ?? null,
        }
      : null,
    participants: s.participants.map((p) => ({
      id: p.id,
      name: p.name,
      submitted: !!p.availabilitySubmittedAt,
      submittedAt: p.availabilitySubmittedAt?.toISOString() ?? null,
    })),
    grid: slotGrid(rulesOf(s)),
    results,
    best: bestOf(results),
    candidates: s.candidateTimes.map((c) => ({
      id: c.id,
      startAt: c.startAt.toISOString(),
      endAt: c.endAt.toISOString(),
      votes: s.votes.filter((v) => v.candidateTimeId === c.id).length,
    })),
    myVote:
      s.votes.find((v) => v.participantId === p?.id)?.candidateTimeId ?? null,
    voted: s.votes.length,
    comments: s.comments.map((c) => ({
      id: c.id,
      participantId: c.participantId,
      name: s.participants.find((p) => p.id === c.participantId)?.name ?? "",
      role:
        c.participantId === s.participants[0]?.id ? "建立者" : "參與者",
      content: c.content,
      createdAt: c.createdAt.toISOString(),
    })),
    meeting: s.meeting
      ? {
          startAt: s.meeting.startAt.toISOString(),
          endAt: s.meeting.endAt.toISOString(),
          location: s.meeting.location,
          meetingUrl: s.meeting.meetingUrl,
          description: s.meeting.description,
          reminderMinutes: s.meeting.reminderMinutes,
          confirmedAt: s.meeting.confirmedAt.toISOString(),
        }
      : null,
  };
}
export type ScheduleView = ReturnType<typeof present>;

// All schedule mutations share the same row lock. This serializes capacity checks,
// last submissions, voting, cancellation and confirmation across every app instance.
async function mutate<T>(
  id: string,
  fn: (tx: Prisma.TransactionClient, s: Full) => Promise<T>,
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      const found = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM schedules WHERE public_id = ${id} FOR UPDATE`;
      if (!found.length) throw new AppError("找不到排程。", 404);
      const s = await tx.schedule.findUniqueOrThrow({
        where: { id: found[0].id },
        include: graph,
      });
      return fn(tx, s);
    },
    { maxWait: 10000, timeout: 30000 },
  );
}
export async function createSchedule(input: unknown) {
  const v = createSchema.parse(input);
  const publicId = newToken().slice(0, 22),
    admin = newToken(),
    participant = newToken();
  const data = {
    title: v.title,
    creatorName: v.creatorName,
    description: v.description,
    expectedParticipants: v.expectedParticipants,
    startDate: new Date(`${v.startDate}T00:00:00Z`),
    endDate: new Date(`${v.endDate}T00:00:00Z`),
    dailyStartTime: new Date(`1970-01-01T${v.dailyStartTime}:00Z`),
    dailyEndTime: new Date(`1970-01-01T${v.dailyEndTime}:00Z`),
    durationMinutes: v.durationMinutes,
    timezone: v.timezone,
    deadline: v.deadline
      ? new Date(
          wallInstant(
            v.deadline.slice(0, 10),
            v.deadline.slice(11),
            v.timezone,
          ),
        )
      : null,
    publicId,
    adminTokenHash: hashToken(admin),
    participants: {
      create: {
        name: v.creatorName,
        normalizedName: v.creatorName.toLowerCase(),
        participantTokenHash: hashToken(participant),
      },
    },
  };
  await db.schedule.create({ data });
  return { publicId, admin, participant };
}
export async function joinSchedule(
  id: string,
  input: unknown,
  session: Session,
) {
  const name = nameSchema.parse(
    z.object({ name: nameSchema }).parse(input).name,
  );
  const token = newToken();
  await mutate(id, async (tx, s) => {
    collecting(s);
    if (participantOf(s, session)) throw new AppError("你已加入此排程。", 409);
    if (s.participants.length >= s.expectedParticipants)
      throw new AppError("參與人數已額滿。", 409);
    if (s.participants.some((p) => p.normalizedName === name.toLowerCase()))
      throw new AppError("此名稱已有人使用，請換一個名稱。", 409);
    await tx.participant.create({
      data: {
        scheduleId: s.id,
        name,
        normalizedName: name.toLowerCase(),
        participantTokenHash: hashToken(token),
      },
    });
  });
  return token;
}
export async function saveAvailability(
  id: string,
  input: unknown,
  session: Session,
) {
  const { slots } = z
    .object({ slots: z.array(z.iso.datetime()).max(1488) })
    .parse(input);
  await mutate(id, async (tx, s) => {
    const p = requireParticipant(s, session);
    collecting(s);
    const legal = new Set(
      slotGrid(rulesOf(s)).flatMap((d) =>
        d.slots.map((a) => Date.parse(a.startAt)),
      ),
    );
    const unique = [...new Set(slots.map((a) => Date.parse(a)))];
    if (unique.some((a) => !legal.has(a)))
      throw new AppError("可行時間包含範圍外或無效的時間格。");
    await tx.availability.deleteMany({
      where: { participantId: p.id, scheduleId: s.id },
    });
    await tx.availability.createMany({
      data: unique.map((a) => ({
        participantId: p.id,
        scheduleId: s.id,
        startAt: new Date(a),
      })),
    });
    await tx.participant.update({
      where: { id: p.id },
      data: { availabilitySubmittedAt: new Date() },
    });
    const updated = await tx.schedule.findUniqueOrThrow({
      where: { id: s.id },
      include: graph,
    });
    const best = bestOf(resultsOf(updated));
    if (best.length > 1) {
      await tx.candidateTime.createMany({
        data: best.map((b) => ({
          scheduleId: s.id,
          startAt: new Date(b.startAt),
          endAt: new Date(b.endAt),
        })),
      });
      await tx.schedule.update({
        where: { id: s.id },
        data: { status: "VOTING" },
      });
    }
  });
}
export async function vote(id: string, input: unknown, session: Session) {
  const { candidateId } = z
    .object({ candidateId: z.string().min(1).max(100) })
    .parse(input);
  await mutate(id, async (tx, s) => {
    const p = requireParticipant(s, session);
    if (s.status !== "VOTING" || s.votingClosedAt)
      throw new AppError("目前不開放投票。", 409);
    if (!s.candidateTimes.some((c) => c.id === candidateId))
      throw new AppError("候選時間不屬於此排程。");
    await tx.vote.upsert({
      where: {
        scheduleId_participantId: { scheduleId: s.id, participantId: p.id },
      },
      create: {
        scheduleId: s.id,
        participantId: p.id,
        candidateTimeId: candidateId,
      },
      update: { candidateTimeId: candidateId },
    });
    const voteCount = await tx.vote.count({ where: { scheduleId: s.id } });
    if (voteCount === s.participants.length) {
      await tx.schedule.update({
        where: { id: s.id },
        data: { votingClosedAt: new Date() },
      });
    }
  });
}
export async function closeVoting(id: string, session: Session) {
  await mutate(id, async (tx, s) => {
    requireAdmin(s, session);
    if (s.status !== "VOTING" || s.votingClosedAt)
      throw new AppError("投票尚未開啟或已結束。", 409);
    await tx.schedule.update({
      where: { id: s.id },
      data: { votingClosedAt: new Date() },
    });
  });
}
export async function confirmMeeting(
  id: string,
  input: unknown,
  session: Session,
) {
  const v = meetingSchema.parse(input);
  await mutate(id, async (tx, s) => {
    requireAdmin(s, session);
    writable(s);
    const best = bestOf(resultsOf(s));
    if (!best.length) throw new AppError("需等待全員提交後才能確認會議。", 409);
    if (s.status === "VOTING" && !s.votingClosedAt)
      throw new AppError("請先結束投票。", 409);
    const chosen = best.find(
      (b) => Date.parse(b.startAt) === Date.parse(v.startAt),
    );
    if (!chosen) throw new AppError("請從最佳時段中選擇。");
    if (best.length > 1 && s.status !== "VOTING")
      throw new AppError("並列時段必須先進行投票。", 409);
    await tx.meeting.create({
      data: {
        scheduleId: s.id,
        startAt: new Date(chosen.startAt),
        endAt: new Date(chosen.endAt),
        location: v.location,
        meetingUrl: v.meetingUrl,
        description: v.description,
        reminderMinutes: v.reminderMinutes,
      },
    });
    await tx.schedule.update({
      where: { id: s.id },
      data: { status: "CONFIRMED" },
    });
  });
}
export async function cancelSchedule(id: string, session: Session) {
  await mutate(id, async (tx, s) => {
    requireAdmin(s, session);
    if (s.status === "CANCELLED") throw new AppError("排程已取消。", 409);
    await tx.schedule.update({
      where: { id: s.id },
      data: { status: "CANCELLED" },
    });
  });
}
export async function addComment(id: string, input: unknown, session: Session) {
  const { content } = z
    .object({ content: z.string().trim().min(1).max(500) })
    .parse(input);
  await mutate(id, async (tx, s) => {
    const p = requireParticipant(s, session);
    if (s.status === "CANCELLED")
      throw new AppError("已取消的排程為唯讀。", 409);
    await tx.comment.create({
      data: { scheduleId: s.id, participantId: p.id, content },
    });
  });
}
export async function deleteComment(
  id: string,
  commentId: string,
  session: Session,
) {
  await mutate(id, async (tx, s) => {
    if (s.status === "CANCELLED")
      throw new AppError("已取消的排程為唯讀。", 409);
    const c = s.comments.find((c) => c.id === commentId);
    if (!c) throw new AppError("留言不存在。", 404);
    if (
      !matches(session.admin, s.adminTokenHash) &&
      participantOf(s, session)?.id !== c.participantId
    )
      throw new AppError("不能刪除其他人的留言。", 403);
    await tx.comment.delete({ where: { id: c.id } });
  });
}
