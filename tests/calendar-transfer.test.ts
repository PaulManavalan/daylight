import { test } from "node:test";
import assert from "node:assert/strict";
import ICAL from "ical.js";
import {
  readCalendarFile,
  replaceCalendar,
  emptyCalendars,
  calendarBusyToday,
  exportDayCalendar,
} from "../src/lib/calendar-transfer";
import { buildNotionDayPlan } from "../src/lib/notion-day-plan";
import { emptyNotionDay } from "../src/lib/notion-day-model";
const now = new Date("2026-11-21T09:00:00Z"),
  from = new Date("2026-11-21T00:00:00Z"),
  to = new Date("2026-12-21T00:00:00Z");
const file = (events: string) =>
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + events + "\r\nEND:VCALENDAR\r\n";
const event = (uid: string, start: string, end: string, extra = "") =>
  `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:School event\r\n${extra}\r\nEND:VEVENT`;
test("UTC events round-trip, reimport replaces its calendar and sources remain protected", () => {
  const read = readCalendarFile(
    file(event("school", "20261121T160000Z", "20261121T170000Z")),
    "School",
    "google",
    from,
    to,
    now,
  );
  assert.equal(read.events.length, 1);
  assert.equal(read.events[0].start, "2026-11-21T16:00:00.000Z");
  let state = replaceCalendar(emptyCalendars(), read);
  state = replaceCalendar(state, read);
  assert.equal(state.calendars.length, 1);
  assert.equal(state.calendars[0].events.length, 1);
  assert.equal(read.provider, "google");
  assert.equal(calendarBusyToday(state, now)[0].days.length, 0);
});
test("recurrences, exclusions and moved/canceled occurrences use source identities", () => {
  const recurring = event(
    "series",
    "20261121T160000Z",
    "20261121T170000Z",
    "RRULE:FREQ=DAILY;COUNT=4\r\nEXDATE:20261122T160000Z",
  );
  const moved = event(
    "series",
    "20261123T180000Z",
    "20261123T190000Z",
    "RECURRENCE-ID:20261123T160000Z",
  );
  const cancelled = event(
    "series",
    "20261124T160000Z",
    "20261124T170000Z",
    "RECURRENCE-ID:20261124T160000Z\r\nSTATUS:CANCELLED",
  );
  const read = readCalendarFile(
    file([recurring, moved, cancelled].join("\r\n")),
    "Home",
    "apple",
    from,
    to,
    now,
  );
  assert.deepEqual(
    read.events.map((e) => e.start),
    ["2026-11-21T16:00:00.000Z", "2026-11-23T18:00:00.000Z"],
  );
});
test("all-day busy events and overnight events reserve the correct day, while transparent events do not block", () => {
  const allDay =
    "BEGIN:VEVENT\r\nUID:day\r\nDTSTART;VALUE=DATE:20261121\r\nDTEND;VALUE=DATE:20261122\r\nSUMMARY:Travel\r\nEND:VEVENT";
  const transparent = event(
    "free",
    "20261121T120000Z",
    "20261121T130000Z",
    "TRANSP:TRANSPARENT",
  );
  const read = readCalendarFile(
    file(allDay + "\r\n" + transparent),
    "Home",
    "apple",
    from,
    to,
    now,
  );
  assert.equal(read.events.length, 1);
  assert.equal(read.events[0].allDay, true);
  const busy = calendarBusyToday(
    replaceCalendar(emptyCalendars(), read),
    new Date(2026, 10, 21, 9),
  );
  assert.equal(busy[0].start, "00:00");
  assert.equal(busy[0].end, "23:59");
});
test("unresolved zones, dangerous recurrence, orphan overrides and invitations fail instead of creating false availability", () => {
  assert.throws(
    () =>
      readCalendarFile(
        file(
          event("zone", "20261121T160000", "20261121T170000").replace(
            "DTSTART:",
            "DTSTART;TZID=Missing/Zone:",
          ),
        ),
        "Test",
        "google",
        from,
        to,
      ),
    /timezone/,
  );
  assert.throws(
    () =>
      readCalendarFile(
        file(
          event(
            "repeat",
            "20261121T160000Z",
            "20261121T170000Z",
            "RRULE:FREQ=SECONDLY",
          ),
        ),
        "Test",
        "google",
        from,
        to,
      ),
    /frequency/,
  );
  assert.throws(
    () =>
      readCalendarFile(
        file(
          event(
            "orphan",
            "20261121T160000Z",
            "20261121T170000Z",
            "RECURRENCE-ID:20261120T160000Z",
          ),
        ),
        "Test",
        "google",
        from,
        to,
      ),
    /missing/,
  );
  assert.throws(
    () =>
      readCalendarFile(
        file(event("meeting", "20261121T160000Z", "20261121T170000Z")).replace(
          "VERSION:2.0",
          "VERSION:2.0\r\nMETHOD:REQUEST",
        ),
        "Test",
        "google",
        from,
        to,
      ),
    /invitation/,
  );
});
test("expired import coverage cannot silently be treated as an empty calendar", () => {
  const read = readCalendarFile(
    file(event("school", "20261121T160000Z", "20261121T170000Z")),
    "School",
    "google",
    from,
    to,
    now,
  );
  assert.throws(
    () =>
      calendarBusyToday(
        replaceCalendar(emptyCalendars(), read),
        new Date(2027, 0, 1),
      ),
    /Refresh/,
  );
});
test("embedded timezone rules preserve local recurring times across daylight saving transitions", () => {
  const zone =
    "BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\nBEGIN:DAYLIGHT\r\nDTSTART:20070311T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nDTSTART:20071104T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nEND:STANDARD\r\nEND:VTIMEZONE";
  const recurring = event(
    "dst",
    "20260307T160000",
    "20260307T170000",
    "RRULE:FREQ=DAILY;COUNT=3",
  )
    .replace("DTSTART:", "DTSTART;TZID=America/New_York:")
    .replace("DTEND:", "DTEND;TZID=America/New_York:");
  const read = readCalendarFile(
    file(zone + "\r\n" + recurring),
    "School",
    "google",
    new Date("2026-03-07T00:00:00Z"),
    new Date("2026-03-11T00:00:00Z"),
  );
  assert.deepEqual(
    read.events.map((e) => e.start),
    [
      "2026-03-07T21:00:00.000Z",
      "2026-03-08T20:00:00.000Z",
      "2026-03-09T20:00:00.000Z",
    ],
  );
});
test("the day engine reserves imported events and exports only Daylight focus blocks without invitations", () => {
  const localNow = new Date(2026, 10, 21, 9),
    start = new Date(2026, 10, 21, 11),
    end = new Date(2026, 10, 21, 12),
    utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(".000", "");
  const read = readCalendarFile(
    file(event("school", utc(start), utc(end))),
    "School",
    "google",
    new Date(2026, 10, 21),
    new Date(2026, 11, 1),
    localNow,
  );
  const source = {
    pageId: "sample",
    title: "Synthetic",
    readAt: localNow.toISOString(),
    weeklyNotes: [],
    warnings: [],
    items: Array.from({ length: 8 }, (_, i) => ({
      key: "task-" + i,
      title: "Focus " + i,
      subject: "Math",
      sourceUrl: "https://www.notion.so/",
      yellowHighlighted: true,
      completion: "not_specified" as const,
    })),
  };
  const plan = buildNotionDayPlan(
    source,
    {
      ...emptyNotionDay(),
      start: "10:00",
      finish: "15:00",
      eventsDiscussed: true,
      extrasDiscussed: true,
    },
    localNow,
    replaceCalendar(emptyCalendars(), read),
  );
  for (const entry of plan.entries.filter((e) => e.kind === "study"))
    assert.ok(
      Date.parse(entry.end) <= +start || Date.parse(entry.start) >= +end,
    );
  assert.ok(
    plan.entries.some((e) => e.kind === "fixed" && e.title === "School event"),
  );
  const exported = exportDayCalendar(plan),
    parsed = new ICAL.Component(ICAL.parse(exported));
  assert.equal(
    parsed.getAllSubcomponents("vevent").length,
    plan.entries.filter((e) => e.kind === "study").length,
  );
  assert.ok(!exported.includes("ATTENDEE"));
  assert.ok(!exported.includes("VALARM"));
  assert.equal(exportDayCalendar(plan), exported);
});
