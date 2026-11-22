import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/news/route";
test("the news endpoint accepts only distinct allowlisted topic names, never caller-supplied URLs", async () => {
  for (const query of [
    "",
    "?topics=",
    "?topics=World&url=http://127.0.0.1/private",
    "?topics=http://127.0.0.1",
    "?topics=World,World",
    "?topics=World&topics=Science",
    "?topics=Local,NotARealTopic",
  ]) {
    const response = await GET(
      new NextRequest("http://localhost/api/news" + query),
    );
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});
test("unknown local coverage is returned explicitly without a guessed publisher or location", async () => {
  const response = await GET(
    new NextRequest("http://localhost/api/news?topics=Local"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.unsupportedTopics, ["Local"]);
  assert.deepEqual(body.headlines, []);
  assert.deepEqual(body.sources, []);
});
