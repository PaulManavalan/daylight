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
        viewport: { width: 390, height: 844 },
        acceptDownloads: true,
      }),
      page = await context.newPage();
    await page.goto(server.url + "/day/preferences");
    const name = page.getByLabel("Your name");
    await name.waitFor();
    await name.fill("Synthetic original");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved in this browser" })
      .waitFor();
    await page.evaluate(() =>
      localStorage.setItem("sb-auth-token", "NEVER_EXPORT_THIS"),
    );
    await page.locator("summary").filter({ hasText: "Backups" }).click();
    let downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export workspace", exact: true })
      .click();
    const download = await downloadPromise,
      file = await download.path(),
      text = await fs.readFile(file, "utf8"),
      data = JSON.parse(text);
    assert.equal(data.focused.personal.displayName, "Synthetic original");
    assert.ok(!text.includes("NEVER_EXPORT_THIS"));
    await name.fill("Synthetic changed");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved in this browser" })
      .waitFor();
    await page
      .getByLabel("Choose Daylight backup")
      .setInputFiles({
        name: "daylight-workspace.json",
        mimeType: "application/json",
        buffer: Buffer.from(text),
      });
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("heading", { name: "Restore your local workspace" })
      .waitFor();
    await dialog
      .getByRole("button", { name: "Keep current workspace" })
      .click();
    assert.equal(await name.inputValue(), "Synthetic changed");
    await page
      .getByLabel("Choose Daylight backup")
      .setInputFiles({
        name: "daylight-workspace.json",
        mimeType: "application/json",
        buffer: Buffer.from(text),
      });
    await dialog
      .getByRole("button", { name: "Replace local workspace", exact: true })
      .click();
    await page.waitForLoadState("domcontentloaded");
    await page.getByLabel("Your name").waitFor();
    assert.equal(
      await page.getByLabel("Your name").inputValue(),
      "Synthetic original",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("sb-auth-token")),
      "NEVER_EXPORT_THIS",
    );
    await page.locator("summary").filter({ hasText: "Backups" }).click();
    downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download previous workspace", exact: true })
      .click();
    const recovery = JSON.parse(
      await fs.readFile(await (await downloadPromise).path(), "utf8"),
    );
    assert.equal(recovery.focused.personal.displayName, "Synthetic changed");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    console.log(
      "PASS focused export → review/cancel → restore → previous-state recovery export → credentials excluded/preserved → mobile",
    );
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
