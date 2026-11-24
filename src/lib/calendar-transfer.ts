import ICAL from "ical.js";
import { z } from "zod";
import { addDays, dateKey, dayAt, type FixedBlock } from "./scheduling";
import type { NotionDayPlan } from "./notion-day-plan";
import { calendarInstant } from "./calendar-timezone";

export const calendarEventSchema = z
  .object({
    id: z.string().min(1).max(1000),
    uid: z.string().min(1).max(600),
    title: z.string().min(1).max(300),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    allDay: z.boolean(),
    calendar: z.string().min(1).max(80),
    provider: z.enum(["google", "apple", "other"]),
    readAt: z.iso.datetime(),
  })
  .refine(
    (e) => Date.parse(e.end) > Date.parse(e.start),
    "Event end must follow start.",
  );
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export const calendarSnapshotSchema = z.object({
  version: z.literal(1),
  calendars: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        provider: z.enum(["google", "apple", "other"]),
        title: z.string().min(1).max(80).optional(),
        source: z.enum(["file", "google", "icloud"]).optional(),
        readAt: z.iso.datetime(),
        rangeStart: z.iso.datetime(),
        rangeEnd: z.iso.datetime(),
        needsRefresh: z.boolean().optional(),
        warnings: z.array(z.string()).max(20),
        events: z.array(calendarEventSchema).max(1000),
      }),
    )
    .max(20),
});
export type CalendarSnapshot = z.infer<typeof calendarSnapshotSchema>;
export type CalendarRead = CalendarSnapshot["calendars"][number];
export const emptyCalendars = (): CalendarSnapshot => ({
  version: 1,
  calendars: [],
});

/** Local-file bridge, not a live calendar connection. Parse fully or reject. */
export function readCalendarFile(
  text: string,
  calendar: string,
  provider: CalendarEvent["provider"],
  from: Date,
  to: Date,
  readAt = new Date(),
  displayTimeZone?: string,
): CalendarRead {
  if (displayTimeZone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: displayTimeZone }).format(
        readAt,
      );
    } catch {
      throw Error(
        "Choose a valid display timezone before reading this calendar.",
      );
    }
  }
  if (text.length > 2_000_000)
    throw new Error("Choose a calendar file under 2 MB.");
  if (
    !Number.isFinite(+from) ||
    !Number.isFinite(+to) ||
    +to <= +from ||
    +to - +from > 32 * 86400000
  )
    throw new Error("Read a window of at most 32 days.");
  if (!calendar.trim() || calendar.length > 80)
    throw new Error("Name this calendar using 1–80 characters.");
  let component: InstanceType<typeof ICAL.Component>;
  try {
    component = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new Error(
      "This file is not a valid .ics calendar. No calendar was replaced.",
    );
  }
  if (component.name !== "vcalendar")
    throw new Error("Choose a VCALENDAR .ics file.");
  if (
    component.getFirstPropertyValue("method") &&
    component.getFirstPropertyValue("method") !== "PUBLISH"
  )
    throw new Error(
      "This file contains calendar invitations or cancellations. Export the calendar itself instead.",
    );
  const components = component.getAllSubcomponents("vevent");
  if (components.length > 2000)
    throw new Error(
      "This calendar has too many source records. Export a smaller calendar.",
    );
  const warnings = new Set<string>(),
    events: CalendarEvent[] = [],
    seen = new Set<string>();
  let iterations = 0;
  function checkTimeZone(
    time: InstanceType<typeof ICAL.Time>,
    event: InstanceType<typeof ICAL.Event>,
  ) {
    if (time.isDate) return;
    for (const key of ["dtstart", "dtend", "recurrence-id"]) {
      const tzid = event.component.getFirstProperty(key)?.getParameter("tzid");
      if (tzid && tzid !== "UTC" && !component.getTimeZoneByID(String(tzid)))
        throw new Error(
          `The file omits timezone rules for ${tzid}. Export with timezone definitions or UTC times.`,
        );
    }
    if (time.zone.tzid === "floating")
      warnings.add(
        "Floating event times use " +
          (displayTimeZone
            ? "the requested display timezone: "
            : "this device’s timezone: ") +
          (displayTimeZone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone) +
          ". Review the times before using them.",
      );
  }
  function append(
    event: InstanceType<typeof ICAL.Event>,
    start: InstanceType<typeof ICAL.Time>,
    end: InstanceType<typeof ICAL.Time>,
    recurrenceId: string,
  ) {
    if (
      event.component.getFirstPropertyValue("status") === "CANCELLED" ||
      event.component.getFirstPropertyValue("transp") === "TRANSPARENT"
    )
      return;
    checkTimeZone(start, event);
    checkTimeZone(end, event);
    const resolve = (time: InstanceType<typeof ICAL.Time>) =>
      displayTimeZone && (time.isDate || time.zone.tzid === "floating")
        ? new Date(
            calendarInstant(
              time.toString().slice(0, 10),
              time.isDate ? "00:00:00" : time.toString().slice(11, 19),
              displayTimeZone,
            ),
          )
        : time.toJSDate();
    const begins = resolve(start),
      ends = resolve(end);
    if (
      !Number.isFinite(+begins) ||
      !Number.isFinite(+ends) ||
      +ends <= +begins
    )
      throw new Error(
        "An event has an invalid or missing duration. Correct it in the source calendar before importing.",
      );
    if (+ends <= +from || +begins >= +to) return;
    const id = event.uid + "::" + recurrenceId;
    if (seen.has(id))
      throw new Error(
        "This file contains duplicate event identities. Export a fresh calendar copy.",
      );
    seen.add(id);
    events.push(
      calendarEventSchema.parse({
        id,
        uid: event.uid,
        title: (event.summary || "Busy").slice(0, 300),
        start: begins.toISOString(),
        end: ends.toISOString(),
        allDay: start.isDate,
        calendar: calendar.trim(),
        provider,
        readAt: readAt.toISOString(),
      }),
    );
    if (events.length > 1000)
      throw new Error(
        "More than 1,000 busy events occur in this window. Export a smaller calendar.",
      );
  }
  try {
    const masters = components.filter((c) => !c.hasProperty("recurrence-id")),
      uids = new Set<string>();
    for (const item of masters) {
      const event = new ICAL.Event(item);
      if (!event.uid || event.uid.length > 600)
        throw new Error("Every event needs a valid source UID.");
      if (uids.has(event.uid))
        throw new Error(
          "Duplicate event series found. Export a fresh calendar copy.",
        );
      uids.add(event.uid);
      if (event.component.getFirstPropertyValue("status") === "CANCELLED")
        continue;
      if (
        event.component
          .getAllProperties("rrule")
          .some((p) =>
            ["SECONDLY", "MINUTELY", "HOURLY"].includes(
              String((p.getFirstValue() as { freq: string }).freq),
            ),
          )
      )
        throw new Error(
          "High-frequency recurrence is not supported by this file bridge. Use a smaller exported calendar.",
        );
      if (event.isRecurring()) {
        const iterator = event.iterator();
        let occurrence;
        while ((occurrence = iterator.next())) {
          if (++iterations > 20_000)
            throw new Error(
              "Recurrence expansion exceeded the safe limit. Export a smaller date range.",
            );
          // Do not stop at a base occurrence: an exception can move an event across the range boundary.
          const details = event.getOccurrenceDetails(occurrence);
          if (+occurrence.toJSDate() > +to + 32 * 86400000) break;
          append(
            details.item,
            details.startDate,
            details.endDate,
            occurrence.toString(),
          );
        }
      } else
        append(
          event,
          event.startDate,
          event.endDate,
          event.startDate.toString(),
        );
    }
    for (const item of components.filter((c) =>
      c.hasProperty("recurrence-id"),
    )) {
      const event = new ICAL.Event(item);
      if (!uids.has(event.uid))
        throw new Error(
          "An event override is missing its recurring series. Export the complete calendar.",
        );
      const recurrence = event.recurrenceId.toString();
      if (!seen.has(event.uid + "::" + recurrence))
        append(event, event.startDate, event.endDate, recurrence);
    }
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "The calendar could not be read. No calendar was replaced.",
    );
  }
  return {
    id: calendar.trim(),
    provider,
    source: "file",
    readAt: readAt.toISOString(),
    rangeStart: from.toISOString(),
    rangeEnd: to.toISOString(),
    warnings: [...warnings],
    events: events.sort((a, b) => a.start.localeCompare(b.start)),
  };
}

export function replaceCalendar(
  snapshot: CalendarSnapshot,
  next: CalendarRead,
) {
  const current = calendarSnapshotSchema.parse(snapshot);
  return calendarSnapshotSchema.parse({
    ...current,
    calendars: [...current.calendars.filter((c) => c.id !== next.id), next],
  });
}
export function calendarBusyToday(
  snapshot: CalendarSnapshot,
  now: Date,
): FixedBlock[] {
  const from = dayAt(now),
    to = addDays(from, 1),
    seen = new Set<string>(),
    result: FixedBlock[] = [];
  const localClock = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  for (const calendar of calendarSnapshotSchema.parse(snapshot).calendars) {
    if (calendar.needsRefresh)
      throw new Error(
        `Refresh ${calendar.id}: its source events changed after the last read.`,
      );
    if (
      +from < Date.parse(calendar.rangeStart) ||
      +to > Date.parse(calendar.rangeEnd)
    )
      throw new Error(
        `Refresh ${calendar.id}: its imported date range does not cover today.`,
      );
    for (const event of calendar.events) {
      if (Date.parse(event.end) <= +from || Date.parse(event.start) >= +to)
        continue;
      const key = event.uid + "::" + event.start;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = new Date(
          Math.max(Math.floor(Date.parse(event.start) / 60000) * 60000, +from),
        ),
        end = new Date(
          Math.min(Math.ceil(Date.parse(event.end) / 60000) * 60000, +to),
        );
      const starts = localClock(start),
        ends = +end === +to ? "23:59" : localClock(end);
      if (starts === ends)
        throw new Error(
          "A calendar event is too short to protect accurately. Correct its times first.",
        );
      result.push({
        id:
          "calendar:" +
          encodeURIComponent(calendar.id) +
          ":" +
          encodeURIComponent(event.id),
        title: ((event.allDay ? "All day · " : "") + event.title).slice(0, 100),
        date: dateKey(now),
        start: starts,
        end: ends,
        days: [],
        recovery_minutes: 0,
      });
      if (result.length > 200)
        throw new Error(
          "More than 200 busy events cover today. Review the imported calendars before planning.",
        );
    }
  }
  return result;
}

/** Export Daylight focus sessions, optionally chosen training. No external events or invitations. */
export function exportDayCalendar(
  plan: NotionDayPlan,
  includeTraining = false,
) {
  const calendar = new ICAL.Component(["vcalendar", [], []]);
  calendar.updatePropertyWithValue("version", "2.0");
  calendar.updatePropertyWithValue(
    "prodid",
    "-//Daylight//Personal Planner//EN",
  );
  calendar.updatePropertyWithValue("calscale", "GREGORIAN");
  for (const entry of plan.entries.filter(
    (e) => e.kind === "study" || (includeTraining && e.kind === "activity"),
  )) {
    const event = new ICAL.Event();
    event.uid = `daylight-${encodeURIComponent(plan.day + "-" + entry.sourceKey + "-" + entry.start + "-" + entry.title)}@daylight.local`;
    event.summary = entry.title;
    event.startDate = ICAL.Time.fromJSDate(new Date(entry.start), true);
    event.endDate = ICAL.Time.fromJSDate(new Date(entry.end), true);
    event.component.updatePropertyWithValue(
      "dtstamp",
      ICAL.Time.fromJSDate(new Date(plan.generatedAt), true),
    );
    event.component.updatePropertyWithValue(
      "description",
      entry.kind === "activity"
        ? "Daylight training plan selected by the user. This is not a completed-session report."
        : "Daylight focus block. This is not confirmation that the underlying task is complete.",
    );
    calendar.addSubcomponent(event.component);
  }
  return calendar.toString() + "\r\n";
}
