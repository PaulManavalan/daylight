import { test } from "node:test";
import assert from "node:assert/strict";
import { NewsService } from "../src/lib/news-service";
import { newsSources } from "../src/lib/news";
const initial = new Date("2026-11-22T15:00:00Z");
function fixture() {
  let now = new Date(initial),
    failNASA = false,
    calls = 0;
  const fetcher: typeof fetch = async (input) => {
    calls++;
    const source = newsSources.find((source) => source.url === String(input))!;
    assert.ok(source);
    if (source.id === "nasa" && failNASA) throw Error("Synthetic offline");
    return new Response(
      `<rss><channel><item><title>Synthetic ${source.publisher} update</title><link>${source.publisher === "NASA" ? "https://www.nasa.gov/news-release/synthetic" : "https://www.theguardian.com/world/synthetic"}</link><pubDate>Sun, 22 Nov 2026 14:00:00 GMT</pubDate></item></channel></rss>`,
      { headers: { "content-type": "application/rss+xml" } },
    );
  };
  return {
    service: new NewsService(fetcher, () => now),
    setTime: (minutes: number) => {
      now = new Date(+initial + minutes * 60000);
    },
    fail: (value: boolean) => {
      failNASA = value;
    },
    calls: () => calls,
  };
}
test("feed caching shares public publisher snapshots without inventing fresh fetch timestamps", async () => {
  const f = fixture(),
    first = await f.service.read(["Science"]);
  assert.equal(f.calls(), 2);
  f.setTime(5);
  const cached = await f.service.read(["Science"]);
  assert.equal(f.calls(), 2);
  assert.equal(cached.sources[0].fetchedAt, first.sources[0].fetchedAt);
  assert.notEqual(cached.generatedAt, first.generatedAt);
});
test("partial publisher failure retains an explicitly stale snapshot and retries after a bounded cooldown", async () => {
  const f = fixture(),
    first = await f.service.read(["Science"]);
  f.setTime(16);
  f.fail(true);
  const failed = await f.service.read(["Science"]);
  assert.equal(
    failed.sources.find((source) => source.id === "nasa")?.state,
    "stale",
  );
  assert.equal(
    failed.sources.find((source) => source.id === "nasa")?.fetchedAt,
    first.sources.find((source) => source.id === "nasa")?.fetchedAt,
  );
  assert.equal(
    failed.sources.find((source) => source.id === "guardian-science")?.state,
    "current",
  );
  assert.equal(failed.headlines.length, 2);
  const count = f.calls();
  await f.service.read(["Science"]);
  assert.equal(f.calls(), count);
  f.fail(false);
  f.setTime(18);
  assert.equal(
    (await f.service.read(["Science"])).sources.find(
      (source) => source.id === "nasa",
    )?.state,
    "current",
  );
});
test("source overlap deduplicates articles while preserving all feed identities and unsupported local coverage stays explicit", async () => {
  const f = fixture(),
    result = await f.service.read(["Technology", "AI"]);
  const guardian = result.headlines.find(
    (item) => item.publisher === "The Guardian",
  )!;
  assert.equal(guardian.sourceIds.length, 2);
  assert.ok(guardian.topics.includes("AI"));
  const local = await f.service.read(["Local"]);
  assert.equal(local.headlines.length, 0);
  assert.deepEqual(local.unsupportedTopics, ["Local"]);
});
test("concurrent requests share in-flight feed reads and initial failures do not manufacture empty success", async () => {
  const f = fixture();
  await Promise.all([f.service.read(["Science"]), f.service.read(["Science"])]);
  assert.equal(f.calls(), 2);
  const failed = new NewsService(
    async () => {
      throw Error("Offline");
    },
    () => initial,
  );
  const result = await failed.read(["Science"]);
  assert.equal(result.headlines.length, 0);
  assert.ok(
    result.sources.every(
      (source) => source.state === "unavailable" && source.fetchedAt === null,
    ),
  );
});
