const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs/promises");
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
        viewport: { width: 1280, height: 950 },
        timezoneId: "America/New_York",
        acceptDownloads: true,
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(server.url + "/day/sat");
    await page.getByLabel("Practice skill").selectOption("Linear equations");
    await page.getByLabel("Show elapsed time").check();
    await page
      .getByRole("button", { name: "Start practice set", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Check answer & save", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Check answer & save", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByRole("radio").first().check();
    await page
      .getByRole("button", { name: "Check answer & save", exact: true })
      .click();
    await page.getByText("Let’s work through it.", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Add mistake to review log", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add mistake to review log", exact: true })
      .click();
    let state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("daylight.sat.v1.local-demo")),
    );
    assert.equal(state.attempts.length, 1);
    assert.equal(state.errors.length, 1);
    assert.equal(state.scores.length, 0);
    await page
      .getByRole("button", { name: "Next question", exact: true })
      .click();
    await page.getByRole("radio").nth(1).check();
    await page
      .getByRole("button", { name: "Check answer & save", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Next question", exact: true })
      .click();
    await page.getByRole("radio").nth(2).check();
    await page
      .getByRole("button", { name: "Check answer & save", exact: true })
      .click();
    await page.getByRole("button", { name: "Finish set", exact: true }).click();
    await page
      .getByText("Set complete. Your submitted answers are saved below.", {
        exact: true,
      })
      .waitFor();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export SAT records", exact: true })
      .click();
    const download = await downloadPromise,
      data = JSON.parse(await fs.readFile(await download.path(), "utf8"));
    assert.equal(data.attempts.length, 3);
    assert.equal(data.errors.length, 1);
    await page.reload();
    await page.getByText("2 / 3 correct ·", { exact: false }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/sat-practice-mobile.png",
      fullPage: true,
    });
    await page.getByLabel("Practice skill").selectOption("Sentence boundaries");
    await page
      .getByRole("button", { name: "Start practice set", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByRole("radio").nth(1).check();
    await page
      .getByRole("button", { name: "Check answer & save", exact: true })
      .click();
    await page.getByText("Correct.", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS original practice → persisted answers/explanations → deduplicated error log → completed set → export/reload → mobile reading question",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
