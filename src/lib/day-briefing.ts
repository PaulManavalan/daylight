import { savedDaySessionSchema } from "./day-session";
import { emptyCalendars, calendarBusyToday } from "./calendar-transfer";
import { fitnessActivitiesForDate } from "./fitness";
import { dateKey } from "./scheduling";
import type { PersonalWorkspace } from "./personal-workspace";

/** A read-only view of confirmed local records, not an AI summary or background job. */
export function dayBriefing(
  raw: unknown,
  personal: PersonalWorkspace,
  now = new Date(),
) {
  const day = dateKey(now),
    warnings: string[] = [];
  const parsed = raw === null ? null : savedDaySessionSchema.safeParse(raw);
  const saved = parsed?.success ? parsed.data : null;
  if (parsed && !parsed.success)
    warnings.push("The saved day needs recovery. It has not been changed.");
  const activities = fitnessActivitiesForDate(personal.fitness, day);
  let events: ReturnType<typeof calendarBusyToday> = [];
  try {
    events = calendarBusyToday(personal.calendars, now);
  } catch (e) {
    warnings.push((e as Error).message);
  }
  const revisionsMatch =
    !!saved &&
    (saved.calendarRevision ?? JSON.stringify(emptyCalendars())) ===
      JSON.stringify(personal.calendars) &&
    (saved.activityRevision ?? "[]") === JSON.stringify(activities);
  const approved =
    !!saved?.approved &&
    saved.plan?.day === day &&
    revisionsMatch &&
    warnings.length === 0;
  if (saved?.plan && !revisionsMatch)
    warnings.push(
      "Your calendars or chosen training changed. Review a fresh day plan.",
    );
  const plan = approved ? saved!.plan : null;
  const upcoming =
    plan?.entries
      .filter((e) => Date.parse(e.end) > +now)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)) ?? [];
  const next =
    upcoming.find((e) => ["study", "activity", "fixed"].includes(e.kind)) ??
    null;
  const meals =
    personal.nutrition.plans.flatMap((p) => p.days).find((d) => d.date === day)
      ?.slots ?? null;
  return {
    day,
    approved,
    plan,
    next,
    events,
    activities,
    meals,
    warnings,
    sample: saved?.sample ?? false,
    sourceReadAt: saved?.source.readAt ?? null,
    assignments:
      saved?.source.items.filter(
        (i) => i.yellowHighlighted && i.completion !== "checked",
      ) ?? [],
    readingUrl: `https://bible.usccb.org/bible/readings/${day.slice(5, 7)}${day.slice(8, 10)}${day.slice(2, 4)}.cfm`,
  };
}
