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
  rows = new Map<string, CloudDocument>();
  failRead = false;
  failSave = false;
  loseAck = false;
  beforeSave: (() => Promise<void>) | null = null;
  async readAll() {
    if (this.failRead) throw Error("offline");
    return structuredClone([...this.rows.values()]);
  }
  async save(changes: DocumentChange[]) {
    if (this.beforeSave) {
      const action = this.beforeSave;
      this.beforeSave = null;
      await action();
    }
    if (this.failSave) throw Error("offline");
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
