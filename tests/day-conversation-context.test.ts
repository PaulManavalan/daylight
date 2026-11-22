import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyNotionDay,
  notionDayConversationMessages,
  notionDayModelReply,
} from "../src/lib/notion-day-model";
import { savedDaySessionSchema } from "../src/lib/day-session";
const known = emptyNotionDay();
const request = {
  mode: "notion_day" as const,
  persona: { name: "Daylight", tone: "calm" as const },
  messages: [
    {
      role: "user" as const,
      content: "What homework is highlighted, and when is the calendar event?",
    },
  ],
  context: JSON.stringify({
    knownDay: known,
    source: {
      items: [{ key: "q", title: "Read chapter", today: true }],
      omitted: 20,
    },
    externalCalendarEvents: [
      { title: "Dentist", start: "16:30", end: "17:00" },
    ],
    selectedTrainingActivities: [{ title: "My routine", minutes: 20 }],
    existingPlan: {
      entries: [{ title: "Read chapter", start: "17:15", end: "17:40" }],
    },
  }),
};
test("the conversational reply receives actual homework, calendar and existing-plan facts", () => {
  const messages = notionDayConversationMessages(request, known),
    text = messages[0].content;
  for (const phrase of [
    "Read chapter",
    "Dentist",
    "16:30",
    "17:15",
    "My routine",
    "omitted",
  ])
    assert.ok(text.includes(phrase), phrase);
  const changed = { ...known, start: "10:00" };
  assert.ok(
    notionDayConversationMessages(request, changed)[0].content.includes(
      '"existingPlan":null',
    ),
  );
});
test("existing calendar and timetable times can be discussed without being mistaken for invented appointments", () => {
  const reply = notionDayModelReply(
    {
      reply:
        "Dentist is at 4:30 pm; the existing reading block starts at 5:15 pm.",
      dailyContext: known,
    },
    request,
  );
  assert.equal(reply.dailyContext.events.length, 0);
  assert.throws(
    () =>
      notionDayModelReply(
        { reply: "Start homework at 8:45 pm.", dailyContext: known },
        request,
      ),
    /unconfirmed time/,
  );
});
test("saved day conversations retain more than six exchanges while staying bounded", () => {
  const session = {
    source: {
      pageId: "example",
      title: "List",
      readAt: new Date().toISOString(),
      items: [],
      weeklyNotes: [],
      warnings: [],
    },
    sample: false,
    known,
    messages: Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: "Message " + i,
    })),
    plan: null,
    approved: false,
  };
  assert.equal(savedDaySessionSchema.parse(session).messages.length, 40);
  assert.equal(
    savedDaySessionSchema.safeParse({
      ...session,
      messages: Array.from({ length: 201 }, () => ({
        role: "user",
        content: "Hi",
      })),
    }).success,
    false,
  );
});
