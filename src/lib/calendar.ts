export type CalendarMeeting = {
  uid: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  location?: string | null;
  description?: string | null;
  meetingUrl?: string | null;
  reminderMinutes?: number | null;
  confirmedAt: string;
};
const stamp = (s: string) =>
  new Date(s)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
const escape = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function fold(line: string) {
  const result: string[] = [];
  let current = "",
    bytes = 0;
  for (const char of line) {
    const n = Buffer.byteLength(char);
    if (bytes + n > 75) {
      result.push(current);
      current = " ";
      bytes = 1;
    }
    current += char;
    bytes += n;
  }
  result.push(current);
  return result.join("\r\n");
}
export function ics(m: CalendarMeeting) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shared Time//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escape(m.uid)}`,
    `DTSTAMP:${stamp(m.confirmedAt)}`,
    `DTSTART:${stamp(m.startAt)}`,
    `DTEND:${stamp(m.endAt)}`,
    `SUMMARY:${escape(m.title)}`,
    `DESCRIPTION:${escape([m.description, m.meetingUrl].filter(Boolean).join("\n"))}`,
    `LOCATION:${escape(m.location ?? "")}`,
  ];
  if (m.reminderMinutes != null)
    lines.push(
      "BEGIN:VALARM",
      `TRIGGER:-PT${m.reminderMinutes}M`,
      "ACTION:DISPLAY",
      "DESCRIPTION:會議提醒",
      "END:VALARM",
    );
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
export function googleCalendar(m: CalendarMeeting) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: m.title,
    dates: `${stamp(m.startAt)}/${stamp(m.endAt)}`,
    ctz: m.timezone,
    location: m.location ?? "",
    details: [m.description, m.meetingUrl].filter(Boolean).join("\n"),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
