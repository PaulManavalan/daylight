import { practiceAttemptSchema } from "./sat-practice";
import { satDayReviewSchema } from "./sat-day-review";
import { z } from "zod";
import { taskInputSchema, type TaskInput } from "./types";
export const satSectionSchema = z.enum(["math", "reading_writing"]);
export type SatSection = z.infer<typeof satSectionSchema>;
export const satSectionLabels = {
  math: "Math",
  reading_writing: "Reading & Writing",
};
const scaledScore = z.number().int().min(200).max(800).multipleOf(10);
export const satScoreSchema = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  kind: z.enum(["practice", "official"]),
  label: z.string().trim().min(1).max(120),
  math: scaledScore,
  reading_writing: scaledScore,
});
export const satErrorSchema = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  section: satSectionSchema,
  topic: z.string().trim().min(1).max(100),
  note: z.string().trim().min(1).max(2000),
  reviewed: z.boolean(),
});
export const satStateSchema = z
  .object({
    version: z.literal(1),
    goal: z.number().int().min(400).max(1600).multipleOf(10),
    nextTestDate: z.iso.date().nullable(),
    scores: z.array(satScoreSchema).max(200),
    errors: z.array(satErrorSchema).max(1000),
    attempts: z.array(practiceAttemptSchema).max(3000).default([]),
    reviewPlans: z.array(satDayReviewSchema).max(365).default([]),
  })
  .refine(
    (s) =>
      new Set(s.scores.map((x) => x.id)).size === s.scores.length &&
      new Set(s.errors.map((x) => x.id)).size === s.errors.length,
    "SAT record IDs must be unique.",
  )
  .refine(
    (s) => new Set(s.attempts.map((a) => a.id)).size === s.attempts.length,
    "Practice attempt IDs must be unique.",
  )
  .refine(
    (s) =>
      new Set(s.reviewPlans.map((review) => review.id)).size ===
      s.reviewPlans.length,
    "Practice plan IDs must be unique.",
  );
export type SatState = z.infer<typeof satStateSchema>;
export const satKey = (owner: string) => "daylight.sat.v1." + owner;
export const defaultSat = (): SatState => ({
  version: 1,
  goal: 1550,
  nextTestDate: null,
  scores: [],
  errors: [],
  attempts: [],
  reviewPlans: [],
});
interface SatStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export class SatStore {
  readonly key: string;
  constructor(
    private storage: SatStorage,
    private owner: string,
  ) {
    this.key = satKey(owner);
  }
  load() {
    if (
      this.owner === "local-demo" &&
      this.storage.getItem("daylight.restore.pending.v1") !== null
    )
      throw new Error(
        "Reload to finish your workspace restore before editing SAT records.",
      );
    const raw = this.storage.getItem(this.key);
    if (raw === null) return { state: defaultSat(), raw };
    try {
      return { state: satStateSchema.parse(JSON.parse(raw)), raw };
    } catch {
      throw new Error(
        "Saved SAT data needs recovery. Download its raw copy before making changes; it has not been reset.",
      );
    }
  }
  save(state: SatState, expected: string | null) {
    if (
      this.owner === "local-demo" &&
      this.storage.getItem("daylight.restore.pending.v1") !== null
    )
      throw new Error(
        "Finish your workspace restore before editing SAT records.",
      );
    const next = JSON.stringify(satStateSchema.parse(state));
    if (this.storage.getItem(this.key) !== expected)
      throw new Error(
        "SAT records changed in another tab. Reload before saving.",
      );
    try {
      this.storage.setItem(this.key, next);
    } catch {
      throw new Error(
        "Browser storage could not save your SAT records. Your previous data is preserved.",
      );
    }
    return next;
  }
}
export function satSummary(state: SatState) {
  const scores = [...state.scores].sort((a, b) => b.date.localeCompare(a.date));
  const topics = new Map<
    string,
    { section: SatSection; topic: string; logged: number; unreviewed: number }
  >();
  for (const error of state.errors) {
    const key = error.section + ":" + error.topic.trim().toLowerCase(),
      row = topics.get(key) ?? {
        section: error.section,
        topic: error.topic,
        logged: 0,
        unreviewed: 0,
      };
    row.logged++;
    if (!error.reviewed) row.unreviewed++;
    topics.set(key, row);
  }
  const focus = [...topics.values()].sort(
    (a, b) =>
      b.unreviewed - a.unreviewed ||
      b.logged - a.logged ||
      a.topic.localeCompare(b.topic),
  );
  return {
    goal: state.goal,
    nextTestDate: state.nextTestDate,
    latest: scores[0]
      ? { ...scores[0], total: scores[0].math + scores[0].reading_writing }
      : null,
    bestTotal: scores.length
      ? Math.max(...scores.map((s) => s.math + s.reading_writing))
      : null,
    scoreCount: scores.length,
    unreviewed: state.errors.filter((e) => !e.reviewed).length,
    focus: focus.slice(0, 5),
    evidence:
      "Manually entered SAT records. Logged mistake frequency is not a diagnostic score or proof of mastery.",
  };
}
export function satReviewTask(
  state: SatState,
  section: SatSection,
  topic: string,
  minutes: number,
): TaskInput {
  satStateSchema.parse(state);
  satSectionSchema.parse(section);
  z.number().int().min(5).max(120).parse(minutes);
  const label = z.string().trim().min(1).max(100).parse(topic);
  return taskInputSchema.parse({
    title: `SAT ${satSectionLabels[section]}: ${label}`,
    subject: "SAT",
    description: `Targeted review for the ${state.goal} goal. Review logged mistakes on ${label}, then try fresh practice questions and record what you learned.`,
    deadline: state.nextTestDate
      ? new Date(state.nextTestDate + "T23:59:00").toISOString()
      : null,
    estimated_minutes: minutes,
    remaining_minutes: minutes,
    priority: "medium",
    energy_level: null,
    status: "not_started",
  });
}
