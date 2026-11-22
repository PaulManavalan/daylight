// Opt-in real WebGPU inference. Reuses only the previously approved browser model/profile.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
if (process.env.DAYLIGHT_ALLOW_MODEL_DOWNLOAD !== "1")
  throw Error(
    "This test may download the approved ~1 GB browser model. Explicit approval is required.",
  );
const { chromium } = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const profile = path.resolve("artifacts/browser-model-live-profile"),
  url = process.env.DAYLIGHT_TEST_URL ?? "http://127.0.0.1:3104",
  day = "2026-11-22",
  key = "daylight.notion-day.v1." + day;
const target = new URL(url);
if (
  !["127.0.0.1", "localhost"].includes(target.hostname) &&
  !(target.protocol === "https:" && target.hostname.endsWith(".vercel.app"))
)
  throw Error("Use an authorized Daylight preview URL.");
fs.mkdirSync(profile, { recursive: true });
(async () => {
  let context, page;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: "msedge",
      headless: true,
      viewport: { width: 1280, height: 1000 },
      timezoneId: "America/New_York",
    });
    page = context.pages()[0] ?? (await context.newPage());
    page.on("pageerror", (e) => console.log("PAGE ERROR " + e.message));
    page.on("console", (m) => {
      if (m.type() === "error")
        console.log("BROWSER " + m.text().slice(0, 400));
    });
    context.on("requestfailed", (r) =>
      console.log(
        "RESOURCE FAILED " +
          new URL(r.url()).origin +
          new URL(r.url()).pathname +
          " " +
          r.failure()?.errorText,
      ),
    );
    await context.addInitScript(
      ({ key }) => {
        localStorage.setItem(
          "daylight.ai.provider.v1.notion-day-v1",
          "planner",
        );
        localStorage.removeItem(key);
        localStorage.removeItem("daylight.personal-preview.v1");
      },
      { key },
    );
    await context.route("**/api/assistant", (r) =>
      r.fulfill({
        status: r.request().method() === "GET" ? 200 : 503,
        json:
          r.request().method() === "GET"
            ? { available: false, models: [] }
            : { error: "Local AI disabled for real browser evaluation." },
      }),
    );
    await context.route("**/api/notion", (r) =>
      r.fulfill({ json: { configured: false, connected: false } }),
    );
    for (const route of [
      "**/api/running-list-snapshot",
      "**/api/personal-profile-snapshot",
    ])
      await context.route(route, (r) =>
        r.fulfill({ status: 404, json: { available: false } }),
      );
    await page.clock.install({ time: new Date(day + "T09:00:00-05:00") });
    await page.goto(url + "/day");
    await page
      .getByRole("button", { name: "Try a sample list", exact: true })
      .click();
    const gpu = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      return { available: !!adapter, f16: adapter?.features.has("shader-f16") };
    });
    console.log("GPU " + JSON.stringify(gpu));
    assert.equal(gpu.available, true);
    await page.getByText("Chat connection · offline", { exact: true }).click();
    await page
      .getByRole("button", {
        name: "Enable free browser AI (~1 GB)",
        exact: true,
      })
      .click();
    const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      if (
        await page.getByText("Chat connection · ready", { exact: true }).count()
      )
        break;
      const progress = await page
        .locator("details")
        .filter({
          has: page.locator("summary").filter({ hasText: "Chat connection" }),
        })
        .innerText();
      console.log("LOAD " + progress.replace(/\s+/g, " ").slice(-450));
      if (/could not|no usable GPU|does not support WebGPU/i.test(progress))
        throw Error("Browser model failed to load: " + progress);
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
    assert.equal(
      await page.getByText("Chat connection · ready", { exact: true }).count(),
      1,
      "Browser model initialization timed out",
    );
    console.log("CONNECTED real browser model");
    async function say(text) {
      const count = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).messages.length,
        key,
      );
      await page
        .getByLabel("Talk through your day", { exact: true })
        .fill(text);
      await page.getByRole("button", { name: "Send →", exact: true }).click();
      try {
        await page.waitForFunction(
          ({ key, count }) =>
            JSON.parse(localStorage.getItem(key))?.messages.length > count,
          { key, count },
          { timeout: 150000 },
        );
      } catch (error) {
        console.log(
          "CHAT ERROR " +
            (await page.getByRole("alert").allTextContents()).join(" "),
        );
        throw error;
      }
      const saved = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        key,
      );
      console.log("REPLY " + saved.messages.at(-1).content);
      return saved;
    }
    const first = await say(
      "I can work from 2pm to 8pm. Soccer practice is 4 to 5pm. I also want 20 minutes of piano. No other events or wants.",
    );
    assert.equal(first.known.start, "14:00");
    assert.equal(first.known.finish, "20:00");
    assert.ok(
      first.known.events.some((e) => e.start === "16:00" && e.end === "17:00"),
    );
    assert.ok(first.known.extras.some((e) => e.minutes === 20));
    assert.ok(first.plan);
    console.log("PASS browser daily facts and real timetable");
    const corrected = await say("Soccer ends at 5:30 instead.");
    assert.equal(corrected.known.start, "14:00");
    assert.equal(corrected.known.finish, "20:00");
    assert.ok(corrected.known.events.some((e) => e.end === "17:30"));
    assert.equal(corrected.known.extras.length, first.known.extras.length);
    await page
      .getByRole("button", { name: "Use this plan", exact: true })
      .click();
    const talk = await say("wait no i js wanna talk");
    assert.equal(talk.approved, true);
    assert.deepEqual(talk.known, corrected.known);
    assert.doesNotMatch(
      talk.messages.at(-1).content,
      /what time can you start|what events do you have/i,
    );
    console.log("PASS browser correction and open conversation preserve day");
    const recall = await say("What homework do I have highlighted today?");
    assert.equal(recall.approved, true);
    assert.match(
      recall.messages.at(-1).content,
      /chapter|practice problems|project outline/i,
    );
    console.log("PASS real browser homework recall");
    fs.writeFileSync(
      "artifacts/browser-day-model-evaluation.json",
      JSON.stringify(
        { model: "Qwen2.5 1.5B", first, corrected, talk, recall },
        null,
        2,
      ),
    );
    await page.screenshot({
      path: "artifacts/browser-day-model-live.png",
      fullPage: true,
    });
    console.log(
      "PASS real WebGPU daily planner: no local model API, paid AI or personal records.",
    );
  } catch (error) {
    if (page)
      await page.screenshot({
        path: "artifacts/browser-day-model-live-failure.png",
        fullPage: true,
      });
    throw error;
  } finally {
    await context?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
