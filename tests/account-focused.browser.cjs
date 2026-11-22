// Uses the real Supabase browser SDK with a synthetic HTTP backend. No live account is contacted.
const assert = require("node:assert/strict"),
  path = require("node:path");
const { chromium } = require(
  path.join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
);
const { startBrowserServer } = require("./browser-server.cjs");
const A = "2b2f5471-1ef6-49c4-a488-888f8467e1d1",
  B = "50b8b044-9d6f-4acc-b973-de6b5e31f582",
  origin = "https://daylight-synthetic-test.supabase.co",
  authKey = "sb-daylight-synthetic-test-auth-token";
const token = (owner) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: owner,
        aud: "authenticated",
        role: "authenticated",
        exp: 1893456000,
      }),
    ).toString("base64url"),
    "synthetic-signature",
  ].join(".");
const session = (owner) => ({
  access_token: token(owner),
  refresh_token: "synthetic-refresh",
  token_type: "bearer",
  expires_at: 1893456000,
  expires_in: 3600,
  user: {
    id: owner,
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic@example.test",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
  },
});
const documents = new Map(),
  privacy = new Map(),
  errors = [],
  privateReads = [];
let offlineOne = false;
async function waitForDocument(key, predicate) {
  const until = Date.now() + 15000;
  while (!predicate(documents.get(key))) {
    if (Date.now() > until)
      throw Error("No confirmed synthetic account document: " + key);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
function ownerFrom(request) {
  const value = request.headers()["authorization"] ?? "";
  try {
    return JSON.parse(
      Buffer.from(value.replace(/^Bearer /, "").split(".")[1], "base64url"),
    ).sub;
  } catch {
    return null;
  }
}
(async () => {
  const server = await startBrowserServer(),
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    async function device(owner, first = false) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 1000 },
        timezoneId: "America/New_York",
        storageState: {
          cookies: [],
          origins: [
            {
              origin: server.url,
              localStorage: [
                { name: authKey, value: JSON.stringify(session(owner)) },
              ],
            },
          ],
        },
      });
      await context.route(origin + "/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          user = ownerFrom(request);
        if (first && offlineOne)
          return route.fulfill({
            status: 503,
            json: { message: "synthetic offline" },
          });
        if (url.pathname === "/auth/v1/user")
          return route.fulfill({ json: session(user ?? owner).user });
        if (url.pathname === "/auth/v1/logout")
          return route.fulfill({ status: 204 });
        if (url.pathname === "/rest/v1/workspace_documents") {
          assert.equal(url.searchParams.get("user_id"), "eq." + user);
          const offset = Number(url.searchParams.get("offset") ?? 0),
            limit = Number(url.searchParams.get("limit") ?? 200),
            rows = [...documents.values()]
              .filter((r) => r.user_id === user)
              .sort((a, b) => a.document_key.localeCompare(b.document_key))
              .slice(offset, offset + limit);
          return route.fulfill({ json: rows });
        }
        if (url.pathname === "/rest/v1/rpc/read_workspace_privacy") {
          assert.equal(request.postDataJSON().p_owner, user);
          return route.fulfill({
            json: privacy.get(user) ?? { generation: 0, erasures: {} },
          });
        }
        if (url.pathname === "/rest/v1/rpc/erase_workspace_scope") {
          const body = request.postDataJSON(),
            current = privacy.get(user) ?? { generation: 0, erasures: {} };
          assert.equal(body.p_owner, user);
          if (body.p_generation !== current.generation)
            return route.fulfill({
              status: 409,
              json: { code: "40001", message: "workspace_privacy_changed" },
            });
          const includes = (key) =>
            body.p_scope === "all" ||
            (body.p_scope === "sat" && key === "sat") ||
            (body.p_scope === "days" && key.startsWith("day:")) ||
            (["meals", "training", "calendars", "preferences"].includes(
              body.p_scope,
            ) &&
              key === "personal");
          const rows = [...documents.values()].filter(
            (r) => r.user_id === user && includes(r.document_key),
          );
          if (
            rows.some(
              (r) =>
                !body.p_expected.some(
                  (e) => e.key === r.document_key && e.revision === r.revision,
                ),
            )
          )
            return route.fulfill({
              status: 409,
              json: { code: "40001", message: "workspace_revision_conflict" },
            });
          for (const row of rows) {
            const next = structuredClone(row);
            next.revision++;
            next.updated_at = new Date().toISOString();
            if (["all", "sat", "days"].includes(body.p_scope))
              next.payload = null;
            else if (next.payload && body.p_scope === "preferences") {
              next.payload.displayName = "";
              next.payload.food = {
                likes: [],
                dislikes: [],
                ingredientExceptions: [],
                favoriteMeals: [],
                allergyStatus: "unknown",
                allergies: [],
                meals: null,
              };
              next.payload.news = [
                "US",
                "World",
                "Politics",
                "Technology",
                "AI",
                "Business",
                "Science",
                "Sports",
              ];
            } else throw Error("Untested synthetic deletion scope");
            documents.set(user + ":" + row.document_key, next);
          }
          const receipt = {
            generation: current.generation + 1,
            erasures: {
              ...current.erasures,
              [body.p_scope]: current.generation + 1,
            },
          };
          privacy.set(user, receipt);
          return route.fulfill({
            json: {
              ...receipt,
              scope: body.p_scope,
              changedDocuments: rows.length,
            },
          });
        }
        if (url.pathname === "/rest/v1/rpc/save_workspace_documents") {
          const body = request.postDataJSON();
          assert.equal(body.p_owner, user);
          if (body.p_generation !== (privacy.get(user)?.generation ?? 0))
            return route.fulfill({
              status: 409,
              json: { code: "40001", message: "workspace_privacy_changed" },
            });
          if (
            body.p_changes.some(
              (c) =>
                (documents.get(user + ":" + c.key)?.revision ?? 0) !==
                c.expectedRevision,
            )
          )
            return route.fulfill({
              status: 409,
              json: { code: "40001", message: "workspace_revision_conflict" },
            });
          const rows = body.p_changes.map((c) => ({
            user_id: user,
            document_key: c.key,
            revision: c.expectedRevision + 1,
            payload: c.payload,
            updated_at: new Date().toISOString(),
          }));
          for (const row of rows)
            documents.set(user + ":" + row.document_key, structuredClone(row));
          return route.fulfill({ json: rows });
        }
        throw Error("Unexpected Supabase operation " + url.pathname);
      });
      await context.route("**/api/personal-profile-snapshot", (route) => {
        privateReads.push(owner);
        return route.fulfill({ status: 404, json: { available: false } });
      });
      await context.route("**/api/running-list-snapshot", (route) => {
        privateReads.push(owner);
        return route.fulfill({ status: 404, json: { available: false } });
      });
      await context.route("**/api/google-calendar", (r) =>
        r.fulfill({ json: { configured: false, connected: false } }),
      );
      await context.route("**/api/notion", (r) =>
        r.fulfill({ json: { configured: false, connected: false } }),
      );
      await context.route("**/api/assistant", (r) =>
        r.fulfill({ json: { available: false, models: [] } }),
      );
      await context.route("**/api/news?**", (r) =>
        r.fulfill({
          status: 503,
          json: { error: "News disabled in the account-isolation scenario" },
        }),
      );
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date("2026-11-21T09:00:00-05:00") });
      return { context, page };
    }
    const one = await device(A, true);
    await one.page.goto(server.url + "/day/preferences");
    await one.page.getByLabel("Your name", { exact: true }).fill("Account A");
    await one.page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await one.page
      .getByLabel("Workspace identity")
      .getByText("Account workspace · saved", { exact: true })
      .waitFor();
    await waitForDocument(
      A + ":personal",
      (row) => row?.payload.displayName === "Account A",
    );
    assert.equal(
      documents.get(A + ":personal").payload.displayName,
      "Account A",
    );
    assert.equal(
      await one.page.evaluate(() =>
        localStorage.getItem("daylight.personal-preview.v1"),
      ),
      null,
      "account writes must not overwrite local-demo data",
    );
    const two = await device(A),
      other = await device(B);
    await two.page.goto(server.url + "/day/preferences");
    assert.equal(
      await two.page.getByLabel("Your name", { exact: true }).inputValue(),
      "Account A",
    );
    await other.page.goto(server.url + "/day/preferences");
    assert.equal(
      await other.page.getByLabel("Your name", { exact: true }).inputValue(),
      "",
    );
    await other.page.getByLabel("Your name", { exact: true }).fill("Account B");
    await other.page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await other.page
      .getByLabel("Workspace identity")
      .getByText("Account workspace · saved", { exact: true })
      .waitFor();
    await waitForDocument(
      B + ":personal",
      (row) => row?.payload.displayName === "Account B",
    );
    offlineOne = true;
    await one.page
      .getByLabel("Your name", { exact: true })
      .fill("Offline A draft");
    await one.page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await one.page
      .getByRole("region", { name: "Account sync" })
      .getByText(
        "Account sync could not finish. Your local changes are kept for retry.",
        { exact: true },
      )
      .waitFor();
    await one.page.reload();
    assert.equal(
      await one.page.getByLabel("Your name", { exact: true }).inputValue(),
      "Offline A draft",
    );
    await two.page
      .getByLabel("Your name", { exact: true })
      .fill("Other device A");
    await two.page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await two.page
      .getByLabel("Workspace identity")
      .getByText("Account workspace · saved", { exact: true })
      .waitFor();
    await waitForDocument(
      A + ":personal",
      (row) => row?.payload.displayName === "Other device A",
    );
    offlineOne = false;
    await one.page
      .getByRole("button", { name: "Retry sync", exact: true })
      .click();
    await one.page
      .getByRole("button", { name: "Use account version", exact: true })
      .waitFor();
    await one.page
      .getByRole("button", { name: "Use account version", exact: true })
      .click();
    await one.page
      .getByLabel("Workspace identity")
      .getByText("Account workspace · saved", { exact: true })
      .waitFor();
    await one.page.reload();
    assert.equal(
      await one.page.getByLabel("Your name", { exact: true }).inputValue(),
      "Other device A",
    );
    assert.equal(
      documents.get(B + ":personal").payload.displayName,
      "Account B",
    );
    await one.page.goto(server.url + "/day/meals");
    await one.page
      .getByRole("button", { name: "Food journal", exact: true })
      .click();
    await one.page
      .getByLabel("Meal or snack", { exact: true })
      .fill("Account lunch");
    await one.page
      .getByLabel("Portion or serving (optional)", { exact: true })
      .fill("One bowl");
    await one.page
      .getByRole("button", { name: "Log food", exact: true })
      .click();
    await waitForDocument(A + ":personal", (row) =>
      row?.payload.nutrition.journal.some(
        (entry) => entry.title === "Account lunch",
      ),
    );
    await two.page.goto(server.url + "/day/meals");
    await two.page.reload();
    await two.page
      .getByRole("button", { name: "Food journal", exact: true })
      .click();
    await two.page.getByText("Account lunch", { exact: true }).waitFor();
    await one.page.goto(server.url + "/day/fitness");
    await one.page
      .getByRole("button", { name: "Log session", exact: true })
      .click();
    await one.page
      .getByLabel("Session title", { exact: true })
      .fill("Account mobility");
    await one.page.getByLabel("Session activity type").selectOption("mobility");
    await one.page
      .getByLabel("Total session time (minutes)", { exact: true })
      .fill("15");
    await one.page
      .getByRole("button", { name: "Save session", exact: true })
      .click();
    await waitForDocument(A + ":personal", (row) =>
      row?.payload.fitness.logs.some(
        (entry) => entry.title === "Account mobility",
      ),
    );
    await two.page.goto(server.url + "/day/fitness");
    await two.page.reload();
    await two.page
      .getByRole("button", { name: "Log session", exact: true })
      .click();
    await two.page
      .getByRole("button", { name: "Edit Account mobility", exact: true })
      .waitFor();
    assert.equal(
      documents.get(A + ":personal").payload.nutrition.journal.length,
      1,
      "Training save must keep the account food journal",
    );
    await one.page.goto(server.url + "/day/sat");
    await one.page
      .getByRole("button", { name: "Start practice set", exact: true })
      .click();
    await one.page.getByRole("radio").first().check();
    await one.page
      .getByRole("button", { name: "Check answer & save", exact: true })
      .click();
    await one.page
      .getByLabel("Workspace identity")
      .getByText("Account workspace · saved", { exact: true })
      .waitFor();
    await waitForDocument(
      A + ":sat",
      (row) => row?.payload.attempts.length === 1,
    );
    assert.equal(documents.get(A + ":sat").payload.attempts.length, 1);
    await two.page.goto(server.url + "/day/sat");
    await two.page.reload();
    await two.page
      .getByRole("heading", { name: "Recent answers", exact: true })
      .waitFor();
    assert.ok(
      await two.page.getByText("seconds per attempt", { exact: false }).count(),
    );
    await one.page.goto(server.url + "/day");
    await one.page
      .getByRole("button", { name: "Try a sample list", exact: true })
      .click();
    await one.page
      .getByText("Review day details or plan without AI", { exact: true })
      .click();
    await one.page.getByLabel("Available from", { exact: true }).fill("10:00");
    await one.page.getByLabel("Finish by", { exact: true }).fill("16:00");
    await one.page
      .getByRole("checkbox", {
        name: "These include today’s events and other activities I want to plan around.",
      })
      .check();
    await one.page
      .getByRole("button", {
        name: "Create draft from these details",
        exact: true,
      })
      .click();
    await one.page
      .getByRole("button", { name: "Use this plan", exact: true })
      .click();
    await one.page
      .getByLabel("Workspace identity")
      .getByText("Account workspace · saved", { exact: true })
      .waitFor();
    await waitForDocument(
      A + ":day:2026-11-21",
      (row) => row?.payload.approved === true,
    );
    assert.equal(documents.get(A + ":day:2026-11-21").payload.approved, true);
    await two.page.goto(server.url + "/day/briefing");
    await two.page.reload();
    await two.page
      .getByRole("heading", { name: "Your approved timeline", exact: true })
      .waitFor();
    await one.page.getByText("Check in on homework", { exact: true }).click();
    await one.page
      .getByLabel("Homework item", { exact: true })
      .selectOption("sample-0");
    await one.page
      .getByLabel("Minutes actually worked", { exact: true })
      .fill("20");
    await one.page
      .getByLabel("More focus minutes wanted today", { exact: true })
      .fill("10");
    await one.page
      .getByRole("button", { name: "Review homework check-in", exact: true })
      .click();
    assert.equal(
      documents.get(A + ":day:2026-11-21").payload.homeworkProgress.length,
      0,
    );
    await one.page
      .getByRole("button", {
        name: "Save reviewed homework check-in",
        exact: true,
      })
      .click();
    await waitForDocument(
      A + ":day:2026-11-21",
      (row) => row?.payload.homeworkProgress?.length === 1,
    );
    assert.equal(documents.get(A + ":day:2026-11-21").payload.approved, false);
    await two.page.goto(server.url + "/day");
    await two.page.reload();
    await two.page
      .getByText("20 recorded minutes today", { exact: true })
      .waitFor();
    await other.page.goto(server.url + "/day");
    assert.equal(
      await other.page
        .getByText("20 recorded minutes today", { exact: true })
        .count(),
      0,
    );
    await other.page.goto(server.url + "/day/preferences");
    await other.page.evaluate(
      (value) =>
        localStorage.setItem(
          "daylight.personal-preview.v1",
          JSON.stringify(value),
        ),
      {
        ...documents.get(B + ":personal").payload,
        displayName: "Reviewed local B",
      },
    );
    assert.equal(
      documents.get(B + ":personal").payload.displayName,
      "Account B",
      "Local records must not upload automatically",
    );
    await other.page
      .getByRole("button", {
        name: "Review copying my local workspace",
        exact: true,
      })
      .click();
    await other.page
      .getByRole("button", { name: "Keep workspaces separate", exact: true })
      .click();
    assert.equal(
      documents.get(B + ":personal").payload.displayName,
      "Account B",
    );
    await other.page
      .getByRole("button", {
        name: "Review copying my local workspace",
        exact: true,
      })
      .click();
    await other.page
      .getByRole("button", {
        name: "Copy reviewed records to this account",
        exact: true,
      })
      .click();
    await waitForDocument(
      B + ":personal",
      (row) => row?.payload.displayName === "Reviewed local B",
    );
    assert.equal(
      documents.get(A + ":personal").payload.displayName,
      "Other device A",
    );
    assert.ok(
      !JSON.stringify([...documents.values()]).includes("synthetic-refresh"),
      "Provider/auth tokens must stay outside document payloads",
    );
    assert.deepEqual(
      privateReads,
      [],
      "account mode must not fetch private local development snapshots",
    );
    offlineOne = true;
    const firstOffline = await device(B, true);
    await firstOffline.page.goto(server.url + "/day/preferences");
    await firstOffline.page
      .getByRole("heading", {
        name: "Your workspace needs attention",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await firstOffline.page.getByLabel("Your name", { exact: true }).count(),
      0,
      "An initial network failure must not seed an empty account form",
    );
    assert.equal(
      await firstOffline.page
        .getByRole("button", {
          name: "Download account recovery copy",
          exact: true,
        })
        .count(),
      0,
    );
    offlineOne = false;
    await firstOffline.page
      .getByRole("button", { name: "Retry sync", exact: true })
      .click();
    await firstOffline.page.getByLabel("Your name", { exact: true }).waitFor();
    assert.equal(
      await firstOffline.page
        .getByLabel("Your name", { exact: true })
        .inputValue(),
      "Reviewed local B",
    );
    await firstOffline.context.close();
    await other.page.goto(server.url + "/day/preferences");
    const downloaded = other.page.waitForEvent("download");
    await other.page
      .getByRole("button", {
        name: "Export portable account backup",
        exact: true,
      })
      .click();
    const backupText = await require("node:fs/promises").readFile(
      await (await downloaded).path(),
      "utf8",
    );
    await other.page
      .getByLabel("Records to delete", { exact: true })
      .selectOption("preferences");
    await other.page
      .getByRole("button", { name: "Review account deletion", exact: true })
      .click();
    await other.page
      .getByRole("button", { name: "Cancel deletion", exact: true })
      .click();
    assert.equal(
      documents.get(B + ":personal").payload.displayName,
      "Reviewed local B",
    );
    await other.page
      .getByRole("button", { name: "Review account deletion", exact: true })
      .click();
    await other.page
      .getByLabel(
        "I understand this removes these account records and retained recovery copies. I have saved anything I want to keep.",
        { exact: true },
      )
      .check();
    await other.page
      .getByRole("button", {
        name: "Delete reviewed account records",
        exact: true,
      })
      .click();
    await waitForDocument(
      B + ":personal",
      (r) => r?.payload.displayName === "",
    );
    await other.page.getByLabel("Your name", { exact: true }).waitFor();
    assert.equal(
      await other.page.getByLabel("Your name", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      await other.page.evaluate(
        (owner) =>
          localStorage.getItem(
            "daylight.account-cache.v1." + owner + ".before-import",
          ),
        B,
      ),
      null,
    );
    await other.page
      .getByLabel("Review an account backup", { exact: true })
      .setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(backupText),
      });
    await other.page
      .getByRole("region", { name: "Review account backup", exact: true })
      .waitFor();
    assert.equal(
      await other.page
        .getByRole("button", {
          name: "Restore reviewed account records",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    await other.page
      .getByLabel(
        "I reviewed the source account and want these records restored, including any data I previously deleted.",
        { exact: true },
      )
      .check();
    await other.page
      .getByRole("button", {
        name: "Restore reviewed account records",
        exact: true,
      })
      .click();
    await waitForDocument(
      B + ":personal",
      (r) => r?.payload.displayName === "Reviewed local B",
    );
    await one.page.goto(server.url + "/day/preferences");
    await one.page.setViewportSize({ width: 390, height: 844 });
    await one.page.getByRole("region", { name: "Account sync" }).waitFor();
    assert.equal(
      await one.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await one.page.screenshot({
      path: "artifacts/account-workspace-mobile.png",
      fullPage: true,
    });
    await one.page
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await one.page
      .getByLabel("Workspace identity")
      .getByText("Local workspace · this device", { exact: true })
      .waitFor();
    await one.page.goto(server.url + "/day/preferences");
    assert.equal(
      await one.page.getByLabel("Your name", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      await one.page.getByRole("region", { name: "Account sync" }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS synthetic SDK account screens → two devices → distinct accounts → offline reload → explicit conflict review → SAT/day sync → local snapshot exclusion → sign-out isolation",
    );
    await one.context.close();
    await two.context.close();
    await other.context.close();
  } finally {
    await browser.close();
    server.process.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
