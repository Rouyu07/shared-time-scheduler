from datetime import date, datetime, time, timezone
import pytest
from backend.scheduling import Rules, best_of, recommend, slot_grid, wall_instant


RULES = Rules(date(2027, 9, 16), date(2027, 9, 16), time(19), time(21), 60, "Asia/Taipei")


def test_waits_for_every_participant_and_submission():
    slots = [datetime.fromisoformat(v["startAt"].replace("Z", "+00:00")) for v in slot_grid(RULES)[0]["slots"]]
    assert recommend(RULES, [{"name": "A", "submitted": True, "slots": slots}], 2) == []
    assert recommend(RULES, [{"name": "A", "submitted": False, "slots": slots}], 1) == []


def test_consecutive_slots_and_every_best_tie_are_retained():
    slots = [datetime.fromisoformat(v["startAt"].replace("Z", "+00:00")) for v in slot_grid(RULES)[0]["slots"]]
    results = recommend(RULES, [
        {"name": "A", "submitted": True, "slots": slots},
        {"name": "B", "submitted": True, "slots": [slots[0], slots[2]]},
    ], 2)
    assert len(results) == 3
    assert len(best_of(results)) == 3
    assert all(v["count"] == 1 and v["unavailable"] == ["B"] for v in results)


def test_unique_best_empty_availability_and_timezone_edges():
    slots = [datetime.fromisoformat(v["startAt"].replace("Z", "+00:00")) for v in slot_grid(RULES)[0]["slots"]]
    assert len(best_of(recommend(RULES, [{"name": "A", "submitted": True, "slots": slots[:2]}], 1))) == 1
    assert all(v["count"] == 0 for v in recommend(RULES, [{"name": "A", "submitted": True, "slots": []}], 1))
    assert wall_instant(date(2027, 9, 16), time(19), "Asia/Taipei") == datetime(2027, 9, 16, 11, tzinfo=timezone.utc)
    with pytest.raises(ValueError):
        wall_instant(date(2026, 3, 8), time(2, 30), "America/New_York")
    with pytest.raises(ValueError):
        wall_instant(date(2026, 11, 1), time(1, 30), "America/New_York")
