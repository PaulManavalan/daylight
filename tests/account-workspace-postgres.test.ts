import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  AccountWorkspace,
  type WorkspaceLock,
} from "../src/lib/account-workspace";
import {
  validateCloudDocuments,
  WorkspaceConflictError,
  type DocumentTransport,
} from "../src/lib/workspace-documents";
import { defaultPersonalWorkspace } from "../src/lib/personal-workspace";
const A = "2b2f5471-1ef6-49c4-a488-888f8467e1d1",
  B = "50b8b044-9d6f-4acc-b973-de6b5e31f582";
class Memory {
  values = new Map<string, string>();
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.values.set(k, v);
  }
}
function lock(): WorkspaceLock {
  let pending: Promise<unknown> = Promise.resolve();
  return (action) => {
    const result = pending.then(action);
    pending = result.catch(() => undefined);
    return result;
  };
}
test("account outbox and PostgreSQL CAS reconcile two devices while keeping a second account isolated", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      `create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;insert into auth.users values ('${A}'),('${B}');`,
    );
    await db.exec(
      await readFile("supabase/migrations/002_workspace_documents.sql", "utf8"),
    );
    await db.exec(
      await readFile("supabase/migrations/003_workspace_privacy.sql", "utf8"),
    );
    function transport(owner: string): DocumentTransport {
      return {
        owner,
        async readPrivacy() {
          return db.transaction(async (tx) => {
            await tx.exec("set local role authenticated");
            await tx.query(
              "select set_config('request.jwt.claim.sub',$1,true)",
              [owner],
            );
            return (
              await tx.query<{ p: { generation: number; erasures: {} } }>(
                "select public.read_workspace_privacy($1) p",
                [owner],
              )
            ).rows[0].p;
          });
        },
        async readAll() {
          return db.transaction(async (tx) => {
            await tx.exec("set local role authenticated");
            await tx.query(
              "select set_config('request.jwt.claim.sub',$1,true)",
              [owner],
            );
            const rows = await tx.query<{ row: unknown }>(
              "select to_jsonb(d) as row from public.workspace_documents d order by document_key",
            );
            return validateCloudDocuments(
              rows.rows.map((r) => r.row),
              owner,
            );
          });
        },
        async save(changes, generation) {
          try {
            return await db.transaction(async (tx) => {
              await tx.exec("set local role authenticated");
              await tx.query(
                "select set_config('request.jwt.claim.sub',$1,true)",
                [owner],
              );
              const rows = await tx.query<{ saved: unknown }>(
                "select public.save_workspace_documents($1,$2::jsonb,$3) as saved",
                [owner, JSON.stringify(changes), generation],
              );
              return validateCloudDocuments(rows.rows[0].saved, owner);
            });
          } catch (error) {
            if ((error as { code?: string }).code === "40001")
              throw new WorkspaceConflictError();
            throw error;
          }
        },
      };
    }
    const deviceOne = new AccountWorkspace(
        new Memory(),
        A,
        transport(A),
        lock(),
      ),
      secondAccount = new AccountWorkspace(
        new Memory(),
        B,
        transport(B),
        lock(),
      );
    await deviceOne.sync();
    await deviceOne.update(
      "personal",
      { ...defaultPersonalWorkspace(), displayName: "Account A" },
      0,
    );
    await deviceOne.sync();
    await secondAccount.sync();
    assert.equal(secondAccount.document("personal").payload, null);
    await secondAccount.update(
      "personal",
      { ...defaultPersonalWorkspace(), displayName: "Account B" },
      0,
    );
    await secondAccount.sync();
    const deviceTwo = new AccountWorkspace(
      new Memory(),
      A,
      transport(A),
      lock(),
    );
    await deviceTwo.sync();
    assert.equal(
      (deviceTwo.document("personal").payload as { displayName: string })
        .displayName,
      "Account A",
    );
    const one = deviceOne.document("personal"),
      two = deviceTwo.document("personal");
    await deviceOne.update(
      "personal",
      { ...(one.payload as object), displayName: "First device edit" },
      one.sequence,
    );
    await deviceTwo.update(
      "personal",
      { ...(two.payload as object), displayName: "Second device edit" },
      two.sequence,
    );
    await deviceOne.sync();
    await deviceTwo.sync();
    assert.equal(deviceTwo.snapshot().status, "conflict");
    assert.equal(
      (deviceTwo.document("personal").payload as { displayName: string })
        .displayName,
      "Second device edit",
    );
    assert.equal(
      (deviceTwo.conflict("personal")?.payload as { displayName: string })
        .displayName,
      "First device edit",
    );
    const conflict = deviceTwo.conflict("personal")!,
      local = deviceTwo.document("personal");
    await deviceTwo.resolve(
      "personal",
      "cloud",
      conflict.revision,
      local.sequence,
    );
    await deviceTwo.sync();
    assert.equal(deviceTwo.snapshot().status, "synced");
    assert.equal(
      (deviceTwo.document("personal").payload as { displayName: string })
        .displayName,
      "First device edit",
    );
    await secondAccount.sync();
    assert.equal(
      (secondAccount.document("personal").payload as { displayName: string })
        .displayName,
      "Account B",
    );
  } finally {
    await db.close();
  }
});
