import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groundHomeworkCheckin,
  isHomeworkWorkReport,
  homeworkReportText,
} from "../src/lib/day-homework-model";
import {
  emptyNotionDay,
  notionDayModelReply,
  UnapprovedDayActionClaim,
} from "../src/lib/notion-day-model";
import { modelResponseFormat } from "../src/lib/assistant-brain";
import { notionDayReplySchema } from "../src/lib/notion-day-model";
const context = { source: { items: [{ key: "q", title: "Read chapter 4" }] } },
  proposal = {
    sourceKey: "q",
    outcome: "worked",
    minutes: 20,
    remainingMinutes: 10,
    note: "Invented note to discard",
  };
const messages = (content: string) => [{ role: "user" as const, content }];
test("a source-backed short answer retains the explicit report only through an immediate clarification", () => {
  const source = {
    source: {
      items: [
        { key: "q", title: "Read chapter 4", subject: "Literature" },
        { key: "r", title: "Read chapter 4", subject: "History" },
      ],
    },
  };
  const sequence = [
    ...messages("I finished Read chapter 4."),
    {
      role: "assistant" as const,
      content: "Which subject was that for, Literature or History?",
    },
    ...messages("Literature"),
  ];
  assert.match(homeworkReportText(sequence, source)!, /I finished.*Literature/);
  assert.equal(groundHomeworkCheckin(null, sequence, source)?.sourceKey, "q");
  assert.equal(
    groundHomeworkCheckin(
      null,
      messages("I finished Literature Read chapter 4."),
      source,
    )?.sourceKey,
    "q",
  );
  assert.equal(
    groundHomeworkCheckin(
      { ...proposal, outcome: "complete", remainingMinutes: null },
      sequence,
      source,
    )?.sourceKey,
    "q",
  );
  assert.equal(
    homeworkReportText(
      [...sequence.slice(0, -1), ...messages("I just wanna talk")],
      source,
    ),
    null,
  );
  assert.equal(
    homeworkReportText([...sequence.slice(0, -1), ...messages("yes")], source),
    null,
  );
  assert.equal(
    homeworkReportText(
      [...sequence.slice(0, -1), ...messages("Practice at 4")],
      source,
    ),
    null,
  );
  assert.equal(
    homeworkReportText(
      [
        { role: "user", content: "What if I finished Read chapter 4?" },
        ...sequence.slice(1),
      ],
      source,
    ),
    null,
  );
  const duration = [
    ...messages("I worked on chapter 4."),
    { role: "assistant" as const, content: "How many minutes did you work?" },
    ...messages("twenty minutes"),
  ];
  assert.equal(
    groundHomeworkCheckin(
      { ...proposal, remainingMinutes: null },
      duration,
      context,
    )?.minutes,
    20,
  );
});
test("compound actual durations are grounded as one interval without adding remaining focus", () => {
  for (const text of [
    "I spent one hour and thirty minutes on chapter 4 and need 10 more minutes.",
    "I worked 1h30m on chapter 4 and need 10 more minutes.",
  ]) {
    const result = groundHomeworkCheckin(
      { ...proposal, minutes: 30 },
      messages(text),
      context,
    )!;
    assert.equal(result.minutes, 90);
    assert.equal(result.remainingMinutes, 10);
  }
  const result = groundHomeworkCheckin(
    { ...proposal, minutes: 70 },
    messages("I spent one hour on chapter 4 and need 10 more minutes."),
    context,
  )!;
  assert.equal(result.minutes, 60);
  assert.equal(result.remainingMinutes, 10);
  assert.equal(
    isHomeworkWorkReport("I need another fifteen minutes on chapter 4."),
    true,
  );
});
test("a numeric correction recovers only an unambiguous field of the unsaved proposal", () => {
  const pending = { ...proposal, outcome: "worked" as const };
  const result = groundHomeworkCheckin(null, messages("Actually 15, not 20."), {
    ...context,
    pendingHomeworkCheckin: { value: pending },
  })!;
  assert.equal(result.minutes, 15);
  assert.equal(result.remainingMinutes, 10);
  assert.equal(result.sourceKey, "q");
  assert.equal(
    groundHomeworkCheckin(null, messages("Actually 15 not 20."), {
      ...context,
      pendingHomeworkCheckin: { value: { ...pending, remainingMinutes: 20 } },
    }),
    null,
  );
  assert.equal(
    groundHomeworkCheckin(null, messages("Actually 15 not 20."), context),
    null,
  );
});
test("duplicate titles need a uniquely qualified subject or the current unsaved review", () => {
  const duplicate = {
    source: {
      items: [
        { key: "q", title: "Read chapter 4", subject: "Art" },
        { key: "r", title: "Read chapter 4", subject: "History" },
      ],
    },
  };
  const raw = { ...proposal, outcome: "complete", remainingMinutes: null };
  assert.equal(
    groundHomeworkCheckin(
      raw,
      messages("I finished Read chapter 4."),
      duplicate,
    ),
    null,
  );
  assert.equal(
    groundHomeworkCheckin(
      raw,
      messages("I finished Art Read chapter 4."),
      duplicate,
    )?.sourceKey,
    "q",
  );
  assert.equal(
    groundHomeworkCheckin(
      raw,
      messages("I finished History Read chapter 4."),
      duplicate,
    ),
    null,
  );
  assert.equal(
    groundHomeworkCheckin(
      raw,
      messages("I started and finished Read chapter 4."),
      duplicate,
    ),
    null,
  );
});
test("hypothetical completion claims are rejected while conditional discussion remains allowed", () => {
  const request = {
    mode: "notion_day" as const,
    persona: { name: "Daylight", tone: "calm" as const },
    messages: messages("What if I finished Read chapter 4?"),
    context: JSON.stringify({ ...context, knownDay: emptyNotionDay() }),
  };
  assert.throws(
    () =>
      notionDayModelReply(
        {
          reply: "Great, you've marked it complete.",
          dailyContext: emptyNotionDay(),
          homeworkCheckin: null,
        },
        request,
      ),
    UnapprovedDayActionClaim,
  );
  assert.doesNotThrow(() =>
    notionDayModelReply(
      {
        reply:
          "If you finished it, you could use that time for the next assignment.",
        dailyContext: emptyNotionDay(),
        homeworkCheckin: null,
      },
      request,
    ),
  );
});
test("an explicit unique literal title can recover a model abstention as an unsaved completion proposal", () => {
  assert.equal(
    groundHomeworkCheckin(null, messages("I finished Read chapter 4."), context)
      ?.outcome,
    "complete",
  );
  for (const text of [
    "I finished chapter 4.",
    "I finished Read chapter 4 yesterday.",
    "I have not finished Read chapter 4.",
    "What if I finished Read chapter 4?",
  ])
    assert.equal(
      groundHomeworkCheckin(null, messages(text), context),
      null,
      text,
    );
  assert.equal(
    groundHomeworkCheckin(null, messages("I finished Read chapter 4."), {
      source: {
        items: [
          ...context.source.items,
          { key: "other", title: "Read chapter 4" },
        ],
      },
    }),
    null,
  );
});
test("actual and remaining time are grounded separately and model-written notes are not accepted as user facts", () => {
  const result = groundHomeworkCheckin(
    { ...proposal, minutes: 10, remainingMinutes: 20 },
    messages("I spent 20 minutes on chapter 4 and need 10 more minutes."),
    context,
  )!;
  assert.equal(result.minutes, 20);
  assert.equal(result.remainingMinutes, 10);
  assert.equal(
    result.note,
    "I spent 20 minutes on chapter 4 and need 10 more minutes.",
  );
});
test("unknown actual time stays unknown, and a focus-time request does not record work", () => {
  const done = groundHomeworkCheckin(
    { ...proposal, outcome: "complete", minutes: 25, remainingMinutes: null },
    messages("I finished chapter 4."),
    context,
  )!;
  assert.equal(done.minutes, null);
  const more = groundHomeworkCheckin(
    { ...proposal, minutes: null, remainingMinutes: 15 },
    messages("I need 15 more minutes on chapter 4."),
    context,
  )!;
  assert.equal(more.outcome, "more_time");
  assert.equal(more.minutes, null);
  assert.equal(more.remainingMinutes, 15);
});
test("questions, unrelated initial planning, hypotheticals and invented task keys do not become work proposals", () => {
  for (const text of [
    "What if I spent 20 minutes on chapter 4?",
    "Did I finish chapter 4?",
    "Can you show me my plan?",
    "I can work from 2pm to 8pm. I also want 20 minutes of piano.",
  ]) {
    assert.equal(isHomeworkWorkReport(text), false, text);
    assert.equal(
      groundHomeworkCheckin(proposal, messages(text), context),
      null,
    );
  }
  assert.equal(
    groundHomeworkCheckin(
      { ...proposal, sourceKey: "missing" },
      messages("I spent 20 minutes on chapter 4."),
      context,
    ),
    null,
  );
  assert.equal(
    groundHomeworkCheckin(
      { ...proposal, outcome: "complete", remainingMinutes: null },
      messages("I worked 20 minutes but did not finish chapter 4."),
      context,
    ),
    null,
  );
});
test("word durations can be reported without using chapter numbers as actual time", () => {
  assert.equal(
    groundHomeworkCheckin(
      { ...proposal, minutes: 25, remainingMinutes: null },
      messages("I worked twenty-five minutes on chapter 4."),
      context,
    )?.minutes,
    25,
  );
  assert.equal(
    groundHomeworkCheckin(
      { ...proposal, minutes: 4, remainingMinutes: null },
      messages("I finished chapter 4."),
      context,
    )?.minutes,
    null,
  );
});
test("a proposal preserves known day facts and exports a model response schema with a nullable check-in", () => {
  const known = { ...emptyNotionDay(), start: "14:00", finish: "20:00" },
    request = {
      mode: "notion_day" as const,
      persona: { name: "Daylight", tone: "calm" as const },
      messages: messages(
        "I spent 20 minutes on chapter 4 and need 10 more minutes.",
      ),
      context: JSON.stringify({ ...context, knownDay: known }),
    };
  const response = notionDayModelReply(
    {
      reply: "Please review your check-in.",
      dailyContext: { ...known, start: "12:00" },
      homeworkCheckin: proposal,
    },
    request,
  );
  assert.deepEqual(response.dailyContext, known);
  assert.equal(response.homeworkCheckin?.minutes, 20);
  assert.ok(
    JSON.stringify(modelResponseFormat(notionDayReplySchema)).includes(
      "homeworkCheckin",
    ),
  );
});
