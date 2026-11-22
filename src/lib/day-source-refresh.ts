import type { RunningListSource } from "./notion-daily-source";
import {
  notionDayContextSchema,
  type NotionDayContext,
} from "./notion-day-model";
import type { NotionDayPlan } from "./notion-day-plan";
/** Reading the running list updates homework, not the user's confirmed day or conversation. */
export function refreshDaySource(
  before: RunningListSource,
  next: RunningListSource,
  known: NotionDayContext,
  plan: NotionDayPlan | null,
  approved: boolean,
) {
  if (
    before.pageId === next.pageId &&
    Date.parse(next.readAt) < Date.parse(before.readAt)
  )
    throw Error(
      "This list copy is older than the one already loaded. Refresh Notion or use a newer local snapshot; your saved day is kept.",
    );
  const context = notionDayContextSchema.parse(known),
    keys = new Set(next.items.map((item) => item.key));
  context.focusOrder = context.focusOrder.filter((key) => keys.has(key));
  context.skipKeys = context.skipKeys.filter((key) => keys.has(key));
  const selection = (source: RunningListSource, day: NotionDayContext) => {
    const order = new Map(day.focusOrder.map((key, index) => [key, index])),
      skip = new Set(day.skipKeys);
    return source.items
      .filter(
        (item) =>
          item.completion !== "checked" &&
          (item.yellowHighlighted || order.has(item.key)),
      )
      .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999))
      .map(({ key, title, subject, sourceUrl }) => ({
        key,
        title,
        subject,
        sourceUrl,
        skipped: skip.has(key),
      }));
  };
  const changed =
    before.pageId !== next.pageId ||
    JSON.stringify(selection(before, known)) !==
      JSON.stringify(selection(next, context));
  return {
    known: context,
    changed,
    plan: changed ? null : plan ? { ...plan, sourceReadAt: next.readAt } : null,
    approved: changed || !plan ? false : approved,
  };
}
/** Prioritize today's selected work rather than silently filling the model with the top of a long page. */
export function daySourceContext(
  source: RunningListSource,
  known: NotionDayContext,
  message: string,
  compact = false,
) {
  const focus = new Set(known.focusOrder),
    skip = new Set(known.skipKeys),
    said = message.toLocaleLowerCase();
  const active = source.items.filter((item) => item.completion !== "checked");
  const rank = (item: (typeof active)[number]) =>
    item.title.trim().length >= 3 &&
    said.includes(item.title.toLocaleLowerCase())
      ? 0
      : (focus.has(item.key) || item.yellowHighlighted) && !skip.has(item.key)
        ? 1
        : skip.has(item.key)
          ? 2
          : 3;
  const items: {
    key: string;
    title: string;
    subject: string | null;
    today: boolean;
  }[] = [];
  let used = 0;
  for (const item of [...active].sort((a, b) => rank(a) - rank(b))) {
    const entry = {
      key: item.key,
      title: item.title.slice(0, compact ? 140 : 250),
      subject: item.subject,
      today: item.yellowHighlighted,
    };
    const size = JSON.stringify(entry).length;
    if (
      used + size > (compact ? 2600 : 7000) ||
      items.length >= (compact ? 20 : 40)
    )
      continue;
    items.push(entry);
    used += size;
  }
  const shown = new Set(items.map((item) => item.key));
  return {
    title: source.title,
    readAt: source.readAt,
    items,
    omitted: active.length - items.length,
    highlightedOmitted: active.filter(
      (item) => item.yellowHighlighted && !shown.has(item.key),
    ).length,
    weeklyNotes: source.weeklyNotes
      .slice(0, 3)
      .map((note) => note.slice(0, compact ? 250 : 500)),
    notesOmitted: Math.max(0, source.weeklyNotes.length - 3),
    contextIsExcerpt:
      items.some(
        (item) =>
          item.title !==
          active.find((original) => original.key === item.key)?.title,
      ) ||
      source.weeklyNotes.some(
        (note, index) => index >= 3 || note.length > (compact ? 250 : 500),
      ),
  };
}
