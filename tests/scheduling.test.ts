import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recommend,
  bestOf,
  slotGrid,
  wallInstant,
  type Rules,
} from "../src/lib/scheduling";
const rules: Rules = {
  startDate: "2026-09-16",
  endDate: "2026-09-16",
  dailyStartTime: "19:00",
  dailyEndTime: "21:00",
  durationMinutes: 60,
  timezone: "Asia/Taipei",
};
const slots = slotGrid(rules)[0].slots.map((s) => s.startAt);
test("waits for the configured headcount and every submission", () => {
  const p = [{ id: "a", name: "A", submitted: true, slots }];
  assert.deepEqual(recommend(rules, p, 2), []);
  assert.deepEqual(recommend(rules, [{ ...p[0], submitted: false }], 1), []);
});
test("requires every consecutive slot, retains every best tie and lists absentees", () => {
  const people = [
    { id: "a", name: "A", submitted: true, slots },
    { id: "b", name: "B", submitted: true, slots: [slots[0], slots[2]] },
  ];
  const result = recommend(rules, people, 2);
  assert.equal(result.length, 3);
  assert.equal(bestOf(result).length, 3);
  assert.ok(result.every((r) => r.count === 1 && r.unavailable[0] === "B"));
  assert.deepEqual(
    result.map((r) => r.startAt),
    slots.slice(0, 3),
  );
});
test("unique maximum, empty availability, and duration boundaries", () => {
  const result = recommend(
    rules,
    [{ id: "a", name: "A", submitted: true, slots: slots.slice(0, 2) }],
    1,
  );
  assert.equal(bestOf(result).length, 1);
  assert.equal(result[0].count, 1);
  assert.ok(
    recommend(
      rules,
      [{ id: "a", name: "A", submitted: true, slots: [] }],
      1,
    ).every((r) => r.count === 0),
  );
  assert.equal(
    recommend(
      { ...rules, durationMinutes: 150 },
      [{ id: "a", name: "A", submitted: true, slots }],
      1,
    ).length,
    0,
  );
});
test("Taipei conversion and DST gaps/repeats do not silently shift times", () => {
  assert.equal(
    wallInstant("2026-09-16", "19:00", "Asia/Taipei"),
    "2026-09-16T11:00:00Z",
  );
  for (const day of ["2026-03-08", "2026-11-01"]) {
    const grid = slotGrid({
      ...rules,
      startDate: day,
      endDate: day,
      timezone: "America/New_York",
      dailyStartTime: "01:00",
      dailyEndTime: "04:00",
    });
    assert.ok(grid[0].slots.length < 6);
    assert.equal(
      new Set(grid[0].slots.map((s) => s.startAt)).size,
      grid[0].slots.length,
    );
  }
});
