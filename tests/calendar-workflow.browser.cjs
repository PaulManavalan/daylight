const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const { startBrowserServer } = require("./browser-server.cjs");
const ics = (uid, title, start, end) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:${title}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
(async () => {
  const server = await startBrowserServer(),
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({
      timezoneId: "America/New_York",
      viewport: { width: 1280, height: 1000 },
      acceptDownloads: true,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-11-21T09:00:00-05:00") });
    await page.route("**/api/notion", (route) =>
      route.fulfill({ json: { configured: false, connected: false } }),
    );
    let lastRequest;
    await page.route("**/api/assistant", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          json: {
            available: true,
            model: "synthetic-test-model",
            models: ["synthetic-test-model"],
          },
        });
      lastRequest = route.request().postDataJSON();
      return route.fulfill({
        json: {
          result: {
            kind: "none",
            reply: "Your draft is ready to review.",
            dailyContext: {
              start: "10:00",
              finish: "22:00",
              eventsDiscussed: true,
              extrasDiscussed: true,
              events: [],
              extras: [],
              focusMinutes: null,
              focusBudget: null,
              focusOrder: [],
              skipKeys: [],
            },
            tasks: [],
            events: [],
            edits: [],
            progress: [],
          },
        },
      });
    });
    await page.goto(server.url + "/day");
    await page
      .getByText("Calendars · 0 saved sources", {
        exact: true,
      })
      .click();
    await page
      .getByText("Import an Apple or Google calendar file", { exact: true })
      .click();
    const file = page.getByLabel("Calendar file");
    await file.setInputFiles({
      name: "school.ics",
      mimeType: "text/calendar",
      buffer: Buffer.from(
        ics(
          "school-event",
          "School assembly",
          "20261121T170000Z",
          "20261121T180000Z",
        ),
      ),
    });
    await page
      .getByRole("heading", { name: "Review School · 1 busy events" })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("daylight.personal-preview.v1") ||
              '{"calendars":{"calendars":[]}}',
          ).calendars.calendars.length,
      ),
      0,
      "file read must not auto-approve",
    );
    await page
      .getByRole("button", { name: "Use these events", exact: true })
      .click();
    await page.getByLabel("Calendar provider").selectOption("apple");
    await file.setInputFiles({
      name: "home.ics",
      mimeType: "text/calendar",
      buffer: Buffer.from(
        ics(
          "home-event",
          "Family appointment",
          "20261121T230000Z",
          "20261122T000000Z",
        ),
      ),
    });
    await page
      .getByRole("button", { name: "Use these events", exact: true })
      .click();
    await page.getByRole("button", { name: "Try a sample list" }).click();
    await page.getByRole("button", { name: "Plan today →" }).click();
    await page
      .getByRole("button", { name: "Use this plan", exact: true })
      .waitFor();
    assert.equal(
      JSON.parse(lastRequest.context).externalCalendarEvents.length,
      2,
    );
    assert.equal(
      await page
        .getByRole("heading", { name: "School assembly", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("heading", { name: "Family appointment", exact: true })
        .count(),
      1,
    );
    await page
      .getByRole("button", { name: "Use this plan", exact: true })
      .click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export focus blocks to Calendar" })
      .click();
    const download = await downloadPromise;
    const text = await fs.readFile(await download.path(), "utf8");
    assert.ok(text.includes("BEGIN:VCALENDAR"));
    assert.ok(text.includes("Read chapter"));
    assert.ok(!text.includes("School assembly"));
    assert.ok(!text.includes("Family appointment"));
    assert.ok(!text.includes("ATTENDEE"));
    await page.getByLabel("Calendar provider").selectOption("google");
    await file.setInputFiles({
      name: "school.ics",
      mimeType: "text/calendar",
      buffer: Buffer.from(
        ics(
          "school-event",
          "School assembly",
          "20261121T180000Z",
          "20261121T190000Z",
        ),
      ),
    });
    await page
      .getByRole("button", { name: "Replace saved School", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Your calendars changed" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Export focus blocks to Calendar" })
        .count(),
      0,
    );
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("daylight.personal-preview.v1"))
            .calendars.calendars.length,
      ),
      2,
    );
    await page.getByRole("link", { name: "Your preferences" }).click();
    await page
      .getByLabel("Foods you dislike (comma separated)")
      .fill("Example food, Another food");
    await page.getByLabel("Who usually prepares meals?").selectOption("family");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved in this browser" })
      .waitFor();
    await page.reload();
    assert.equal(
      await page.getByLabel("Foods you dislike (comma separated)").inputValue(),
      "Example food, Another food",
    );
    assert.equal(
      await page
        .getByLabel("Allergies and medical dietary restrictions")
        .inputValue(),
      "unknown",
    );
    assert.equal(
      await page.getByLabel("Who usually prepares meals?").inputValue(),
      "family",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/preferences-mobile.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "← Back to your day" }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/calendars-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    const offline = await browser.newPage({
      timezoneId: "America/New_York",
      viewport: { width: 390, height: 844 },
    });
    await offline.clock.install({
      time: new Date("2026-11-21T09:00:00-05:00"),
    });
    await offline.route("**/api/notion", (r) =>
      r.fulfill({ json: { configured: false, connected: false } }),
    );
    await offline.route("**/api/assistant", (r) =>
      r.fulfill({ json: { available: false, models: [] } }),
    );
    await offline.goto(server.url + "/day");
    await offline.getByRole("button", { name: "Try a sample list" }).click();
    await offline
      .getByText("Review day details or plan without AI", { exact: true })
      .click();
    await offline.getByLabel("Available from", { exact: true }).fill("10:00");
    await offline.getByLabel("Finish by", { exact: true }).fill("20:00");
    await offline
      .getByRole("checkbox", {
        name: "These include today’s events and other activities I want to plan around.",
      })
      .check();
    await offline
      .getByRole("button", {
        name: "Create draft from these details",
        exact: true,
      })
      .click();
    await offline
      .getByRole("button", { name: "Use this plan", exact: true })
      .waitFor();
    assert.ok(
      await offline
        .getByRole("heading", { name: "Read chapter 4", exact: true })
        .count(),
    );
    assert.equal(
      await offline.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await offline
      .getByRole("button", { name: "Use this plan", exact: true })
      .click();
    await offline
      .getByRole("heading", { name: "Your plan for today", exact: true })
      .waitFor();
    await offline.close();
    console.log(
      "PASS reviewed Google + Apple file import → protected daily plan → focus-only export → changed-calendar invalidation → preferences persistence → mobile layouts → usable offline planner",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
