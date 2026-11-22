import { z } from "zod";
export const fitnessKinds = [
  "soccer",
  "running",
  "strength",
  "calisthenics",
  "mobility",
  "other",
] as const;
export const fitnessLabels: Record<(typeof fitnessKinds)[number], string> = {
  soccer: "Soccer",
  running: "Running / XC",
  strength: "Strength",
  calisthenics: "Calisthenics",
  mobility: "Flexibility / mobility",
  other: "Other activity",
};
export const exerciseRecordSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(100),
    sets: z.number().int().min(1).max(50).nullable(),
    reps: z.number().int().min(1).max(1000).nullable(),
    seconds: z.number().int().min(1).max(7200).nullable(),
    load: z.number().min(0).max(1000).nullable(),
    loadUnit: z.enum(["kg", "lb", "none"]),
    note: z.string().trim().max(500),
  })
  .refine(
    (row) => (row.loadUnit === "none" ? row.load === null : true),
    "Leave added resistance blank when no added weight is selected.",
  );
export type ExerciseRecord = z.infer<typeof exerciseRecordSchema>;
export const workoutRoutineSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(160),
    kind: z.enum(fitnessKinds),
    minutes: z.number().int().min(1).max(360),
    exercises: z.array(exerciseRecordSchema).max(40),
    note: z.string().trim().max(1500),
  })
  .refine(
    (routine) =>
      new Set(routine.exercises.map((e) => e.id)).size ===
      routine.exercises.length,
    "Exercise rows need unique IDs.",
  );
export type WorkoutRoutine = z.infer<typeof workoutRoutineSchema>;
export const workoutPlanSchema = z
  .object({
    id: z.uuid(),
    date: z.iso.date(),
    title: z.string().trim().min(1).max(160),
    kind: z.enum(fitnessKinds),
    minutes: z.number().int().min(1).max(360),
    routineId: z.uuid().nullable(),
    exercises: z.array(exerciseRecordSchema).max(40),
    includeInDayPlan: z.boolean(),
    status: z.enum(["planned", "done", "skipped"]),
    note: z.string().trim().max(1500),
  })
  .refine(
    (plan) =>
      new Set(plan.exercises.map((row) => row.id)).size ===
      plan.exercises.length,
    "Exercise rows need unique IDs.",
  );
export type WorkoutPlan = z.infer<typeof workoutPlanSchema>;
export const workoutLogSchema = z
  .object({
    id: z.uuid(),
    date: z.iso.date(),
    title: z.string().trim().min(1).max(160),
    kind: z.enum(fitnessKinds),
    minutes: z.number().int().min(1).max(1440),
    distance: z.number().positive().max(200).nullable(),
    distanceUnit: z.enum(["km", "mi"]),
    effort: z.enum(["easy", "moderate", "hard", "not_recorded"]),
    recovery: z.enum(["okay", "sore", "pain", "not_recorded"]),
    exercises: z.array(exerciseRecordSchema).max(40),
    plannedId: z.uuid().nullable(),
    note: z.string().trim().max(2000),
  })
  .refine(
    (log) => log.kind === "running" || log.distance === null,
    "Distance belongs to a running session.",
  )
  .refine(
    (log) =>
      new Set(log.exercises.map((row) => row.id)).size === log.exercises.length,
    "Exercise rows need unique IDs.",
  );
export type WorkoutLog = z.infer<typeof workoutLogSchema>;
export const fitnessPreferencesSchema = z.object({
  equipment: z.enum([
    "unknown",
    "gym",
    "home_weights",
    "no_added_weight",
    "mixed",
  ]),
  equipmentDetails: z.string().trim().max(1000).default(""),
  restrictionsStatus: z.enum(["unknown", "none_reported", "reported"]),
  restrictions: z.string().trim().max(1500),
});
export const fitnessStateSchema = z
  .object({
    routines: z.array(workoutRoutineSchema).max(150),
    plans: z.array(workoutPlanSchema).max(1000),
    logs: z.array(workoutLogSchema).max(3000),
    preferences: fitnessPreferencesSchema,
  })
  .refine(
    (state) =>
      new Set(state.routines.map((r) => r.id)).size === state.routines.length &&
      new Set(state.plans.map((r) => r.id)).size === state.plans.length &&
      new Set(state.logs.map((r) => r.id)).size === state.logs.length,
    "Workout record IDs must be unique.",
  );
export type FitnessState = z.infer<typeof fitnessStateSchema>;
export const emptyFitness = (): FitnessState => ({
  routines: [],
  plans: [],
  logs: [],
  preferences: {
    equipment: "unknown",
    equipmentDetails: "",
    restrictionsStatus: "unknown",
    restrictions: "",
  },
});
export function saveRoutine(state: FitnessState, routine: WorkoutRoutine) {
  const valid = workoutRoutineSchema.parse(routine);
  return fitnessStateSchema.parse({
    ...state,
    routines: [...state.routines.filter((row) => row.id !== valid.id), valid],
  });
}
export function planRoutine(
  state: FitnessState,
  routineId: string,
  date: string,
  includeInDayPlan = false,
): FitnessState {
  const routine = state.routines.find((row) => row.id === routineId);
  if (!routine) throw new Error("Choose a saved routine first.");
  const planned = workoutPlanSchema.parse({
    ...structuredClone(routine),
    id: crypto.randomUUID(),
    date,
    routineId,
    includeInDayPlan,
    status: "planned",
  });
  return fitnessStateSchema.parse({
    ...state,
    plans: [...state.plans, planned],
  });
}
export function saveWorkoutLog(
  state: FitnessState,
  raw: WorkoutLog,
  today: string,
): FitnessState {
  const log = workoutLogSchema.parse(raw);
  if (log.date > today)
    throw new Error(
      "Log work you have actually done. Use the plan for future sessions.",
    );
  const previous = state.logs.find((row) => row.id === log.id);
  if (previous?.plannedId !== undefined && previous.plannedId !== log.plannedId)
    throw new Error("An edited log must keep its original plan link.");
  if (log.plannedId && !state.plans.some((row) => row.id === log.plannedId))
    throw new Error(
      "The planned session is no longer available. Reload before logging it.",
    );
  if (
    log.plannedId &&
    state.plans.find((plan) => plan.id === log.plannedId)?.kind !== log.kind
  )
    throw new Error(
      "This log uses a different activity type from its plan. Log a separate session instead.",
    );
  if (
    log.plannedId &&
    state.logs.some(
      (row) => row.id !== log.id && row.plannedId === log.plannedId,
    )
  )
    throw new Error(
      "This planned session already has a log. Edit that log instead.",
    );
  return fitnessStateSchema.parse({
    ...state,
    logs: [...state.logs.filter((row) => row.id !== log.id), log],
    plans: state.plans.map((plan) =>
      plan.id === log.plannedId ? { ...plan, status: "done" } : plan,
    ),
  });
}
export function removeWorkoutLog(
  state: FitnessState,
  id: string,
): FitnessState {
  const log = state.logs.find((row) => row.id === id);
  return fitnessStateSchema.parse({
    ...state,
    logs: state.logs.filter((row) => row.id !== id),
    plans: state.plans.map((plan) =>
      plan.id === log?.plannedId ? { ...plan, status: "planned" } : plan,
    ),
  });
}
export function setWorkoutPlanStatus(
  state: FitnessState,
  id: string,
  status: "planned" | "skipped",
): FitnessState {
  if (state.logs.some((log) => log.plannedId === id))
    throw new Error(
      "This session has a completed log. Edit or remove the log before changing its plan status.",
    );
  if (!state.plans.some((plan) => plan.id === id))
    throw new Error("This planned session is unavailable.");
  return fitnessStateSchema.parse({
    ...state,
    plans: state.plans.map((plan) =>
      plan.id === id ? { ...plan, status } : plan,
    ),
  });
}
export function fitnessActivitiesForDate(state: FitnessState, date: string) {
  return fitnessStateSchema
    .parse(state)
    .plans.filter(
      (plan) =>
        plan.date === date &&
        plan.includeInDayPlan &&
        plan.status === "planned",
    )
    .map((plan) => ({
      id: plan.id,
      title: plan.title,
      kind: plan.kind,
      minutes: plan.minutes,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function fitnessSummary(state: FitnessState, from: string, to: string) {
  const logs = fitnessStateSchema
      .parse(state)
      .logs.filter((log) => log.date >= from && log.date <= to),
    byKind = fitnessKinds.map((kind) => ({
      kind,
      sessions: logs.filter((log) => log.kind === kind).length,
      minutes: logs
        .filter((log) => log.kind === kind)
        .reduce((total, log) => total + log.minutes, 0),
    }));
  const runs = logs
    .filter((log) => log.kind === "running" && log.distance !== null)
    .map((log) => ({
      ...log,
      km: log.distance! * (log.distanceUnit === "mi" ? 1.609344 : 1),
    }));
  const km = runs.reduce((total, run) => total + run.km, 0),
    runMinutes = runs.reduce((total, run) => total + run.minutes, 0);
  return {
    sessions: logs.length,
    minutes: logs.reduce((total, log) => total + log.minutes, 0),
    byKind,
    runKm: km,
    runMinutes,
    paceMinutesPerKm: km > 0 ? runMinutes / km : null,
    painReports: logs.filter((log) => log.recovery === "pain").length,
  };
}
export function runningHistory(state: FitnessState) {
  return [...state.logs]
    .filter((log) => log.kind === "running" && log.distance !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((log) => ({
      id: log.id,
      date: log.date,
      km: log.distance! * (log.distanceUnit === "mi" ? 1.609344 : 1),
      minutes: log.minutes,
      pace:
        log.minutes /
        (log.distance! * (log.distanceUnit === "mi" ? 1.609344 : 1)),
    }));
}
