import { test } from "node:test";
import assert from "node:assert/strict";
import { ics, googleCalendar, type CalendarMeeting } from "../src/lib/calendar";
const m: CalendarMeeting = {
  uid: "id@shared-time",
  title: "小組,會議;討論\n下週",
  startAt: "2026-09-16T11:00:00Z",
  endAt: "2026-09-16T12:00:00Z",
  timezone: "Asia/Taipei",
  confirmedAt: "2026-09-12T02:00:00Z",
  description: "中".repeat(90),
  reminderMinutes: 60,
};
test("ICS UTC instants, escaped text, CRLF and UTF-8 octet folding", () => {
  const content = ics(m);
  assert.ok(content.includes("DTSTART:20260916T110000Z"));
  assert.ok(content.includes("TRIGGER:-PT60M"));
  assert.ok(content.includes("小組\\,會議\\;討論\\n下週"));
  assert.ok(
    content.split("\r\n").every((line) => Buffer.byteLength(line) <= 75),
  );
  assert.ok(!ics({ ...m, reminderMinutes: null }).includes("VALARM"));
});
test("Google URL preserves timezone and exact UTC start/end", () => {
  const url = new URL(googleCalendar(m));
  assert.equal(
    url.searchParams.get("dates"),
    "20260916T110000Z/20260916T120000Z",
  );
  assert.equal(url.searchParams.get("ctz"), "Asia/Taipei");
  assert.equal(url.searchParams.get("text"), m.title);
});
