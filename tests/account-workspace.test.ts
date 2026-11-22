import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AccountWorkspace,
  accountCacheKey,
  type WorkspaceLock,
} from "../src/lib/account-workspace";
import {
  WorkspaceConflictError,
  type DocumentTransport,
  type DocumentChange,
  type CloudDocument,
} from "../src/lib/workspace-documents";
import {
  defaultPersonalWorkspace,
  personalWorkspaceKey,
} from "../src/lib/personal-workspace";
import { defaultSat } from "../src/lib/sat";
import {
  emptyPrivacy,
  erasePayload,
  scopeIncludesKey,
  WorkspacePrivacyChangedError,
  type ErasureScope,
} from "../src/lib/workspace-privacy";
const A = "2b2f5471-1ef6-49c4-a488-888f8467e1d1",
  B = "50b8b044-9d6f-4acc-b973-de6b5e31f582";
class Memory {
  values = new Map<string, string>();
  fail = false;
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw Error("quota");
    this.values.set(k, v);
  }
}
function mutex(): WorkspaceLock {
  let pending: Promise<unknown> = Promise.resolve();
  return (action) => {
    const result = pending.then(action);
    pending = result.catch(() => undefined);
    return result;
  };
}
const personal = (displayName: string) => ({
  ...defaultPersonalWorkspace(),
  displayName,
});
class Cloud implements DocumentTransport {
  readonly owner = A;
  privacy = emptyPrivacy();
  rows = new Map<string, CloudDocument>();
  failRead = false;
  failSave = false;
  loseAck = false;
  beforeSave: (() => Promise<void>) | null = null;
  async readPrivacy() {
    if (this.failRead) throw Error("offline");
    return structuredClone(this.privacy);
  }
  async erase(
    scope: ErasureScope,
    generation: number,
    expected: { key: string; revision: number }[],
  ) {
    if (generation !== this.privacy.generation)
      throw new WorkspacePrivacyChangedError();
    const actual = [...this.rows.values()].filter((r) =>
      scopeIncludesKey(scope, r.document_key),
    );
    if (
      actual.some(
        (r) =>
          !expected.some(
            (e) => e.key === r.document_key && e.revision === r.revision,
          ),
      ) ||
      expected.some(
        (e) =>
          e.revision > 0 &&
          !actual.some(
            (r) => r.document_key === e.key && r.revision === e.revision,
          ),
      )
    )
      throw new WorkspaceConflictError();
    for (const row of actual)
      this.external(
        row.document_key,
        erasePayload(row.document_key, row.payload, [scope]),
      );
    this.privacy = {
      generation: generation + 1,
      erasures: { ...this.privacy.erasures, [scope]: generation + 1 },
    };
    return { ...this.privacy, scope, changedDocuments: actual.length };
  }
  async readAll() {
    if (this.failRead) throw Error("offline");
    return structuredClone([...this.rows.values()]);
  }
  async save(changes: DocumentChange[], generation = 0) {
    if (this.beforeSave) {
      const action = this.beforeSave;
      this.beforeSave = null;
      await action();
    }
    if (this.failSave) throw Error("offline");
    if (generation !== this.privacy.generation)
      throw new WorkspacePrivacyChangedError();
    if (
      changes.some(
        (c) => (this.rows.get(c.key)?.revision ?? 0) !== c.expectedRevision,
      )
    )
      throw new WorkspaceConflictError();
    const result = changes.map((c) => ({
      user_id: this.owner,
      document_key: c.key,
      revision: c.expectedRevision + 1,
      payload: c.payload,
      updated_at: new Date().toISOString(),
    }));
    for (const row of result)
      this.rows.set(row.document_key, structuredClone(row));
    if (this.loseAck) {
      this.loseAck = false;
      throw Error("lost response");
    }
    return structuredClone(result);
  }
  external(key: string, payload: unknown) {
    const old = this.rows.get(key);
    this.rows.set(key, {
      user_id: this.owner,
      document_key: key,
      payload,
      revision: (old?.revision ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });
  }
}
test("privacy deletion purges offline drafts and retained copies without discarding unrelated edits", async () => {
  const cloud = new Cloud(),
    s1 = new Memory(),
    s2 = new Memory(),
    one = new AccountWorkspace(s1, A, cloud, mutex()),
    two = new AccountWorkspace(s2, A, cloud, mutex());
  await one.sync();
  const initial = personal("Original");
  initial.nutrition.journal = [
    {
      id: crypto.randomUUID(),
      date: "2026-11-21",
      slot: "lunch",
      title: "Private meal",
      serving: "bowl",
      calories: null,
      protein: null,
      nutritionSource: "",
      note: "",
    },
  ];
  await one.update("personal", initial, 0);
  await one.sync();
  await two.sync();
  const draft = two.document("personal");
  await two.update(
    "personal",
    { ...(draft.payload as object), displayName: "Unrelated offline name" },
    draft.sequence,
  );
  s2.setItem(two.key + ".before-import", "Private meal");
  s2.setItem(two.key + ".before-restore", "Private meal");
  await one.erase(one.prepareErasure("meals"));
  await two.sync();
  assert.equal(two.snapshot().generation, 1);
  assert.ok(!two.recovery()!.includes("Private meal"));
  assert.ok(!s2.getItem(two.key + ".before-import")!.includes("Private meal"));
  assert.ok(!s2.getItem(two.key + ".before-restore")!.includes("Private meal"));
  assert.equal(
    (two.document("personal").payload as typeof initial).displayName,
    "Unrelated offline name",
  );
  if (two.conflict("personal")) {
    const c = two.conflict("personal")!;
    await two.resolve(
      "personal",
      "draft",
      c.revision,
      two.document("personal").sequence,
    );
    await two.sync();
  }
  assert.equal(
    (cloud.rows.get("personal")!.payload as typeof initial).nutrition.journal
      .length,
    0,
  );
  const oldMissing = two.document("sat").sequence;
  await one.sync();
  await one.erase(one.prepareErasure("all"));
  await two.sync();
  await assert.rejects(
    () => two.update("sat", defaultSat(), oldMissing),
    /changed since/,
  );
  assert.equal(two.document("personal").payload, null);
  assert.equal(two.snapshot().conflicts.length, 0);
});
test("deletion during upload cannot resurrect an old revision-zero draft", async () => {
  const cloud = new Cloud(),
    one = new AccountWorkspace(new Memory(), A, cloud, mutex()),
    two = new AccountWorkspace(new Memory(), A, cloud, mutex());
  await one.sync();
  await two.sync();
  await two.update("sat", defaultSat(), 0);
  cloud.beforeSave = async () => {
    await one.erase(one.prepareErasure("all"));
  };
  await two.sync();
  assert.equal(two.document("sat").payload, null);
  assert.equal(cloud.rows.has("sat"), false);
  assert.equal(two.snapshot().status, "synced");
});
test("storage failure after server deletion hides recovery and blocks editing until cleanup succeeds", async () => {
  const cloud = new Cloud(),
    s = new Memory(),
    one = new AccountWorkspace(new Memory(), A, cloud, mutex()),
    two = new AccountWorkspace(s, A, cloud, mutex());
  await one.sync();
  await one.update("personal", personal("Private name"), 0);
  await one.sync();
  await two.sync();
  s.setItem(two.key + ".before-import", "Private name");
  await one.erase(one.prepareErasure("all"));
  s.fail = true;
  await two.sync();
  assert.equal(two.snapshot().privacyBlocked, true);
  assert.equal(two.snapshot().ready, false);
  assert.equal(two.recovery(), null);
  assert.equal(two.document("personal").payload, null);
  await assert.rejects(
    () =>
      two.update(
        "personal",
        personal("stale"),
        two.document("personal").sequence,
      ),
    /Load your account/,
  );
  s.fail = false;
  await two.sync();
  assert.equal(two.snapshot().privacyBlocked, false);
  assert.equal(two.snapshot().ready, true);
  assert.ok(!s.getItem(two.key)!.includes("Private name"));
  assert.ok(!s.getItem(two.key + ".before-import")!.includes("Private name"));
});
test("accounts do not silently import local-demo data and caches remain owner-bound", async () => {
  const storage = new Memory(),
    cloud = new Cloud();
  storage.setItem(
    personalWorkspaceKey,
    JSON.stringify(personal("Private local demo")),
  );
  const account = new AccountWorkspace(storage, A, cloud, mutex());
  await account.sync();
  assert.equal(account.snapshot().ready, true);
  assert.equal(account.document("personal").payload, null);
  assert.ok(
    storage.getItem(personalWorkspaceKey)!.includes("Private local demo"),
  );
  assert.throws(
    () => new AccountWorkspace(storage, B, cloud, mutex()),
    /another user/,
  );
  const wrong = JSON.parse(storage.getItem(accountCacheKey(A))!);
  wrong.owner = B;
  storage.setItem(accountCacheKey(A), JSON.stringify(wrong));
  assert.throws(
    () => new AccountWorkspace(storage, A, cloud, mutex()),
    /recovery/,
  );
});
test("offline edits survive reload and sync only after the server confirms their revision", async () => {
  const storage = new Memory(),
    cloud = new Cloud(),
    lock = mutex();
  const account = new AccountWorkspace(storage, A, cloud, lock);
  await account.sync();
  cloud.failSave = true;
  await account.update("personal", personal("Draft"), 0);
  await account.sync();
  assert.equal(account.snapshot().status, "offline");
  assert.equal(account.snapshot().dirty, 1);
  const reopened = new AccountWorkspace(storage, A, cloud, lock);
  assert.equal(
    (reopened.document("personal").payload as { displayName: string })
      .displayName,
    "Draft",
  );
  cloud.failSave = false;
  await reopened.sync();
  assert.equal(reopened.snapshot().status, "synced");
  assert.equal(reopened.document("personal").revision, 1);
  assert.equal(cloud.rows.get("personal")?.revision, 1);
});
test("conflicts preserve both versions and stale review cannot overwrite newer local edits", async () => {
  const cloud = new Cloud(),
    account = new AccountWorkspace(new Memory(), A, cloud, mutex());
  await account.sync();
  await account.update("personal", personal("First"), 0);
  await account.sync();
  await account.update("personal", personal("Local draft"), 1);
  cloud.external("personal", personal("Other device"));
  await account.sync();
  assert.equal(account.snapshot().status, "conflict");
  assert.equal(
    (account.document("personal").payload as { displayName: string })
      .displayName,
    "Local draft",
  );
  assert.equal(
    (account.conflict("personal")?.payload as { displayName: string })
      .displayName,
    "Other device",
  );
  await assert.rejects(
    () => account.resolve("personal", "draft", 1, 2),
    /changed after review/,
  );
  await account.resolve("personal", "draft", 2, 2);
  await account.sync();
  assert.equal(account.snapshot().status, "synced");
  assert.equal(
    (cloud.rows.get("personal")?.payload as { displayName: string })
      .displayName,
    "Local draft",
  );
  assert.equal(cloud.rows.get("personal")?.revision, 3);
});
test("a lost save acknowledgement converges without duplicating or losing an edit", async () => {
  const cloud = new Cloud(),
    account = new AccountWorkspace(new Memory(), A, cloud, mutex());
  await account.sync();
  await account.update("personal", personal("Saved once"), 0);
  cloud.loseAck = true;
  await account.sync();
  assert.equal(account.snapshot().dirty, 1);
  assert.equal(cloud.rows.get("personal")?.revision, 1);
  await account.sync();
  assert.equal(account.snapshot().dirty, 0);
  assert.equal(account.document("personal").revision, 1);
  assert.equal(cloud.rows.get("personal")?.revision, 1);
});
test("edits made during an upload remain queued against the acknowledged revision", async () => {
  const cloud = new Cloud(),
    account = new AccountWorkspace(new Memory(), A, cloud, mutex());
  await account.sync();
  await account.update("personal", personal("First draft"), 0);
  cloud.beforeSave = async () => {
    await account.update("personal", personal("Newer draft"), 1);
  };
  await account.sync();
  assert.equal(account.snapshot().status, "synced");
  assert.equal(
    (cloud.rows.get("personal")?.payload as { displayName: string })
      .displayName,
    "Newer draft",
  );
  assert.equal(cloud.rows.get("personal")?.revision, 2);
  assert.equal(account.document("personal").dirty, false);
});
test("shared-tab storage locking preserves independent documents and rejects stale local edits", async () => {
  const storage = new Memory(),
    cloud = new Cloud(),
    lock = mutex(),
    one = new AccountWorkspace(storage, A, cloud, lock),
    two = new AccountWorkspace(storage, A, cloud, lock);
  await one.sync();
  await Promise.all([
    one.update("personal", personal("One"), 0),
    two.update("sat", defaultSat(), 0),
  ]);
  await assert.rejects(
    () => two.update("personal", personal("Stale form"), 0),
    /changed since/,
  );
  await one.sync();
  assert.equal(cloud.rows.size, 2);
  assert.equal(
    (cloud.rows.get("personal")?.payload as { displayName: string })
      .displayName,
    "One",
  );
});
test("a reviewed multi-document import commits locally as one change and rejects stale targets before replacing anything", async () => {
  const cloud = new Cloud(),
    storage = new Memory(),
    account = new AccountWorkspace(storage, A, cloud, mutex());
  await account.sync();
  await account.update("personal", personal("Existing"), 0);
  const before = storage.getItem(account.key);
  await assert.rejects(
    () =>
      account.updateMany([
        { key: "sat", payload: defaultSat(), expectedSequence: 0 },
        {
          key: "personal",
          payload: personal("Stale import"),
          expectedSequence: 0,
        },
      ]),
    /changed after/,
  );
  assert.equal(storage.getItem(account.key), before);
  assert.equal(account.document("sat").payload, null);
  await account.updateMany([
    { key: "sat", payload: defaultSat(), expectedSequence: 0 },
    {
      key: "personal",
      payload: personal("Reviewed import"),
      expectedSequence: 1,
    },
  ]);
  await account.sync();
  assert.equal(cloud.rows.size, 2);
  assert.equal(
    (cloud.rows.get("personal")?.payload as { displayName: string })
      .displayName,
    "Reviewed import",
  );
});
test("cache failures, unknown document keys and foreign server rows never reset saved data", async () => {
  const storage = new Memory(),
    cloud = new Cloud(),
    account = new AccountWorkspace(storage, A, cloud, mutex());
  await account.sync();
  const before = storage.getItem(account.key);
  storage.fail = true;
  await assert.rejects(
    () => account.update("personal", personal("Unsaveable"), 0),
    /Previous saved/,
  );
  assert.equal(storage.getItem(account.key), before);
  storage.fail = false;
  await assert.rejects(
    () => account.update("provider_tokens", {}, 0),
    /Unknown account/,
  );
  cloud.rows.set("personal", {
    user_id: B,
    document_key: "personal",
    revision: 1,
    payload: personal("Foreign"),
    updated_at: new Date().toISOString(),
  });
  await account.sync();
  assert.equal(account.document("personal").payload, null);
  assert.equal(account.snapshot().status, "offline");
});
