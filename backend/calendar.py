from urllib.parse import urlencode
from .scheduling import utc_iso


def stamp(value):
    return utc_iso(value).replace("-", "").replace(":", "").replace(".000", "")


def escape(value: str):
    return value.replace("\\", "\\\\").replace("\r\n", "\\n").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")


def fold(line: str):
    lines, current, size = [], "", 0
    for char in line:
        n = len(char.encode())
        if size + n > 75:
            lines.append(current)
            current, size = " ", 1
        current += char
        size += n
    lines.append(current)
    return "\r\n".join(lines)


def ics(schedule, meeting):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//REX//Heshi//ZH-TW", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", f"UID:{escape(schedule.public_id)}@heshi", f"DTSTAMP:{stamp(meeting.confirmed_at)}", f"DTSTART:{stamp(meeting.start_at)}", f"DTEND:{stamp(meeting.end_at)}", f"SUMMARY:{escape(schedule.title)}", f"DESCRIPTION:{escape(chr(10).join(filter(None, [meeting.description, meeting.meeting_url])))}", f"LOCATION:{escape(meeting.location or '')}"]
    if meeting.reminder_minutes is not None:
        lines += ["BEGIN:VALARM", f"TRIGGER:-PT{meeting.reminder_minutes}M", "ACTION:DISPLAY", "DESCRIPTION:會議提醒", "END:VALARM"]
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(fold(line) for line in lines) + "\r\n"


def google_calendar(schedule, meeting):
    return "https://calendar.google.com/calendar/render?" + urlencode({"action": "TEMPLATE", "text": schedule.title, "dates": f"{stamp(meeting.start_at)}/{stamp(meeting.end_at)}", "ctz": schedule.timezone, "location": meeting.location or "", "details": "\n".join(filter(None, [meeting.description, meeting.meeting_url]))})
