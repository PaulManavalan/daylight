import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { z } from "zod";
import {
  CALDAV,
  DAV,
  ICloudCalDavClient,
  ICloudCalendarError,
  davChild,
  davName,
  icloudURL,
  parseDavMultistatus,
  xmlText,
  type DavNode,
} from "./icloud-caldav";
import {
  icloudCalendarRowSchema,
  type ICloudCalendarRow,
} from "./icloud-calendar-data";
import {
  calendarSnapshotSchema,
  readCalendarFile,
  type CalendarRead,
} from "./calendar-transfer";
const propertyRequest = (properties: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>${properties}</d:prop></d:propfind>`;
function singleHref(property: DavNode | undefined, base: string) {
  const hrefs =
    property?.children.filter(
      (node) => node.uri === DAV && node.local === "href",
    ) ?? [];
  if (hrefs.length !== 1)
    throw new ICloudCalendarError(
      "iCloud did not provide a single calendar location. Your saved calendars are kept.",
      502,
    );
  return icloudURL(xmlText(hrefs[0]).trim(), base).href;
}
export async function discoverICloudCalendars(client: ICloudCalDavClient) {
  const root = await client.request(
    "https://caldav.icloud.com/",
    "PROPFIND",
    propertyRequest("<d:current-user-principal/>"),
  );
  const principals = parseDavMultistatus(root.text)
    .map((row) => row.properties.get(davName(DAV, "current-user-principal")))
    .filter(Boolean);
  if (principals.length !== 1)
    throw new ICloudCalendarError(
      "iCloud did not identify the signed-in calendar account.",
      502,
    );
  const principalURL = singleHref(principals[0], root.url);
  const principal = await client.request(
    principalURL,
    "PROPFIND",
    propertyRequest("<c:calendar-home-set/>"),
  );
  const homes = parseDavMultistatus(principal.text)
    .map((row) => row.properties.get(davName(CALDAV, "calendar-home-set")))
    .filter(Boolean);
  if (homes.length !== 1)
    throw new ICloudCalendarError(
      "iCloud did not identify one calendar home for this account.",
      502,
    );
  const homeURL = singleHref(homes[0], principal.url);
  const calendars = await listICloudCalendars(client, homeURL);
  return { principalURL, homeURL, calendars };
}
export async function listICloudCalendars(
  client: ICloudCalDavClient,
  home: string,
) {
  const homeURL = icloudURL(home);
  const response = await client.request(
    homeURL.href,
    "PROPFIND",
    propertyRequest(
      "<d:displayname/><d:resourcetype/><d:current-user-privilege-set/><c:supported-calendar-component-set/>",
    ),
    "1",
  );
  const rows: ICloudCalendarRow[] = [],
    seen = new Set<string>();
  for (const item of parseDavMultistatus(response.text)) {
    const type = item.properties.get(davName(DAV, "resourcetype"));
    if (!type || !davChild(type, CALDAV, "calendar")) continue;
    const id = icloudURL(item.href, response.url).href;
    if (seen.has(id))
      throw new ICloudCalendarError(
        "iCloud returned a duplicate calendar identity.",
        502,
      );
    seen.add(id);
    const title = item.properties.get(davName(DAV, "displayname"));
    const privileges = item.properties.get(
      davName(DAV, "current-user-privilege-set"),
    );
    const granted =
      privileges?.children
        .filter((node) => node.uri === DAV && node.local === "privilege")
        .flatMap((node) =>
          node.children
            .filter((child) => child.uri === DAV)
            .map((child) => child.local),
        ) ?? [];
    rows.push(
      icloudCalendarRowSchema.parse({
        id,
        title:
          (title ? xmlText(title).trim() : "iCloud calendar").slice(0, 80) ||
          "iCloud calendar",
        canWrite:
          granted.includes("write") ||
          (granted.includes("write-content") && granted.includes("bind")),
      }),
    );
  }
  if (rows.length > 100)
    throw new ICloudCalendarError(
      "This account has too many calendars for one read. Your saved calendars are kept.",
      413,
    );
  return rows;
}
export async function readICloudCalendar(
  client: ICloudCalDavClient,
  homeURL: string,
  calendarId: string,
  from: string,
  to: string,
  displayTimeZone: string,
  now = new Date(),
): Promise<CalendarRead> {
  z.iso.datetime().parse(from);
  z.iso.datetime().parse(to);
  try {
    new Intl.DateTimeFormat("en", { timeZone: displayTimeZone }).format(now);
  } catch {
    throw new ICloudCalendarError(
      "Choose a valid display timezone before reading iCloud.",
    );
  }
  if (
    Date.parse(to) <= Date.parse(from) ||
    Date.parse(to) - Date.parse(from) > 32 * 86400000
  )
    throw new ICloudCalendarError(
      "Choose an iCloud window of at most 32 days.",
    );
  const calendar = (await listICloudCalendars(client, homeURL)).find(
    (row) => row.id === icloudURL(calendarId).href,
  );
  if (!calendar)
    throw new ICloudCalendarError(
      "Choose a calendar from this iCloud account before reading it.",
      403,
    );
  const stamp = (value: string) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const body = `<?xml version="1.0" encoding="UTF-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${stamp(from)}" end="${stamp(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const response = await client.request(calendar.id, "REPORT", body, "1");
  const merged = new ICAL.Component(["vcalendar", [], []]);
  merged.updatePropertyWithValue("version", "2.0");
  const zones = new Map<string, string>(),
    resources = new Set<string>();
  for (const row of parseDavMultistatus(response.text)) {
    const resource = icloudURL(row.href, response.url).href;
    if (resources.has(resource))
      throw new ICloudCalendarError(
        "iCloud returned a duplicate calendar resource.",
        502,
      );
    resources.add(resource);
    const data = row.properties.get(davName(CALDAV, "calendar-data"));
    if (!data)
      throw new ICloudCalendarError(
        "iCloud omitted an event body. Your saved calendar has not been replaced.",
        502,
      );
    let component: InstanceType<typeof ICAL.Component>;
    try {
      component = new ICAL.Component(ICAL.parse(xmlText(data)));
    } catch {
      throw new ICloudCalendarError(
        "iCloud returned an unreadable event. Your saved calendar is kept.",
        502,
      );
    }
    if (
      component.name !== "vcalendar" ||
      component.getFirstPropertyValue("method")
    )
      throw new ICloudCalendarError(
        "iCloud returned an unsupported calendar message.",
        502,
      );
    for (const zone of component.getAllSubcomponents("vtimezone")) {
      const id = String(zone.getFirstPropertyValue("tzid") ?? ""),
        encoded = zone.toString();
      if (!id || (zones.has(id) && zones.get(id) !== encoded))
        throw new ICloudCalendarError(
          "iCloud returned conflicting timezone rules.",
          502,
        );
      if (!zones.has(id)) {
        zones.set(id, encoded);
        merged.addSubcomponent(zone);
      }
    }
    for (const event of component.getAllSubcomponents("vevent")) {
      merged.addSubcomponent(event);
    }
  }
  const parsed = readCalendarFile(
    merged.toString(),
    calendar.title,
    "apple",
    new Date(from),
    new Date(to),
    now,
    displayTimeZone,
  );
  const result = {
    ...parsed,
    id:
      "icloud-live:" +
      createHash("sha256").update(calendar.id).digest("hex").slice(0, 32),
    title: calendar.title,
    source: "icloud" as const,
  };
  return calendarSnapshotSchema.parse({ version: 1, calendars: [result] })
    .calendars[0];
}
