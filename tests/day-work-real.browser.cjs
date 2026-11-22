// Opt-in real browser + installed local model. Synthetic records, no downloads.
const assert = require("node:assert/strict"),
  path = require("node:path");
const { chromium } = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const { startBrowserServer } = require("./browser-server.cjs");
if (process.env.DAYLIGHT_REAL_MODEL_TEST !== "1")
  throw Error(
    "Set DAYLIGHT_REAL_MODEL_TEST=1 to use the already installed local model.",
  );
const key = "daylight.notion-day.v1.2026-11-22";
const initial = {
  source: {
    pageId: "synthetic-homework",
    title: "Synthetic running list",
    readAt: "2026-11-22T17:00:00.000Z",
    items: [
      { key: "literature", title: "Read chapter 4", subject: "Literature" },
      { key: "history", title: "Read chapter 4", subject: "History" },
      { key: "physics", title: "Physics questions", subject: "Physics" },
    ].map((item) => ({
      ...item,
      yellowHighlighted: true,
      completion: "unchecked",
      sourceUrl: "https://www.notion.so/synthetic",
    })),
    weeklyNotes: [],
    warnings: [],
  },
  sample: false,
  known: {
    start: "14:00",
    finish: "20:00",
    eventsDiscussed: true,
    extrasDiscussed: true,
    events: [],
    extras: [],
    focusMinutes: null,
    focusBudget: null,
    focusOrder: [],
    skipKeys: [],
  },
  messages: [],
  plan: null,
  approved: false,
};
(async () => {
  const server = await startBrowserServer(),
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
      }),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(110000);
    await page.clock.install({ time: new Date("2026-11-22T12:00:00") });
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
    await page.addInitScript(
      ({ key, initial }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(initial));
      },
      { key, initial },
    );
    await page.goto(server.url + "/day");
    const saved = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
    async function say(text) {
      const count = (await saved()).messages.length;
      await page
        .getByLabel("Talk through your day", { exact: true })
        .fill(text);
      await page.getByRole("button", { name: "Send →", exact: true }).click();
      await page.waitForFunction(
        ({ key, count }) => {
          const value = JSON.parse(localStorage.getItem(key));
          return (
            value.messages.length >= count + 2 &&
            value.messages.at(-1)?.role === "assistant"
          );
        },
        { key, count },
      );
      assert.deepEqual(
        (await page.getByRole("alert").allTextContents()).filter((text) =>
          text.trim(),
        ),
        [],
      );
    }
    await say("I finished Read chapter 4.");
    let state = await saved();
    assert.equal(state.pendingHomeworkCheckin, null);
    assert.equal(state.homeworkProgress.length, 0);
    assert.match(state.messages.at(-1).content, /which|do you mean/i);
    console.log("PASS real browser: ambiguous completion asks which subject.");
    await say("Literature");
    state = await saved();
    assert.equal(state.pendingHomeworkCheckin.value.sourceKey, "literature");
    assert.equal(state.homeworkProgress.length, 0);
    const review = page.getByRole("region", {
      name: "Review conversational homework check-in",
      exact: true,
    });
    await review.getByText("Literature", { exact: true }).waitFor();
    await review
      .getByRole("button", { name: "Record this check-in", exact: true })
      .click();
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key)).homeworkProgress.length === 1,
      key,
    );
    state = await saved();
    assert.equal(state.homeworkProgress[0].minutes, null);
    assert.ok(
      !state.plan.entries.some((item) => item.sourceKey === "literature"),
    );
    assert.ok(state.plan.entries.some((item) => item.sourceKey === "history"));
    console.log(
      "PASS real browser: one-word clarification stages the right review and leaves the other subject unfinished.",
    );
    await say(
      "I spent one hour and thirty minutes on Physics questions and need 10 more minutes.",
    );
    state = await saved();
    assert.equal(state.pendingHomeworkCheckin.value.minutes, 90);
    assert.equal(state.pendingHomeworkCheckin.value.remainingMinutes, 10);
    assert.equal(state.homeworkProgress.length, 1);
    await say("Actually 15 not 90.");
    state = await saved();
    assert.equal(state.pendingHomeworkCheckin.value.minutes, 15);
    assert.equal(state.pendingHomeworkCheckin.value.remainingMinutes, 10);
    assert.equal(state.homeworkProgress.length, 1);
    await review
      .getByRole("button", { name: "Record this check-in", exact: true })
      .click();
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key)).homeworkProgress.length === 2,
      key,
    );
    state = await saved();
    assert.equal(state.homeworkProgress[1].minutes, 15);
    assert.equal(state.approved, false);
    assert.equal(state.pendingHomeworkCheckin, null);
    assert.ok(
      state.plan.entries.some(
        (item) =>
          item.sourceKey === "physics" &&
          (Date.parse(item.end) - Date.parse(item.start)) / 60000 === 10,
      ),
    );
    await page.screenshot({
      path: "artifacts/day-work-real-browser.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS real browser: compound actual time → corrected unsaved review → explicit recording → new remaining-day draft.",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
