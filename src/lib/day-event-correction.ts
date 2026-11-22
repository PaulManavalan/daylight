import type { NotionDayContext } from "./notion-day-model";
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A single explicit event-edge correction cannot also rewrite the work window or add activities. */
export function explicitEventCorrection(
  known: NotionDayContext,
  latest: string,
  earlierUserMessages: string[],
): NotionDayContext | null {
  const match = latest
    .trim()
    .match(
      /^(?:(?:actually|wait|no)[,\s]+)*(.+?)\s+(starts?|ends?|finishes?)\s+(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\s*(?:instead|now)?[.!]?$/i,
    );
  if (!match) return null;
  const name = match[1]
      .trim()
      .toLocaleLowerCase()
      .replace(/^the\s+/, ""),
    edge = /^start/i.test(match[2]) ? "start" : "end";
  const candidates = known.events.filter((event) => {
    const title = event.title.toLocaleLowerCase().replace(/^the\s+/, "");
    if (
      name === title ||
      title.startsWith(name + " ") ||
      title.endsWith(" " + name)
    )
      return true;
    if (/^(?:it|that|that event)$/.test(name)) return known.events.length === 1;
    const nearby = new RegExp(
      "(?:" +
        escaped(title) +
        "\\s+" +
        escaped(name) +
        "|" +
        escaped(name) +
        "\\s+" +
        escaped(title) +
        ")",
      "i",
    );
    return earlierUserMessages.some((message) => nearby.test(message));
  });
  if (candidates.length !== 1) return null;
  const event = candidates[0],
    hour = Number(match[3]),
    minute = match[4] ?? "00",
    meridiem = match[5]?.toLowerCase();
  if (hour > 23 || (meridiem && (hour < 1 || hour > 12))) return null;
  const base = Number(event[edge].slice(0, 2));
  const resolved = meridiem
    ? (hour % 12) + (meridiem === "pm" ? 12 : 0)
    : hour >= 13 || hour === 0
      ? hour
      : (hour % 12) + (base >= 12 ? 12 : 0);
  const time = String(resolved).padStart(2, "0") + ":" + minute;
  if (
    (edge === "end" && time <= event.start) ||
    (edge === "start" && time >= event.end)
  )
    return null;
  return {
    ...structuredClone(known),
    events: known.events.map((item) =>
      item === event ? { ...item, [edge]: time } : { ...item },
    ),
  };
}
