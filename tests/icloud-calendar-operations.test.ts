import { test } from "node:test";
import assert from "node:assert/strict";
import { ICloudCalDavClient, escapeDav } from "../src/lib/icloud-caldav";
import {
  discoverICloudCalendars,
  readICloudCalendar,
} from "../src/lib/icloud-calendar-operations";
import { readCalendarFile } from "../src/lib/calendar-transfer";
const home = "https://p42-caldav.icloud.com/synthetic/calendars/",
  calendar = home + "home/";
const multistatus = (href: string, props: string) =>
  `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
const list = () =>
  multistatus(
    calendar,
    "<d:displayname>Home</d:displayname><d:resourcetype><c:calendar/></d:resourcetype><d:current-user-privilege-set><d:privilege><d:write/></d:privilege></d:current-user-privilege-set>",
  );
const ics = (body: string) =>
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:synthetic-event\r\nSUMMARY:Home event\r\n" +
  body +
  "\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
const client = (send: (url: string, method?: string) => string) =>
  new ICloudCalDavClient(
    { email: "synthetic@example.test", appPassword: "abcd-efgh-ijkl-mnop" },
    (async (url, init) =>
      new Response(send(String(url), init?.method), {
        status: 207,
      })) as typeof fetch,
  );
test("principal and home discovery produce stable calendar identities and privileges", async () => {
  const calls: string[] = [];
  const api = client((url) => {
    calls.push(url);
    if (calls.length === 1)
      return multistatus(
        "/",
        "<d:current-user-principal><d:href>https://p42-caldav.icloud.com/synthetic/principal/</d:href></d:current-user-principal>",
      );
    if (calls.length === 2)
      return multistatus(
        url,
        `<c:calendar-home-set><d:href>${home}</d:href></c:calendar-home-set>`,
      );
    return list();
  });
  const result = await discoverICloudCalendars(api);
  assert.equal(result.homeURL, home);
  assert.equal(result.calendars[0].id, calendar);
  assert.equal(result.calendars[0].canWrite, true);
});
test("provider reads produce a reviewed snapshot with explicit timezone and stable source ID", async () => {
  const data = ics("DTSTART;VALUE=DATE:20261124\r\nDTEND;VALUE=DATE:20261125");
  const api = client((_url, method) =>
    method === "PROPFIND"
      ? list()
      : multistatus(
          calendar + "event.ics",
          `<d:getetag>\"v1\"</d:getetag><c:calendar-data>${escapeDav(data)}</c:calendar-data>`,
        ),
  );
  const result = await readICloudCalendar(
    api,
    home,
    calendar,
    "2026-11-23T00:00:00.000Z",
    "2026-11-26T00:00:00.000Z",
    "Pacific/Auckland",
    new Date("2026-11-24T00:00:00Z"),
  );
  assert.equal(result.source, "icloud");
  assert.match(result.id, /^icloud-live:/);
  assert.equal(result.events[0].allDay, true);
  assert.equal(result.events[0].start, "2026-11-23T11:00:00.000Z");
  assert.equal(result.events[0].end, "2026-11-24T11:00:00.000Z");
});
test("an unlisted calendar or incomplete event response never replaces the old snapshot", async () => {
  const api = client((_url, method) =>
    method === "PROPFIND"
      ? list()
      : multistatus(calendar + "event.ics", "<d:getetag>v1</d:getetag>"),
  );
  await assert.rejects(
    () =>
      readICloudCalendar(
        api,
        home,
        home + "other/",
        "2026-11-24T00:00:00Z",
        "2026-11-25T00:00:00Z",
        "America/New_York",
      ),
    /Choose a calendar/,
  );
  await assert.rejects(
    () =>
      readICloudCalendar(
        api,
        home,
        calendar,
        "2026-11-24T00:00:00Z",
        "2026-11-25T00:00:00Z",
        "America/New_York",
      ),
    /omitted an event body/,
  );
});
test("floating times use the requested zone and an ambiguous clock change still needs review", () => {
  const from = new Date("2026-11-23T00:00:00Z"),
    to = new Date("2026-11-26T00:00:00Z");
  const result = readCalendarFile(
    ics("DTSTART:20261124T160000\r\nDTEND:20261124T170000"),
    "Home",
    "apple",
    from,
    to,
    from,
    "Pacific/Auckland",
  );
  assert.equal(result.events[0].start, "2026-11-24T03:00:00.000Z");
  assert.match(result.warnings[0], /requested display timezone/);
  assert.throws(
    () =>
      readCalendarFile(
        ics("DTSTART:20261101T013000\r\nDTEND:20261101T023000"),
        "Home",
        "apple",
        new Date("2026-11-01T00:00:00Z"),
        new Date("2026-11-02T12:00:00Z"),
        from,
        "America/New_York",
      ),
    /ambiguous/,
  );
});
