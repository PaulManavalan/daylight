import { createHash } from "node:crypto";
import { z } from "zod";
import {
  GoogleCalendarClient,
  GoogleCalendarError,
} from "./google-calendar-server";
import { calendarInstant } from "./calendar-timezone";
import { calendarSnapshotSchema, type CalendarRead } from "./calendar-transfer";
import {
  googleCalendarRowSchema,
  googleEventDraftSchema,
  googleReceiptSchema,
  type GoogleCalendarRow,
  type GoogleEventDraft,
  type GoogleEventReceipt,
} from "./google-calendar-data";
const object = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new GoogleCalendarError(
      "Google returned incomplete calendar data.",
      502,
    );
  return raw as Record<string, unknown>;
};
const string = (raw: unknown, label: string, max = 1024) => {
  if (typeof raw !== "string" || !raw || raw.length > max)
    throw new GoogleCalendarError(
      "Google returned an invalid " + label + ".",
      502,
    );
  return raw;
};
const calendarPath = (id: string) =>
  "/calendars/" + encodeURIComponent(z.string().min(1).max(1024).parse(id));
const eventPath = (calendarId: string, id: string) =>
  calendarPath(calendarId) +
  "/events/" +
  encodeURIComponent(z.string().min(1).max(1024).parse(id));
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function row(raw: unknown): GoogleCalendarRow {
  const data = object(raw);
  return googleCalendarRowSchema.parse({
    id: data.id,
    title:
      typeof data.summaryOverride === "string"
        ? data.summaryOverride
        : typeof data.summary === "string"
          ? data.summary
          : "Calendar",
    timeZone: data.timeZone,
    accessRole: data.accessRole,
    primary: data.primary === true,
  });
}
export async function listGoogleCalendars(client: GoogleCalendarClient) {
  const rows: GoogleCalendarRow[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      maxResults: "100",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await client.call("/users/me/calendarList?" + params);
    if (!Array.isArray(data.items))
      throw new GoogleCalendarError(
        "Google returned an incomplete calendar list.",
        502,
      );
    for (const item of data.items) {
      const candidate = object(item);
      if (candidate.deleted === true || candidate.hidden === true) continue;
      rows.push(row(candidate));
    }
    if (!data.nextPageToken) return rows;
    pageToken = string(data.nextPageToken, "calendar page token", 3000);
  }
  throw new GoogleCalendarError(
    "There are too many calendars to load safely. No calendar selection changed.",
    413,
  );
}
export async function googleCalendarDetails(
  client: GoogleCalendarClient,
  id: string,
) {
  return row(
    await client.call(
      "/users/me/calendarList/" +
        encodeURIComponent(z.string().min(1).max(1024).parse(id)),
    ),
  );
}
function eventTime(raw: unknown, zone: string) {
  const data = object(raw);
  if (typeof data.date === "string")
    return {
      value: calendarInstant(z.iso.date().parse(data.date), "00:00:00", zone),
      allDay: true,
    };
  const text = string(data.dateTime, "event time", 100);
  if (z.iso.datetime({ offset: true }).safeParse(text).success)
    return { value: new Date(text).toISOString(), allDay: false };
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})$/);
  if (!match)
    throw new GoogleCalendarError(
      "Google returned an unsupported event time. No calendar snapshot was replaced.",
      502,
    );
  return {
    value: calendarInstant(
      match[1],
      match[2],
      typeof data.timeZone === "string" ? data.timeZone : zone,
    ),
    allDay: false,
  };
}
export async function readGoogleCalendar(
  client: GoogleCalendarClient,
  id: string,
  from: string,
  to: string,
  now = new Date(),
): Promise<CalendarRead & { managed: GoogleEventReceipt[] }> {
  z.iso.datetime().parse(from);
  z.iso.datetime().parse(to);
  if (
    Date.parse(to) <= Date.parse(from) ||
    Date.parse(to) - Date.parse(from) > 32 * 86400000
  )
    throw new GoogleCalendarError(
      "Choose a calendar window of at most 32 days.",
    );
  const calendar = await googleCalendarDetails(client, id);
  if (calendar.accessRole === "freeBusyReader")
    throw new GoogleCalendarError(
      "This calendar only grants free/busy access. Detailed event access is needed for this connection.",
      403,
    );
  const calendarId = "google-live:" + hash(id).slice(0, 32),
    events: CalendarRead["events"] = [],
    managed: GoogleEventReceipt[] = [],
    seen = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      timeMin: from,
      timeMax: to,
      singleEvents: "true",
      orderBy: "startTime",
      showDeleted: "false",
      maxResults: "250",
      timeZone: calendar.timeZone,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await client.call(calendarPath(id) + "/events?" + params);
    if (!Array.isArray(data.items))
      throw new GoogleCalendarError(
        "Google returned an incomplete event page. Your saved snapshot is unchanged.",
        502,
      );
    for (const raw of data.items) {
      const item = object(raw);
      if (item.status === "cancelled" || item.transparency === "transparent")
        continue;
      if (item.status !== "confirmed" && item.status !== "tentative")
        throw new GoogleCalendarError(
          "An event has an unknown status. Review it in Google before refreshing.",
          502,
        );
      if (
        Array.isArray(item.attendees) &&
        item.attendees.some((a) => {
          const attendee = object(a);
          return (
            attendee.self === true && attendee.responseStatus === "declined"
          );
        })
      )
        continue;
      const eventId = string(item.id, "event ID"),
        start = eventTime(item.start, calendar.timeZone),
        end = eventTime(item.end, calendar.timeZone);
      if (start.allDay !== end.allDay)
        throw new GoogleCalendarError(
          "An event mixes all-day and timed boundaries. Review the source event.",
          502,
        );
      if (seen.has(eventId))
        throw new GoogleCalendarError(
          "Google returned a repeated event across pages. Retry the refresh.",
          502,
        );
      seen.add(eventId);
      events.push({
        id: eventId,
        uid:
          typeof item.iCalUID === "string"
            ? item.iCalUID.slice(0, 600)
            : "google:" + hash(id + ":" + eventId),
        title:
          typeof item.summary === "string" && item.summary.trim()
            ? item.summary.slice(0, 300)
            : "Busy",
        start: start.value,
        end: end.value,
        allDay: start.allDay,
        calendar: calendar.title.slice(0, 80),
        provider: "google",
        readAt: now.toISOString(),
      });
      if (!start.allDay && !item.recurringEventId && !item.recurrence) {
        const extended =
            typeof item.extendedProperties === "object" &&
            item.extendedProperties !== null
              ? object(item.extendedProperties)
              : {},
          privateData =
            typeof extended.private === "object" && extended.private !== null
              ? object(extended.private)
              : {};
        if (
          privateData.daylightApp === "v1" &&
          privateData.daylightOwner === marker(client)
        )
          managed.push(receipt(id, item, "existing", calendar.timeZone));
      }
      if (events.length > 1000)
        throw new GoogleCalendarError(
          "This range has too many events. Choose a shorter calendar window.",
          413,
        );
    }
    if (!data.nextPageToken)
      return {
        ...calendarSnapshotSchema.parse({
          version: 1,
          calendars: [
            {
              id: calendarId,
              provider: "google",
              readAt: now.toISOString(),
              rangeStart: from,
              rangeEnd: to,
              warnings: [
                "Read directly from Google Calendar. Refresh this snapshot when source events change.",
              ],
              events,
            },
          ],
        }).calendars[0],
        managed,
      };
    pageToken = string(data.nextPageToken, "event page token", 3000);
  }
  throw new GoogleCalendarError(
    "The event range could not be read completely. Your previous snapshot is unchanged.",
    413,
  );
}
function marker(client: GoogleCalendarClient) {
  return hash("daylight:" + client.session.owner);
}
function payloadHash(draft: GoogleEventDraft) {
  return hash(
    JSON.stringify({ title: draft.title, start: draft.start, end: draft.end }),
  );
}
function verifyOwned(
  client: GoogleCalendarClient,
  event: Record<string, unknown>,
) {
  const extended = object(event.extendedProperties ?? {}),
    privateData = object(extended.private ?? {});
  if (
    privateData.daylightOwner !== marker(client) ||
    privateData.daylightApp !== "v1"
  )
    throw new GoogleCalendarError(
      "Daylight can only edit events created by this connection. Open other events in Google Calendar.",
      403,
    );
  if (event.recurringEventId || event.recurrence)
    throw new GoogleCalendarError(
      "Recurring event editing needs a separate occurrence review. Open this event in Google Calendar.",
      409,
    );
  return privateData;
}
function receipt(
  calendarId: string,
  event: Record<string, unknown>,
  outcome: "created" | "existing" | "updated" | "deleted",
  zone = "UTC",
) {
  let url: string | null = null;
  if (typeof event.htmlLink === "string") {
    try {
      const candidate = new URL(event.htmlLink);
      if (
        candidate.protocol === "https:" &&
        ["calendar.google.com", "www.google.com"].includes(
          candidate.hostname,
        ) &&
        candidate.pathname.startsWith("/calendar") &&
        !candidate.username &&
        !candidate.password
      )
        url = candidate.href;
    } catch {}
  }
  return googleReceiptSchema.parse({
    id: event.id,
    etag: event.etag,
    calendarId,
    title: typeof event.summary === "string" ? event.summary : "Event",
    start: eventTime(event.start, zone).value,
    end: eventTime(event.end, zone).value,
    url,
    outcome,
  });
}
async function requireWritable(client: GoogleCalendarClient, id: string) {
  const calendar = await googleCalendarDetails(client, id);
  if (!["writer", "owner"].includes(calendar.accessRole))
    throw new GoogleCalendarError("Choose a calendar you can edit.", 403);
  return calendar;
}
export async function createGoogleEvent(
  client: GoogleCalendarClient,
  raw: GoogleEventDraft,
) {
  const draft = googleEventDraftSchema.parse(raw),
    calendar = await requireWritable(client, draft.calendarId),
    id =
      "d" +
      hash(marker(client) + ":" + draft.calendarId + ":" + draft.requestId);
  const body = {
    id,
    summary: draft.title,
    start: { dateTime: draft.start },
    end: { dateTime: draft.end },
    extendedProperties: {
      private: {
        daylightApp: "v1",
        daylightOwner: marker(client),
        daylightRequest: draft.requestId,
        daylightPayload: payloadHash(draft),
      },
    },
  };
  let event: Record<string, unknown>,
    outcome: "created" | "existing" = "created";
  try {
    event = await client.call(
      calendarPath(draft.calendarId) + "/events",
      "POST",
      body,
    );
  } catch (e) {
    if (!(e instanceof GoogleCalendarError) || e.status !== 409) throw e;
    event = await client.call(eventPath(draft.calendarId, id));
    outcome = "existing";
  }
  const privateData = verifyOwned(client, event);
  if (
    privateData.daylightPayload !== payloadHash(draft) ||
    privateData.daylightRequest !== draft.requestId
  )
    throw new GoogleCalendarError(
      "This proposal ID belongs to a different event. Review a new proposal.",
      409,
    );
  const result = receipt(draft.calendarId, event, outcome, calendar.timeZone);
  if (
    result.id !== id ||
    result.title !== draft.title ||
    result.start !== draft.start ||
    result.end !== draft.end
  )
    throw new GoogleCalendarError(
      "Google returned different event details. Refresh the calendar before trying again.",
      409,
    );
  return result;
}
export async function editGoogleEvent(
  client: GoogleCalendarClient,
  raw: GoogleEventDraft,
  id: string,
  etag: string,
  remove = false,
) {
  const draft = googleEventDraftSchema.parse(raw),
    calendar = await requireWritable(client, draft.calendarId),
    event = await client.call(eventPath(draft.calendarId, id));
  verifyOwned(client, event);
  if (event.etag !== etag)
    throw new GoogleCalendarError(
      "This event changed in Google Calendar. Refresh and review it again.",
      412,
    );
  if (remove) {
    await client.call(
      eventPath(draft.calendarId, id),
      "DELETE",
      undefined,
      etag,
    );
    return receipt(draft.calendarId, event, "deleted", calendar.timeZone);
  }
  const updated = await client.call(
    eventPath(draft.calendarId, id),
    "PATCH",
    {
      summary: draft.title,
      start: { dateTime: draft.start },
      end: { dateTime: draft.end },
    },
    etag,
  );
  verifyOwned(client, updated);
  const result = receipt(
    draft.calendarId,
    updated,
    "updated",
    calendar.timeZone,
  );
  if (
    result.title !== draft.title ||
    result.start !== draft.start ||
    result.end !== draft.end
  )
    throw new GoogleCalendarError(
      "Google returned different event details. Refresh this event.",
      409,
    );
  return result;
}
