import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyFitness,
  exerciseRecordSchema,
  fitnessActivitiesForDate,
  fitnessStateSchema,
  fitnessSummary,
  planRoutine,
  removeWorkoutLog,
  runningHistory,
  saveRoutine,
  saveWorkoutLog,
  setWorkoutPlanStatus,
  workoutLogSchema,
  workoutPlanSchema,
  type ExerciseRecord,
  type FitnessState,
  type WorkoutLog,
  type WorkoutRoutine,
} from "../src/lib/fitness";
import {
  defaultPersonalWorkspace,
  personalWorkspaceSchema,
} from "../src/lib/personal-workspace";

const today = "2026-11-21";
const exercise = (): ExerciseRecord => ({
  id: crypto.randomUUID(),
  name: "User-recorded exercise",
  sets: 2,
  reps: 5,
  seconds: null,
  load: 12,
  loadUnit: "kg",
  note: "Synthetic record, not a workout recommendation.",
});
const routine = (): WorkoutRoutine => ({
  id: crypto.randomUUID(),
  title: "My saved routine",
  kind: "strength",
  minutes: 20,
  exercises: [exercise()],
  note: "Entered by the user.",
});
const log = (overrides: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: crypto.randomUUID(),
  date: today,
  title: "My reported session",
  kind: "soccer",
  minutes: 30,
  distance: null,
  distanceUnit: "km",
  effort: "not_recorded",
  recovery: "not_recorded",
  exercises: [],
  plannedId: null,
  note: "Synthetic self-report.",
  ...overrides,
});
function planned(include = false, date = today) {
  const saved = routine();
  const state = planRoutine(
    saveRoutine(emptyFitness(), saved),
    saved.id,
    date,
    include,
  );
  return { state, saved, plan: state.plans[0] };
}

test("user-authored routines are saved by identity and planning takes an independent snapshot", () => {
  const initial = planned(true);
  const changed = {
    ...initial.saved,
    title: "Renamed routine",
    minutes: 35,
    exercises: [{ ...initial.saved.exercises[0], reps: 7 }],
  };
  const updated = saveRoutine(initial.state, changed);
  assert.equal(updated.routines.length, 1);
  assert.equal(updated.routines[0].title, "Renamed routine");
  assert.equal(updated.plans[0].title, "My saved routine");
  assert.equal(updated.plans[0].minutes, 20);
  assert.equal(updated.plans[0].exercises[0].reps, 5);
  changed.exercises[0].reps = 9;
  assert.equal(updated.plans[0].exercises[0].reps, 5);
  assert.throws(() => planRoutine(emptyFitness(), crypto.randomUUID(), today));
});

test("calendar inclusion is opt-in, date-scoped and never inferred from an elapsed plan", () => {
  const privatePlan = planned(false);
  assert.deepEqual(fitnessActivitiesForDate(privatePlan.state, today), []);
  const past = planned(true, "2026-11-19");
  const before = JSON.stringify(past.state);
  assert.deepEqual(fitnessActivitiesForDate(past.state, today), []);
  assert.equal(fitnessActivitiesForDate(past.state, "2026-11-19").length, 1);
  assert.equal(past.state.plans[0].status, "planned");
  assert.equal(past.state.logs.length, 0);
  assert.equal(JSON.stringify(past.state), before);
  const included = planned(true);
  const activities = fitnessActivitiesForDate(included.state, today);
  assert.deepEqual(
    activities.map((activity) => [
      activity.id,
      activity.title,
      activity.minutes,
    ]),
    [[included.plan.id, included.plan.title, included.plan.minutes]],
  );
});

test("a future report is rejected without changing the plan or history", () => {
  const { state, plan } = planned(true);
  const before = JSON.stringify(state);
  assert.throws(
    () =>
      saveWorkoutLog(
        state,
        log({ date: "2026-11-22", kind: plan.kind, plannedId: plan.id }),
        today,
      ),
    /actually done|future/i,
  );
  assert.equal(JSON.stringify(state), before);
  assert.equal(state.plans[0].status, "planned");
});

test("a completed log cannot fulfill a planned session of a different activity type", () => {
  const { state, plan } = planned(true);
  const before = JSON.stringify(state);
  assert.throws(
    () =>
      saveWorkoutLog(state, log({ kind: "soccer", plannedId: plan.id }), today),
    /activity type|activity kind|different/i,
  );
  assert.equal(JSON.stringify(state), before);
  assert.equal(state.plans[0].status, "planned");
  const standalone = saveWorkoutLog(state, log({ kind: "soccer" }), today);
  assert.equal(standalone.logs.length, 1);
  assert.equal(standalone.plans[0].status, "planned");
});

test("only an explicit completed-session save marks a linked plan done, and edits replace that log", () => {
  const initial = planned(true);
  const report = log({
    kind: initial.plan.kind,
    plannedId: initial.plan.id,
    minutes: 18,
    exercises: [exercise()],
  });
  const completed = saveWorkoutLog(initial.state, report, today);
  assert.equal(completed.plans[0].status, "done");
  assert.equal(initial.state.plans[0].status, "planned");
  assert.equal(completed.logs.length, 1);
  assert.deepEqual(fitnessActivitiesForDate(completed, today), []);
  const edited = saveWorkoutLog(completed, { ...report, minutes: 21 }, today);
  assert.equal(edited.logs.length, 1);
  assert.equal(edited.logs[0].minutes, 21);
  assert.equal(edited.logs[0].id, report.id);
  assert.throws(
    () =>
      saveWorkoutLog(completed, { ...report, id: crypto.randomUUID() }, today),
    /already has a log/,
  );
  assert.throws(
    () => saveWorkoutLog(completed, { ...report, plannedId: null }, today),
    /original plan link/,
  );
  assert.throws(
    () =>
      saveWorkoutLog(
        emptyFitness(),
        log({ plannedId: crypto.randomUUID() }),
        today,
      ),
    /no longer available/,
  );
});

test("removing a linked log restores its plan while unlinked logs cannot change another plan", () => {
  const initial = planned(true);
  const report = log({ kind: initial.plan.kind, plannedId: initial.plan.id });
  const completed = saveWorkoutLog(initial.state, report, today);
  const restored = removeWorkoutLog(completed, report.id);
  assert.equal(restored.logs.length, 0);
  assert.equal(restored.plans[0].status, "planned");
  assert.equal(fitnessActivitiesForDate(restored, today).length, 1);
  const standalone = log();
  const withStandalone = saveWorkoutLog(completed, standalone, today);
  const withoutStandalone = removeWorkoutLog(withStandalone, standalone.id);
  assert.equal(withoutStandalone.plans[0].status, "done");
  assert.equal(withoutStandalone.logs.length, 1);
});

test("users can skip and reopen unlogged plans but cannot silently override a completion", () => {
  const initial = planned(true);
  const skipped = setWorkoutPlanStatus(
    initial.state,
    initial.plan.id,
    "skipped",
  );
  assert.equal(skipped.plans[0].status, "skipped");
  assert.deepEqual(fitnessActivitiesForDate(skipped, today), []);
  const reopened = setWorkoutPlanStatus(skipped, initial.plan.id, "planned");
  assert.equal(fitnessActivitiesForDate(reopened, today).length, 1);
  const completed = saveWorkoutLog(
    reopened,
    log({ kind: initial.plan.kind, plannedId: initial.plan.id }),
    today,
  );
  assert.throws(
    () => setWorkoutPlanStatus(completed, initial.plan.id, "skipped"),
    /completed log/,
  );
  assert.throws(
    () => setWorkoutPlanStatus(initial.state, crypto.randomUUID(), "skipped"),
    /unavailable/,
  );
});

test("running summaries normalize miles and exclude unknown distances from pace calculations", () => {
  const records = [
    log({
      kind: "running",
      date: "2026-11-20",
      minutes: 10,
      distance: 1,
      distanceUnit: "mi",
    }),
    log({ kind: "running", minutes: 20, distance: 2, distanceUnit: "km" }),
    log({ kind: "running", minutes: 60, distance: null }),
    log({ kind: "running", date: "2026-11-10", minutes: 30, distance: 3 }),
  ];
  const state: FitnessState = { ...emptyFitness(), logs: records };
  const summary = fitnessSummary(state, "2026-11-20", today);
  assert.equal(summary.sessions, 3);
  assert.equal(summary.minutes, 90);
  assert.ok(Math.abs(summary.runKm - 3.609344) < 0.000001);
  assert.equal(summary.runMinutes, 30);
  assert.ok(Math.abs(summary.paceMinutesPerKm! - 30 / 3.609344) < 0.000001);
  const history = runningHistory(state);
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((row) => row.date),
    ["2026-11-10", "2026-11-20", today],
  );
  assert.ok(Math.abs(history[1].pace - 10 / 1.609344) < 0.000001);
  const unknownOnly = fitnessSummary(
    { ...emptyFitness(), logs: [records[2]] },
    today,
    today,
  );
  assert.equal(unknownOnly.paceMinutesPerKm, null);
});

test("activity totals include team sport, strength and mobility without interpreting self-reports as prescriptions", () => {
  const state: FitnessState = {
    ...emptyFitness(),
    logs: [
      log({ kind: "soccer", minutes: 50 }),
      log({ kind: "strength", minutes: 20, exercises: [exercise()] }),
      log({ kind: "mobility", minutes: 10, recovery: "pain" }),
      log({ kind: "calisthenics", minutes: 15 }),
      log({ kind: "other", date: "2026-11-19", minutes: 25 }),
    ],
  };
  const summary = fitnessSummary(state, today, today);
  assert.equal(summary.sessions, 4);
  assert.equal(summary.minutes, 95);
  assert.equal(
    summary.byKind.find((row) => row.kind === "soccer")?.minutes,
    50,
  );
  assert.equal(
    summary.byKind.find((row) => row.kind === "strength")?.sessions,
    1,
  );
  assert.equal(
    summary.byKind.find((row) => row.kind === "mobility")?.minutes,
    10,
  );
  assert.equal(summary.byKind.find((row) => row.kind === "other")?.sessions, 0);
  assert.equal(summary.painReports, 1);
  assert.equal("recommendedMinutes" in summary, false);
  assert.equal("calories" in summary, false);
});

test("record validation rejects inconsistent external resistance and malformed activity data", () => {
  assert.equal(
    exerciseRecordSchema.safeParse({ ...exercise(), loadUnit: "none" }).success,
    false,
  );
  assert.equal(
    exerciseRecordSchema.safeParse({
      ...exercise(),
      loadUnit: "none",
      load: null,
    }).success,
    true,
  );
  assert.equal(
    workoutLogSchema.safeParse(log({ kind: "soccer", distance: 2 })).success,
    false,
  );
  assert.equal(workoutLogSchema.safeParse(log({ minutes: 0 })).success, false);
  const row = exercise();
  assert.equal(
    workoutLogSchema.safeParse(log({ kind: "strength", exercises: [row, row] }))
      .success,
    false,
  );
  const { plan } = planned();
  assert.equal(
    workoutPlanSchema.safeParse({ ...plan, exercises: [row, row] }).success,
    false,
  );
  assert.equal(
    workoutPlanSchema.safeParse({
      ...plan,
      exercises: [row, { ...row, id: crypto.randomUUID() }],
    }).success,
    true,
  );
  const duplicate = log();
  assert.equal(
    fitnessStateSchema.safeParse({
      ...emptyFitness(),
      logs: [duplicate, duplicate],
    }).success,
    false,
  );
});

test("older personal data gains empty fitness records without losing food preferences, nutrition or calendars", () => {
  const full = defaultPersonalWorkspace();
  full.food.dislikes = ["Synthetic dislike"];
  full.nutrition.hiddenIdeas = [crypto.randomUUID()];
  full.calendars.calendars = [
    {
      id: "Synthetic calendar",
      provider: "google",
      readAt: "2026-11-21T10:00:00.000Z",
      rangeStart: "2026-11-21T00:00:00.000Z",
      rangeEnd: "2026-12-21T00:00:00.000Z",
      warnings: [],
      events: [],
    },
  ];
  const { fitness, ...old } = full;
  const restored = personalWorkspaceSchema.parse(old);
  assert.deepEqual(restored.fitness, emptyFitness());
  assert.equal(restored.fitness.preferences.restrictionsStatus, "unknown");
  assert.deepEqual(restored.food, full.food);
  assert.deepEqual(restored.nutrition, full.nutrition);
  assert.deepEqual(restored.calendars, full.calendars);
});
