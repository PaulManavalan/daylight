const assert = require("node:assert/strict"),
  path = require("node:path");
const { chromium } = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const { startBrowserServer } = require("./browser-server.cjs");
const key = "daylight.notion-day.v1.2026-11-22";
const time = (value) =>
  new Date("2026-11-22T" + value + ":00-05:00").toISOString();
const source = {
  pageId: "sample",
  title: "Synthetic running list",
  readAt: time("09:00"),
  items: [
    {
      key: "a",
      title: "Read chapter 4",
      subject: "Literature",
      yellowHighlighted: true,
      completion: "unchecked",
      sourceUrl: "https://www.notion.so/synthetic",
    },
  ],
  weeklyNotes: [],
  warnings: [],
};
const session = {
  source,
  sample: true,
  known: {
    start: "10:00",
    finish: "12:00",
    eventsDiscussed: true,
    extrasDiscussed: true,
    events: [{ title: "Appointment", start: "11:00", end: "11:30" }],
    extras: [],
    focusMinutes: null,
    focusBudget: null,
    focusOrder: [],
    skipKeys: [],
  },
  messages: [],
  approved: true,
  homeworkProgress: [],
  pendingHomeworkCheckin: null,
  plan: {
    day: "2026-11-22",
    generatedAt: time("09:00"),
    sourceReadAt: source.readAt,
    window: "10:00–12:00",
    assumptions: [],
    deferred: [],
    entries: [
      {
        id: "study",
        title: "Read chapter 4",
        start: time("10:00"),
        end: time("10:25"),
        kind: "study",
        sourceKey: "a",
      },
      {
        id: "break",
        title: "Break",
        start: time("10:25"),
        end: time("10:30"),
        kind: "break",
        sourceKey: null,
      },
      {
        id: "event",
        title: "Appointment",
        start: time("11:00"),
        end: time("11:30"),
        kind: "fixed",
        sourceKey: null,
      },
    ],
  },
};
(async () => {
  const server = await startBrowserServer(),
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
        reducedMotion: "reduce",
      }),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-11-22T10:15:00-05:00") });
    for (const endpoint of [
      "personal-profile-snapshot",
      "running-list-snapshot",
    ])
      await page.route(`**/api/${endpoint}`, (route) =>
        route.fulfill({ status: 404, json: { available: false } }),
      );
    await page.route("**/api/notion", (route) =>
      route.fulfill({ json: { configured: false, connected: false } }),
    );
    await page.route("**/api/assistant", (route) =>
      route.fulfill({ json: { available: false, models: [] } }),
    );
    await page.addInitScript(
      ({ key, session }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(session));
      },
      { key, session },
    );
    await page.goto(server.url + "/day");
    const panel = page.getByRole("complementary", {
      name: "Current schedule",
      exact: true,
    });
    await panel.getByText("Scheduled now", { exact: true }).waitFor();
    assert.equal(
      await panel
        .getByRole("heading", { name: "Read chapter 4", exact: true })
        .count(),
      1,
    );
    const original = await page.evaluate(
      (key) => localStorage.getItem(key),
      key,
    );
    async function move(value) {
      await page.clock.setFixedTime(new Date(value));
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    }
    await move("2026-11-22T10:25:00-05:00");
    await panel.getByRole("heading", { name: "Break", exact: true }).waitFor();
    await move("2026-11-22T10:30:00-05:00");
    await panel.getByText("Room to breathe", { exact: true }).waitFor();
    await panel
      .getByRole("heading", { name: "Appointment", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await panel.screenshot({ path: "artifacts/day-now-mobile.png" });
    await move("2026-11-22T11:30:00-05:00");
    await panel.getByText("No later blocks", { exact: true }).waitFor();
    await move("2026-11-23T00:01:00-05:00");
    await panel
      .getByText("This plan needs a fresh review. Reload to plan today.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), key),
      original,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS approved schedule → current focus → break → open gap → next event → elapsed blocks → new day → no inferred work or storage writes → mobile/reduced motion",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
