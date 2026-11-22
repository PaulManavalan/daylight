import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  defaultPersonalWorkspace,
  personalWorkspaceSchema,
} from "../src/lib/personal-workspace";
const A = "2b2f5471-1ef6-49c4-a488-888f8467e1d1",
  B = "50b8b044-9d6f-4acc-b973-de6b5e31f582";
test("privacy generation blocks stale uploads, scoped erasure preserves other data, and broad deletion rejects stale reviews", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      `create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;insert into auth.users values('${A}'),('${B}');`,
    );
    for (const file of [
      "002_workspace_documents.sql",
      "003_workspace_privacy.sql",
    ])
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    async function asUser(id: string, role = "authenticated") {
      await db.exec("reset role;set role " + role);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    }
    async function privacy(owner = A) {
      return (
        await db.query<{
          value: { generation: number; erasures: Record<string, number> };
        }>("select public.read_workspace_privacy($1) as value", [owner])
      ).rows[0].value;
    }
    async function save(changes: unknown, generation: number) {
      return db.query(
        "select public.save_workspace_documents($1,$2::jsonb,$3)",
        [A, JSON.stringify(changes), generation],
      );
    }
    async function erase(scope: string, generation: number, expected: unknown) {
      return (
        await db.query<{
          value: { generation: number; changedDocuments: number };
        }>("select public.erase_workspace_scope($1,$2,$3,$4::jsonb) as value", [
          A,
          scope,
          generation,
          JSON.stringify(expected),
        ])
      ).rows[0].value;
    }
    await asUser(A);
    assert.equal((await privacy()).generation, 0);
    const personal = defaultPersonalWorkspace();
    personal.displayName = "Name kept";
    personal.food.likes = ["Food preference kept"];
    personal.fitness.preferences.equipmentDetails = "Training kept";
    personal.nutrition.journal = [
      {
        id: crypto.randomUUID(),
        date: "2026-11-21",
        slot: "lunch",
        title: "Meal to remove",
        serving: "one bowl",
        calories: null,
        protein: null,
        nutritionSource: "",
        note: "",
      },
    ];
    await save(
      [
        { key: "personal", expectedRevision: 0, payload: personal },
        { key: "sat", expectedRevision: 0, payload: { version: 1 } },
      ],
      0,
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.save_workspace_documents_checked($1,$2::jsonb)",
          [A, "[]"],
        ),
      /permission denied/,
    );
    const removed = await erase("meals", 0, [{ key: "personal", revision: 1 }]);
    assert.equal(removed.generation, 1);
    const result = (
        await db.query<{ payload: unknown }>(
          "select payload from public.workspace_documents where document_key='personal'",
        )
      ).rows[0].payload,
      parsed = personalWorkspaceSchema.parse(result);
    assert.equal(parsed.nutrition.journal.length, 0);
    assert.equal(parsed.displayName, "Name kept");
    assert.equal(parsed.food.likes[0], "Food preference kept");
    assert.equal(parsed.fitness.preferences.equipmentDetails, "Training kept");
    await assert.rejects(
      () =>
        save(
          [
            {
              key: "day:2026-11-22",
              expectedRevision: 0,
              payload: { oldOfflineData: true },
            },
          ],
          0,
        ),
      /privacy_changed/,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.workspace_documents where document_key='day:2026-11-22'",
        )
      ).rows.length,
      0,
    );
    await save(
      [
        {
          key: "day:2026-11-22",
          expectedRevision: 0,
          payload: { newExplicitData: true },
        },
      ],
      1,
    );
    await assert.rejects(() => erase("days", 1, []), /revision_conflict/);
    assert.equal((await privacy()).generation, 1);
    const cleared = await erase("all", 1, [
      { key: "personal", revision: 2 },
      { key: "sat", revision: 1 },
      { key: "day:2026-11-22", revision: 1 },
    ]);
    assert.equal(cleared.generation, 2);
    assert.equal(cleared.changedDocuments, 3);
    assert.ok(
      (
        await db.query<{ payload: unknown }>(
          "select payload from public.workspace_documents",
        )
      ).rows.every((row) => row.payload === null),
    );
    assert.deepEqual((await privacy()).erasures, { meals: 1, all: 2 });
    await asUser(B);
    assert.equal((await privacy(B)).generation, 0);
    await assert.rejects(() => privacy(A), /owner_mismatch/);
    await assert.rejects(
      () =>
        db.query("select public.erase_workspace_scope($1,'all',0,'[]')", [A]),
      /owner_mismatch/,
    );
    assert.equal(
      (await db.query("select * from public.workspace_privacy")).rows.length,
      0,
    );
    await asUser("", "anon");
    await assert.rejects(() => privacy(A), /permission denied/);
  } finally {
    await db.close();
  }
});
