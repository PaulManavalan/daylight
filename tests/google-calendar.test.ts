import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GoogleCalendarClient,
  GoogleCalendarError,
  googleCalendarConfig,
  startGoogleAuthorization,
  validateGoogleState,
  sealGoogle,
  unsealGoogle,
  finishGoogleAuthorization,
  readGoogleSession,
  googleReadScopes,
  googleWriteScope,
  requireGoogleOrigin,
  googleCalendarOwner,
  type GoogleCalendarConfig,
  type GoogleCalendarSession,
} from "../src/lib/google-calendar-server";
import { calendarInstant } from "../src/lib/calendar-timezone";
import {
  readGoogleCalendar,
  listGoogleCalendars,
  createGoogleEvent,
  editGoogleEvent,
} from "../src/lib/google-calendar-operations";
import { calendarBusyToday } from "../src/lib/calendar-transfer";
const config: GoogleCalendarConfig = {
  clientId: "synthetic-client",
  clientSecret: "synthetic-secret",
  redirectUri: "http://127.0.0.1:3104/api/google-calendar/callback",
  cookieSecret: "synthetic-cookie-secret-at-least-32-characters",
  origin: "http://127.0.0.1:3104",
  secure: false,
};
const session = (): GoogleCalendarSession => ({
  kind: "google-calendar",
  owner: "synthetic",
  accessToken: "SECRET_ACCESS",
  refreshToken: "SECRET_REFRESH",
  scopes: [...googleReadScopes, googleWriteScope],
  accessExpires: Date.now() + 3600000,
  expires: Date.now() + 86400000,
});
const json = (data: unknown, status = 200) => Response.json(data, { status });
const calendar = {
  id: "school@example.test",
  summary: "School",
  timeZone: "America/New_York",
  accessRole: "owner",
  primary: true,
};
const draft = {
  calendarId: calendar.id,
  requestId: "98152a59-0c30-4cc1-84d1-f2a846f17ad2",
  title: "Review physics",
  start: "2026-11-21T19:00:00.000Z",
  end: "2026-11-21T19:30:00.000Z",
};
test("hosted and rebinding authorities cannot use a local-demo Google connection", async () => {
  await assert.rejects(
    () =>
      googleCalendarOwner(
        new Request("https://daylight.example/api/google-calendar", {
          headers: { host: "daylight.example" },
        }),
      ),
    /Sign in/,
  );
  await assert.rejects(
    () =>
      googleCalendarOwner(
        new Request("http://127.0.0.1:3104/api/google-calendar", {
          headers: { host: "attacker.example" },
        }),
      ),
    /Sign in/,
  );
  const prior = process.env.VERCEL;
  try {
    process.env.VERCEL = "1";
    await assert.rejects(
      () =>
        googleCalendarOwner(
          new Request("http://localhost:3104/api/google-calendar", {
            headers: { host: "localhost:3104" },
          }),
        ),
      /Sign in/,
    );
  } finally {
    if (prior === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prior;
  }
});
test("OAuth configuration, encrypted state, origin and owner binding reject invalid authority or tampering", () => {
  const env = {
    GOOGLE_CALENDAR_CLIENT_ID: config.clientId,
    GOOGLE_CALENDAR_CLIENT_SECRET: config.clientSecret,
    GOOGLE_CALENDAR_REDIRECT_URI: config.redirectUri,
    GOOGLE_CALENDAR_COOKIE_SECRET: config.cookieSecret,
  };
  assert.ok(googleCalendarConfig(env));
  assert.equal(
    googleCalendarConfig({
      ...env,
      GOOGLE_CALENDAR_REDIRECT_URI:
        "http://evil.test/api/google-calendar/callback",
    }),
    null,
  );
  const auth = startGoogleAuthorization(config, "synthetic", false, 1000),
    url = new URL(auth.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(
    !url.searchParams.get("scope")!.split(" ").includes(googleWriteScope),
  );
  assert.ok(!auth.url.includes(config.clientSecret));
  const state = validateGoogleState(
    auth.cookie,
    url.searchParams.get("state")!,
    config,
    1001,
  );
  assert.equal(state.owner, "synthetic");
  assert.throws(() => validateGoogleState(auth.cookie, "wrong", config, 1001));
  assert.throws(() =>
    validateGoogleState(auth.cookie, state.nonce, config, 700000),
  );
  assert.throws(() => unsealGoogle(auth.cookie.slice(1), config.cookieSecret));
  const sealed = sealGoogle(session(), config.cookieSecret);
  assert.ok(!sealed.includes("SECRET_ACCESS"));
  assert.equal(readGoogleSession(sealed, config, "other"), null);
  assert.ok(readGoogleSession(sealed, config, "synthetic"));
  assert.throws(() =>
    requireGoogleOrigin(
      new Request(config.origin, { headers: { origin: "https://evil.test" } }),
      config,
    ),
  );
});
test("OAuth exchange uses PKCE, rejects partial permissions, and keeps tokens on the server", async () => {
  const auth = startGoogleAuthorization(config, "synthetic", true),
    state = validateGoogleState(
      auth.cookie,
      new URL(auth.url).searchParams.get("state")!,
      config,
    );
  const fetcher: typeof fetch = async (_url, init) => {
    const body = new URLSearchParams(init!.body as URLSearchParams);
    assert.equal(body.get("code_verifier"), state.verifier);
    assert.equal(body.get("client_secret"), config.clientSecret);
    return json({
      access_token: "SECRET_ACCESS",
      refresh_token: "SECRET_REFRESH",
      expires_in: 3600,
      scope: [...googleReadScopes, googleWriteScope].join(" "),
    });
  };
  const connected = await finishGoogleAuthorization(
    config,
    state,
    "synthetic-code",
    fetcher,
  );
  assert.ok(connected.scopes.includes(googleWriteScope));
  await assert.rejects(
    () =>
      finishGoogleAuthorization(config, state, "code", async () =>
        json({
          access_token: "x",
          expires_in: 3600,
          scope: googleReadScopes.join(" "),
        }),
      ),
    /permissions/,
  );
});
test("expired access refreshes once and preserves the refresh token; read-only sessions cannot write", async () => {
  const original = session();
  original.accessExpires = 0;
  let calls = 0;
  const client = new GoogleCalendarClient(
    original,
    config,
    async (url, init) => {
      calls++;
      if (String(url).includes("/token"))
        return json({ access_token: "NEW_ACCESS", expires_in: 3600 });
      assert.equal(
        (init!.headers as Record<string, string>).Authorization,
        "Bearer NEW_ACCESS",
      );
      return json({ items: [] });
    },
  );
  await listGoogleCalendars(client);
  assert.equal(calls, 2);
  assert.equal(client.changed, true);
  assert.equal(client.session.refreshToken, "SECRET_REFRESH");
  const readonly = new GoogleCalendarClient(
    { ...session(), scopes: googleReadScopes },
    config,
    async () => {
      throw Error("must not send");
    },
  );
  await assert.rejects(
    () => readonly.call("/calendars/test/events", "POST", {}),
    /editing/,
  );
  await assert.rejects(() => client.call("//evil.test/path"), /Invalid/);
});
test("timezone conversion respects DST and rejects gaps, ambiguity and invalid dates", () => {
  assert.equal(
    calendarInstant("2026-03-08", "00:00:00", "America/New_York"),
    "2026-03-08T05:00:00.000Z",
  );
  assert.equal(
    calendarInstant("2026-03-09", "00:00:00", "America/New_York"),
    "2026-03-09T04:00:00.000Z",
  );
  assert.throws(
    () => calendarInstant("2026-03-08", "02:30:00", "America/New_York"),
    /missing or ambiguous/,
  );
  assert.throws(
    () => calendarInstant("2026-11-01", "01:30:00", "America/New_York"),
    /missing or ambiguous/,
  );
  assert.throws(
    () => calendarInstant("2026-02-31", "00:00:00", "UTC"),
    /invalid date/,
  );
});
test("event reads follow all pages, preserve calendar timezone, and omit canceled/free/declined entries", async () => {
  let pages = 0;
  const event = (id: string, extra = {}) => ({
    id,
    status: "confirmed",
    summary: "Synthetic event",
    iCalUID: id,
    start: { dateTime: "2026-11-21T14:00:00-05:00" },
    end: { dateTime: "2026-11-21T15:00:00-05:00" },
    ...extra,
  });
  const client = new GoogleCalendarClient(session(), config, async (url) => {
    if (String(url).includes("/calendarList/")) return json(calendar);
    pages++;
    const u = new URL(url as URL);
    assert.equal(u.searchParams.get("singleEvents"), "true");
    return pages === 1
      ? json({
          items: [
            event("a"),
            event("free", { transparency: "transparent" }),
            event("cancel", { status: "cancelled" }),
          ],
          nextPageToken: "page2",
        })
      : json({
          items: [
            event("declined", {
              attendees: [{ self: true, responseStatus: "declined" }],
            }),
            event("all-day", {
              start: { date: "2026-11-21" },
              end: { date: "2026-11-22" },
            }),
          ],
        });
  });
  const read = await readGoogleCalendar(
    client,
    calendar.id,
    "2026-11-21T05:00:00.000Z",
    "2026-11-23T05:00:00.000Z",
  );
  assert.equal(pages, 2);
  assert.equal(read.events.length, 2);
  assert.equal(read.events[0].start, "2026-11-21T19:00:00.000Z");
  assert.equal(read.events[1].start, "2026-11-21T05:00:00.000Z");
  assert.equal(read.events[1].allDay, true);
  assert.deepEqual(read.managed, []);
  assert.throws(
    () =>
      calendarBusyToday(
        { version: 1, calendars: [{ ...read, needsRefresh: true }] },
        new Date("2026-11-21T12:00:00Z"),
      ),
    /source events changed/,
  );
});
test("failed pagination never produces a partial calendar snapshot", async () => {
  let page = 0;
  const client = new GoogleCalendarClient(session(), config, async (url) =>
    String(url).includes("/calendarList/")
      ? json(calendar)
      : ++page === 1
        ? json({ items: [], nextPageToken: "next" })
        : json({ error: "provider failure" }, 503),
  );
  await assert.rejects(
    () =>
      readGoogleCalendar(
        client,
        calendar.id,
        "2026-11-21T05:00:00.000Z",
        "2026-11-23T05:00:00.000Z",
      ),
    /could not finish/,
  );
});
test("creation retry checks the same provider event ID and rejects conflicting reuse", async () => {
  let stored: Record<string, unknown> | null = null,
    inserts = 0;
  const client = new GoogleCalendarClient(
    session(),
    config,
    async (url, init) => {
      if (String(url).includes("/calendarList/")) return json(calendar);
      if (init?.method === "POST") {
        inserts++;
        if (stored) return json({}, 409);
        stored = {
          ...JSON.parse(init.body as string),
          etag: "version1",
          htmlLink: "https://calendar.google.com/calendar/event?eid=synthetic",
        };
        return json(stored);
      }
      return json(stored);
    },
  );
  const first = await createGoogleEvent(client, draft),
    again = await createGoogleEvent(client, draft);
  assert.equal(first.outcome, "created");
  assert.equal(again.outcome, "existing");
  assert.equal(first.id, again.id);
  assert.equal(inserts, 2);
  assert.ok(!JSON.stringify(stored).includes("attendees"));
  await assert.rejects(
    () => createGoogleEvent(client, { ...draft, title: "Changed proposal" }),
    /different event/,
  );
});
test("edits require a current ETag and Daylight-owned event; deletion sends the reviewed condition", async () => {
  let stored: Record<string, unknown> = {},
    mutations = 0;
  const client = new GoogleCalendarClient(
    session(),
    config,
    async (url, init) => {
      if (String(url).includes("/calendarList/")) return json(calendar);
      if (init?.method === "POST") {
        stored = { ...JSON.parse(init.body as string), etag: "v1" };
        return json(stored);
      }
      if (init?.method === "PATCH") {
        mutations++;
        assert.equal(
          (init.headers as Record<string, string>)["If-Match"],
          "v1",
        );
        stored = { ...stored, ...JSON.parse(init.body as string), etag: "v2" };
        return json(stored);
      }
      if (init?.method === "DELETE") {
        mutations++;
        assert.equal(
          (init.headers as Record<string, string>)["If-Match"],
          "v2",
        );
        return new Response(null, { status: 204 });
      }
      return json(stored);
    },
  );
  const created = await createGoogleEvent(client, draft);
  await assert.rejects(
    () => editGoogleEvent(client, draft, created.id, "stale"),
    /changed/,
  );
  assert.equal(mutations, 0);
  const updated = await editGoogleEvent(
    client,
    { ...draft, title: "Updated" },
    created.id,
    "v1",
  );
  assert.equal(updated.etag, "v2");
  assert.equal(updated.outcome, "updated");
  const deleted = await editGoogleEvent(
    client,
    { ...draft, title: "Updated" },
    created.id,
    "v2",
    true,
  );
  assert.equal(deleted.outcome, "deleted");
  assert.equal(mutations, 2);
  stored = { ...stored, extendedProperties: {} };
  await assert.rejects(
    () => editGoogleEvent(client, draft, created.id, "v2"),
    /only edit events created/,
  );
  assert.equal(mutations, 2);
});
