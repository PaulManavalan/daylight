import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNewsFeed, fetchNewsFeed } from "../src/lib/news-feed";
import {
  newsSources,
  canonicalNewsURL,
  mergeHeadlines,
  newsSnapshotSchema,
} from "../src/lib/news";
const source = newsSources.find((source) => source.id === "guardian-world")!,
  now = new Date("2026-11-22T15:00:00Z");
const item = (
  title: string,
  url = "https://www.theguardian.com/world/synthetic",
  date = "Sun, 22 Nov 2026 10:00:00 GMT",
) =>
  `<item><title><![CDATA[${title}]]></title><link>${url.replaceAll("&", "&amp;")}</link><pubDate>${date}</pubDate><description><![CDATA[Article body is not retained <img src="https://third-party.invalid/tracker"/>]]></description></item>`;
const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Source</title>${items}</channel></rss>`;
test("RSS parsing retains attributed headlines and original publication times while excluding article bodies and tracking", () => {
  const rows = parseNewsFeed(
    rss(
      item(
        "Example & reporting",
        "https://www.theguardian.com/world/synthetic?utm_source=feed&amp;x=1#part",
      ),
    ),
    source,
    now,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Example & reporting");
  assert.equal(rows[0].publishedAt, "2026-11-22T10:00:00.000Z");
  assert.equal(rows[0].publisher, "The Guardian");
  assert.ok(!rows[0].url.includes("utm_source"));
  assert.ok(!JSON.stringify(rows).includes("Article body"));
  assert.ok(!JSON.stringify(rows).includes("third-party"));
});
test("unknown publication times stay unknown and future-dated items do not become current headlines", () => {
  const rows = parseNewsFeed(
    rss(
      item("No time", "https://www.theguardian.com/world/unknown", "") +
        item(
          "Timezone missing",
          "https://www.theguardian.com/world/no-zone",
          "2026-11-22T10:00:00",
        ) +
        item(
          "Future",
          "https://www.theguardian.com/world/future",
          "Sun, 22 Nov 2026 19:00:00 GMT",
        ),
    ),
    source,
    now,
  );
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.publishedAt === null));
});
test("feed XML declarations, unsafe links, excessive nesting, entities and malformed XML are rejected", () => {
  for (const link of [
    "javascript:alert(1)",
    "http://www.theguardian.com/world/x",
    "https://www.theguardian.com.evil.invalid/x",
    "https://user:password@www.theguardian.com/x",
    "https://127.0.0.1/x",
    "https://www.theguardian.com:8080/x",
  ])
    assert.equal(canonicalNewsURL(link, source), null);
  assert.equal(
    parseNewsFeed(rss(item("Unsafe", "javascript:alert(1)")), source, now)
      .length,
    0,
  );
  for (const xml of [
    '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]>' + rss(item("x")),
    rss(item("x")).replace("</rss>", ""),
    "<x>".repeat(41) + "</x>".repeat(41),
    "x".repeat(1048577),
    rss("<item><title>&unknown;</title></item>"),
  ])
    assert.throws(() => parseNewsFeed(xml, source, now));
});
test("Atom alternate links work without treating a modified timestamp as a publication date", () => {
  const xml =
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Example update</title><link rel="self" href="https://www.theguardian.com/feed/item"/><link rel="alternate" href="https://www.theguardian.com/world/atom"/><updated>2026-11-22T10:00:00Z</updated></entry></feed>';
  const rows = parseNewsFeed(xml, source, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, "https://www.theguardian.com/world/atom");
  assert.equal(rows[0].publishedAt, null);
});
test("feed requests never follow redirects or accept arbitrary URLs, and oversize streams are cancelled", async () => {
  let cancelled = false;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(input, source.url);
    assert.equal(init?.redirect, "error");
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1048577));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "content-type": "application/rss+xml" } },
    );
  };
  await assert.rejects(
    () => fetchNewsFeed(source, fetcher as typeof fetch, now),
    /size limit/,
  );
  assert.equal(cancelled, true);
  await assert.rejects(
    () =>
      fetchNewsFeed(
        source,
        async () =>
          new Response("<html>Not RSS</html>", {
            headers: { "content-type": "text/html" },
          }),
        now,
      ),
    /unavailable/,
  );
});
test("duplicates retain source provenance and unsafe snapshot links fail client validation", () => {
  const rows = parseNewsFeed(rss(item("Example")), source, now),
    merged = mergeHeadlines([...rows, ...rows]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].sourceIds, [source.id]);
  const response = {
    generatedAt: now.toISOString(),
    topics: ["World"],
    unsupportedTopics: [],
    headlines: [{ ...rows[0], url: "javascript:alert(1)" }],
    sources: [],
  };
  assert.equal(newsSnapshotSchema.safeParse(response).success, false);
});
