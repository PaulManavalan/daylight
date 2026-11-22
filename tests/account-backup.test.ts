import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAccountBackup } from "../src/lib/account-backup";
import { defaultPersonalWorkspace } from "../src/lib/personal-workspace";
import { emptyNotionDay } from "../src/lib/notion-day-model";
import {
  emptyPrivacy,
  workspacePrivacySchema,
} from "../src/lib/workspace-privacy";
const owner = "2b2f5471-1ef6-49c4-a488-888f8467e1d1";
test("restoring a saved daily conversation always removes its previous approval", () => {
  const data = {
    format: "daylight-account-backup",
    version: 1,
    sourceOwner: owner,
    exportedAt: new Date().toISOString(),
    privacyGeneration: 0,
    documents: {
      "day:2026-11-21": {
        source: {
          pageId: "example",
          title: "Homework",
          readAt: new Date().toISOString(),
          items: [],
          weeklyNotes: [],
          warnings: [],
        },
        sample: true,
        known: emptyNotionDay(),
        messages: [{ role: "user", content: "Saved conversation" }],
        plan: null,
        approved: true,
      },
    },
  };
  const result = parseAccountBackup(JSON.stringify(data));
  assert.equal(
    (result.documents["day:2026-11-21"] as { approved: boolean }).approved,
    false,
  );
  assert.ok(JSON.stringify(result).includes("Saved conversation"));
});
test("portable backup validates documents and does not carry source cloud revision or identity into payloads", () => {
  const data = {
    format: "daylight-account-backup",
    version: 1,
    sourceOwner: owner,
    exportedAt: new Date().toISOString(),
    privacyGeneration: 3,
    documents: { personal: defaultPersonalWorkspace() },
  };
  assert.equal(parseAccountBackup(JSON.stringify(data)).sourceOwner, owner);
  assert.throws(() =>
    parseAccountBackup(
      JSON.stringify({ ...data, documents: { tokens: { secret: "no" } } }),
    ),
  );
  assert.throws(() =>
    parseAccountBackup(
      JSON.stringify({ ...data, documents: { personal: { broken: true } } }),
    ),
  );
  assert.throws(() => parseAccountBackup("x".repeat(4194305)), /smaller than/);
});
test("legacy recovery is accepted only when versions are resolved", () => {
  const data = {
    version: 1,
    owner,
    documents: {
      personal: {
        payload: defaultPersonalWorkspace(),
        revision: 8,
        sequence: 12,
        dirty: true,
      },
    },
    conflicts: {},
  };
  assert.equal(parseAccountBackup(JSON.stringify(data)).privacyGeneration, 0);
  assert.throws(
    () =>
      parseAccountBackup(
        JSON.stringify({
          ...data,
          conflicts: { personal: { revision: 9, payload: null } },
        }),
      ),
    /unresolved versions/,
  );
});
test("privacy metadata permits missing scopes and rejects a checkpoint newer than the generation", () => {
  assert.deepEqual(
    workspacePrivacySchema.parse(emptyPrivacy()),
    emptyPrivacy(),
  );
  assert.equal(
    workspacePrivacySchema.safeParse({ generation: 1, erasures: { all: 2 } })
      .success,
    false,
  );
});
