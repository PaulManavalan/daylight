const assert = require("node:assert/strict"),
  path = require("node:path");
const { chromium } = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const { startBrowserServer } = require("./browser-server.cjs");
(async () => {
  const server = await startBrowserServer(),
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        timezoneId: "America/New_York",
      }),
      page = await context.newPage();
    await page.clock.install({ time: new Date("2026-11-21T09:00:00-05:00") });
    await page.route("**/api/news?**", (r) =>
      r.fulfill({
        status: 503,
        json: {
          error: "News disabled in the unrelated planner overview scenario",
        },
      }),
    );
    await page.route("**/api/notion", (r) =>
      r.fulfill({ json: { configured: false, connected: false } }),
    );
    await page.route("**/api/assistant", (r) =>
      r.fulfill({ json: { available: false, models: [] } }),
    );
    await page.goto(server.url + "/day/briefing");
    await page
      .getByRole("navigation", { name: "Today's saved records" })
      .getByRole("link", { name: /Your running list Read from Notion/ })
      .waitFor();
    await page.goto(server.url + "/day");
    await page
      .getByRole("button", { name: "Try a sample list", exact: true })
      .click();
    await page
      .getByText("Review day details or plan without AI", { exact: true })
      .click();
    await page.getByLabel("Available from", { exact: true }).fill("10:00");
    await page.getByLabel("Finish by", { exact: true }).fill("16:00");
    await page
      .getByRole("checkbox", {
        name: "These include today’s events and other activities I want to plan around.",
      })
      .check();
    await page
      .getByRole("button", {
        name: "Create draft from these details",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Use this plan", exact: true })
      .click();
    await page.goto(server.url + "/day/briefing");
    await page
      .getByRole("heading", { name: "Your approved timeline", exact: true })
      .waitFor();
    await page.getByText("2026-11-21 · SAMPLE DATA", { exact: true }).waitFor();
    const overview = page.getByRole("navigation", {
      name: "Today's saved records",
    });
    await overview.getByRole("link", { name: /0 min Work recorded/ }).waitFor();
    const savedBeforeClock = await page.evaluate(() =>
      localStorage.getItem("daylight.notion-day.v1.2026-11-21"),
    );
    await page.clock.fastForward(2 * 60 * 60 * 1000);
    await page
      .getByRole("complementary", { name: "Current schedule" })
      .getByText("Scheduled now", { exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("daylight.notion-day.v1.2026-11-21"),
      ),
      savedBeforeClock,
      "Viewing elapsed schedule must not record work",
    );
    await overview.getByRole("link", { name: /0 min Work recorded/ }).waitFor();
    await page.setViewportSize({ width: 1440, height: 1050 });
    const mealCard = await page
      .getByRole("heading", { name: "Meals for today", exact: true })
      .evaluate((node) => {
        const section = node.closest("section");
        return {
          width: section.getBoundingClientRect().width,
          clipped: section.scrollWidth > section.clientWidth,
        };
      });
    assert.ok(
      mealCard.width > 300,
      "Desktop modules need enough width for readable content",
    );
    assert.equal(mealCard.clipped, false, "Module content must not be clipped");
    await page.screenshot({
      path: "artifacts/day-briefing-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.ok(
      (
        await page
          .getByRole("link", { name: "USCCB daily Mass readings" })
          .getAttribute("href")
      ).endsWith("/112126.cfm"),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/day-briefing-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.evaluate(() => {
      const key = "daylight.notion-day.v1.2026-11-21",
        data = JSON.parse(localStorage.getItem(key));
      data.calendarRevision = "stale";
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload();
    await page.getByRole("alert").filter({ hasText: "changed" }).waitFor();
    assert.equal(
      await page
        .getByRole("heading", { name: "Your approved timeline", exact: true })
        .count(),
      0,
    );
    console.log(
      "PASS approved sample plan → connected overview → dated reading link → mobile → changed-source invalidation",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
