import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  AppError,
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
} from "@/lib/service";
import { cookieName, cookieOptions, matches, type Session } from "@/lib/auth";
import { ics } from "@/lib/calendar";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
function session(req: NextRequest, id: string): Session {
  return {
    admin: req.cookies.get(cookieName("admin", id))?.value,
    participant: req.cookies.get(cookieName("participant", id))?.value,
  };
}
async function body(req: NextRequest) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new AppError("請使用 JSON。", 415);
  if (Number(req.headers.get("content-length") ?? 0) > 100000)
    throw new AppError("內容過大。", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("缺少內容。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 100000) {
      await reader.cancel();
      throw new AppError("內容過大。", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("JSON 格式錯誤。");
  }
}
async function handle(req: NextRequest, ctx: Context) {
  try {
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      if (
        !process.env.APP_URL ||
        origin !== new URL(process.env.APP_URL).origin
      )
        throw new AppError("請由本站頁面操作。", 403);
    }
    const path = (await ctx.params).path ?? [];
    if (path.length > 3) throw new AppError("找不到操作。", 404);
    const [id, action, item] = path;
    if (!id && req.method === "POST") {
      const result = await createSchedule(await body(req));
      const response = NextResponse.json(
        {
          publicId: result.publicId,
          adminLink: `/s/${result.publicId}/manage#token=${result.admin}`,
        },
        { status: 201 },
      );
      response.cookies.set(
        cookieName("admin", result.publicId),
        result.admin,
        cookieOptions(),
      );
      response.cookies.set(
        cookieName("participant", result.publicId),
        result.participant,
        cookieOptions(),
      );
      return response;
    }
    if (!id) throw new AppError("找不到排程。", 404);
    const auth = session(req, id);
    if (req.method === "GET") {
      const s = await getSchedule(id);
      if (action === "calendar") {
        if (s.status !== "CONFIRMED" || !s.meeting)
          throw new AppError("會議尚未確認或已取消。", 409);
        return new NextResponse(
          ics({
            uid: `${s.publicId}@shared-time`,
            title: s.title,
            timezone: s.timezone,
            ...s.meeting,
            startAt: s.meeting.startAt.toISOString(),
            endAt: s.meeting.endAt.toISOString(),
            confirmedAt: s.meeting.confirmedAt.toISOString(),
          }),
          {
            headers: {
              "Content-Type": "text/calendar; charset=utf-8",
              "Content-Disposition": 'attachment; filename="meeting.ics"',
            },
          },
        );
      }
      if (action) throw new AppError("找不到操作。", 404);
      return NextResponse.json(present(s, auth));
    }
    if (req.method === "POST" && action === "admin-session") {
      const input = await body(req);
      const s = await getSchedule(id);
      if (
        typeof input?.token !== "string" ||
        !matches(input.token, s.adminTokenHash)
      )
        throw new AppError("管理連結無效。", 403);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(
        cookieName("admin", id),
        input.token,
        cookieOptions(),
      );
      return response;
    }
    if (req.method === "POST" && action === "join") {
      const token = await joinSchedule(id, await body(req), auth);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(
        cookieName("participant", id),
        token,
        cookieOptions(),
      );
      return response;
    }
    if (req.method === "PUT" && action === "availability")
      await saveAvailability(id, await body(req), auth);
    else if (req.method === "POST" && action === "vote")
      await vote(id, await body(req), auth);
    else if (req.method === "POST" && action === "close-voting")
      await closeVoting(id, auth);
    else if (req.method === "POST" && action === "confirm")
      await confirmMeeting(id, await body(req), auth);
    else if (req.method === "POST" && action === "cancel")
      await cancelSchedule(id, auth);
    else if (req.method === "POST" && action === "comments")
      await addComment(id, await body(req), auth);
    else if (req.method === "DELETE" && action === "comments" && item)
      await deleteComment(id, item, auth);
    else throw new AppError("找不到操作；排程設定建立後不可修改。", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("；"),
        },
        { status: 400 },
      );
    // Do not log requests, tokens, input or database errors containing connection details.
    return NextResponse.json(
      { error: "操作暫時失敗，請稍後再試。" },
      { status: 500 },
    );
  }
}
async function dispatch(req: NextRequest, ctx: Context) {
  const res = await handle(req, ctx);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
export {
  dispatch as GET,
  dispatch as POST,
  dispatch as PUT,
  dispatch as DELETE,
  dispatch as PATCH,
};
