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
    const context = await browser.newContext({
        timezoneId: "America/New_York",
        viewport: { width: 1280, height: 1000 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-11-21T09:00:00-05:00") });
    await page.goto(server.url + "/day/preferences");
    await page.getByLabel("Foods you dislike (comma separated)").fill("eggs");
    await page
      .getByLabel("Dislikes that are okay inside other recipes")
      .fill("eggs");
    await page
      .getByLabel("Allergies and medical dietary restrictions")
      .selectOption("none");
    await page
      .getByText("Favorite meals to use in weekly suggestions", { exact: true })
      .click();
    await page
      .getByLabel("Breakfast favorites (comma separated)")
      .fill("Family pancakes");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved in this browser" })
      .waitFor();
    await page.goto(server.url + "/day/meals");
    await page
      .getByRole("button", { name: "Suggest my week", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("2026-11-16 breakfast", { exact: true })
        .inputValue(),
      "Family pancakes",
    );
    const initial = await page
      .getByLabel("2026-11-16 dinner", { exact: true })
      .inputValue();
    await page
      .getByRole("button", { name: "Swap 2026-11-16 dinner", exact: true })
      .click();
    assert.notEqual(
      await page.getByLabel("2026-11-16 dinner", { exact: true }).inputValue(),
      initial,
    );
    assert.equal(
      await page
        .getByLabel("2026-11-16 breakfast", { exact: true })
        .inputValue(),
      "Family pancakes",
    );
    await page
      .getByRole("button", { name: "Save weekly plan", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Weekly meal plan saved" })
      .waitFor();
    let saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("daylight.personal-preview.v1")),
    );
    assert.ok(saved.nutrition.recipes.length > 0);
    assert.ok(
      !saved.nutrition.recipes.some((r) => r.title === "Family pancakes"),
    );
    assert.equal(
      saved.nutrition.journal.length,
      0,
      "Planning never logs food eaten",
    );
    await page.reload();
    assert.equal(
      await page
        .getByLabel("2026-11-16 breakfast", { exact: true })
        .inputValue(),
      "Family pancakes",
    );
    await page.getByRole("button", { name: "Meal ideas", exact: true }).click();
    await page
      .getByLabel("Search meals or ingredients")
      .fill("Skillet Braised Chicken");
    const card = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "Skillet Braised Chicken",
          exact: true,
        }),
      });
    assert.equal(await card.count(), 1);
    assert.ok(
      (
        await card
          .getByRole("link", { name: "Open source recipe" })
          .getAttribute("href")
      ).startsWith("https://medlineplus.gov/recipes/"),
    );
    await card.getByRole("button", { name: "Not for me", exact: true }).click();
    await page
      .getByRole("button", { name: "Restore hidden ideas (1)", exact: true })
      .waitFor();
    assert.equal(await card.count(), 0);
    await page
      .getByRole("button", { name: "Restore hidden ideas (1)", exact: true })
      .click();
    assert.equal(await card.count(), 1);
    await page.reload();
    await page
      .getByRole("heading", { name: "Find your next meal", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/meal-ideas-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "My week", exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/meal-week-suggestions-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS favorites → full suggested week without recipe entry → one-slot swap → save/reload → sourced discovery → reversible hiding → mobile sections",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
