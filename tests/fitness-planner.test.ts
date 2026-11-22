import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyFitness,
  planRoutine,
  saveRoutine,
  saveWorkoutLog,
  type WorkoutLog,
} from "../src/lib/fitness";
import { buildNotionDayPlan } from "../src/lib/notion-day-plan";
import { emptyNotionDay } from "../src/lib/notion-day-model";
import { emptyCalendars } from "../src/lib/calendar-transfer";
const now = new Date(2026, 10, 21, 9),
  source = {
    pageId: "synthetic",
    title: "Synthetic list",
    readAt: now.toISOString(),
    items: [
      {
        key: "a",
        title: "Read chapter",
        subject: "Literature",
        sourceUrl: "https://www.notion.so/",
        yellowHighlighted: true,
        completion: "not_specified" as const,
      },
    ],
    weeklyNotes: [],
    warnings: [],
  };
const context = {
  ...emptyNotionDay(),
  start: "10:00",
  finish: "16:00",
  eventsDiscussed: true,
  extrasDiscussed: true,
  events: [{ title: "School event", start: "11:00", end: "12:00" }],
};
function fixture(minutes = 45, include = true) {
  let state = saveRoutine(emptyFitness(), {
    id: crypto.randomUUID(),
    title: "User-selected routine",
    kind: "mobility",
    minutes,
    exercises: [],
    note: "User authored.",
  });
  return planRoutine(state, state.routines[0].id, "2026-11-21", include);
}
test("chosen training is one contiguous block around protected commitments, without changing its completion status", () => {
  const fitness = fixture(),
    result = buildNotionDayPlan(
      source,
      context,
      now,
      emptyCalendars(),
      fitness,
    ),
    activities = result.entries.filter((e) => e.kind === "activity");
  assert.equal(activities.length, 1);
  assert.equal(activities[0].activityId, fitness.plans[0].id);
  assert.equal(
    (Date.parse(activities[0].end) - Date.parse(activities[0].start)) / 60000,
    45,
  );
  assert.ok(
    Date.parse(activities[0].end) <= +new Date(2026, 10, 21, 10, 50) ||
      Date.parse(activities[0].start) >= +new Date(2026, 10, 21, 12, 10),
  );
  assert.equal(fitness.plans[0].status, "planned");
  assert.ok(result.entries.some((e) => e.kind === "study"));
});
test("workouts without opt-in stay out, and no partial workout is squeezed into a short window", () => {
  const excluded = buildNotionDayPlan(
    source,
    context,
    now,
    emptyCalendars(),
    fixture(45, false),
  );
  assert.ok(!excluded.entries.some((e) => e.kind === "activity"));
  const result = buildNotionDayPlan(
    source,
    { ...context, finish: "10:30" },
    now,
    emptyCalendars(),
    fixture(45),
  );
  assert.ok(!result.entries.some((e) => e.kind === "activity"));
  assert.ok(
    result.deferred.some((e) => e.title.includes("User-selected routine")),
  );
});
test("logging a workout removes it from future drafts only after the explicit completion report", () => {
  const fitness = fixture(),
    log: WorkoutLog = {
      id: crypto.randomUUID(),
      plannedId: fitness.plans[0].id,
      date: "2026-11-21",
      kind: "mobility",
      title: "Actual session",
      minutes: 35,
      distance: null,
      distanceUnit: "km",
      effort: "easy",
      recovery: "okay",
      exercises: [],
      note: "",
    };
  const next = saveWorkoutLog(fitness, log, "2026-11-21"),
    result = buildNotionDayPlan(source, context, now, emptyCalendars(), next);
  assert.ok(!result.entries.some((e) => e.kind === "activity"));
  assert.equal(next.plans[0].status, "done");
  assert.equal(fitness.plans[0].status, "planned");
});
