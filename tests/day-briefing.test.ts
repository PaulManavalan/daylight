import { test } from "node:test";
import assert from "node:assert/strict";
import { dayBriefing } from "../src/lib/day-briefing";
import { defaultPersonalWorkspace } from "../src/lib/personal-workspace";
import { emptyNotionDay } from "../src/lib/notion-day-model";
const now = new Date(2026, 10, 21, 10),
  personal = defaultPersonalWorkspace();
const entry = {
  id: "s",
  title: "Actual chosen work",
  start: new Date(2026, 10, 21, 11).toISOString(),
  end: new Date(2026, 10, 21, 12).toISOString(),
  kind: "study",
  sourceKey: "a",
};
const saved = {
  source: {
    pageId: "test",
    title: "List",
    readAt: now.toISOString(),
    items: [
      {
        key: "a",
        title: "Open",
        subject: null,
        sourceUrl: "https://www.notion.so/",
        yellowHighlighted: true,
        completion: "unchecked",
      },
      {
        key: "b",
        title: "Already checked",
        subject: null,
        sourceUrl: "https://www.notion.so/",
        yellowHighlighted: true,
        completion: "checked",
      },
    ],
    weeklyNotes: [],
    warnings: [],
  },
  sample: false,
  known: emptyNotionDay(),
  messages: [],
  approved: true,
  calendarRevision: JSON.stringify(personal.calendars),
  activityRevision: "[]",
  plan: {
    day: "2026-11-21",
    generatedAt: now.toISOString(),
    sourceReadAt: now.toISOString(),
    window: "test",
    assumptions: [],
    entries: [entry],
    deferred: [],
  },
};
test("briefing uses only approved current-day plans and does not infer completion", () => {
  const brief = dayBriefing(saved, personal, now);
  assert.equal(brief.next?.title, entry.title);
  assert.equal(brief.assignments.length, 1);
  assert.equal(brief.assignments[0].title, "Open");
  assert.equal(brief.sample, false);
  assert.equal(
    dayBriefing({ ...saved, approved: false }, personal, now).next,
    null,
  );
  assert.equal(
    dayBriefing(
      { ...saved, plan: { ...saved.plan, day: "2026-11-20" } },
      personal,
      now,
    ).next,
    null,
  );
  assert.equal(
    dayBriefing(saved, personal, new Date(2026, 10, 21, 13)).next,
    null,
  );
  assert.equal(saved.source.items[0].completion, "unchecked");
  assert.match(brief.readingUrl, /112126.cfm$/);
});
test("briefing refuses stale or malformed plans while keeping personal modules available", () => {
  const stale = dayBriefing(
    { ...saved, activityRevision: "changed" },
    personal,
    now,
  );
  assert.equal(stale.approved, false);
  assert.equal(stale.next, null);
  assert.ok(stale.warnings.some((w) => w.includes("changed")));
  const malformed = dayBriefing({ plan: "broken" }, personal, now);
  assert.equal(malformed.next, null);
  assert.equal(malformed.warnings.length, 1);
  assert.equal(malformed.meals, null);
  assert.equal(dayBriefing(null, personal, now).warnings.length, 0);
});
