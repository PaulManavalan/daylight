"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccountWorkspace } from "./account-workspace-context";
import { usePersonalWorkspace } from "./use-personal-workspace";
import { personalProfileSchema } from "@/lib/personal-workspace";
import { localDate } from "@/lib/nutrition";
import {
  fitnessKinds,
  fitnessLabels,
  fitnessSummary,
  runningHistory,
  saveRoutine,
  planRoutine,
  saveWorkoutLog,
  removeWorkoutLog,
  setWorkoutPlanStatus,
  workoutRoutineSchema,
  workoutLogSchema,
  type FitnessState,
  type WorkoutRoutine,
  type WorkoutLog,
  type WorkoutPlan,
  type ExerciseRecord,
} from "@/lib/fitness";
import styles from "./notion-daily-planner.module.css";
import css from "./fitness-workspace.module.css";

type Kind = (typeof fitnessKinds)[number];
type Section = "overview" | "log" | "routines" | "planned";
type ExerciseDraft = {
  id: string;
  name: string;
  sets: string;
  reps: string;
  seconds: string;
  load: string;
  loadUnit: ExerciseRecord["loadUnit"];
  note: string;
};
type LogDraft = {
  id: string | null;
  date: string;
  title: string;
  kind: Kind;
  minutes: string;
  distance: string;
  distanceUnit: WorkoutLog["distanceUnit"];
  effort: WorkoutLog["effort"];
  recovery: WorkoutLog["recovery"];
  exercises: ExerciseDraft[];
  plannedId: string | null;
  note: string;
};
type RoutineDraft = {
  id: string | null;
  title: string;
  kind: Kind;
  minutes: string;
  exercises: ExerciseDraft[];
  note: string;
};
const blankLog = (date: string): LogDraft => ({
  id: null,
  date,
  title: "",
  kind: "soccer",
  minutes: "",
  distance: "",
  distanceUnit: "km",
  effort: "not_recorded",
  recovery: "not_recorded",
  exercises: [],
  plannedId: null,
  note: "",
});
const blankRoutine = (): RoutineDraft => ({
  id: null,
  title: "",
  kind: "soccer",
  minutes: "",
  exercises: [],
  note: "",
});
const nullable = (value: string) => (value.trim() ? Number(value) : null);
const displayDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const pace = (minutes: number | null) => {
  if (minutes === null || !Number.isFinite(minutes)) return "Not recorded";
  const seconds = Math.round(minutes * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
function exerciseDraft(row: ExerciseRecord): ExerciseDraft {
  return {
    ...row,
    sets: row.sets?.toString() ?? "",
    reps: row.reps?.toString() ?? "",
    seconds: row.seconds?.toString() ?? "",
    load: row.load?.toString() ?? "",
  };
}
function exerciseValues(rows: ExerciseDraft[]): ExerciseRecord[] {
  return rows.map((row) => ({
    ...row,
    sets: nullable(row.sets),
    reps: nullable(row.reps),
    seconds: nullable(row.seconds),
    load: row.loadUnit === "none" ? null : nullable(row.load),
  }));
}
function describeExercise(row: ExerciseRecord) {
  const parts: string[] = [];
  if (row.sets !== null) parts.push(`${row.sets} sets`);
  if (row.reps !== null) parts.push(`${row.reps} reps`);
  if (row.seconds !== null) parts.push(`${row.seconds} sec`);
  if (row.load !== null)
    parts.push(`${row.load} ${row.loadUnit} added resistance`);
  else if (row.loadUnit === "none") parts.push("no added resistance");
  return parts.join(" · ") || "Details not recorded";
}

function ActivitySelect({
  value,
  onChange,
  id,
  disabled = false,
}: {
  value: Kind;
  onChange: (kind: Kind) => void;
  id: string;
  disabled?: boolean;
}) {
  return (
    <label>
      Activity type
      <select
        aria-label={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as Kind)}
      >
        {fitnessKinds.map((kind) => (
          <option value={kind} key={kind}>
            {fitnessLabels[kind]}
          </option>
        ))}
      </select>
    </label>
  );
}
function ExerciseEditor({
  rows,
  onChange,
  prefix,
}: {
  rows: ExerciseDraft[];
  onChange: (rows: ExerciseDraft[]) => void;
  prefix: string;
}) {
  function update(index: number, field: keyof ExerciseDraft, value: string) {
    onChange(
      rows.map((row, i) =>
        i === index
          ? {
              ...row,
              [field]: value,
              ...(field === "loadUnit" && value === "none" ? { load: "" } : {}),
            }
          : row,
      ),
    );
  }
  return (
    <div>
      <h3>
        Exercises & drills <small className={styles.muted}>(optional)</small>
      </h3>
      <p className={styles.muted}>
        Record your own exercises and details. Blank values stay unknown; no
        training volume is supplied for you.
      </p>
      {rows.map((row, index) => (
        <fieldset className={css.exerciseRow} key={row.id}>
          <legend>
            {prefix} exercise {index + 1}
          </legend>
          <div className={css.exerciseFields}>
            <label>
              Exercise or drill
              <input
                aria-label={`${prefix} exercise ${index + 1} name`}
                required
                maxLength={100}
                value={row.name}
                onChange={(event) => update(index, "name", event.target.value)}
              />
            </label>
            <label>
              Sets
              <input
                aria-label={`${prefix} exercise ${index + 1} sets`}
                type="number"
                min={1}
                max={50}
                step={1}
                value={row.sets}
                onChange={(event) => update(index, "sets", event.target.value)}
              />
            </label>
            <label>
              Repetitions
              <input
                aria-label={`${prefix} exercise ${index + 1} reps`}
                type="number"
                min={1}
                max={1000}
                step={1}
                value={row.reps}
                onChange={(event) => update(index, "reps", event.target.value)}
              />
            </label>
            <label>
              Time, seconds
              <input
                aria-label={`${prefix} exercise ${index + 1} seconds`}
                type="number"
                min={1}
                max={7200}
                step={1}
                value={row.seconds}
                onChange={(event) =>
                  update(index, "seconds", event.target.value)
                }
              />
            </label>
            <label>
              Added resistance
              <input
                aria-label={`${prefix} exercise ${index + 1} resistance`}
                type="number"
                min={0}
                max={1000}
                step="any"
                disabled={row.loadUnit === "none"}
                value={row.load}
                onChange={(event) => update(index, "load", event.target.value)}
              />
            </label>
            <label>
              Resistance unit
              <select
                aria-label={`${prefix} exercise ${index + 1} resistance unit`}
                value={row.loadUnit}
                onChange={(event) =>
                  update(index, "loadUnit", event.target.value)
                }
              >
                <option value="none">No added weight</option>
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </label>
          </div>
          <label>
            Exercise note
            <input
              aria-label={`${prefix} exercise ${index + 1} note`}
              maxLength={500}
              value={row.note}
              onChange={(event) => update(index, "note", event.target.value)}
            />
          </label>
          <button
            className={styles.secondary}
            type="button"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            Remove {prefix.toLowerCase()} exercise {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        className={styles.secondary}
        type="button"
        disabled={rows.length >= 40}
        onClick={() =>
          onChange([
            ...rows,
            {
              id: crypto.randomUUID(),
              name: "",
              sets: "",
              reps: "",
              seconds: "",
              load: "",
              loadUnit: "none",
              note: "",
            },
          ])
        }
      >
        Add {prefix.toLowerCase()} exercise
      </button>
    </div>
  );
}

export default function FitnessWorkspace() {
  const { account } = useAccountWorkspace();
  const workspace = usePersonalWorkspace();
  const [today, setToday] = useState(""),
    [section, setSection] = useState<Section>("overview"),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [log, setLog] = useState<LogDraft>(() => blankLog("")),
    [routine, setRoutine] = useState<RoutineDraft>(blankRoutine),
    [selectedRoutine, setSelectedRoutine] = useState(""),
    [planDate, setPlanDate] = useState(""),
    [includeInDay, setIncludeInDay] = useState(false);
  const [from, setFrom] = useState(""),
    [through, setThrough] = useState(""),
    [historyKind, setHistoryKind] = useState<Kind | "all">("all"),
    [planFilter, setPlanFilter] = useState<
      "all" | "planned" | "done" | "skipped"
    >("all"),
    [preferences, setPreferences] = useState<
      FitnessState["preferences"] | null
    >(null),
    [knownTraining, setKnownTraining] = useState<
      FitnessState["preferences"] | null
    >(null);
  useEffect(() => {
    const date = localDate(new Date()),
      first = new Date(date + "T12:00:00");
    first.setDate(first.getDate() - 27);
    setToday(date);
    setLog(blankLog(date));
    setPlanDate(date);
    setThrough(date);
    setFrom(localDate(first));
    const view = new URLSearchParams(location.search).get("view");
    if (view && ["overview", "log", "routines", "planned"].includes(view))
      setSection(view as Section);
  }, []);
  const state = workspace.state,
    fitness = state?.fitness;
  useEffect(() => {
    if (fitness && !preferences)
      setPreferences(structuredClone(fitness.preferences));
  }, [fitness, preferences]);
  useEffect(() => {
    if (account) return;
    void fetch("/api/personal-profile-snapshot", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const profile = personalProfileSchema.safeParse(await response.json());
        if (profile.success && profile.data.trainingPreferences)
          setKnownTraining(profile.data.trainingPreferences);
      })
      .catch(() => {});
  }, [account]);
  function reviewTrainingPreferences() {
    if (!preferences || !knownTraining) return;
    const preserveRestrictions =
      preferences.restrictionsStatus === "reported" ||
      knownTraining.restrictionsStatus === "unknown";
    setPreferences({
      ...preferences,
      ...knownTraining,
      equipment:
        knownTraining.equipment === "unknown"
          ? preferences.equipment
          : knownTraining.equipment,
      equipmentDetails: knownTraining.equipmentDetails.trim()
        ? knownTraining.equipmentDetails
        : preferences.equipmentDetails,
      ...(preserveRestrictions
        ? {
            restrictionsStatus: preferences.restrictionsStatus,
            restrictions: preferences.restrictions,
          }
        : {}),
    });
    setMessage(
      "Confirmed training preferences from our chat are filled for review. Existing reported restrictions are preserved. Save training preferences when you are ready; no routines, plans or logs were changed.",
    );
    setError("");
  }
  function navigate(next: Section) {
    setSection(next);
    const url = new URL(location.href);
    url.searchParams.set("view", next);
    history.replaceState(
      history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }
  async function persist(next: FitnessState, success: string) {
    if (!state) return false;
    try {
      if (workspace.error) throw new Error(workspace.error);
      await workspace.save({ ...state, fitness: next });
      setMessage(success);
      setError("");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This change could not be saved. Your previous records are preserved.",
      );
      return false;
    }
  }
  async function perform(action: () => void | Promise<unknown>) {
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Review the session details before saving.",
      );
    }
  }
  const summary = useMemo(
    () =>
      fitness && from && through && from <= through
        ? fitnessSummary(fitness, from, through)
        : null,
    [fitness, from, through],
  );
  const filteredLogs = useMemo(
    () =>
      fitness
        ? [...fitness.logs]
            .filter((row) => historyKind === "all" || row.kind === historyKind)
            .sort(
              (a, b) =>
                b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
            )
        : [],
    [fitness, historyKind],
  );
  const recentRuns = useMemo(
    () =>
      fitness
        ? runningHistory(fitness).filter(
            (row) => row.date >= from && row.date <= through,
          )
        : [],
    [fitness, from, through],
  );
  const recentExercises = useMemo(
    () =>
      fitness
        ? [...fitness.logs]
            .filter((row) => row.date >= from && row.date <= through)
            .sort((a, b) => b.date.localeCompare(a.date))
            .flatMap((row) =>
              row.exercises.map((exercise) => ({
                date: row.date,
                sessionId: row.id,
                exercise,
              })),
            )
            .slice(0, 30)
        : [],
    [fitness, from, through],
  );
  const plans = useMemo(
    () =>
      fitness
        ? [...fitness.plans]
            .filter(
              (plan) => planFilter === "all" || plan.status === planFilter,
            )
            .sort(
              (a, b) =>
                b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
            )
        : [],
    [fitness, planFilter],
  );
  function submitLog() {
    if (!fitness) return;
    const parsed = workoutLogSchema.safeParse({
      ...log,
      id: log.id ?? crypto.randomUUID(),
      minutes: Number(log.minutes),
      distance: log.kind === "running" ? nullable(log.distance) : null,
      exercises: exerciseValues(log.exercises),
    });
    if (!parsed.success) {
      setError(
        "Check the session title, date and positive duration. Exercise rows need names, and any measurements must be valid nonnegative values.",
      );
      return;
    }
    void perform(async () => {
      const next = saveWorkoutLog(fitness, parsed.data, today);
      if (
        await persist(
          next,
          log.id
            ? "Session updated. Your history reflects your edited report."
            : "Session saved as work you reported completing.",
        )
      )
        setLog(blankLog(today));
    });
  }
  function editLog(saved: WorkoutLog) {
    setLog({
      ...saved,
      minutes: String(saved.minutes),
      distance: saved.distance?.toString() ?? "",
      exercises: saved.exercises.map(exerciseDraft),
    });
    navigate("log");
    setError("");
    setMessage(
      "Editing " + saved.title + ". The original stays saved until you submit.",
    );
  }
  function reviewPlan(plan: WorkoutPlan) {
    const existing = fitness?.logs.find((row) => row.plannedId === plan.id);
    if (existing) {
      editLog(existing);
      return;
    }
    setLog({
      ...blankLog(plan.date > today ? today : plan.date),
      title: plan.title,
      kind: plan.kind,
      plannedId: plan.id,
      exercises: plan.exercises.map((row) => ({
        id: row.id,
        name: row.name,
        sets: "",
        reps: "",
        seconds: "",
        load: "",
        loadUnit: row.loadUnit,
        note: "",
      })),
    });
    navigate("log");
    setError("");
    setMessage(
      "Review what you actually completed. Planned exercise names are included, but actual duration and measurements need your report. Nothing is marked done until you save.",
    );
  }
  function submitRoutine() {
    if (!fitness) return;
    const parsed = workoutRoutineSchema.safeParse({
      ...routine,
      id: routine.id ?? crypto.randomUUID(),
      minutes: Number(routine.minutes),
      exercises: exerciseValues(routine.exercises),
    });
    if (!parsed.success) {
      setError(
        "Give the routine a name and duration of 1–360 minutes. Check exercise names and any optional sets, repetitions, times or added resistance.",
      );
      return;
    }
    void perform(async () => {
      if (
        await persist(
          saveRoutine(fitness, parsed.data),
          routine.id
            ? "Routine updated. Existing planned sessions keep their original details."
            : "Routine saved. You can now choose when to use it.",
        )
      )
        setRoutine(blankRoutine());
    });
  }
  function editRoutine(saved: WorkoutRoutine) {
    setRoutine({
      ...saved,
      minutes: String(saved.minutes),
      exercises: saved.exercises.map(exerciseDraft),
    });
    navigate("routines");
    setMessage(
      "Editing " +
        saved.title +
        ". Already planned sessions and logs will keep their recorded details.",
    );
    setError("");
  }
  function submitPlan() {
    if (!fitness) return;
    void perform(async () => {
      if (
        await persist(
          planRoutine(fitness, selectedRoutine, planDate, includeInDay),
          "Session planned. Completion still needs your report." +
            (includeInDay
              ? " Make a fresh daily plan to place this flexible activity."
              : ""),
        )
      ) {
        setIncludeInDay(false);
        setSelectedRoutine("");
      }
    });
  }
  function savePreferences() {
    if (!fitness || !preferences) return;
    if (
      preferences.restrictionsStatus === "reported" &&
      !preferences.restrictions.trim()
    ) {
      setError(
        "Add the training restriction you want to keep with your records.",
      );
      return;
    }
    persist(
      {
        ...fitness,
        preferences: {
          ...preferences,
          restrictions:
            preferences.restrictionsStatus === "reported"
              ? preferences.restrictions
              : "",
        },
      },
      "Training preferences saved in this browser.",
    );
  }
  const selected = fitness?.routines.find((row) => row.id === selectedRoutine),
    largestMinutes = summary
      ? Math.max(1, ...summary.byKind.map((row) => row.minutes))
      : 1;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/day" className={styles.logo}>
          daylight<span> / fitness</span>
        </Link>
        <nav className={styles.nav}>
          <Link href="/day/meals">Meals</Link>
          <Link href="/day">← Your day</Link>
        </nav>
      </header>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>THE WORK YOU DO, IN PERSPECTIVE</p>
        <h1>
          Train. Recover.
          <br />
          <em>See your progress.</em>
        </h1>
        <p>
          Your sessions, routines and plans in one place—from team practice to a
          run or a mobility session.{" "}
          {account
            ? "Records belong to your account, with a draft kept on this device."
            : "Records stay in this browser."}
        </p>
      </section>
      <nav className={styles.moduleNav} aria-label="Fitness sections">
        {(["overview", "log", "routines", "planned"] as Section[]).map(
          (view) => (
            <button
              key={view}
              aria-pressed={section === view}
              onClick={() => navigate(view)}
            >
              {view === "overview"
                ? "Overview"
                : view === "log"
                  ? "Log session"
                  : view === "routines"
                    ? "My routines"
                    : "Planned sessions"}
            </button>
          ),
        )}
      </nav>
      {(error || workspace.error) && (
        <p className={styles.error} role="alert">
          {error || workspace.error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!state || !fitness || !today ? (
        <p>Loading your training records…</p>
      ) : (
        <>
          {section === "overview" && (
            <>
              <section className={styles.panel}>
                <div className={styles.sectionTitle}>
                  <h2>Your activity overview</h2>
                  <span>From your reported sessions</span>
                </div>
                <div className={css.filterRow}>
                  <label>
                    Progress from
                    <input
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                    />
                  </label>
                  <label>
                    Progress through
                    <input
                      type="date"
                      value={through}
                      onChange={(event) => setThrough(event.target.value)}
                    />
                  </label>
                </div>
                {!summary ? (
                  <p className={styles.muted}>
                    Choose a valid date range to review your activity.
                  </p>
                ) : (
                  <>
                    <div className={css.metrics}>
                      <div className={css.metric}>
                        <span>Sessions logged</span>
                        <strong>{summary.sessions}</strong>
                        <span>Confirmed by you</span>
                      </div>
                      <div className={css.metric}>
                        <span>Recorded activity</span>
                        <strong>{summary.minutes.toLocaleString()}</strong>
                        <span>Minutes across activities</span>
                      </div>
                      <div className={css.metric}>
                        <span>Running distance</span>
                        <strong>
                          {summary.runKm.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </strong>
                        <span>Kilometers recorded</span>
                      </div>
                      <div className={css.metric}>
                        <span>Running pace</span>
                        <strong>
                          {summary.paceMinutesPerKm === null
                            ? "—"
                            : pace(summary.paceMinutesPerKm)}
                        </strong>
                        <span>Minutes / km from known distance</span>
                      </div>
                    </div>
                    <h3>Activity mix</h3>
                    <div className={css.mix}>
                      {summary.byKind.map((row) => (
                        <div className={css.mixRow} key={row.kind}>
                          <span>{fitnessLabels[row.kind]}</span>
                          <div className={css.bar} aria-hidden="true">
                            <span
                              style={{
                                width: `${(row.minutes / largestMinutes) * 100}%`,
                              }}
                            />
                          </div>
                          <span>
                            {row.sessions} sessions · {row.minutes} min
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className={styles.muted}>
                      Totals describe what you entered, not a recommended
                      workload. Include team practices and games in your history
                      to see the whole picture. Unknown running distances are
                      excluded from pace.
                    </p>
                    {summary.painReports > 0 && (
                      <div className={css.mutedBox}>
                        <p>
                          You reported pain in {summary.painReports} session
                          {summary.painReports === 1 ? "" : "s"} in this range.
                          Keep these notes for a conversation with your coach or
                          clinician; this app does not diagnose injuries.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {!fitness.logs.length && (
                  <div className={css.empty}>
                    <p>
                      No sessions have been logged yet. Start with something you
                      actually completed; there is no sample performance
                      history.
                    </p>
                    <button onClick={() => navigate("log")}>
                      Log your first session
                    </button>
                  </div>
                )}
              </section>
              <div className={`${css.panels} ${css.section}`}>
                <section className={styles.panel}>
                  <h2>Running history</h2>
                  {!recentRuns.length ? (
                    <p className={styles.muted}>
                      Recorded runs with distance and duration will appear here.
                    </p>
                  ) : (
                    <div className={css.tableScroll}>
                      <table className={css.table}>
                        <caption className={css.srOnly}>
                          Recorded runs in the selected progress range
                        </caption>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Distance</th>
                            <th>Duration</th>
                            <th>Pace / km</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentRuns
                            .slice(-30)
                            .reverse()
                            .map((run) => (
                              <tr key={run.id}>
                                <td>{displayDate(run.date)}</td>
                                <td>{run.km.toFixed(2)} km</td>
                                <td>{run.minutes} min</td>
                                <td>{pace(run.pace)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className={styles.muted}>
                    Pace is calculated from the distance and full session
                    duration you reported. It is not a race prediction or GPS
                    measurement.
                  </p>
                </section>
                <section className={styles.panel}>
                  <h2>Recent exercise records</h2>
                  {!recentExercises.length ? (
                    <p className={styles.muted}>
                      Add exercises to your session logs to review sets,
                      repetitions, time and added resistance here.
                    </p>
                  ) : (
                    <div className={css.tableScroll}>
                      <table className={css.table}>
                        <caption className={css.srOnly}>
                          Recent reported exercises
                        </caption>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Exercise</th>
                            <th>Recorded details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentExercises.map(
                            ({ date, sessionId, exercise }) => (
                              <tr key={sessionId + exercise.id}>
                                <td>{displayDate(date)}</td>
                                <td>{exercise.name}</td>
                                <td>{describeExercise(exercise)}</td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className={styles.muted}>
                    These are historical observations. No maximum-strength
                    estimate or automatic progression is calculated.
                  </p>
                </section>
              </div>
              <section className={`${styles.panel} ${css.section}`}>
                <details>
                  <summary>Training preferences</summary>
                  {preferences && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        savePreferences();
                      }}
                    >
                      {knownTraining && (
                        <button
                          type="button"
                          className={styles.secondary}
                          onClick={reviewTrainingPreferences}
                        >
                          Review training preferences from our chat
                        </button>
                      )}
                      <div className={styles.formGrid}>
                        <label>
                          Available equipment
                          <select
                            value={preferences.equipment}
                            onChange={(event) =>
                              setPreferences({
                                ...preferences,
                                equipment: event.target
                                  .value as typeof preferences.equipment,
                              })
                            }
                          >
                            <option value="unknown">Not recorded</option>
                            <option value="gym">Gym equipment</option>
                            <option value="home_weights">
                              Weights at home
                            </option>
                            <option value="no_added_weight">
                              No added weights
                            </option>
                            <option value="mixed">Gym and home</option>
                          </select>
                        </label>
                        <label>
                          Training restrictions
                          <select
                            value={preferences.restrictionsStatus}
                            onChange={(event) =>
                              setPreferences({
                                ...preferences,
                                restrictionsStatus: event.target
                                  .value as typeof preferences.restrictionsStatus,
                              })
                            }
                          >
                            <option value="unknown">Not confirmed</option>
                            <option value="none_reported">
                              I report no current restrictions
                            </option>
                            <option value="reported">
                              I have restrictions to keep with my plans
                            </option>
                          </select>
                        </label>
                      </div>
                      <label>
                        Equipment details
                        <textarea
                          maxLength={1500}
                          value={preferences.equipmentDetails}
                          onChange={(event) =>
                            setPreferences({
                              ...preferences,
                              equipmentDetails: event.target.value,
                            })
                          }
                        />
                      </label>
                      {preferences.restrictionsStatus === "reported" && (
                        <label>
                          Restriction notes
                          <textarea
                            maxLength={1500}
                            value={preferences.restrictions}
                            onChange={(event) =>
                              setPreferences({
                                ...preferences,
                                restrictions: event.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                      <button>Save training preferences</button>
                    </form>
                  )}
                </details>
                <details>
                  <summary>Training resources</summary>
                  <div className={css.resources}>
                    <a
                      href="https://www.sportsmed.org/youth-strength-training"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Youth strength training ↗
                      <small>
                        American Orthopaedic Society for Sports Medicine ·
                        technique, supervision and individualized training
                      </small>
                    </a>
                    <a
                      href="https://www.healthychildren.org/English/health-issues/injuries-emergencies/sports-injuries/Pages/Preventing-Overuse-Injuries.aspx"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Recovery and overuse prevention ↗
                      <small>
                        American Academy of Pediatrics · consider the combined
                        demands of school and sport
                      </small>
                    </a>
                  </div>
                </details>
              </section>
            </>
          )}
          {section === "log" && (
            <div className={css.panels}>
              <section className={styles.panel}>
                <div className={styles.sectionTitle}>
                  <h2>
                    {log.id ? "Edit your session" : "Log a completed session"}
                  </h2>
                  <span>Your report, not an automatic check-in</span>
                </div>
                {log.plannedId && (
                  <div className={css.mutedBox}>
                    <p>
                      This log is linked to a planned session. Review actual
                      work before saving. Planned measurements have not been
                      copied as completed work.
                    </p>
                    {!log.id && (
                      <button
                        className={styles.secondary}
                        onClick={() => setLog({ ...log, plannedId: null })}
                      >
                        Log separately instead
                      </button>
                    )}
                  </div>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitLog();
                  }}
                >
                  <label>
                    Session title
                    <input
                      required
                      maxLength={160}
                      value={log.title}
                      onChange={(event) =>
                        setLog({ ...log, title: event.target.value })
                      }
                    />
                  </label>
                  <div className={styles.formGrid}>
                    <label>
                      Session date
                      <input
                        type="date"
                        required
                        max={today}
                        value={log.date}
                        onChange={(event) =>
                          setLog({ ...log, date: event.target.value })
                        }
                      />
                    </label>
                    <ActivitySelect
                      id="Session activity type"
                      value={log.kind}
                      disabled={Boolean(log.plannedId)}
                      onChange={(kind) =>
                        setLog({
                          ...log,
                          kind,
                          distance: kind === "running" ? log.distance : "",
                        })
                      }
                    />
                    <label>
                      Total session time (minutes)
                      <input
                        type="number"
                        required
                        min={1}
                        max={1440}
                        step={1}
                        value={log.minutes}
                        onChange={(event) =>
                          setLog({ ...log, minutes: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <p className={styles.muted}>
                    Use the full session time, including warm-up and breaks when
                    applicable.
                  </p>
                  {log.kind === "running" && (
                    <div className={styles.formGrid}>
                      <label>
                        Distance (optional)
                        <input
                          type="number"
                          min={0.001}
                          max={200}
                          step="any"
                          value={log.distance}
                          onChange={(event) =>
                            setLog({ ...log, distance: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Distance unit
                        <select
                          value={log.distanceUnit}
                          onChange={(event) =>
                            setLog({
                              ...log,
                              distanceUnit: event.target
                                .value as WorkoutLog["distanceUnit"],
                            })
                          }
                        >
                          <option value="km">Kilometers</option>
                          <option value="mi">Miles</option>
                        </select>
                      </label>
                    </div>
                  )}
                  <div className={styles.formGrid}>
                    <label>
                      Effort
                      <select
                        value={log.effort}
                        onChange={(event) =>
                          setLog({
                            ...log,
                            effort: event.target.value as WorkoutLog["effort"],
                          })
                        }
                      >
                        <option value="not_recorded">Not recorded</option>
                        <option value="easy">Easy</option>
                        <option value="moderate">Moderate</option>
                        <option value="hard">Hard</option>
                      </select>
                    </label>
                    <label>
                      Recovery
                      <select
                        value={log.recovery}
                        onChange={(event) =>
                          setLog({
                            ...log,
                            recovery: event.target
                              .value as WorkoutLog["recovery"],
                          })
                        }
                      >
                        <option value="not_recorded">Not recorded</option>
                        <option value="okay">Felt okay</option>
                        <option value="sore">Sore</option>
                        <option value="pain">Pain reported</option>
                      </select>
                    </label>
                  </div>
                  <ExerciseEditor
                    prefix="Session"
                    rows={log.exercises}
                    onChange={(exercises) => setLog({ ...log, exercises })}
                  />
                  <label>
                    Session notes
                    <textarea
                      maxLength={2000}
                      value={log.note}
                      onChange={(event) =>
                        setLog({ ...log, note: event.target.value })
                      }
                    />
                  </label>
                  <button>
                    {log.id ? "Save session changes" : "Save session"}
                  </button>
                  {(log.id || log.plannedId) && (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => {
                        setLog(blankLog(today));
                        setMessage(
                          "Draft canceled. Saved records are unchanged.",
                        );
                        setError("");
                      }}
                    >
                      Cancel session edit
                    </button>
                  )}
                </form>
              </section>
              <section className={styles.panel}>
                <div className={styles.sectionTitle}>
                  <h2>Session history</h2>
                  <span>{fitness.logs.length} reported</span>
                </div>
                <label>
                  Filter session history
                  <select
                    value={historyKind}
                    onChange={(event) =>
                      setHistoryKind(event.target.value as Kind | "all")
                    }
                  >
                    <option value="all">All activities</option>
                    {fitnessKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {fitnessLabels[kind]}
                      </option>
                    ))}
                  </select>
                </label>
                {!filteredLogs.length ? (
                  <p className={css.empty}>No matching sessions yet.</p>
                ) : (
                  filteredLogs.map((saved) => (
                    <article className={css.row} key={saved.id}>
                      <div className={css.rowHeader}>
                        <div>
                          <h3>{saved.title}</h3>
                          <p className={styles.muted}>
                            {displayDate(saved.date)} ·{" "}
                            {fitnessLabels[saved.kind]} · {saved.minutes} min
                          </p>
                        </div>
                        <span className={css.badge} data-status="done">
                          Reported complete
                        </span>
                      </div>
                      {saved.distance !== null && (
                        <p>
                          {saved.distance} {saved.distanceUnit} recorded
                        </p>
                      )}
                      <p className={styles.muted}>
                        {saved.effort === "not_recorded"
                          ? "Effort not recorded"
                          : saved.effort + " effort"}{" "}
                        ·{" "}
                        {saved.recovery === "not_recorded"
                          ? "Recovery not recorded"
                          : saved.recovery === "pain"
                            ? "Pain reported"
                            : saved.recovery === "sore"
                              ? "Soreness reported"
                              : "Felt okay"}
                      </p>
                      {saved.note && <p>{saved.note}</p>}
                      {saved.exercises.length > 0 && (
                        <details>
                          <summary>
                            Exercise details · {saved.exercises.length}
                          </summary>
                          <ul>
                            {saved.exercises.map((row) => (
                              <li key={row.id}>
                                <strong>{row.name}</strong> ·{" "}
                                {describeExercise(row)}
                                {row.note ? " · " + row.note : ""}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <div className={css.historyActions}>
                        <button
                          className={styles.secondary}
                          onClick={() => editLog(saved)}
                        >
                          Edit {saved.title}
                        </button>
                        <button
                          className={styles.secondary}
                          onClick={() => {
                            if (
                              confirm(
                                "Delete this session log? A linked plan will return to planned, because its completion would no longer have a report.",
                              )
                            )
                              perform(() =>
                                persist(
                                  removeWorkoutLog(fitness, saved.id),
                                  "Session deleted. Any linked plan is back to planned.",
                                ),
                              );
                          }}
                        >
                          Delete {saved.title}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </section>
            </div>
          )}
          {section === "routines" && (
            <div className={css.panels}>
              <section className={styles.panel}>
                <div className={styles.sectionTitle}>
                  <h2>
                    {routine.id ? "Edit your routine" : "Create a routine"}
                  </h2>
                  <span>Your own plan</span>
                </div>
                <p className={styles.muted}>
                  Save a routine from your coach or one you already use. Nothing
                  here automatically prescribes sets, repetitions, pace or added
                  resistance.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitRoutine();
                  }}
                >
                  <label>
                    Routine title
                    <input
                      required
                      maxLength={160}
                      value={routine.title}
                      onChange={(event) =>
                        setRoutine({ ...routine, title: event.target.value })
                      }
                    />
                  </label>
                  <div className={styles.formGrid}>
                    <ActivitySelect
                      id="Routine activity type"
                      value={routine.kind}
                      onChange={(kind) => setRoutine({ ...routine, kind })}
                    />
                    <label>
                      Planned total session time (minutes)
                      <input
                        type="number"
                        required
                        min={1}
                        max={360}
                        step={1}
                        value={routine.minutes}
                        onChange={(event) =>
                          setRoutine({
                            ...routine,
                            minutes: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <ExerciseEditor
                    prefix="Routine"
                    rows={routine.exercises}
                    onChange={(exercises) =>
                      setRoutine({ ...routine, exercises })
                    }
                  />
                  <label>
                    Routine notes
                    <textarea
                      maxLength={1500}
                      value={routine.note}
                      onChange={(event) =>
                        setRoutine({ ...routine, note: event.target.value })
                      }
                    />
                  </label>
                  <button>
                    {routine.id ? "Save routine changes" : "Save routine"}
                  </button>
                  {routine.id && (
                    <button
                      className={styles.secondary}
                      type="button"
                      onClick={() => {
                        setRoutine(blankRoutine());
                        setMessage(
                          "Routine edit canceled. Your saved routine is unchanged.",
                        );
                        setError("");
                      }}
                    >
                      Cancel routine edit
                    </button>
                  )}
                </form>
              </section>
              <section className={styles.panel}>
                <div className={styles.sectionTitle}>
                  <h2>Saved routines</h2>
                  <span>{fitness.routines.length} saved</span>
                </div>
                {!fitness.routines.length ? (
                  <p className={css.empty}>
                    Your own routines will appear here. You can log a completed
                    team practice or run without creating one first.
                  </p>
                ) : (
                  fitness.routines.map((saved) => (
                    <article className={css.row} key={saved.id}>
                      <h3>{saved.title}</h3>
                      <p className={styles.muted}>
                        {fitnessLabels[saved.kind]} · {saved.minutes} planned
                        minutes
                      </p>
                      {saved.note && <p>{saved.note}</p>}
                      {saved.exercises.length > 0 && (
                        <details>
                          <summary>
                            Planned exercises · {saved.exercises.length}
                          </summary>
                          <ul>
                            {saved.exercises.map((row) => (
                              <li key={row.id}>
                                <strong>{row.name}</strong> ·{" "}
                                {describeExercise(row)}
                                {row.note ? " · " + row.note : ""}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <button
                        onClick={() => {
                          setSelectedRoutine(saved.id);
                          navigate("planned");
                          setError("");
                        }}
                      >
                        Plan {saved.title}
                      </button>
                      <button
                        className={styles.secondary}
                        onClick={() => editRoutine(saved)}
                      >
                        Edit routine {saved.title}
                      </button>
                      <button
                        className={styles.secondary}
                        onClick={async () => {
                          if (
                            confirm(
                              "Remove this saved routine? Already planned sessions and completed logs will keep their recorded details.",
                            )
                          ) {
                            if (
                              await persist(
                                {
                                  ...fitness,
                                  routines: fitness.routines.filter(
                                    (row) => row.id !== saved.id,
                                  ),
                                },
                                "Routine removed. Planned sessions and logs were preserved.",
                              )
                            ) {
                              if (routine.id === saved.id)
                                setRoutine(blankRoutine());
                              if (selectedRoutine === saved.id)
                                setSelectedRoutine("");
                            }
                          }
                        }}
                      >
                        Remove routine {saved.title}
                      </button>
                    </article>
                  ))
                )}
              </section>
            </div>
          )}
          {section === "planned" && (
            <section className={styles.panel}>
              <div className={styles.sectionTitle}>
                <h2>Planned sessions</h2>
                <span>Time passing never marks a session done</span>
              </div>
              {!fitness.routines.length ? (
                <div className={css.empty}>
                  <p>
                    Create a routine first if you want to choose a future
                    training session. You can still log any completed activity
                    directly.
                  </p>
                  <button onClick={() => navigate("routines")}>
                    Create my first routine
                  </button>
                </div>
              ) : (
                <form
                  className={css.planForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitPlan();
                  }}
                >
                  <h3>Choose a session for your plan</h3>
                  <div className={styles.formGrid}>
                    <label>
                      Routine to plan
                      <select
                        required
                        value={selectedRoutine}
                        onChange={(event) =>
                          setSelectedRoutine(event.target.value)
                        }
                      >
                        <option value="">Choose a saved routine</option>
                        {fitness.routines.map((saved) => (
                          <option key={saved.id} value={saved.id}>
                            {saved.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Planned session date
                      <input
                        type="date"
                        required
                        value={planDate}
                        onChange={(event) => setPlanDate(event.target.value)}
                      />
                    </label>
                  </div>
                  {selected && (
                    <p className={styles.muted}>
                      {fitnessLabels[selected.kind]} · {selected.minutes}{" "}
                      planned minutes. This stores a snapshot; editing the
                      routine later will not rewrite the planned session.
                    </p>
                  )}
                  <label className={css.checkLabel}>
                    <input
                      type="checkbox"
                      checked={includeInDay}
                      onChange={(event) =>
                        setIncludeInDay(event.target.checked)
                      }
                    />
                    Include as a flexible activity in my day plan
                  </label>
                  <p className={styles.muted}>
                    Choose this for activity you can move around other
                    commitments. Use your calendar for a fixed team practice or
                    appointment. A new daily draft is needed before a time is
                    assigned.
                  </p>
                  <button disabled={!selectedRoutine}>Plan routine</button>
                </form>
              )}
              <label>
                Filter planned sessions
                <select
                  value={planFilter}
                  onChange={(event) =>
                    setPlanFilter(event.target.value as typeof planFilter)
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="planned">Planned</option>
                  <option value="done">Reported complete</option>
                  <option value="skipped">Skipped</option>
                </select>
              </label>
              {!plans.length ? (
                <p className={css.empty}>No sessions match this view.</p>
              ) : (
                plans.map((plan) => (
                  <article className={css.row} key={plan.id}>
                    <div className={css.rowHeader}>
                      <div>
                        <h3>{plan.title}</h3>
                        <p className={styles.muted}>
                          {displayDate(plan.date)} · {fitnessLabels[plan.kind]}{" "}
                          · {plan.minutes} planned minutes
                        </p>
                      </div>
                      <span className={css.badge} data-status={plan.status}>
                        {plan.status === "done"
                          ? "Reported complete"
                          : plan.status === "skipped"
                            ? "Skipped"
                            : "Planned"}
                      </span>
                    </div>
                    {plan.status === "planned" && plan.date < today && (
                      <p className={styles.muted}>
                        This date has passed. It remains planned until you
                        report an outcome.
                      </p>
                    )}
                    <p className={styles.muted}>
                      {plan.includeInDayPlan
                        ? "Selected for the flexible daily plan while this session remains planned."
                        : "Kept in your training plan; not selected for the daily timetable."}
                    </p>
                    {plan.note && <p>{plan.note}</p>}
                    {plan.status === "planned" && (
                      <>
                        <button onClick={() => reviewPlan(plan)}>
                          Review completed session {plan.title}
                        </button>
                        <button
                          className={styles.secondary}
                          onClick={() =>
                            perform(() =>
                              persist(
                                setWorkoutPlanStatus(
                                  fitness,
                                  plan.id,
                                  "skipped",
                                ),
                                "Session marked skipped. No completed work was recorded.",
                              ),
                            )
                          }
                        >
                          Skip {plan.title}
                        </button>
                      </>
                    )}
                    {plan.status === "done" && (
                      <button
                        className={styles.secondary}
                        onClick={() => reviewPlan(plan)}
                      >
                        Edit completed log {plan.title}
                      </button>
                    )}
                    {plan.status === "skipped" && (
                      <button
                        className={styles.secondary}
                        onClick={() =>
                          perform(() =>
                            persist(
                              setWorkoutPlanStatus(fitness, plan.id, "planned"),
                              "Session returned to planned. Completion still needs your report.",
                            ),
                          )
                        }
                      >
                        Restore plan {plan.title}
                      </button>
                    )}
                  </article>
                ))
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
