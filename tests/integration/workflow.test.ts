import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/lib/db";
import {
  createSchedule,
  joinSchedule,
  saveAvailability,
  vote,
  closeVoting,
  confirmMeeting,
  cancelSchedule,
  addComment,
  deleteComment,
  getSchedule,
  present,
} from "../../src/lib/service";
import { slotGrid } from "../../src/lib/scheduling";
const ids: string[] = [];
const base = {
  title: "Integration fixture",
  creatorName: "Owner",
  expectedParticipants: 2,
  startDate: "2027-09-16",
  endDate: "2027-09-16",
  dailyStartTime: "19:00",
  dailyEndTime: "21:00",
  durationMinutes: 60,
  timezone: "Asia/Taipei",
};
async function create(extra = {}) {
  const s = await createSchedule({ ...base, ...extra });
  ids.push(s.publicId);
  return s;
}
after(async () => {
  await db.schedule.deleteMany({ where: { publicId: { in: ids } } });
  await db.$disconnect();
});
test("capacity and case-insensitive names; all-submit tie starts voting; freeze, vote, close and confirm", async () => {
  const s = await create();
  const auth = { admin: s.admin, participant: s.participant };
  await assert.rejects(joinSchedule(s.publicId, { name: "owner" }, {}), /名稱/);
  const attempts = await Promise.allSettled([
    joinSchedule(s.publicId, { name: "B" }, {}),
    joinSchedule(s.publicId, { name: "C" }, {}),
  ]);
  assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
  const winner = attempts.find(
    (a) => a.status === "fulfilled",
  ) as PromiseFulfilledResult<string>;
  const guest = { participant: winner.value };
  const slots = slotGrid(base)[0].slots.map((a) => a.startAt);
  await saveAvailability(s.publicId, { slots }, auth);
  assert.equal(present(await getSchedule(s.publicId), auth).results.length, 0);
  await assert.rejects(
    confirmMeeting(s.publicId, { startAt: slots[0] }, auth),
    /全員/,
  );
  await saveAvailability(s.publicId, { slots }, guest);
  let view = present(await getSchedule(s.publicId), auth);
  assert.equal(view.status, "VOTING");
  assert.equal(view.candidates.length, 3);
  await assert.rejects(
    saveAvailability(s.publicId, { slots: [] }, guest),
    /鎖定/,
  );
  await assert.rejects(
    vote(s.publicId, { candidateId: "foreign" }, guest),
    /不屬於/,
  );
  await assert.rejects(closeVoting(s.publicId, guest), /管理/);
  await vote(s.publicId, { candidateId: view.candidates[0].id }, guest);
  await vote(s.publicId, { candidateId: view.candidates[1].id }, guest);
  view = present(await getSchedule(s.publicId), guest);
  assert.equal(view.voted, 1);
  assert.equal(view.candidates[1].votes, 1);
  assert.equal(view.candidates[0].votes, 0);
  await assert.rejects(
    confirmMeeting(s.publicId, { startAt: slots[0] }, auth),
    /結束投票/,
  );
  await closeVoting(s.publicId, auth);
  await assert.rejects(
    vote(s.publicId, { candidateId: view.candidates[0].id }, guest),
    /不開放/,
  );
  const confirmations = await Promise.allSettled([
    confirmMeeting(
      s.publicId,
      { startAt: slots[0], reminderMinutes: 30 },
      auth,
    ),
    confirmMeeting(s.publicId, { startAt: slots[1] }, auth),
  ]);
  assert.equal(confirmations.filter((a) => a.status === "fulfilled").length, 1);
  const final = await getSchedule(s.publicId);
  assert.equal(final.status, "CONFIRMED");
  assert.ok(final.meeting);
  await assert.rejects(saveAvailability(s.publicId, { slots }, auth), /鎖定/);
});
test("unique best skips voting, session isolation and cancellation keep data read-only", async () => {
  const a = await create({ expectedParticipants: 1 });
  const b = await create({ expectedParticipants: 1 });
  const auth = { admin: a.admin, participant: a.participant };
  const slots = slotGrid(base)[0]
    .slots.slice(0, 2)
    .map((a) => a.startAt);
  await assert.rejects(
    saveAvailability(a.publicId, { slots }, { participant: b.participant }),
    /先加入/,
  );
  await assert.rejects(
    saveAvailability(a.publicId, { slots: ["2027-09-17T00:00:00Z"] }, auth),
    /無效/,
  );
  await saveAvailability(a.publicId, { slots }, auth);
  const view = present(await getSchedule(a.publicId), auth);
  assert.equal(view.status, "COLLECTING");
  assert.equal(view.best.length, 1);
  await assert.rejects(
    confirmMeeting(a.publicId, { startAt: slots[0] }, { admin: b.admin }),
    /管理/,
  );
  await addComment(a.publicId, { content: "<script>alert(1)</script>" }, auth);
  const comment = (await getSchedule(a.publicId)).comments[0];
  await assert.rejects(
    deleteComment(a.publicId, comment.id, { participant: b.participant }),
    /不能刪除/,
  );
  await deleteComment(a.publicId, comment.id, auth);
  await confirmMeeting(a.publicId, { startAt: slots[0] }, auth);
  await cancelSchedule(a.publicId, auth);
  await assert.rejects(
    addComment(a.publicId, { content: "blocked" }, auth),
    /唯讀/,
  );
  assert.ok((await getSchedule(a.publicId)).meeting);
});
test("deadline is enforced for joining and submissions", async () => {
  const a = await create();
  // Fixture setup: the public application has no API to change the deadline.
  await db.schedule.update({
    where: { publicId: a.publicId },
    data: { deadline: new Date(Date.now() - 1000) },
  });
  await assert.rejects(joinSchedule(a.publicId, { name: "late" }, {}), /截止/);
  await assert.rejects(
    saveAvailability(a.publicId, { slots: [] }, { participant: a.participant }),
    /截止/,
  );
});
