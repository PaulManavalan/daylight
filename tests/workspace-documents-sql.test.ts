import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "2b2f5471-1ef6-49c4-a488-888f8467e1d1",
  B = "50b8b044-9d6f-4acc-b973-de6b5e31f582";
test("PostgreSQL migration enforces ownership, CAS, atomic batches, tombstones and anonymous denial", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon;
 insert into auth.users values ('${A}'),('${B}');`);
    await db.exec(
      await readFile("supabase/migrations/002_workspace_documents.sql", "utf8"),
    );
    async function asUser(id: string, role = "authenticated") {
      await db.exec(`reset role;set role ${role};`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    }
    async function save(owner: string, changes: unknown) {
      return db.query<{ saved: unknown }>(
        `select public.save_workspace_documents($1::uuid,$2::jsonb) as saved`,
        [owner, JSON.stringify(changes)],
      );
    }
    await asUser(A);
    await save(A, [
      { key: "personal", expectedRevision: 0, payload: { private: "A" } },
    ]);
    await assert.rejects(
      () =>
        save(B, [
          {
            key: "personal",
            expectedRevision: 0,
            payload: { private: "attack" },
          },
        ]),
      /owner_mismatch/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.workspace_documents values ($1,'sat',1,'{}',now())",
          [B],
        ),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("update public.workspace_documents set payload='{}'"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("delete from public.workspace_documents"),
      /permission denied/,
    );
    await asUser(B);
    assert.equal(
      (await db.query("select * from public.workspace_documents")).rows.length,
      0,
    );
    await save(B, [
      { key: "personal", expectedRevision: 0, payload: { private: "B" } },
    ]);
    const own = (
      await db.query<{ payload: { private: string } }>(
        "select payload from public.workspace_documents",
      )
    ).rows;
    assert.equal(own.length, 1);
    assert.equal(own[0].payload.private, "B");
    assert.equal(
      (
        await db.query(
          "select * from public.workspace_documents where user_id=$1",
          [A],
        )
      ).rows.length,
      0,
    );
    await asUser(A);
    await assert.rejects(
      () =>
        save(A, [
          { key: "personal", expectedRevision: 0, payload: { bad: "stale" } },
        ]),
      /revision_conflict/,
    );
    await assert.rejects(
      () =>
        save(A, [
          { key: "day:2026-11-21", expectedRevision: 0, payload: {} },
          {
            key: "personal",
            expectedRevision: 99,
            payload: { bad: "stale batch" },
          },
        ]),
      /revision_conflict/,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.workspace_documents where document_key='day:2026-11-21'",
        )
      ).rows.length,
      0,
      "failed batch must roll back every document",
    );
    await save(A, [{ key: "personal", expectedRevision: 1, payload: null }]);
    await assert.rejects(
      () =>
        save(A, [
          {
            key: "personal",
            expectedRevision: 0,
            payload: { bad: "resurrect" },
          },
        ]),
      /revision_conflict/,
    );
    const tombstone = (
      await db.query<{ revision: number; payload: unknown }>(
        "select revision,payload from public.workspace_documents where document_key='personal'",
      )
    ).rows[0];
    assert.equal(Number(tombstone.revision), 2);
    assert.equal(tombstone.payload, null);
    await save(A, [
      { key: "personal", expectedRevision: 2, payload: { restored: true } },
    ]);
    await assert.rejects(
      () =>
        save(A, [{ key: "provider_tokens", expectedRevision: 0, payload: {} }]),
      /invalid_change/,
    );
    await assert.rejects(
      () =>
        save(A, [{ key: "day:2026-02-31", expectedRevision: 0, payload: {} }]),
      /date/,
    );
    await assert.rejects(
      () =>
        save(A, [
          { key: "sat", expectedRevision: 0, payload: {} },
          { key: "sat", expectedRevision: 0, payload: {} },
        ]),
      /invalid_change/,
    );
    await asUser("", "anon");
    await assert.rejects(
      () => db.query("select * from public.workspace_documents"),
      /permission denied/,
    );
    await assert.rejects(
      () => save(A, [{ key: "sat", expectedRevision: 0, payload: {} }]),
      /permission denied/,
    );
    await asUser("");
    await assert.rejects(
      () => save(A, [{ key: "sat", expectedRevision: 0, payload: {} }]),
      /owner_mismatch/,
    );
  } finally {
    await db.close();
  }
});
