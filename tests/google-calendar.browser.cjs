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
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        timezoneId: "America/New_York",
      }),
      calls = [],
      requests = [];
    let failed = false,
      managed = [];
    await page.clock.install({ time: new Date("2026-11-21T09:00:00-05:00") });
    const row = {
        id: "school@example.test",
        title: "Synthetic school",
        timeZone: "America/New_York",
        accessRole: "owner",
        primary: true,
      },
      snapshot = {
        id: "google-live:synthetic",
        provider: "google",
        readAt: "2026-11-21T14:00:00.000Z",
        rangeStart: "2026-11-21T05:00:00.000Z",
        rangeEnd: "2026-12-21T05:00:00.000Z",
        warnings: [],
        events: [
          {
            id: "fixed",
            uid: "fixeduid",
            title: "Protected class",
            start: "2026-11-21T15:00:00.000Z",
            end: "2026-11-21T16:00:00.000Z",
            allDay: false,
            calendar: "Synthetic school",
            provider: "google",
            readAt: "2026-11-21T14:00:00.000Z",
          },
        ],
      };
    await page.route("**/api/google-calendar", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          json: { configured: true, connected: true, canWrite: true },
        });
      const body = route.request().postDataJSON();
      calls.push(body.op);
      if (body.op === "calendars")
        return route.fulfill({ json: { calendars: [row] } });
      if (body.op === "read")
        return route.fulfill({ json: { calendar: { ...snapshot, managed } } });
      if (body.op === "create") {
        requests.push(body.draft.requestId);
        if (!failed) {
          failed = true;
          return route.fulfill({
            status: 502,
            json: {
              error:
                "Google may have received this action. Keep this proposal and retry it.",
            },
          });
        }
        const receipt = {
          id: "synthetic-created",
          etag: "v1",
          calendarId: row.id,
          title: body.draft.title,
          start: body.draft.start,
          end: body.draft.end,
          url: "https://calendar.google.com/calendar/event?eid=synthetic",
          outcome: "created",
        };
        managed = [receipt];
        return route.fulfill({ json: { receipt } });
      }
      if (body.op === "update") {
        assert.equal(body.etag, "v1");
        managed = [
          { ...managed[0], ...body.draft, etag: "v2", outcome: "updated" },
        ];
        return route.fulfill({ json: { receipt: managed[0] } });
      }
      if (body.op === "delete") {
        assert.equal(body.confirmDelete, true);
        assert.equal(body.etag, "v2");
        const receipt = { ...managed[0], outcome: "deleted" };
        managed = [];
        return route.fulfill({ json: { receipt } });
      }
      throw Error("Unexpected operation " + body.op);
    });
    await page.goto(server.url + "/day/preferences");
    const panel = page.getByRole("region", { name: "Live Google Calendar" });
    await panel
      .getByRole("button", { name: "Choose or refresh calendars", exact: true })
      .click();
    await panel.getByLabel("Google calendar to use").selectOption(row.id);
    await panel
      .getByRole("button", { name: "Read next 30 days", exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "Use these Google events in my plan",
        exact: true,
      })
      .click();
    let state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("daylight.personal-preview.v1")),
    );
    assert.equal(state.calendars.calendars.length, 1);
    await page
      .getByLabel("Your name", { exact: true })
      .fill("Synthetic preference after calendar read");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("daylight.personal-preview.v1")),
    );
    assert.equal(
      state.calendars.calendars.length,
      1,
      "Saving preferences must preserve the newly read calendar",
    );
    await panel
      .getByLabel("Event title", { exact: true })
      .fill("Synthetic review");
    await panel
      .getByLabel("Event starts", { exact: true })
      .fill("2026-11-21T14:00");
    await panel
      .getByLabel("Event ends", { exact: true })
      .fill("2026-11-21T14:30");
    await panel
      .getByRole("button", { name: "Review event", exact: true })
      .click();
    assert.equal(calls.filter((x) => x === "create").length, 0);
    await panel
      .getByRole("button", {
        name: "Save reviewed event to Google Calendar",
        exact: true,
      })
      .click();
    await panel
      .getByRole("alert")
      .filter({ hasText: "may have received" })
      .waitFor();
    await panel
      .getByRole("button", {
        name: "Save reviewed event to Google Calendar",
        exact: true,
      })
      .click();
    await panel
      .getByText("Google confirmation: created · Synthetic review", {
        exact: false,
      })
      .waitFor();
    assert.equal(requests[0], requests[1]);
    state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("daylight.personal-preview.v1")),
    );
    assert.equal(state.calendars.calendars[0].needsRefresh, true);
    assert.equal(state.displayName, "Synthetic preference after calendar read");
    await panel
      .getByRole("button", { name: "Edit Synthetic review", exact: true })
      .click();
    await panel
      .getByLabel("Event title", { exact: true })
      .fill("Updated review");
    await panel
      .getByRole("button", { name: "Review event", exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "Save reviewed event to Google Calendar",
        exact: true,
      })
      .click();
    await panel
      .getByText("Google confirmation: updated · Updated review", {
        exact: false,
      })
      .waitFor();
    await panel
      .getByRole("button", {
        name: "Review deletion of Updated review",
        exact: true,
      })
      .click();
    assert.equal(calls.filter((x) => x === "delete").length, 0);
    await panel
      .getByRole("button", {
        name: "Confirm deletion in Google Calendar",
        exact: true,
      })
      .click();
    await panel
      .getByText("Google confirmation: deleted · Updated review", {
        exact: false,
      })
      .waitFor();
    assert.equal(calls.filter((x) => x === "delete").length, 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/google-calendar-mobile.png",
      fullPage: true,
    });
    console.log(
      "PASS synthetic Google read/review → planner snapshot → preference merge → reviewed create/retry identity → stale snapshot → ETag update → explicit delete → mobile",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
