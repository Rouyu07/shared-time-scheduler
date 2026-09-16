import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { minutes, slotGrid, wallInstant } from "./scheduling";
export const nameSchema = z
  .string()
  .trim()
  .min(1, "請輸入名稱")
  .max(40, "名稱最多 40 字");
export const createSchema = z
  .object({
    title: z.string().trim().min(1, "請輸入排程名稱").max(120),
    creatorName: nameSchema,
    expectedParticipants: z.coerce.number().int().min(1).max(100),
    description: z.string().trim().max(5000).default(""),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    dailyStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    dailyEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    durationMinutes: z.coerce.number().int().min(30).max(1410).multipleOf(30),
    timezone: z.string().max(64).default("Asia/Taipei"),
    deadline: z.string().max(30).default(""),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    try {
      const days = Temporal.PlainDate.from(v.startDate).until(
        Temporal.PlainDate.from(v.endDate),
      ).days;
      if (days < 0 || days > 30) issue("日期需為連續 1～31 天");
      new Intl.DateTimeFormat("en", { timeZone: v.timezone }).format();
      if (
        minutes(v.dailyEndTime) - minutes(v.dailyStartTime) <
        v.durationMinutes
      )
        issue("每日範圍必須足夠容納會議，且不可跨午夜");
      if (
        days >= 0 &&
        days <= 30 &&
        !slotGrid(v).some((d) => d.slots.length >= v.durationMinutes / 30)
      )
        issue("此時區與範圍沒有足夠的有效時間格");
      if (
        v.deadline &&
        Date.parse(
          wallInstant(
            v.deadline.slice(0, 10),
            v.deadline.slice(11),
            v.timezone,
          ),
        ) <= Date.now()
      )
        issue("截止時間必須在未來");
    } catch {
      issue(
        "日期、截止時間或 IANA 時區無效；請避開日光節約時間切換的重複／不存在時間",
      );
    }
  });
export const meetingSchema = z.object({
  startAt: z.iso.datetime(),
  location: z.string().trim().max(200).default(""),
  meetingUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .max(2048)
        .refine((v) => /^https?:\/\//i.test(v), "會議網址限 HTTP 或 HTTPS"),
    ])
    .default(""),
  description: z.string().trim().max(5000).default(""),
  reminderMinutes: z
    .union([z.null(), z.number().int().min(0).max(40320)])
    .default(null),
});
