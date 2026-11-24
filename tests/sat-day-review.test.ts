import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSat, satStateSchema } from "../src/lib/sat";
import { satReviewsForDate } from "../src/lib/sat-day-review";
import { buildNotionDayPlan } from "../src/lib/notion-day-plan";
import { emptyNotionDay } from "../src/lib/notion-day-model";
import { emptyCalendars } from "../src/lib/calendar-transfer";
import { emptyFitness } from "../src/lib/fitness";
import { defaultPersonalWorkspace } from "../src/lib/personal-workspace";
import { dayBriefing } from "../src/lib/day-briefing";
import type { RunningListSource } from "../src/lib/notion-daily-source";
const now = new Date(2026, 10, 24, 13),
  review = {
    id: "a580c9b4-160f-4b4e-81a2-c7441fef9380",
    date: "2026-11-24",
    skill: "Algebra",
    minutes: 20,
  };
const source: RunningListSource = {
  pageId: "example",
  title: "Synthetic homework",
  readAt: now.toISOString(),
  weeklyNotes: [],
  warnings: [],
  items: [
    {
      key: "essay",
      title: "Essay",
      subject: "Literature",
      yellowHighlighted: true,
      completion: "unchecked",
      sourceUrl: "https://www.notion.so/example",
    },
  ],
};
const known = {
  ...emptyNotionDay(),
  start: "14:00",
  finish: "18:00",
  eventsDiscussed: true,
  extrasDiscussed: true,
  events: [{ title: "Appointment", start: "14:20", end: "14:40" }],
};
test("old SAT records remain compatible and planned time never creates answer attempts", () => {
  const { reviewPlans, ...old } = defaultSat();
  assert.deepEqual(satStateSchema.parse(old).reviewPlans, []);
  const state = satStateSchema.parse({ ...old, reviewPlans: [review] });
  assert.equal(state.attempts.length, 0);
  assert.equal(satReviewsForDate(state, "2026-11-25").length, 0);
  assert.equal(satReviewsForDate(state, review.date).length, 1);
  assert.equal(
    satStateSchema.safeParse({ ...state, reviewPlans: [review, review] })
      .success,
    false,
  );
});
test("explicit SAT time joins the homework schedule around protected events", () => {
  const reviews = [review],
    original = JSON.stringify(reviews);
  const plan = buildNotionDayPlan(
    source,
    known,
    now,
    emptyCalendars(),
    emptyFitness(),
    [],
    reviews,
  );
  const practice = plan.entries.filter(
    (entry) => entry.satReviewId === review.id,
  );
  assert.equal(
    practice.reduce(
      (sum, entry) =>
        sum + (Date.parse(entry.end) - Date.parse(entry.start)) / 60000,
      0,
    ),
    20,
  );
  assert.ok(
    practice.every(
      (entry) => entry.kind === "study" && entry.sourceKey === null,
    ),
  );
  const event = plan.entries.find((entry) => entry.kind === "fixed")!;
  assert.ok(
    practice.every(
      (entry) =>
        Date.parse(entry.end) <= Date.parse(event.start) ||
        Date.parse(entry.start) >= Date.parse(event.end),
    ),
  );
  assert.equal(JSON.stringify(reviews), original);
});
test("SAT and homework share focus capacity and unplaced practice stays visible", () => {
  const plan = buildNotionDayPlan(
    source,
    { ...known, focusBudget: 30 },
    now,
    emptyCalendars(),
    emptyFitness(),
    [],
    [review],
  );
  const minutes = plan.entries
    .filter((entry) => entry.kind === "study")
    .reduce(
      (sum, entry) =>
        sum + (Date.parse(entry.end) - Date.parse(entry.start)) / 60000,
      0,
    );
  assert.ok(minutes <= 30);
  assert.ok(plan.deferred.some((entry) => entry.title.includes("SAT")));
});
test("a conversational read-back of the selected SAT duration is not added a second time", () => {
  const plan = buildNotionDayPlan(
    source,
    { ...known, extras: [{ title: "SAT practice", minutes: 20 }] },
    now,
    emptyCalendars(),
    emptyFitness(),
    [],
    [review],
  );
  const entries = plan.entries.filter((entry) => entry.title.startsWith("SAT"));
  assert.ok(entries.every((entry) => entry.satReviewId === review.id));
  assert.equal(
    entries.reduce(
      (sum, entry) =>
        sum + (Date.parse(entry.end) - Date.parse(entry.start)) / 60000,
      0,
    ),
    20,
  );
});
test("changed SAT choices invalidate an old approval in the Today overview", () => {
  const plan = buildNotionDayPlan(source, known, now);
  const saved = {
    source,
    sample: false,
    known,
    messages: [],
    plan,
    approved: true,
  };
  assert.equal(
    dayBriefing(saved, defaultPersonalWorkspace(), now, defaultSat()).approved,
    true,
  );
  const sat = { ...defaultSat(), reviewPlans: [review] };
  assert.equal(
    dayBriefing(saved, defaultPersonalWorkspace(), now, sat).approved,
    false,
  );
  const matching = { ...saved, satReviewRevision: JSON.stringify([review]) };
  assert.equal(
    dayBriefing(matching, defaultPersonalWorkspace(), now, sat).approved,
    true,
  );
  assert.equal(
    dayBriefing(matching, defaultPersonalWorkspace(), now, null).approved,
    false,
  );
});
