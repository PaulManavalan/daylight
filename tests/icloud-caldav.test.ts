import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ICloudCalDavClient,
  icloudURL,
  parseDavMultistatus,
  DAV,
  davName,
  xmlText,
} from "../src/lib/icloud-caldav";
const credentials = {
  email: "synthetic@example.test",
  appPassword: "abcd-efgh-ijkl-mnop",
};
const response = (properties: string) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/synthetic/calendars/home/</d:href><d:propstat><d:prop>${properties}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
test("iCloud credentials cannot travel to foreign hosts, plaintext URLs, ports or userinfo", () => {
  assert.equal(
    icloudURL("/home/", "https://p42-caldav.icloud.com/root/").href,
    "https://p42-caldav.icloud.com/home/",
  );
  for (const url of [
    "http://caldav.icloud.com/",
    "https://caldav.icloud.com:8443/",
    "https://caldav.icloud.com@evil.test/",
    "https://caldav.icloud.com.evil.test/",
    "https://127.0.0.1/",
    "https://p42-carddav.icloud.com/",
    "https://caldav.icloud.com/?token=x",
    "https://caldav.icloud.com/#x",
  ])
    assert.throws(() => icloudURL(url));
});
test("DAV parsing follows namespaces and successful property status without treating missing metadata as data", () => {
  const xml = response(
    "<d:displayname>Home &amp; family</d:displayname><d:resourcetype><c:calendar/></d:resourcetype>",
  );
  const rows = parseDavMultistatus(xml);
  assert.equal(rows.length, 1);
  assert.equal(
    xmlText(rows[0].properties.get(davName(DAV, "displayname"))!),
    "Home & family",
  );
  const missing = xml.replace("HTTP/1.1 200 OK", "HTTP/1.1 404 Not Found");
  assert.equal(parseDavMultistatus(missing)[0].properties.size, 0);
  assert.throws(
    () =>
      parseDavMultistatus(
        xml.replace("HTTP/1.1 200 OK", "HTTP/1.1 403 Forbidden"),
      ),
    /every requested/,
  );
});
test("untrusted XML declarations, duplicates, excessive nesting and namespace spoofing are rejected", () => {
  for (const xml of [
    "<!DOCTYPE d:multistatus [<!ENTITY private SYSTEM 'file:///secret'>]>" +
      response(""),
    response(
      "<d:displayname>A</d:displayname><d:displayname>B</d:displayname>",
    ),
    response("<d:x>".repeat(50) + "</d:x>".repeat(50)),
    response("").replace('xmlns:d="DAV:"', 'xmlns:d="https://evil.test/"'),
  ])
    assert.throws(() => parseDavMultistatus(xml));
});
test("discovery follows only validated Apple redirects with the original read method", async () => {
  const calls: { url: string; method?: string; headers: Headers }[] = [];
  const client = new ICloudCalDavClient(credentials, (async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method,
      headers: new Headers(init?.headers),
    });
    return calls.length === 1
      ? new Response(null, {
          status: 301,
          headers: { location: "https://p42-caldav.icloud.com/" },
        })
      : new Response(response("<d:displayname>Home</d:displayname>"), {
          status: 207,
        });
  }) as typeof fetch);
  const result = await client.request(
    "https://caldav.icloud.com/",
    "PROPFIND",
    "<test/>",
  );
  assert.equal(result.url, "https://p42-caldav.icloud.com/");
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every(
      (call) => call.method === "PROPFIND" && call.headers.has("authorization"),
    ),
  );
});
test("a foreign redirect never receives a credential-bearing request", async () => {
  let requests = 0;
  const client = new ICloudCalDavClient(credentials, (async () => {
    requests++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://evil.test/collect" },
    });
  }) as typeof fetch);
  await assert.rejects(
    () => client.request("https://caldav.icloud.com/", "PROPFIND", "<test/>"),
    /unsupported calendar address/,
  );
  assert.equal(requests, 1);
});
test("authentication failure and response overflow preserve safe fixed error messages", async () => {
  const rejected = new ICloudCalDavClient(
    credentials,
    (async () =>
      new Response("secret provider details", { status: 401 })) as typeof fetch,
  );
  await assert.rejects(
    () => rejected.request("https://caldav.icloud.com/", "PROPFIND"),
    (error) =>
      error instanceof Error &&
      /app-specific password/.test(error.message) &&
      !error.message.includes(credentials.appPassword),
  );
  const oversized = new ICloudCalDavClient(
    credentials,
    (async () =>
      new Response("x".repeat(2_000_001), { status: 207 })) as typeof fetch,
  );
  await assert.rejects(
    () => oversized.request("https://caldav.icloud.com/", "PROPFIND"),
    /smaller iCloud/,
  );
  const controller = new AbortController();
  controller.abort();
  const stopped = new ICloudCalDavClient(
    credentials,
    (async () => {
      throw Error("Must not fetch");
    }) as typeof fetch,
    controller.signal,
  );
  await assert.rejects(
    () => stopped.request("https://caldav.icloud.com/", "PROPFIND"),
    /stopped/,
  );
});
