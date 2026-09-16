from types import SimpleNamespace
from datetime import datetime
from backend.calendar import google_calendar, ics


def fixture(reminder=60):
    schedule = SimpleNamespace(public_id="public", title="小組,會議;討論", timezone="Asia/Taipei")
    meeting = SimpleNamespace(start_at=datetime(2027, 9, 16, 11), end_at=datetime(2027, 9, 16, 12), confirmed_at=datetime(2027, 9, 12, 2), location="討論室", description="中" * 90, meeting_url="https://example.com", reminder_minutes=reminder)
    return schedule, meeting


def test_ics_utc_valarm_escaping_crlf_and_octet_folding():
    schedule, meeting = fixture()
    content = ics(schedule, meeting)
    assert "DTSTART:20270916T110000Z" in content
    assert "TRIGGER:-PT60M" in content
    assert "小組\\,會議\\;討論" in content
    assert all(len(line.encode()) <= 75 for line in content.split("\r\n"))
    assert "VALARM" not in ics(schedule, fixture(None)[1])


def test_google_calendar_preserves_zone_and_instants():
    from urllib.parse import parse_qs, urlparse
    schedule, meeting = fixture()
    values = parse_qs(urlparse(google_calendar(schedule, meeting)).query)
    assert values["dates"] == ["20270916T110000Z/20270916T120000Z"]
    assert values["ctz"] == ["Asia/Taipei"]
