import { dateKey } from "./scheduling";
import type { NotionDayPlan } from "./notion-day-plan";

/** Clock position describes a schedule, never work actually completed. */
export function dayTimeline(plan: NotionDayPlan, now = new Date()) {
  const empty = {
    active: [] as NotionDayPlan["entries"],
    next: null as NotionDayPlan["entries"][number] | null,
  };
  if (plan.day !== dateKey(now))
    return { ...empty, phase: "different_day" as const };
  if (
    plan.entries.some(
      (entry) =>
        !Number.isFinite(Date.parse(entry.start)) ||
        !Number.isFinite(Date.parse(entry.end)) ||
        Date.parse(entry.end) <= Date.parse(entry.start),
    )
  )
    return { ...empty, phase: "invalid" as const };
  const entries = [...plan.entries].sort(
    (a, b) =>
      Date.parse(a.start) - Date.parse(b.start) ||
      Date.parse(a.end) - Date.parse(b.end),
  );
  const active = entries.filter(
    (entry) => Date.parse(entry.start) <= +now && Date.parse(entry.end) > +now,
  );
  const next = entries.find((entry) => Date.parse(entry.start) > +now) ?? null;
  return {
    active,
    next,
    phase: active.length
      ? ("active" as const)
      : next
        ? ("upcoming" as const)
        : ("elapsed" as const),
  };
}
