import { test } from "node:test";
import assert from "node:assert/strict";
import { dayTimeline } from "../src/lib/day-timeline";
import type { NotionDayPlan } from "../src/lib/notion-day-plan";
const at = (hour: number, minute = 0) => new Date(2026, 10, 22, hour, minute);
const plan: NotionDayPlan = {
  day: "2026-11-22",
  generatedAt: at(9).toISOString(),
  sourceReadAt: at(9).toISOString(),
  window: "10:00–12:00",
  assumptions: [],
  deferred: [],
  entries: [
    {
      id: "study",
      title: "Read chapter 4",
      start: at(10).toISOString(),
      end: at(10, 25).toISOString(),
      kind: "study",
      sourceKey: "a",
    },
    {
      id: "break",
      title: "Break",
      start: at(10, 25).toISOString(),
      end: at(10, 30).toISOString(),
      kind: "break",
      sourceKey: null,
    },
    {
      id: "event",
      title: "Appointment",
      start: at(11).toISOString(),
      end: at(11, 30).toISOString(),
      kind: "fixed",
      sourceKey: null,
    },
  ],
};
test("the clock moves through focus, break, open time and elapsed schedule without recording completion", () => {
  const original = JSON.stringify(plan);
  assert.equal(dayTimeline(plan, at(9)).next?.id, "study");
  assert.equal(dayTimeline(plan, at(10, 24)).active[0].id, "study");
  assert.equal(dayTimeline(plan, at(10, 25)).active[0].id, "break");
  const gap = dayTimeline(plan, at(10, 30));
  assert.equal(gap.phase, "upcoming");
  assert.deepEqual(gap.active, []);
  assert.equal(gap.next?.id, "event");
  assert.equal(dayTimeline(plan, at(11, 30)).phase, "elapsed");
  assert.equal(JSON.stringify(plan), original);
});
test("a different day or malformed interval cannot become a current action", () => {
  assert.equal(
    dayTimeline(plan, new Date(2026, 10, 23, 9)).phase,
    "different_day",
  );
  assert.equal(
    dayTimeline(
      { ...plan, entries: [{ ...plan.entries[0], end: at(9).toISOString() }] },
      at(10),
    ).phase,
    "invalid",
  );
});
test("overlapping commitments remain visible instead of silently selecting only one", () => {
  const overlap = {
    ...plan,
    entries: [
      ...plan.entries,
      {
        ...plan.entries[2],
        id: "overlap",
        title: "Other event",
        start: at(10, 10).toISOString(),
        end: at(10, 20).toISOString(),
      },
    ],
  };
  assert.deepEqual(
    dayTimeline(overlap, at(10, 15)).active.map((entry) => entry.id),
    ["study", "overlap"],
  );
  assert.equal(dayTimeline(overlap, at(10, 20)).active.length, 1);
});
