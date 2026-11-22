import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendHomeworkWork,
  homeworkProgressFor,
  removeHomeworkWork,
  homeworkProgressSchema,
  stageHomeworkCheckin,
  verifyHomeworkCheckinReview,
} from "../src/lib/day-homework-progress";
import { emptyNotionDay } from "../src/lib/notion-day-model";
import { buildNotionDayPlan } from "../src/lib/notion-day-plan";
import { emptyCalendars } from "../src/lib/calendar-transfer";
import { emptyFitness } from "../src/lib/fitness";
import { savedDaySessionSchema } from "../src/lib/day-session";
import type { RunningListSource } from "../src/lib/notion-daily-source";
import { parseAccountBackup } from "../src/lib/account-backup";
import { parseWorkspaceBackup } from "../src/lib/workspace-backup";
const now = new Date(2026, 10, 22, 12),
  source: RunningListSource = {
    pageId: "example",
    title: "Synthetic homework",
    readAt: now.toISOString(),
    items: ["a", "b"].map((key) => ({
      key,
      title: "Assignment " + key,
      subject: "Literature",
      yellowHighlighted: true,
      completion: "unchecked",
      sourceUrl: "https://www.notion.so/example",
    })),
    weeklyNotes: [],
    warnings: [],
  },
  known = {
    ...emptyNotionDay(),
    start: "10:00",
    finish: "18:00",
    eventsDiscussed: true,
    extrasDiscussed: true,
  };
const report = (
  outcome: "worked" | "complete" | "set_aside",
  minutes: number | null,
  remainingMinutes: number | null = null,
) => ({ sourceKey: "a", outcome, minutes, remainingMinutes, note: "" });
test("portable local and account restores retain recorded work but require a fresh conversational review", () => {
  const records = appendHomeworkWork(
    [],
    report("worked", 15),
    source,
    false,
    now,
  );
  const pending = stageHomeworkCheckin(
    report("complete", null),
    source,
    records,
    "Review completion.",
    now,
  );
  const session = {
    source,
    sample: false,
    known,
    messages: [],
    plan: null,
    approved: true,
    homeworkProgress: records,
    pendingHomeworkCheckin: pending,
  };
  const account = parseAccountBackup(
    JSON.stringify({
      format: "daylight-account-backup",
      version: 1,
      sourceOwner: "2b2f5471-1ef6-49c4-a488-888f8467e1d1",
      exportedAt: now.toISOString(),
      privacyGeneration: 0,
      documents: { "day:2026-11-22": session },
    }),
  );
  const restored = savedDaySessionSchema.parse(
    account.documents["day:2026-11-22"],
  );
  assert.deepEqual(restored.homeworkProgress, records);
  assert.equal(restored.pendingHomeworkCheckin, null);
  assert.equal(restored.approved, false);
  const local = parseWorkspaceBackup(
    JSON.stringify({
      version: 1,
      exported_at: now.toISOString(),
      tasks: [],
      planning: null,
      focused: { personal: null, days: { "2026-11-22": session } },
    }),
  );
  assert.deepEqual(local.focused?.days["2026-11-22"].homeworkProgress, records);
  assert.equal(local.focused?.days["2026-11-22"].pendingHomeworkCheckin, null);
});
test("an unsaved review is invalidated by a refreshed source or intervening work", () => {
  const pending = stageHomeworkCheckin(
    report("worked", 20, 10),
    source,
    [],
    "Review this check-in.",
    now,
  );
  assert.doesNotThrow(() => verifyHomeworkCheckinReview(pending, source, []));
  assert.throws(
    () =>
      verifyHomeworkCheckinReview(
        pending,
        { ...source, readAt: new Date(+now + 1000).toISOString() },
        [],
      ),
    /changed after/,
  );
  assert.throws(
    () =>
      verifyHomeworkCheckinReview(
        pending,
        { ...source, pageId: "different" },
        [],
      ),
    /changed after/,
  );
  const records = appendHomeworkWork(
    [],
    report("worked", 5),
    source,
    false,
    now,
  );
  assert.throws(
    () => verifyHomeworkCheckinReview(pending, source, records),
    /changed after/,
  );
  assert.equal(records.length, 1);
});
test("a request for more focus does not count as actual or unknown work", () => {
  const records = appendHomeworkWork(
    [],
    {
      sourceKey: "a",
      outcome: "more_time",
      minutes: null,
      remainingMinutes: 40,
      note: "I need 40 more minutes.",
    },
    source,
    false,
    now,
  );
  assert.deepEqual(homeworkProgressFor(records, source.pageId, "a"), {
    status: "more_time",
    minutes: 0,
    unknownTime: 0,
    remaining: 40,
  });
});
test("reported work and remaining focus are separate, and using a suggested block does not complete an assignment", () => {
  let records = appendHomeworkWork(
    [],
    report("worked", 20, 10),
    source,
    false,
    now,
  );
  assert.deepEqual(homeworkProgressFor(records, "example", "a"), {
    status: "worked",
    minutes: 20,
    unknownTime: 0,
    remaining: 10,
  });
  records = appendHomeworkWork(
    records,
    report("worked", 10),
    source,
    false,
    now,
  );
  assert.equal(homeworkProgressFor(records, "example", "a").remaining, 0);
  assert.equal(homeworkProgressFor(records, "example", "a").status, "worked");
  const plan = buildNotionDayPlan(
    source,
    known,
    now,
    emptyCalendars(),
    emptyFitness(),
    records,
  );
  assert.ok(!plan.entries.some((entry) => entry.sourceKey === "a"));
  assert.ok(
    plan.deferred.some(
      (entry) =>
        entry.title === "Assignment a" &&
        entry.reason.includes("not marked complete"),
    ),
  );
  assert.equal(source.items[0].completion, "unchecked");
});
test("a completed report removes future focus without inventing actual time, and removing it restores the proposal", () => {
  const records = appendHomeworkWork(
      [],
      report("complete", null),
      source,
      false,
      now,
    ),
    plan = buildNotionDayPlan(
      source,
      known,
      now,
      emptyCalendars(),
      emptyFitness(),
      records,
    );
  assert.equal(homeworkProgressFor(records, "example", "a").unknownTime, 1);
  assert.ok(!plan.entries.some((entry) => entry.sourceKey === "a"));
  const restored = removeHomeworkWork(
    records,
    records[0].id,
    JSON.stringify(records[0]),
  );
  assert.ok(
    buildNotionDayPlan(
      source,
      known,
      now,
      emptyCalendars(),
      emptyFitness(),
      restored,
    ).entries.some((entry) => entry.sourceKey === "a"),
  );
  assert.throws(
    () => removeHomeworkWork(records, records[0].id, "stale"),
    /changed after/,
  );
});
test("explicit minutes consume daily capacity after replan, while elapsed plans consume none", () => {
  const before = buildNotionDayPlan(source, { ...known, focusBudget: 30 }, now);
  assert.ok(before.entries.some((entry) => entry.kind === "study"));
  const records = appendHomeworkWork(
      [],
      report("worked", 30, 25),
      source,
      false,
      now,
    ),
    after = buildNotionDayPlan(
      source,
      { ...known, focusBudget: 30 },
      now,
      emptyCalendars(),
      emptyFitness(),
      records,
    );
  assert.ok(!after.entries.some((entry) => entry.kind === "study"));
  assert.ok(after.deferred.length > 0);
});
test("source and sample boundaries prevent a report from completing unrelated homework", () => {
  const records = appendHomeworkWork(
    [],
    report("complete", null),
    source,
    false,
    now,
  );
  assert.equal(homeworkProgressFor(records, "other", "a").status, "unreported");
  const sample = { ...source, pageId: "sample" };
  const sampleRecords = appendHomeworkWork(
    [],
    report("worked", 180),
    sample,
    true,
    now,
  );
  assert.ok(
    buildNotionDayPlan(
      source,
      known,
      now,
      emptyCalendars(),
      emptyFitness(),
      sampleRecords,
    ).entries.some((entry) => entry.kind === "study"),
  );
  assert.ok(
    buildNotionDayPlan(
      { ...source, pageId: "other" },
      known,
      now,
      emptyCalendars(),
      emptyFitness(),
      records,
    ).entries.some((entry) => entry.sourceKey === "a"),
  );
});
test("work records reject missing items, duplicate identities, invalid time and stale removals without modifying input", () => {
  const records = appendHomeworkWork(
    [],
    report("set_aside", 0),
    source,
    false,
    now,
  );
  assert.equal(homeworkProgressFor(records, "example", "a").remaining, 0);
  assert.throws(() =>
    appendHomeworkWork(
      records,
      { ...report("complete", null), sourceKey: "missing" },
      source,
      false,
      now,
    ),
  );
  assert.throws(() =>
    appendHomeworkWork(records, report("complete", 20, 10), source, false, now),
  );
  assert.equal(
    homeworkProgressSchema.safeParse([records[0], records[0]]).success,
    false,
  );
  assert.equal(
    homeworkProgressSchema.safeParse([{ ...records[0], minutes: -1 }]).success,
    false,
  );
  assert.equal(records.length, 1);
});
test("old day backups gain an empty work log while current saved records retain explicit provenance", () => {
  const old = {
    source,
    sample: false,
    known,
    messages: [],
    plan: null,
    approved: false,
  };
  assert.deepEqual(savedDaySessionSchema.parse(old).homeworkProgress, []);
  const records = appendHomeworkWork(
    [],
    report("worked", 15),
    source,
    false,
    now,
  );
  assert.equal(
    savedDaySessionSchema.parse({ ...old, homeworkProgress: records })
      .homeworkProgress[0].sourcePageId,
    "example",
  );
});
