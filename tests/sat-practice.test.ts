import { test } from "node:test";
import assert from "node:assert/strict";
import {
  practiceQuestions,
  gradeAttempt,
  choosePractice,
  practiceSummary,
  practiceAttemptSchema,
} from "../src/lib/sat-practice";
import { satStateSchema, defaultSat, SatStore } from "../src/lib/sat";
const make = (id: string, choice: number) => ({
  id: crypto.randomUUID(),
  questionId: id,
  date: "2026-11-21T14:00:00.000Z",
  choice,
  seconds: 30,
});
test("original math answer keys satisfy independent numeric checks", () => {
  const answer = (id: string) => {
    const q = practiceQuestions.find((q) => q.id === id)!;
    return Number(q.choices[q.answer].replace("$", ""));
  };
  assert.equal(3 * (2 * answer("linear-v1") - 5), 27);
  const y = answer("system-v1"),
    x = 10 - y;
  assert.equal(y, 2 * x + 1);
  assert.equal(answer("slope-v1") * (6 - 2), 13 - 5);
  const root = answer("quadratic-v1");
  assert.equal(root * root - 7 * root + 12, 0);
  assert.ok(root > 3);
  assert.equal(answer("vertex-v1"), 9);
  assert.equal(answer("percent-v1"), 80 * (1 - 0.25) * (1 + 0.1));
  assert.equal(answer("ratio-v1") / 24, 3 / 8);
});
test("grading rejects malformed records and selection favors unseen then missed items", () => {
  const q = practiceQuestions.find((q) => q.id === "linear-v1")!,
    wrong = make(q.id, (q.answer + 1) % 4),
    right = make(q.id, q.answer);
  assert.equal(gradeAttempt(wrong).correct, false);
  assert.equal(gradeAttempt(right).correct, true);
  assert.throws(() =>
    practiceAttemptSchema.parse({ ...right, questionId: "invented" }),
  );
  assert.throws(() => practiceAttemptSchema.parse({ ...right, choice: 4 }));
  assert.throws(() => practiceAttemptSchema.parse({ ...right, seconds: -1 }));
  assert.equal(choosePractice([wrong], "Linear equations", 3).at(-1)?.id, q.id);
  const all = practiceQuestions
    .filter((x) => x.skill === "Linear equations")
    .map((x) => make(x.id, x.answer));
  assert.equal(
    choosePractice([...all, wrong], "Linear equations", 1)[0].id,
    q.id,
  );
  const rows = practiceSummary([wrong, right]);
  assert.equal(rows[0].attempts, 2);
  assert.equal(rows[0].correct, 1);
  assert.equal(rows[0].seconds, 60);
});
test("older SAT state migrates without losing scores and practice cannot overwrite stale records", () => {
  const old = { ...defaultSat(), attempts: undefined };
  assert.deepEqual(satStateSchema.parse(old).attempts, []);
  let value: string | null = null;
  const storage = {
    getItem: () => value,
    setItem: (_k: string, v: string) => {
      value = v;
    },
  };
  const store = new SatStore(storage, "test"),
    first = store.load(),
    other = store.load();
  const attempt = make("linear-v1", 1);
  store.save({ ...first.state, attempts: [attempt] }, first.raw);
  assert.throws(() => store.save(other.state, other.raw), /another tab/);
  assert.equal(store.load().state.attempts[0].id, attempt.id);
  assert.throws(
    () =>
      satStateSchema.parse({ ...first.state, attempts: [attempt, attempt] }),
    /unique/,
  );
});
