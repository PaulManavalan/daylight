const assert = require("node:assert/strict"),
  path = require("node:path");
const { chromium } = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const { startBrowserServer } = require("./browser-server.cjs");
const satKey = "daylight.sat.v1.local-demo",
  dayKey = "daylight.notion-day.v1.2026-11-24";
(async () => {
  const server = await startBrowserServer(),
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
      }),
      errors = [];
    for (const endpoint of [
      "personal-profile-snapshot",
      "running-list-snapshot",
    ])
      await context.route(`**/api/${endpoint}`, (route) =>
        route.fulfill({ status: 404, json: { available: false } }),
      );
    await context.route("**/api/notion", (route) =>
      route.fulfill({ json: { configured: false, connected: false } }),
    );
    await context.route("**/api/assistant", (route) =>
      route.fulfill({ json: { available: false, models: [] } }),
    );
    const page = await context.newPage(),
      satPage = await context.newPage();
    for (const item of [page, satPage]) {
      item.on("pageerror", (error) => errors.push(error.message));
      await item.clock.install({ time: new Date("2026-11-24T09:00:00-05:00") });
    }
    await satPage.goto(server.url + "/day/sat");
    await satPage.getByText("Choose practice time", { exact: true }).click();
    await satPage
      .getByLabel("SAT practice date", { exact: true })
      .fill("2026-11-24");
    await satPage.getByLabel("Planned SAT minutes", { exact: true }).fill("20");
    await satPage
      .getByRole("button", { name: "Review adding SAT practice", exact: true })
      .click();
    assert.equal(
      await satPage.evaluate((key) => localStorage.getItem(key), satKey),
      null,
    );
    await satPage
      .getByRole("button", { name: "Keep current SAT time", exact: true })
      .click();
    assert.equal(
      await satPage.evaluate((key) => localStorage.getItem(key), satKey),
      null,
    );
    await page.goto(server.url + "/day");
    await page
      .getByRole("button", { name: "Try a sample list", exact: true })
      .click();
    await page
      .getByText("Review day details or plan without AI", { exact: true })
      .click();
    await page.getByLabel("Available from", { exact: true }).fill("10:00");
    await page.getByLabel("Finish by", { exact: true }).fill("18:00");
    await page
      .getByRole("checkbox", {
        name: "These include today’s events and other activities I want to plan around.",
        exact: true,
      })
      .check();
    const draft = page.getByRole("button", {
      name: "Create draft from these details",
      exact: true,
    });
    await draft.click();
    await page
      .getByRole("button", { name: "Use this plan", exact: true })
      .click();
    await page
      .getByRole("complementary", { name: "Current schedule", exact: true })
      .waitFor();
    await satPage
      .getByRole("button", { name: "Review adding SAT practice", exact: true })
      .click();
    await satPage
      .getByRole("button", { name: "Save reviewed SAT time", exact: true })
      .click();
    await satPage.waitForFunction(
      (key) => JSON.parse(localStorage.getItem(key))?.reviewPlans.length === 1,
      satKey,
    );
    await page
      .getByRole("alert")
      .filter({ hasText: "selected SAT practice changed" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("complementary", { name: "Current schedule", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("checkbox", {
        name: "These include today’s events and other activities I want to plan around.",
        exact: true,
      })
      .check();
    await draft.click();
    let state = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      dayKey,
    );
    assert.equal(state.approved, false);
    assert.equal(
      state.plan.entries
        .filter((entry) => entry.satReviewId)
        .reduce(
          (sum, entry) =>
            sum + (Date.parse(entry.end) - Date.parse(entry.start)) / 60000,
          0,
        ),
      20,
    );
    await page
      .getByRole("button", { name: "Use this plan", exact: true })
      .click();
    const deck = page.getByRole("navigation", {
      name: "Your day at a glance",
      exact: true,
    });
    await deck.getByText("20 min selected", { exact: true }).waitFor();
    assert.equal(await deck.getByRole("link").count(), 6);
    await page.screenshot({
      path: "artifacts/day-app-deck-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await deck.screenshot({
      path: "artifacts/day-app-deck-mobile.png",
      animations: "disabled",
    });
    const sat = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      satKey,
    );
    assert.equal(sat.attempts.length, 0);
    await satPage.getByText("Selected SAT time", { exact: true }).click();
    await satPage
      .getByRole("button", {
        name: "Review removing Mixed practice",
        exact: true,
      })
      .click();
    await satPage
      .getByRole("button", { name: "Remove reviewed SAT time", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "selected SAT practice changed" })
      .waitFor();
    await page
      .getByRole("checkbox", {
        name: "These include today’s events and other activities I want to plan around.",
        exact: true,
      })
      .check();
    await draft.click();
    state = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      dayKey,
    );
    assert.ok(!state.plan.entries.some((entry) => entry.satReviewId));
    assert.equal(state.homeworkProgress.length, 0);
    assert.equal(
      (
        await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)),
          satKey,
        )
      ).attempts.length,
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS SAT choice review/cancel → saved time → cross-tab approval invalidation → shared daily plan → module cards → reviewed removal → no fabricated attempts/work → mobile",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
