import { Temporal } from "@js-temporal/polyfill";

export type Rules = {
  startDate: string;
  endDate: string;
  dailyStartTime: string;
  dailyEndTime: string;
  durationMinutes: number;
  timezone: string;
};
export type Person = {
  id: string;
  name: string;
  submitted: boolean;
  slots: string[];
};
export type Result = {
  startAt: string;
  endAt: string;
  available: string[];
  unavailable: string[];
  count: number;
  total: number;
};
export function dates(r: Rules) {
  const result: string[] = [];
  let day = Temporal.PlainDate.from(r.startDate);
  const end = Temporal.PlainDate.from(r.endDate);
  while (Temporal.PlainDate.compare(day, end) <= 0) {
    result.push(day.toString());
    if (result.length > 31) throw new Error("日期範圍最多 31 天");
    day = day.add({ days: 1 });
  }
  return result;
}
export function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function wallInstant(day: string, time: string, timezone: string) {
  return Temporal.PlainDateTime.from(`${day}T${time}`)
    .toZonedDateTime(timezone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
export function slotGrid(r: Rules) {
  return dates(r).map((day) => {
    const slots: { startAt: string; label: string }[] = [];
    for (
      let m = minutes(r.dailyStartTime);
      m + 30 <= minutes(r.dailyEndTime);
      m += 30
    ) {
      const label = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      // Ambiguous/nonexistent local times are omitted rather than silently shifted at DST changes.
      try {
        const startAt = wallInstant(day, label, r.timezone);
        const end = Temporal.Instant.from(startAt)
          .add({ minutes: 30 })
          .toZonedDateTimeISO(r.timezone);
        const expected = Temporal.PlainDateTime.from(`${day}T${label}`).add({
          minutes: 30,
        });
        if (end.toPlainDateTime().equals(expected))
          slots.push({ startAt, label });
      } catch {
        /* DST gap or repeated wall time */
      }
    }
    return { day, slots };
  });
}
export function recommend(
  r: Rules,
  people: Person[],
  expected: number,
): Result[] {
  if (people.length !== expected || people.some((p) => !p.submitted)) return [];
  const sets = people.map(
    (p) =>
      new Set(p.slots.map((s) => Temporal.Instant.from(s).epochMilliseconds)),
  );
  const result: Result[] = [];
  for (const { day, slots } of slotGrid(r)) {
    const legal = new Set(
      slots.map((s) => Temporal.Instant.from(s.startAt).epochMilliseconds),
    );
    for (const slot of slots) {
      if (minutes(slot.label) + r.durationMinutes > minutes(r.dailyEndTime))
        continue;
      const start = Temporal.Instant.from(slot.startAt);
      const end = start.add({ minutes: r.durationMinutes });
      const localEnd = end.toZonedDateTimeISO(r.timezone);
      if (
        localEnd.toPlainDate().toString() !== day ||
        minutes(localEnd.toPlainTime().toString()) !==
          minutes(slot.label) + r.durationMinutes
      )
        continue;
      const required = Array.from(
        { length: r.durationMinutes / 30 },
        (_, i) => start.epochMilliseconds + i * 1800000,
      );
      if (!required.every((s) => legal.has(s))) continue;
      const available: string[] = [],
        unavailable: string[] = [];
      people.forEach((p, i) =>
        (required.every((s) => sets[i].has(s)) ? available : unavailable).push(
          p.name,
        ),
      );
      result.push({
        startAt: start.toString(),
        endAt: end.toString(),
        available,
        unavailable,
        count: available.length,
        total: expected,
      });
    }
  }
  return result.sort(
    (a, b) =>
      b.count - a.count || Date.parse(a.startAt) - Date.parse(b.startAt),
  );
}
export function bestOf(results: Result[]) {
  return results.filter((r) => r.count === results[0]?.count);
}
export function formatRange(
  start: string | Date,
  end: string | Date,
  timezone: string,
) {
  const date = new Intl.DateTimeFormat("zh-TW", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const time = new Intl.DateTimeFormat("zh-TW", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date.format(new Date(start))} – ${time.format(new Date(end))}`;
}
