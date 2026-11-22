import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyNotionDay } from "../src/lib/notion-day-model";
import { shouldUpdateDayPlan } from "../src/lib/day-plan-update";
test("chat and hypothetical discussion preserve an approved day even if the model proposes changes", () => {
  const before = emptyNotionDay(),
    after = { ...before, start: "14:00", finish: "20:00" };
  for (const message of [
    "wait no i js wanna talk",
    "can we talk for 5 minutes",
    "What if practice ends at 5?",
    "Why is my homework after practice?",
    "What's my plan for today?",
    "What homework do I have highlighted?",
    "Can you show me my plan?",
    "When is my dentist appointment?",
  ])
    assert.equal(shouldUpdateDayPlan(before, after, message), false);
  assert.equal(shouldUpdateDayPlan(before, before, "thanks"), false);
});
test("explicit replanning or a concrete context correction requests a new review", () => {
  const before = { ...emptyNotionDay(), start: "14:00", finish: "20:00" };
  assert.equal(shouldUpdateDayPlan(before, before, "Replan from now"), true);
  assert.equal(
    shouldUpdateDayPlan(before, before, "Can you update my plan?"),
    true,
  );
  assert.equal(
    shouldUpdateDayPlan(
      before,
      { ...before, finish: "19:00" },
      "I need to stop at 7 instead",
    ),
    true,
  );
});
