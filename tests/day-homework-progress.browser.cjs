const assert = require("node:assert/strict"),
  path = require("node:path");
const { chromium } = require(
    path.join(
      process.env.USERPROFILE,
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
  ),
  { startBrowserServer } = require("./browser-server.cjs");
const key = "daylight.notion-day.v1.2026-11-22";
(async () => {
  const server = await startBrowserServer(),
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
      }),
      errors = [];
    let notionWrites = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-11-22T09:00:00") });
    await page.route("**/api/notion", (route) => {
      if (route.request().method() === "POST") notionWrites++;
      return route.fulfill({ json: { configured: false, connected: false } });
    });
    for (const route of [
      "**/api/personal-profile-snapshot",
      "**/api/running-list-snapshot",
    ])
      await page.route(route, (r) =>
        r.fulfill({ status: 404, json: { available: false } }),
      );
    await page.route("**/api/assistant", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          json: { available: true, model: "synthetic", models: ["synthetic"] },
        });
      const request = route.request().postDataJSON(),
        context = JSON.parse(request.context),
        text = request.messages.at(-1).content;
      let proposal = null;
      if (/I spent 20/i.test(text))
        proposal = {
          sourceKey: "sample-0",
          outcome: "worked",
          minutes: 20,
          remainingMinutes: 10,
          note: text,
        };
      if (/I finished/i.test(text))
        proposal = {
          sourceKey: "sample-0",
          outcome: "complete",
          minutes: null,
          remainingMinutes: null,
          note: text,
        };
      return route.fulfill({
        json: {
          result: {
            kind: "none",
            dailyContext: proposal
              ? { ...context.knownDay, start: "12:00" }
              : context.knownDay,
            homeworkCheckin: proposal,
            reply: proposal
              ? "Please review the homework check-in."
              : "Your existing work records and day are unchanged.",
            tasks: [],
            events: [],
            progress: [],
            edits: [],
          },
        },
      });
    });
    const saved = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
    async function say(text) {
      await page
        .getByLabel("Talk through your day", { exact: true })
        .fill(text);
      await page.getByRole("button", { name: "Send →", exact: true }).click();
    }
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
    const initial = await saved();
    await say("I spent 20 minutes on Read chapter 4 and need 10 more minutes.");
    await page
      .getByRole("region", {
        name: "Review conversational homework check-in",
        exact: true,
      })
      .waitFor();
    let state = await saved();
    assert.equal(state.homeworkProgress.length, 0);
    assert.equal(state.approved, true);
    assert.deepEqual(state.known, initial.known);
    assert.deepEqual(state.plan, initial.plan);
    assert.ok(state.pendingHomeworkCheckin);
    const beforeQuota = state;
    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) {
          Storage.prototype.setItem = original;
          throw new DOMException(
            "Synthetic storage quota exceeded",
            "QuotaExceededError",
          );
        }
        return original.call(this, name, value);
      };
    }, key);
    await page
      .getByRole("button", { name: "Record this check-in", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Synthetic storage quota exceeded" })
      .waitFor();
    assert.deepEqual(
      await saved(),
      beforeQuota,
      "A failed save keeps the approved plan and unsaved proposal intact",
    );
    await page.reload();
    await page
      .getByRole("region", {
        name: "Review conversational homework check-in",
        exact: true,
      })
      .waitFor();
    await page
      .getByLabel("Proposed actual homework minutes", { exact: true })
      .fill("30");
    await say("yes?");
    await page
      .getByText("Your existing work records and day are unchanged.", {
        exact: true,
      })
      .waitFor();
    assert.equal((await saved()).homeworkProgress.length, 0);
    await say("yes");
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key)).messages.at(-2)?.content ===
        "yes",
      key,
    );
    assert.equal(
      (await saved()).homeworkProgress.length,
      0,
      "An unrelated answer must not approve an older proposal",
    );
    await say("save this check-in");
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key)).homeworkProgress.length === 1,
      key,
    );
    state = await saved();
    assert.equal(state.homeworkProgress[0].minutes, 30);
    assert.equal(state.homeworkProgress[0].remainingMinutes, 10);
    assert.equal(state.approved, false);
    assert.equal(state.pendingHomeworkCheckin, null);
    assert.equal(state.source.items[0].completion, "not_specified");
    assert.ok(
      state.plan.entries.some(
        (entry) =>
          entry.sourceKey === "sample-0" &&
          (Date.parse(entry.end) - Date.parse(entry.start)) / 60000 === 10,
      ),
    );
    await page
      .getByRole("button", { name: "Use this plan", exact: true })
      .click();
    await say("I finished Read chapter 4.");
    await page
      .getByRole("button", { name: "Discard this check-in", exact: true })
      .click();
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key)).pendingHomeworkCheckin === null,
      key,
    );
    assert.equal((await saved()).homeworkProgress.length, 1);
    assert.equal((await saved()).approved, true);
    await say("I finished Read chapter 4.");
    await page
      .getByRole("button", { name: "Record this check-in", exact: true })
      .click();
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key)).homeworkProgress.length === 2,
      key,
    );
    state = await saved();
    assert.equal(state.homeworkProgress[1].minutes, null);
    assert.ok(
      !state.plan.entries.some((entry) => entry.sourceKey === "sample-0"),
    );
    assert.equal(
      state.homeworkProgress.reduce((n, r) => n + (r.minutes ?? 0), 0),
      30,
    );
    await page.getByText("Recorded work · 2", { exact: true }).click();
    const completed = page
      .getByRole("article")
      .filter({ hasText: "Assignment reported complete" });
    await completed
      .getByRole("button", { name: "Review removing work record", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Keep work record", exact: true })
      .click();
    assert.equal((await saved()).homeworkProgress.length, 2);
    await completed
      .getByRole("button", { name: "Review removing work record", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove reviewed work record", exact: true })
      .click();
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key)).homeworkProgress.length === 1,
      key,
    );
    assert.ok(
      (await saved()).plan.entries.some(
        (entry) => entry.sourceKey === "sample-0",
      ),
    );
    await page.reload();
    await page
      .getByRole("heading", { name: "Your work & next steps", exact: true })
      .waitFor();
    assert.equal((await saved()).homeworkProgress.length, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/day-homework-progress-mobile.png",
      fullPage: true,
    });
    await say("I finished Read chapter 4.");
    await page
      .getByRole("region", {
        name: "Review conversational homework check-in",
        exact: true,
      })
      .waitFor();
    const beforeMidnight = await saved();
    await page.clock.setFixedTime(new Date("2026-11-23T00:01:00"));
    await page
      .getByRole("button", { name: "Record this check-in", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "A new day has started" })
      .waitFor();
    assert.deepEqual(
      await saved(),
      beforeMidnight,
      "Yesterday's review must not record work after midnight",
    );
    assert.equal(notionWrites, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS conversational work proposal → no preapproval mutation → pending reload → edited-time confirmation → question/old-yes safety → adaptive draft → unknown-time completion → cancel/remove recovery → mobile → Notion unchanged",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
