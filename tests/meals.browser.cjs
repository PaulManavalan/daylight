const assert = require("node:assert/strict");
const path = require("node:path");
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
        timezoneId: "America/New_York",
        viewport: { width: 1280, height: 1000 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-11-21T09:00:00-05:00") });
    await page.goto(server.url + "/day/preferences");
    await page
      .getByLabel("Foods you dislike (comma separated)")
      .fill("Example ingredient");
    await page.getByLabel("Who usually prepares meals?").selectOption("family");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved in this browser" })
      .waitFor();
    await page.goto(server.url + "/day/meals");
    await page.getByRole("button", { name: "My recipes", exact: true }).click();
    await page.getByText("Add a recipe", { exact: true }).click();
    for (const data of [
      { title: "Family rice bowl", ingredients: "rice\nbeans" },
      { title: "Excluded recipe", ingredients: "Example ingredient\nrice" },
    ]) {
      await page.getByLabel("Recipe name", { exact: true }).fill(data.title);
      await page
        .getByLabel("Ingredients (one per line)")
        .fill(data.ingredients);
      await page
        .getByRole("button", { name: "Save recipe", exact: true })
        .click();
      await page.getByText(data.title, { exact: true }).waitFor();
    }
    await page.getByRole("button", { name: "My week", exact: true }).click();
    await page
      .getByRole("button", { name: "Draft from saved recipes", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("2026-11-16 dinner", { exact: true }).inputValue(),
      "Family rice bowl",
    );
    await page
      .getByRole("button", { name: "Save weekly plan", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Weekly meal plan saved" })
      .waitFor();
    await page.reload();
    assert.equal(
      await page.getByLabel("2026-11-16 dinner", { exact: true }).inputValue(),
      "Family rice bowl",
    );
    await page
      .getByText("Grocery ingredient checklist", { exact: true })
      .click();
    assert.ok(await page.getByText("beans", { exact: false }).count());
    await page
      .getByRole("button", { name: "Food journal", exact: true })
      .click();
    await page
      .getByLabel("Meal or snack", { exact: true })
      .fill("Family lunch");
    await page.getByLabel("Portion or serving (optional)").fill("one bowl");
    await page
      .getByText("Optional nutrition from a label or trusted source", {
        exact: true,
      })
      .click();
    await page
      .getByLabel("Calories for this entry", { exact: true })
      .fill("400");
    await page.getByRole("button", { name: "Log food", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "say where they came from" })
      .waitFor();
    await page
      .getByLabel("Nutrition source", { exact: true })
      .fill("Package label");
    await page.getByRole("button", { name: "Log food", exact: true }).click();
    await page
      .getByRole("button", { name: "Edit Family lunch", exact: true })
      .waitFor();
    await page
      .getByRole("checkbox", { name: "Show nutrition information I entered" })
      .check();
    await page.getByText("400 recorded calories", { exact: false }).waitFor();
    await page
      .getByRole("button", { name: "Edit Family lunch", exact: true })
      .click();
    await page
      .getByLabel("Meal or snack", { exact: true })
      .fill("Updated lunch");
    await page
      .getByRole("button", { name: "Save food changes", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Edit Updated lunch", exact: true })
      .waitFor();
    const second = await context.newPage();
    await second.goto(server.url + "/day/preferences");
    await second
      .getByLabel("Foods you enjoy (comma separated)")
      .fill("Unsaved preference");
    await page.getByLabel("Meal or snack", { exact: true }).fill("Snack");
    await page.getByRole("button", { name: "Log food", exact: true }).click();
    await second
      .getByRole("alert")
      .filter({ hasText: "another tab" })
      .waitFor();
    await second
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    const persisted = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("daylight.personal-preview.v1")),
    );
    assert.equal(persisted.nutrition.journal.length, 2);
    assert.ok(!persisted.food.likes.includes("Unsaved preference"));
    await second.close();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/meals-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS recipe saving → dislike filtering → weekly plan persistence → grocery checklist → sourced nutrition journal/edit → stale-tab protection → mobile layout",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
