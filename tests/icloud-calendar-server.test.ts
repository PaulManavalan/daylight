import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/icloud-calendar/route";
import {
  icloudConfig,
  readICloudSession,
  sealICloud,
  icloudCookieOptions,
  type ICloudSession,
} from "../src/lib/icloud-calendar-server";
const config = {
  origin: "http://127.0.0.1:3104",
  cookieSecret: "synthetic-icloud-encryption-secret-at-least-32",
  secure: false,
};
const session = (): ICloudSession => ({
  kind: "icloud-calendar",
  owner: "local-demo",
  email: "synthetic@example.test",
  appPassword: "abcd-efgh-ijkl-mnop",
  principalURL: "https://p42-caldav.icloud.com/synthetic/principal/",
  homeURL: "https://p42-caldav.icloud.com/synthetic/calendars/",
  expires: Date.now() + 3600000,
});
test("iCloud configuration requires a canonical secure origin and a separate encryption secret", () => {
  assert.equal(icloudConfig({}), null);
  assert.equal(
    icloudConfig({
      ICLOUD_CALENDAR_ORIGIN: config.origin,
      ICLOUD_CALENDAR_COOKIE_SECRET: config.cookieSecret,
    })?.secure,
    false,
  );
  for (const origin of [
    "http://example.test",
    "https://example.test/path",
    "https://example.test?x=1",
    "https://user:secret@example.test/",
  ])
    assert.equal(
      icloudConfig({
        ICLOUD_CALENDAR_ORIGIN: origin,
        ICLOUD_CALENDAR_COOKIE_SECRET: config.cookieSecret,
      }),
      null,
    );
  assert.equal(
    icloudConfig({
      VERCEL: "1",
      ICLOUD_CALENDAR_ORIGIN: config.origin,
      ICLOUD_CALENDAR_COOKIE_SECRET: config.cookieSecret,
    }),
    null,
  );
});
test("encrypted iCloud sessions are owner-bound, expire and cannot be tampered with", () => {
  const data = session(),
    sealed = sealICloud(data, config.cookieSecret);
  assert.ok(!sealed.includes(data.appPassword));
  assert.equal(
    readICloudSession(sealed, config, "local-demo")?.email,
    data.email,
  );
  assert.equal(readICloudSession(sealed, config, "another-owner"), null);
  assert.equal(
    readICloudSession(sealed, config, "local-demo", data.expires),
    null,
  );
  assert.throws(
    () =>
      readICloudSession(
        sealed.slice(0, 30) +
          (sealed[30] === "A" ? "B" : "A") +
          sealed.slice(31),
        config,
        "local-demo",
      ),
    /Reconnect/,
  );
  assert.throws(
    () =>
      readICloudSession(
        sealed,
        { ...config, cookieSecret: "a-different-synthetic-secret-at-least-32" },
        "local-demo",
      ),
    /Reconnect/,
  );
  assert.equal(icloudCookieOptions(config).httpOnly, true);
  assert.equal(icloudCookieOptions(config).path, "/api/icloud-calendar");
  assert.throws(
    () =>
      sealICloud(
        {
          ...data,
          principalURL: "https://p42-caldav.icloud.com/" + "a".repeat(1900),
          homeURL: "https://p42-caldav.icloud.com/" + "b".repeat(1900),
        },
        config.cookieSecret,
      ),
    /too large/,
  );
});
test("the route verifies discovery before storing credentials and never returns them", async (t) => {
  const previousOrigin = process.env.ICLOUD_CALENDAR_ORIGIN,
    previousSecret = process.env.ICLOUD_CALENDAR_COOKIE_SECRET,
    previousFetch = globalThis.fetch;
  process.env.ICLOUD_CALENDAR_ORIGIN = config.origin;
  process.env.ICLOUD_CALENDAR_COOKIE_SECRET = config.cookieSecret;
  t.after(() => {
    if (previousOrigin === undefined) delete process.env.ICLOUD_CALENDAR_ORIGIN;
    else process.env.ICLOUD_CALENDAR_ORIGIN = previousOrigin;
    if (previousSecret === undefined)
      delete process.env.ICLOUD_CALENDAR_COOKIE_SECRET;
    else process.env.ICLOUD_CALENDAR_COOKIE_SECRET = previousSecret;
    globalThis.fetch = previousFetch;
  });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    const props =
      calls === 1
        ? "<d:current-user-principal><d:href>https://p42-caldav.icloud.com/synthetic/principal/</d:href></d:current-user-principal>"
        : calls === 2
          ? "<c:calendar-home-set><d:href>https://p42-caldav.icloud.com/synthetic/calendars/</d:href></c:calendar-home-set>"
          : "<d:displayname>Home</d:displayname><d:resourcetype><c:calendar/></d:resourcetype>";
    return new Response(
      `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/synthetic/calendars/home/</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,
      { status: 207 },
    );
  }) as typeof fetch;
  const request = (body: unknown, origin = config.origin) =>
    new NextRequest(config.origin + "/api/icloud-calendar", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const connected = await POST(
    request({
      op: "connect",
      email: session().email,
      appPassword: session().appPassword,
    }),
  );
  assert.equal(connected.status, 200);
  assert.equal(calls, 3);
  const publicData = await connected.text();
  assert.ok(!publicData.includes(session().appPassword));
  assert.ok(!publicData.includes(session().email));
  const cookie = connected.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/i);
  assert.ok(!cookie.includes(session().appPassword));
  const status = await GET(
    new NextRequest(config.origin + "/api/icloud-calendar", {
      headers: { cookie: cookie.split(";")[0] },
    }),
  );
  assert.equal((await status.json()).connected, true);
  const rejected = await POST(
    request({
      op: "connect",
      email: session().email,
      appPassword: "ordinary-account-password",
    }),
  );
  assert.equal(rejected.status, 400);
  assert.equal(calls, 3);
  const foreign = await POST(
    request({ op: "calendars" }, "https://foreign.test"),
  );
  assert.equal(foreign.status, 403);
  assert.equal(calls, 3);
  const oversized = await POST(
    request({ op: "calendars", extra: "x".repeat(13000) }),
  );
  assert.equal(oversized.status, 413);
  assert.equal(calls, 3);
  const anotherAccountCookie = sealICloud(
    { ...session(), owner: "2b2f5471-1ef6-49c4-a488-888f8467e1d1" },
    config.cookieSecret,
  );
  const anonymousRead = await POST(
    new NextRequest(config.origin + "/api/icloud-calendar", {
      method: "POST",
      headers: {
        origin: config.origin,
        "content-type": "application/json",
        cookie: "daylight_icloud_calendar=" + anotherAccountCookie,
      },
      body: JSON.stringify({ op: "calendars" }),
    }),
  );
  assert.equal(anonymousRead.status, 401);
  assert.equal(
    calls,
    3,
    "A connection owned by an account cannot be used by the local workspace",
  );
  const disconnected = await POST(request({ op: "disconnect" }));
  assert.equal((await disconnected.json()).remoteRevoked, false);
  assert.equal(calls, 3);
  assert.match(disconnected.headers.get("set-cookie")!, /Max-Age=0/i);
});
