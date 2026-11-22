import { test } from "node:test";
import assert from "node:assert/strict";
import {
  refreshDaySource,
  daySourceContext,
} from "../src/lib/day-source-refresh";
import { emptyNotionDay } from "../src/lib/notion-day-model";
import { buildNotionDayPlan } from "../src/lib/notion-day-plan";
import type { RunningListSource } from "../src/lib/notion-daily-source";
test("an older snapshot cannot roll the current source back", () => {
  const newer = { ...source, readAt: new Date(+now + 60000).toISOString() };
  assert.throws(
    () => refreshDaySource(newer, source, known, null, false),
    /older than/,
  );
});
const now = new Date(2026, 10, 21, 9),
  known = {
    ...emptyNotionDay(),
    start: "10:00",
    finish: "18:00",
    eventsDiscussed: true,
    extrasDiscussed: true,
    events: [{ title: "Practice", start: "16:00", end: "17:00" }],
    extras: [{ title: "Piano", minutes: 20 }],
  };
const source: RunningListSource = {
  pageId: "example",
  title: "Homework",
  readAt: now.toISOString(),
  items: ["a", "b", "c"].map((key, i) => ({
    key,
    title: "Assignment " + key,
    subject: "Literature",
    sourceUrl: "https://www.notion.so/example",
    yellowHighlighted: i === 0,
    completion: "unchecked",
  })),
  weeklyNotes: [],
  warnings: [],
};
test("refresh updates set-aside homework as well as scheduled entries", () => {
  const context = { ...known, skipKeys: ["a"] },
    next = structuredClone(source);
  next.items[0].completion = "checked";
  const result = refreshDaySource(
    source,
    next,
    context,
    buildNotionDayPlan(source, context, now),
    true,
  );
  assert.equal(result.changed, true);
  assert.equal(result.approved, false);
  assert.equal(result.plan, null);
});
test("unchanged selected homework preserves approval and timetable across refresh timestamps and unrelated edits", () => {
  const plan = buildNotionDayPlan(source, known, now),
    next = structuredClone(source);
  next.readAt = new Date(+now + 60000).toISOString();
  next.items[1].title = "Unselected changed";
  next.weeklyNotes = ["New note to discuss"];
  const result = refreshDaySource(source, next, known, plan, true);
  assert.equal(result.changed, false);
  assert.equal(result.approved, true);
  assert.deepEqual(result.plan?.entries, plan.entries);
  assert.equal(result.plan?.sourceReadAt, next.readAt);
  assert.deepEqual(result.known, known);
});
test("changed highlights, completion and source identity invalidate approval without deleting day facts", () => {
  const plan = buildNotionDayPlan(source, known, now),
    completed = structuredClone(source),
    highlighted = structuredClone(source);
  completed.items[0].completion = "checked";
  highlighted.items[1].yellowHighlighted = true;
  for (const next of [
    completed,
    highlighted,
    { ...source, pageId: "different" },
  ]) {
    const result = refreshDaySource(source, next, known, plan, true);
    assert.equal(result.changed, true);
    assert.equal(result.approved, false);
    assert.equal(result.plan, null);
    assert.deepEqual(result.known.events, known.events);
    assert.deepEqual(result.known.extras, known.extras);
    assert.equal(result.known.start, "10:00");
  }
});
test("model context keeps highlighted work after the first forty page items and tasks explicitly mentioned", () => {
  const long = {
    ...source,
    items: Array.from({ length: 100 }, (_, i) => ({
      ...source.items[0],
      key: "item-" + i,
      title: "Assignment " + i,
      yellowHighlighted: i === 90,
    })),
    weeklyNotes: ["x".repeat(4000)],
  };
  for (const compact of [false, true]) {
    const result = daySourceContext(
      long,
      known,
      "Can we include Assignment 99?",
      compact,
    );
    assert.ok(result.items.some((i) => i.key === "item-90"));
    assert.ok(result.items.some((i) => i.key === "item-99"));
    assert.equal(result.highlightedOmitted, 0);
    assert.equal(result.omitted, 100 - result.items.length);
    assert.equal(result.contextIsExcerpt, true);
    assert.ok(result.weeklyNotes[0].length <= 500);
    assert.ok(JSON.stringify(result.items).length < (compact ? 2700 : 7100));
  }
  assert.equal(long.items[0].key, "item-0");
});
test("refresh prunes missing task references while preserving explicit choices for surviving tasks", () => {
  const before = { ...known, focusOrder: ["b", "a"], skipKeys: ["c"] },
    next = { ...source, items: source.items.filter((i) => i.key === "b") };
  const result = refreshDaySource(source, next, before, null, false);
  assert.deepEqual(result.known.focusOrder, ["b"]);
  assert.deepEqual(result.known.skipKeys, []);
  assert.equal(before.focusOrder.length, 2);
  const plan = buildNotionDayPlan(next, result.known, now);
  assert.ok(plan.entries.some((e) => e.sourceKey === "b"));
});
