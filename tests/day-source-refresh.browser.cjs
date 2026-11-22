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
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", () => {
      throw Error("Refresh must not ask to discard the conversation");
    });
    await page.clock.install({ time: new Date("2026-11-21T09:00:00") });
    let revision = 0,
      fail = false;
    const source = {
      pageId: "11111111222243338444555555555555",
      title: "Synthetic homework",
      readAt: "2026-11-21T14:00:00.000Z",
      items: ["a", "b"].map((key, i) => ({
        key,
        title: i ? "New highlighted assignment" : "Original assignment",
        subject: "Literature",
        sourceUrl: "https://www.notion.so/" + key,
        yellowHighlighted: i === 0,
        completion: "unchecked",
      })),
      weeklyNotes: [],
      warnings: [],
    };
    await page.route("**/api/running-list-snapshot", (r) =>
      r.fulfill({ json: source }),
    );
    await page.route("**/api/personal-profile-snapshot", (r) =>
      r.fulfill({ status: 404, json: { available: false } }),
    );
    await page.route("**/api/notion", (r) => {
      if (r.request().method() === "GET")
        return r.fulfill({ json: { configured: true, connected: true } });
      assert.equal(r.request().postDataJSON().op, "running-list");
      if (fail)
        return r.fulfill({
          status: 503,
          json: { error: "Synthetic Notion unavailable" },
        });
      const next = structuredClone(source);
      next.readAt = new Date(
        Date.parse(source.readAt) + revision * 60000,
      ).toISOString();
      if (revision >= 2) {
        next.items[0].completion = "checked";
        next.items[1].yellowHighlighted = true;
      }
      return r.fulfill({ json: next });
    });
    await page.route("**/api/assistant", (r) => {
      if (r.request().method() === "GET")
        return r.fulfill({
          json: { available: true, model: "synthetic", models: ["synthetic"] },
        });
      const request = r.request().postDataJSON(),
        known = JSON.parse(request.context).knownDay;
      return r.fulfill({
        json: {
          result: {
            kind: "none",
            reply: "What’s on your mind?",
            dailyContext: request.messages
              .at(-1)
              .content.startsWith("What's my plan")
              ? { ...known, start: "12:00" }
              : known,
            tasks: [],
            events: [],
            progress: [],
            edits: [],
          },
        },
      });
    });
    await page.goto(server.url + "/day");
    await page
      .getByLabel("Running list page link", { exact: true })
      .fill("https://www.notion.so/" + source.pageId);
    await page.getByRole("button", { name: "Read list", exact: true }).click();
    await page.getByText("Synthetic homework", { exact: true }).waitFor();
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
    for (let i = 0; i < 8; i++) {
      await page
        .getByLabel("Talk through your day", { exact: true })
        .fill("I just want to chat, message " + i);
      await page.getByRole("button", { name: "Send →", exact: true }).click();
      await page.waitForFunction(
        (n) =>
          JSON.parse(localStorage.getItem("daylight.notion-day.v1.2026-11-21"))
            .messages.length === n,
        (i + 1) * 2,
      );
    }
    await page
      .getByLabel("Talk through your day", { exact: true })
      .fill("What's my plan for today?");
    await page.getByRole("button", { name: "Send →", exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("daylight.notion-day.v1.2026-11-21"))
          .messages.length === 18,
    );
    const before = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("daylight.notion-day.v1.2026-11-21")),
    );
    assert.equal(before.messages.length, 18);
    assert.equal(
      before.known.start,
      "10:00",
      "Reading the existing plan must not apply a model-proposed window change",
    );
    assert.equal(before.approved, true);
    await page.reload();
    await page
      .getByRole("heading", { name: "Your plan for today", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Running list page link", { exact: true })
        .inputValue(),
      source.pageId,
    );
    await page
      .getByRole("button", {
        name: "Use my local Notion snapshot",
        exact: true,
      })
      .click();
    await page
      .getByText(
        "Your list is up to date. Your conversation and current plan are kept.",
        { exact: true },
      )
      .waitFor();
    revision = 1;
    await page.getByRole("button", { name: "Read list", exact: true }).click();
    await page
      .getByText(
        "Your list is up to date. Your conversation and current plan are kept.",
        { exact: true },
      )
      .waitFor();
    const unchanged = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("daylight.notion-day.v1.2026-11-21")),
    );
    assert.equal(unchanged.approved, true);
    assert.deepEqual(unchanged.plan.entries, before.plan.entries);
    assert.deepEqual(unchanged.messages, before.messages);
    revision = 2;
    await page.getByRole("button", { name: "Read list", exact: true }).click();
    await page
      .getByText(
        "Your list is updated and a fresh draft is ready to review. Your conversation and confirmed day details are kept.",
        { exact: true },
      )
      .waitFor();
    const changed = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("daylight.notion-day.v1.2026-11-21")),
    );
    assert.equal(changed.approved, false);
    assert.deepEqual(changed.known, before.known);
    assert.deepEqual(changed.messages, before.messages);
    assert.ok(
      changed.plan.entries.some(
        (e) => e.title === "New highlighted assignment",
      ),
    );
    assert.ok(
      !changed.plan.entries.some((e) => e.title === "Original assignment"),
    );
    await page
      .getByRole("button", {
        name: "Use my local Notion snapshot",
        exact: true,
      })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "This list copy is older" })
      .waitFor();
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("daylight.notion-day.v1.2026-11-21")),
      ),
      changed,
    );
    fail = true;
    await page.getByRole("button", { name: "Read list", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Synthetic Notion unavailable" })
      .waitFor();
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("daylight.notion-day.v1.2026-11-21")),
      ),
      changed,
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Use this plan", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByText("I just want to chat, message 0", { exact: true })
        .count(),
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS Notion refresh preserves conversation and known day → unchanged approval → changed highlights create a new reviewed draft → failed read preserves saved data → history survives beyond six exchanges",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
