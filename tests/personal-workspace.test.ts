import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PersonalWorkspaceStore,
  personalWorkspaceKey,
  defaultPersonalWorkspace,
  personalWorkspaceSchema,
} from "../src/lib/personal-workspace";
test("preferences persist, unknown allergies stay unknown and stale saves cannot overwrite newer settings", () => {
  const data = new Map<string, string>(),
    storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    },
    store = new PersonalWorkspaceStore(storage);
  const a = store.load(),
    b = store.load();
  const next = {
    ...a.state,
    food: {
      ...a.state.food,
      dislikes: ["Example food"],
      meals: "family" as const,
    },
  };
  store.save(next, a.raw);
  assert.equal(store.load().state.food.allergyStatus, "unknown");
  assert.deepEqual(store.load().state.food.dislikes, ["Example food"]);
  assert.throws(() => store.save(b.state, b.raw), /another tab/);
});
test("corrupt records and full storage preserve prior data; allergy status requires explicit consistency", () => {
  let raw = "corrupted";
  const storage = {
      getItem: (key: string) => (key === personalWorkspaceKey ? raw : null),
      setItem: () => {
        throw Error("quota");
      },
    },
    store = new PersonalWorkspaceStore(storage);
  assert.throws(() => store.load(), /not been reset/);
  assert.equal(raw, "corrupted");
  raw = JSON.stringify(defaultPersonalWorkspace());
  assert.throws(() => store.save(defaultPersonalWorkspace(), raw), /preserved/);
  assert.equal(JSON.parse(raw).version, 1);
  assert.equal(
    personalWorkspaceSchema.safeParse({
      ...defaultPersonalWorkspace(),
      food: {
        likes: [],
        dislikes: [],
        allergyStatus: "listed",
        allergies: [],
        meals: null,
      },
    }).success,
    false,
  );
  assert.equal(personalWorkspaceKey.startsWith("daylight."), true);
});
