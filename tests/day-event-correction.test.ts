import { test } from "node:test";
import assert from "node:assert/strict";
import { explicitEventCorrection } from "../src/lib/day-event-correction";
import {
  emptyNotionDay,
  notionDayModelReply,
} from "../src/lib/notion-day-model";
const known = {
  ...emptyNotionDay(),
  start: "14:00",
  finish: "20:00",
  eventsDiscussed: true,
  extrasDiscussed: true,
  events: [{ title: "Soccer", start: "16:00", end: "17:00" }],
  extras: [{ title: "Piano", minutes: 20 }],
};
test("an explicit correction changes only its grounded event edge and preserves confirmed daily facts", () => {
  const earlier = ["Soccer practice is 4 to 5pm."];
  const corrected = explicitEventCorrection(
    known,
    "Practice ends at 5:30 instead.",
    earlier,
  )!;
  assert.equal(corrected.events[0].end, "17:30");
  assert.equal(corrected.start, "14:00");
  assert.deepEqual(corrected.extras, known.extras);
  assert.equal(known.events[0].end, "17:00");
  assert.equal(
    explicitEventCorrection(known, "Soccer starts at 3:45 pm.", [])?.events[0]
      .start,
    "15:45",
  );
});
test("unrelated, hypothetical, ambiguous or invalid corrections are not applied by the narrow guard", () => {
  for (const text of [
    "What if soccer ends at 5:30?",
    "Dinner ends at 5:30 instead.",
    "Soccer ends at 3pm.",
    "Soccer starts at 6pm.",
    "Soccer ends at 25:00.",
    "Soccer ends at 0 pm.",
    "Practice ends at 5:30 instead.",
    "Soccer ends at 5:30 and I can work until 9.",
  ])
    assert.equal(explicitEventCorrection(known, text, []), null, text);
  assert.equal(
    explicitEventCorrection(
      {
        ...known,
        events: [
          ...known.events,
          { title: "Another event", start: "11:00", end: "12:00" },
        ],
      },
      "It ends at 5:30.",
      [],
    ),
    null,
  );
});
test("a model cannot turn the event correction into an extra activity or a new work window", () => {
  const request = {
    mode: "notion_day" as const,
    persona: { name: "Daylight", tone: "calm" as const },
    context: JSON.stringify({ knownDay: known }),
    messages: [
      { role: "user" as const, content: "Soccer practice is 4 to 5pm." },
      { role: "assistant" as const, content: "Your draft is ready." },
      { role: "user" as const, content: "Practice ends at 5:30 instead." },
    ],
  };
  const result = notionDayModelReply(
    {
      reply: "Practice now ends at 5:30 pm.",
      dailyContext: {
        ...known,
        start: "17:30",
        extras: [...known.extras, { title: "Soccer", minutes: 30 }],
      },
    },
    request,
  );
  assert.equal(result.dailyContext.events[0].end, "17:30");
  assert.equal(result.dailyContext.start, "14:00");
  assert.deepEqual(result.dailyContext.extras, known.extras);
});
