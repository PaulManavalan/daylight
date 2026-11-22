/** Resolve local provider times explicitly. Gaps and ambiguous times fail for review. */
export function calendarInstant(date: string, time: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time))
    throw new Error("The calendar returned an invalid local date or time.");
  const [year, month, day] = date.split("-").map(Number),
    [hour, minute, second] = time.split(":").map(Number);
  if (year < 1900 || hour > 23 || minute > 59 || second > 59)
    throw new Error("The calendar returned an unsupported date or time.");
  const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wanted);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    throw new Error("The calendar returned an invalid date.");
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const components = (stamp: number) => {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(stamp))
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, Number(p.value)]),
    );
    return Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
  };
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const stamp = wanted + hours * 3600000;
    offsets.add(components(stamp) - stamp);
  }
  const candidates = [...offsets]
    .map((offset) => wanted - offset)
    .filter((stamp) => components(stamp) === wanted);
  if (candidates.length !== 1)
    throw new Error(
      "A calendar time is missing or ambiguous at a clock change. Review it in the source calendar.",
    );
  return new Date(candidates[0]).toISOString();
}
