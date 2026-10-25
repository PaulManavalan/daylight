// Uses the desktop app's bundled Playwright. Run after pnpm build and pnpm start.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Draft the history essay", exact: true }).waitFor();
    assert.equal(await page.locator("tbody tr").count(), 7);
    fs.mkdirSync("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/daylight-desktop.png", fullPage: true });
    await page.getByRole("button", { name: "Add task", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Task title" }).fill("Browser smoke task");
    await page.getByRole("combobox", { name: "Subject / area" }).fill("Testing");
    await page.getByRole("spinbutton", { name: "Estimate (minutes)" }).fill("50");
    await page.getByRole("dialog").getByRole("button", { name: "Add task", exact: true }).click();
    await page.getByRole("button", { name: "Browser smoke task", exact: true }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Browser smoke task", exact: true }).click();
    assert.equal(await page.getByRole("spinbutton", { name: "Remaining (minutes)" }).inputValue(), "50");
    await page.getByRole("textbox", { name: "Task title" }).fill("Edited browser task");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("button", { name: "Complete Edited browser task", exact: true }).click();
    await page.getByRole("button", { name: "Reopen Edited browser task", exact: true }).waitFor();
    await page.getByRole("combobox", { name: "Filter by subject", exact: true }).selectOption("Testing");
    assert.equal(await page.locator("tbody tr").count(), 1);
    await page.getByRole("button", { name: "Delete Edited browser task", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete task", exact: true }).click();
    await page.getByText("Nothing here just yet.", { exact: true }).waitFor();
    await page.getByRole("combobox", { name: "Filter by subject", exact: true }).selectOption("all");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "artifacts/daylight-mobile.png", fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "page must not overflow horizontally");
    assert.deepEqual(errors, []);
    console.log("Browser smoke passed: create, persist, edit, complete, filter, delete, mobile layout; no page errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
