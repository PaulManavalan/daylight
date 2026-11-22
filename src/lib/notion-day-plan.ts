import { z } from "zod";
import {
  defaults,
  dateKey,
  dayAt,
  plan,
  preferencesSchema,
  type FixedBlock,
} from "./scheduling";
import { dailyAgenda } from "./agenda";
import {
  notionDayContextSchema,
  type NotionDayContext,
} from "./notion-day-model";
import type { RunningListSource } from "./notion-daily-source";
import type { Task } from "./types";
import {
  fitnessActivitiesForDate,
  emptyFitness,
  type FitnessState,
} from "./fitness";
import {
  calendarBusyToday,
  emptyCalendars,
  type CalendarSnapshot,
} from "./calendar-transfer";

export const notionDayPlanSchema = z.object({
  day: z.iso.date(),
  generatedAt: z.iso.datetime(),
  sourceReadAt: z.iso.datetime(),
  window: z.string(),
  assumptions: z.array(z.string()),
  entries: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      start: z.iso.datetime(),
      end: z.iso.datetime(),
      kind: z.enum(["study", "activity", "fixed", "recovery", "break"]),
      sourceKey: z.string().nullable(),
      activityId: z.string().nullable().optional(),
    }),
  ),
  deferred: z.array(z.object({ title: z.string(), reason: z.string() })),
});
export type NotionDayPlan = z.infer<typeof notionDayPlanSchema>;
export function dayIsReady(raw: NotionDayContext) {
  const context = notionDayContextSchema.parse(raw);
  return (
    !!context.start &&
    !!context.finish &&
    context.eventsDiscussed &&
    context.extrasDiscussed &&
    context.events.every((event) => !!event.start && !!event.end)
  );
}
export function buildNotionDayPlan(
  source: RunningListSource,
  raw: NotionDayContext,
  now = new Date(),
  calendars: CalendarSnapshot = emptyCalendars(),
  fitness: FitnessState = emptyFitness(),
): NotionDayPlan {
  const context = notionDayContextSchema.parse(raw);
  if (!dayIsReady(context))
    throw new Error(
      "Let’s finish discussing your events, other plans and available window first.",
    );
  const start = context.start!,
    finish = context.finish!;
  if (start >= finish)
    throw new Error(
      "The work window needs to end later on the same day. Tell me the times again.",
    );
  const date = dateKey(now),
    end = dayAt(now, finish),
    windowMinutes = (+end - +dayAt(now, start)) / 60000;
  if (+end <= +now)
    throw new Error(
      "That work window has already ended. Tell me what time is available from here.",
    );
  if (windowMinutes < 15)
    throw new Error(
      "That window is under 15 minutes. Tell me whether there is another opening today.",
    );
  const knownKeys = new Set(source.items.map((item) => item.key));
  for (const key of [...context.focusOrder, ...context.skipKeys])
    if (!knownKeys.has(key))
      throw new Error(
        "The list changed or a task was not recognized. Refresh the list and clarify the item.",
      );
  const skipped = new Set(context.skipKeys),
    order = new Map(context.focusOrder.map((key, index) => [key, index]));
  const selected = source.items
    .filter(
      (item) =>
        item.completion !== "checked" &&
        !skipped.has(item.key) &&
        (item.yellowHighlighted || order.has(item.key)),
    )
    .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
  const activities = fitnessActivitiesForDate(fitness, date),
    trainingMinutes = activities.reduce(
      (sum, activity) => sum + activity.minutes,
      0,
    );
  const focus = context.focusMinutes ?? 25,
    capacity = Math.min(
      (context.focusBudget ?? 180) + trainingMinutes,
      Math.floor(windowMinutes),
      720,
    ),
    reserve = Math.min(10, Math.max(0, capacity - 15));
  const preferences = preferencesSchema.parse({
    ...defaults().preferences,
    workStart: start,
    workEnd: finish,
    weekendStart: start,
    weekendEnd: finish,
    focusStart: start,
    focusEnd: finish,
    deepWorkEnd: finish,
    studyDays: [0, 1, 2, 3, 4, 5, 6],
    capacity,
    dailyBuffer: reserve,
    session: Math.max(15, focus),
    pause: 5,
    longBreak: 15,
    longBreakAfter: 90,
    commitmentBuffer: 10,
  });
  const fixed: FixedBlock[] = context.events.map((event, index) => {
    if (!event.start || !event.end || event.start >= event.end)
      throw new Error(`Please clarify the start and end of ${event.title}.`);
    return {
      id: "event-" + index,
      title: event.title,
      date,
      start: event.start,
      end: event.end,
      days: [],
      recovery_minutes: 10,
    };
  });
  const imported = calendarBusyToday(calendars, now);
  for (const event of imported) {
    if (
      !fixed.some(
        (item) =>
          item.title.toLowerCase() === event.title.toLowerCase() &&
          item.start === event.start &&
          item.end === event.end,
      )
    )
      fixed.push(event);
  }
  const tasks: Task[] = selected.map((item) => ({
    id: "notion:" + item.key,
    title: item.title,
    subject: item.subject ?? "Notion",
    description:
      "Suggested focus block, not an estimate of total assignment duration.",
    deadline: null,
    estimated_minutes: focus,
    remaining_minutes: focus,
    priority: "medium",
    energy_level: "medium",
    status: "not_started",
    user_id: "notion-day-proposal",
    actual_minutes: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  }));
  const activityNames = new Set(
    activities.flatMap((activity) => [
      activity.title.toLowerCase(),
      "training: " + activity.title.toLowerCase(),
    ]),
  );
  for (const activity of activities)
    tasks.push({
      id: "fitness:" + activity.id,
      title: "Training: " + activity.title,
      subject: "Training",
      description:
        "Flexible workout explicitly selected by the user. A scheduled block does not mean the session was completed.",
      deadline: null,
      estimated_minutes: activity.minutes,
      remaining_minutes: activity.minutes,
      priority: "medium",
      energy_level: "medium",
      status: "not_started",
      user_id: "notion-day-proposal",
      actual_minutes: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  const assumptions = [
    `${focus}-minute focus blocks are suggested time to spend today, not estimates that whole assignments will be finished.`,
    `${context.focusBudget ?? 180} minutes is ${context.focusBudget === null ? "the suggested" : "your requested"} focus allowance, with breaks and ${reserve} minutes kept free.`,
  ];
  if (activities.length)
    assumptions.push(
      `${trainingMinutes} minutes of explicitly selected training are considered in addition to the focus allowance, within the available window. Whole training blocks are reserved before other flexible work when priorities are equal. Nothing prescribes extra exercise or confirms completion. Fixed team practices belong in your calendar.`,
    );
  if (calendars.calendars.length)
    assumptions.push(
      "Imported calendar events are protected snapshots, not live synchronization. Changes in Google or Apple need a fresh import.",
    );
  let conflicts = 0;
  for (let i = 0; i < fixed.length; i++)
    for (let j = i + 1; j < fixed.length; j++) {
      const a = fixed[i],
        b = fixed[j];
      if (a.start < b.end && b.start < a.end) {
        conflicts++;
        if (conflicts <= 10)
          assumptions.push(
            `Overlapping commitments: ${a.title} (${a.start}–${a.end}) and ${b.title} (${b.start}–${b.end}). Both remain protected; resolve the conflict in your calendar.`,
          );
      }
    }
  if (conflicts > 10)
    assumptions.push(
      `${conflicts - 10} additional commitment overlaps need review.`,
    );
  for (const calendar of calendars.calendars)
    for (const warning of calendar.warnings)
      assumptions.push(calendar.id + ": " + warning);
  const titles = new Set(tasks.map((task) => task.title.trim().toLowerCase()));
  for (const [index, extra] of context.extras.entries()) {
    if (activityNames.has(extra.title.trim().toLowerCase())) continue;
    if (titles.has(extra.title.trim().toLowerCase())) continue;
    titles.add(extra.title.trim().toLowerCase());
    const minutes = extra.minutes ?? focus;
    if (extra.minutes === null)
      assumptions.push(
        `${extra.title}: a ${minutes}-minute block is suggested; you can change it in chat.`,
      );
    tasks.push({
      id: "extra:" + index,
      title: extra.title,
      subject: "Other plans",
      description: "Daily focus proposal.",
      deadline: null,
      estimated_minutes: minutes,
      remaining_minutes: minutes,
      priority: "medium",
      energy_level: "medium",
      status: "not_started",
      user_id: "notion-day-proposal",
      actual_minutes: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }
  const state = { preferences, fixed, sessions: [], history: [] },
    result = plan(
      tasks,
      state,
      now,
      1,
      now,
      [
        ...activities.map((activity) => "fitness:" + activity.id),
        ...tasks
          .filter((task) => !task.id.startsWith("fitness:"))
          .map((task) => task.id),
      ],
      { wholeTaskIds: activities.map((activity) => "fitness:" + activity.id) },
    ),
    agenda = dailyAgenda(tasks, { ...state, sessions: result.sessions }, now);
  const entries: NotionDayPlan["entries"] = agenda.entries.map((entry) => ({
    ...entry,
    kind: entry.taskId?.startsWith("fitness:") ? "activity" : entry.kind,
    activityId: entry.taskId?.startsWith("fitness:")
      ? entry.taskId.slice(8)
      : null,
    sourceKey: entry.taskId?.startsWith("notion:")
      ? entry.taskId.slice(7)
      : null,
  }));
  const withBreaks: NotionDayPlan["entries"] = [];
  for (const entry of entries) {
    const previous = withBreaks.at(-1);
    if (previous?.kind === "study" && entry.kind === "study") {
      const gap = (Date.parse(entry.start) - Date.parse(previous.end)) / 60000;
      if (gap > 0 && gap <= 30)
        withBreaks.push({
          id: "break-" + previous.id,
          title: "Break",
          start: previous.end,
          end: entry.start,
          kind: "break",
          sourceKey: null,
        });
    }
    withBreaks.push(entry);
  }
  const deferred = result.unplaced.map((item) => ({
    title:
      tasks.find((task) => task.id === item.taskId)?.title ??
      "Unplaced focus block",
    reason: item.reason,
  }));
  for (const item of source.items.filter(
    (item) => item.yellowHighlighted && skipped.has(item.key),
  ))
    deferred.push({
      title: item.title,
      reason: "Set aside in this conversation.",
    });
  if (!tasks.length)
    assumptions.push(
      "There are no selected focus items. Highlight work in Notion or tell me which item to include.",
    );
  return notionDayPlanSchema.parse({
    day: date,
    generatedAt: now.toISOString(),
    sourceReadAt: source.readAt,
    window: start + "–" + finish,
    assumptions,
    entries: withBreaks,
    deferred,
  });
}
