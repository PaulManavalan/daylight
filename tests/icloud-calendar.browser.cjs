const assert = require("node:assert/strict"),
  path = require("node:path");
const { chromium } = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const { startBrowserServer } = require("./browser-server.cjs");
const personalKey = "daylight.personal-preview.v1",
  calendarId = "https://p42-caldav.icloud.com/synthetic/calendars/home/";
(async () => {
  const server = await startBrowserServer(),
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 1000 },
        timezoneId: "America/New_York",
        acceptDownloads: true,
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-11-24T09:00:00-05:00") });
    for (const endpoint of [
      "personal-profile-snapshot",
      "running-list-snapshot",
    ])
      await context.route(`**/api/${endpoint}`, (route) =>
        route.fulfill({ status: 404, json: { available: false } }),
      );
    for (const endpoint of ["notion", "google-calendar"])
      await context.route(`**/api/${endpoint}`, (route) =>
        route.fulfill({ json: { configured: false, connected: false } }),
      );
    await context.route("**/api/assistant", (route) =>
      route.fulfill({ json: { available: false, models: [] } }),
    );
    let connected = false,
      failRead = false;
    const ops = [];
    await context.route("**/api/icloud-calendar", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          json: { configured: true, connected, canWrite: false },
        });
      const action = route.request().postDataJSON();
      ops.push(action.op);
      if (action.op === "connect") {
        assert.equal(action.appPassword, "abcd-efgh-ijkl-mnop");
        connected = true;
        return route.fulfill({
          json: {
            connected: true,
            canWrite: false,
            calendars: [{ id: calendarId, title: "Home", canWrite: false }],
          },
          headers: {
            "set-cookie":
              "daylight_icloud_calendar=synthetic-encrypted-cookie; Path=/api/icloud-calendar; HttpOnly; SameSite=Lax",
          },
        });
      }
      if (action.op === "calendars")
        return route.fulfill({
          json: {
            calendars: [{ id: calendarId, title: "Home", canWrite: false }],
          },
        });
      if (action.op === "disconnect") {
        connected = false;
        return route.fulfill({
          json: { disconnected: true, remoteRevoked: false },
        });
      }
      assert.equal(action.op, "read");
      assert.equal(action.calendarId, calendarId);
      assert.equal(action.displayTimeZone, "America/New_York");
      if (failRead)
        return route.fulfill({
          status: 503,
          json: {
            error: "Synthetic iCloud unavailable. Your saved calendar is kept.",
          },
        });
      return route.fulfill({
        json: {
          calendar: {
            id: "icloud-live:synthetic-home",
            title: "Home",
            source: "icloud",
            provider: "apple",
            readAt: "2026-11-24T14:00:00.000Z",
            rangeStart: action.from,
            rangeEnd: action.to,
            warnings: [],
            events: [
              {
                id: "home-event::20261124",
                uid: "home-event",
                title: "Family dinner",
                start: "2026-11-24T23:00:00.000Z",
                end: "2026-11-25T00:00:00.000Z",
                allDay: false,
                calendar: "Home",
                provider: "apple",
                readAt: "2026-11-24T14:00:00.000Z",
              },
            ],
          },
        },
      });
    });
    await page.goto(server.url + "/day/preferences");
    const panel = page.getByRole("region", {
      name: "iCloud Calendar connection",
      exact: true,
    });
    await panel
      .getByLabel("iCloud account email", { exact: true })
      .fill("synthetic@example.test");
    await panel
      .getByLabel("iCloud app-specific password", { exact: true })
      .fill("abcd-efgh-ijkl-mnop");
    await panel
      .getByRole("button", { name: "Connect iCloud Calendar", exact: true })
      .click();
    await panel.getByText("Connected · read access", { exact: true }).waitFor();
    const storage = await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(localStorage))),
    );
    assert.ok(!storage.includes("abcd-efgh-ijkl-mnop"));
    assert.ok(!storage.includes("synthetic@example.test"));
    await page
      .getByLabel("Your name", { exact: true })
      .fill("Unsaved preference");
    await panel
      .getByLabel("iCloud calendar", { exact: true })
      .selectOption(calendarId);
    await panel
      .getByRole("button", {
        name: "Read selected iCloud calendar",
        exact: true,
      })
      .click();
    await panel
      .getByRole("region", { name: "Review iCloud calendar read", exact: true })
      .waitFor();
    const before = await page.evaluate(
      (key) => localStorage.getItem(key),
      personalKey,
    );
    assert.ok(!before || !before.includes("Family dinner"));
    await panel
      .getByRole("button", { name: "Keep existing calendars", exact: true })
      .click();
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), personalKey),
      before,
    );
    await panel
      .getByRole("button", {
        name: "Read selected iCloud calendar",
        exact: true,
      })
      .click();
    await panel
      .getByRole("button", { name: "Use reviewed iCloud events", exact: true })
      .click();
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key))?.calendars.calendars.length === 1,
      personalKey,
    );
    assert.equal(
      await page.getByLabel("Your name", { exact: true }).inputValue(),
      "Unsaved preference",
    );
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      personalKey,
    );
    assert.equal(saved.calendars.calendars[0].source, "icloud");
    assert.equal(saved.displayName, "Unsaved preference");
    const exported = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export saved settings", exact: true })
      .click();
    const download = await exported;
    const backup = await require("node:fs/promises").readFile(
      await download.path(),
      "utf8",
    );
    assert.ok(backup.includes("Family dinner"));
    assert.ok(!backup.includes("abcd-efgh-ijkl-mnop"));
    assert.ok(!backup.includes("synthetic@example.test"));
    failRead = true;
    const beforeFailure = await page.evaluate(
      (key) => localStorage.getItem(key),
      personalKey,
    );
    await panel
      .getByRole("button", {
        name: "Read selected iCloud calendar",
        exact: true,
      })
      .click();
    await panel
      .getByRole("alert")
      .filter({ hasText: "Synthetic iCloud unavailable" })
      .waitFor();
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), personalKey),
      beforeFailure,
    );
    failRead = false;
    await panel
      .getByRole("button", {
        name: "Disconnect iCloud in this browser",
        exact: true,
      })
      .click();
    await panel.getByText("Ready to connect", { exact: true }).waitFor();
    assert.equal(
      await panel
        .getByLabel("iCloud app-specific password", { exact: true })
        .inputValue(),
      "",
    );
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), personalKey),
      beforeFailure,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await panel.screenshot({
      path: "artifacts/icloud-calendar-mobile.png",
      animations: "disabled",
    });
    await page.goto(server.url + "/day");
    await page
      .getByRole("button", { name: "Try a sample list", exact: true })
      .click();
    await page
      .getByText("Review day details or plan without AI", { exact: true })
      .click();
    await page.getByLabel("Available from", { exact: true }).fill("14:00");
    await page.getByLabel("Finish by", { exact: true }).fill("21:00");
    await page
      .getByRole("checkbox", {
        name: "These include today’s events and other activities I want to plan around.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", {
        name: "Create draft from these details",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "Family dinner", exact: true })
      .waitFor();
    const day = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("daylight.notion-day.v1.2026-11-24")),
    );
    const fixed = day.plan.entries.find(
      (item) => item.title === "Family dinner",
    );
    assert.equal(fixed.kind, "fixed");
    assert.ok(
      day.plan.entries
        .filter((item) => item.kind === "study")
        .every(
          (item) =>
            Date.parse(item.end) <= Date.parse(fixed.start) ||
            Date.parse(item.start) >= Date.parse(fixed.end),
        ),
    );
    assert.ok(!JSON.stringify(day).includes("abcd-efgh-ijkl-mnop"));
    assert.ok(!ops.some((op) => ["create", "update", "delete"].includes(op)));
    assert.deepEqual(errors, []);
    console.log(
      "PASS iCloud connection → no credential storage/export → read/review/cancel → saved source → unsaved preference preservation → failed read/disconnect keep data → protected daily event → mobile",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
