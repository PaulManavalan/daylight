const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs"),
  ts = require("typescript");
require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
const { newsSources } = require("../src/lib/news.ts"),
  { defaultPersonalWorkspace } = require("../src/lib/personal-workspace.ts");
const { chromium } = require(
    path.join(
      process.env.USERPROFILE,
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
  ),
  { startBrowserServer } = require("./browser-server.cjs");
function snapshot(topics, mode) {
  const sources = newsSources.filter((source) =>
    source.topics.some((topic) => topics.includes(topic)),
  );
  return {
    generatedAt: "2026-11-22T15:00:00.000Z",
    topics,
    unsupportedTopics: topics.filter(
      (topic) => !sources.some((source) => source.topics.includes(topic)),
    ),
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      publisher: source.publisher,
      home: source.home,
      state: mode === "stale" && source.id === "nasa" ? "stale" : "current",
      fetchedAt:
        source.id === "nasa"
          ? "2026-11-21T15:00:00.000Z"
          : "2026-11-22T15:00:00.000Z",
      checkedAt: "2026-11-22T15:00:00.000Z",
      latestPublishedAt: "2026-11-21T14:00:00.000Z",
      message: "Synthetic source snapshot",
    })),
    headlines: sources.map((source) => {
      const url =
        (source.publisher === "NASA"
          ? "https://www.nasa.gov/news-release/"
          : "https://www.theguardian.com/world/") + source.id;
      return {
        id: url,
        title:
          source.id === "guardian-science"
            ? "<img src=x onerror=alert(1)> literal science headline"
            : source.name + " report",
        url: mode === "malicious" ? "javascript:alert(1)" : url,
        publisher: source.publisher,
        kind: source.kind,
        format: "headline",
        publishedAt: "2026-11-21T14:00:00.000Z",
        topics: source.topics,
        sourceIds: [source.id],
      };
    }),
  };
}
(async () => {
  const server = await startBrowserServer(),
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
      }),
      errors = [];
    let mode = "normal",
      aiCalls = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    const initial = defaultPersonalWorkspace();
    initial.news = ["Science"];
    await page.addInitScript((initial) => {
      localStorage.setItem(
        "daylight.personal-preview.v1",
        JSON.stringify(initial),
      );
      localStorage.setItem("daylight.tasks.v1", "preserve-task-records");
      navigator.geolocation.getCurrentPosition = () => {
        throw Error("News must not infer location");
      };
    }, initial);
    await page.route("**/api/personal-profile-snapshot", (r) =>
      r.fulfill({ status: 404, json: { available: false } }),
    );
    await page.route("**/api/assistant", (r) => {
      aiCalls++;
      return r.fulfill({ status: 503, json: { error: "No AI in RSS reader" } });
    });
    await page.route("**/api/news?**", async (route) => {
      const topics = new URL(route.request().url()).searchParams
        .get("topics")
        .split(",");
      if (mode === "offline")
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic offline" },
        });
      return route.fulfill({ json: snapshot(topics, mode) });
    });
    await page.goto(server.url + "/day/news");
    await page
      .getByRole("region", { name: "Publisher headlines", exact: true })
      .waitFor();
    assert.equal(await page.getByRole("article").count(), 2);
    assert.equal(await page.locator("article img").count(), 0);
    assert.equal(
      await page
        .getByText("<img src=x onerror=alert(1)> literal science headline", {
          exact: false,
        })
        .count(),
      1,
    );
    assert.ok(
      (await page.getByRole("article").first().innerText()).includes("Nov 21"),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Science", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    mode = "offline";
    await page
      .getByRole("button", { name: "Refresh headlines", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "last successful request" })
      .waitFor();
    assert.equal(await page.getByRole("article").count(), 2);
    mode = "stale";
    await page
      .getByRole("button", { name: "Refresh headlines", exact: true })
      .click();
    await page
      .getByRole("article")
      .filter({ hasText: "NASA news releases report" })
      .getByText("Older snapshot", { exact: true })
      .waitFor();
    await page.getByText("Sources & freshness", { exact: true }).click();
    await page
      .getByText("NASA · NASA news releases ↗", { exact: true })
      .waitFor();
    mode = "malicious";
    await page
      .getByRole("button", { name: "Refresh headlines", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "could not be verified" })
      .waitFor();
    assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(await page.getByRole("article").count(), 2);
    mode = "normal";
    await page.getByRole("button", { name: "World", exact: true }).click();
    await page.getByRole("button", { name: "US", exact: true }).click();
    await page.getByRole("button", { name: "World", exact: true }).click();
    await page
      .getByRole("article")
      .filter({ hasText: "US news report" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("article")
        .filter({ hasText: "World news report" })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "Local", exact: true }).click();
    await page.getByRole("button", { name: "US", exact: true }).click();
    await page.getByRole("button", { name: "Science", exact: true }).click();
    await page
      .getByText(
        "A local publisher has not been selected yet. This view does not infer your location.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.getByRole("article").count(), 0);
    await page.getByRole("button", { name: "Science", exact: true }).click();
    await page.getByRole("button", { name: "Local", exact: true }).click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("button")]
          .find((button) => button.textContent === "Local")
          ?.getAttribute("aria-pressed") === "false",
    );
    await page
      .getByRole("region", { name: "Publisher headlines", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/news-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({
      path: "artifacts/news-desktop.png",
      fullPage: true,
    });
    await page.goto(server.url + "/day/briefing");
    await page
      .getByRole("region", { name: "News in your briefing", exact: true })
      .getByRole("link", { name: /literal science headline/ })
      .waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("daylight.tasks.v1")),
      "preserve-task-records",
    );
    assert.equal(aiCalls, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS news preferences → safe publisher links/text → unchanged publication dates → client failure retains snapshot → stale publisher labels → topic races → unknown local coverage → no AI rewriting/location access → mobile",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
