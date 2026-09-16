from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class Rules:
    start_date: date
    end_date: date
    daily_start_time: time
    daily_end_time: time
    duration_minutes: int
    timezone: str


def utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def utc_aware(value: datetime) -> datetime:
    """Return an aware UTC instant for persistence in TIMESTAMPTZ columns."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def wall_instant(day: date, at: time, zone: str) -> datetime:
    local = datetime.combine(day, at)
    z = ZoneInfo(zone)
    aware = local.replace(tzinfo=z, fold=0)
    if aware.astimezone(timezone.utc).astimezone(z).replace(tzinfo=None) != local:
        raise ValueError("不存在的牆上時間")
    other = local.replace(tzinfo=z, fold=1)
    if other.utcoffset() != aware.utcoffset():
        raise ValueError("重複的牆上時間")
    return aware.astimezone(timezone.utc)


def slot_grid(rules: Rules):
    result = []
    day = rules.start_date
    while day <= rules.end_date:
        slots = []
        cursor = datetime.combine(day, rules.daily_start_time)
        stop = datetime.combine(day, rules.daily_end_time)
        while cursor + timedelta(minutes=30) <= stop:
            try:
                start = wall_instant(day, cursor.time(), rules.timezone)
                end_local = (start + timedelta(minutes=30)).astimezone(ZoneInfo(rules.timezone)).replace(tzinfo=None)
                if end_local == cursor + timedelta(minutes=30):
                    slots.append({"startAt": utc_iso(start), "label": cursor.strftime("%H:%M")})
            except ValueError:
                pass
            cursor += timedelta(minutes=30)
        result.append({"day": day.isoformat(), "slots": slots})
        day += timedelta(days=1)
    return result


def recommend(rules: Rules, people: list[dict], expected: int):
    if len(people) != expected or any(not p["submitted"] for p in people):
        return []
    sets = [{utc_naive(v) for v in p["slots"]} for p in people]
    out = []
    for group in slot_grid(rules):
        legal = {utc_naive(datetime.fromisoformat(s["startAt"].replace("Z", "+00:00"))) for s in group["slots"]}
        for slot in group["slots"]:
            start = utc_naive(datetime.fromisoformat(slot["startAt"].replace("Z", "+00:00")))
            required = [start + timedelta(minutes=30 * i) for i in range(rules.duration_minutes // 30)]
            if any(v not in legal for v in required):
                continue
            end = start + timedelta(minutes=rules.duration_minutes)
            local_end = end.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(rules.timezone))
            start_local = start.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(rules.timezone))
            if local_end.date() != start_local.date() or local_end.replace(tzinfo=None) != start_local.replace(tzinfo=None) + timedelta(minutes=rules.duration_minutes):
                continue
            available = [p["name"] for p, chosen in zip(people, sets) if all(v in chosen for v in required)]
            unavailable = [p["name"] for p in people if p["name"] not in available]
            out.append({"startAt": utc_iso(start), "endAt": utc_iso(end), "available": available, "unavailable": unavailable, "count": len(available), "total": expected})
    return sorted(out, key=lambda x: (-x["count"], x["startAt"]))


def best_of(results: list[dict]):
    return [r for r in results if r["count"] == results[0]["count"]] if results else []
