// Opt-in real inference against an already installed model; synthetic records only.
const ts = require("typescript"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
require.extensions[".ts"] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
const { askLocalModel } = require("../src/lib/local-model.ts"),
  { emptyNotionDay } = require("../src/lib/notion-day-model.ts");
const results = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (typeof args[1]?.body === "string") {
    const body = JSON.parse(args[1].body);
    if (
      body.format?.properties?.homeworkCheckin &&
      !body.format?.properties?.dailyContext
    ) {
      const raw = await response.clone().json();
      console.log("SYNTHETIC ACTION " + (raw.message?.content ?? raw.error));
    }
  }
  if (!response.ok)
    console.error(
      "Synthetic model evaluation HTTP failure",
      response.status,
      (await response.clone().text()).slice(0, 1000),
    );
  return response;
};
async function ask(name, messages, known = emptyNotionDay(), extra = {}) {
  const result = await askLocalModel(
    {
      mode: "notion_day",
      persona: { name: "Daylight", tone: "calm" },
      context: JSON.stringify({
        today: "2026-11-21",
        localTime: "09:00",
        source: {
          title: "Synthetic list",
          readAt: "2026-11-21T14:00:00.000Z",
          items: [
            {
              key: "q",
              title: "Review chapter",
              subject: "Literature",
              today: true,
            },
          ],
          weeklyNotes: [],
        },
        knownDay: known,
        externalCalendarEvents: [],
        selectedTrainingActivities: [],
        ...extra,
      }),
      messages,
    },
    AbortSignal.timeout(90000),
  );
  results.push({ name, ...result });
  fs.writeFileSync(
    "artifacts/notion-day-model-evaluation.json",
    JSON.stringify(results, null, 2),
  );
  return result.result;
}
(async () => {
  const captured = await ask("events, flexible want and window", [
    {
      role: "user",
      content:
        "I can work from 2pm to 8pm. Soccer practice is 4 to 5pm. I also want 20 minutes of piano. Nothing else today.",
    },
  ]);
  assert.equal(captured.dailyContext.start, "14:00");
  assert.equal(captured.dailyContext.finish, "20:00");
  assert.ok(
    captured.dailyContext.events.some(
      (e) => e.start === "16:00" && e.end === "17:00",
    ),
  );
  assert.ok(captured.dailyContext.extras.some((e) => e.minutes === 20));
  console.log(
    "PASS real day extraction: fixed event, flexible activity and available window.",
  );
  const correction = await ask(
    "short event correction",
    [
      {
        role: "user",
        content:
          "I can work from 2pm to 8pm. Soccer practice is 4 to 5pm. I also want 20 minutes of piano. Nothing else today.",
      },
      { role: "assistant", content: captured.reply },
      { role: "user", content: "Practice ends at 5:30 instead." },
    ],
    captured.dailyContext,
  );
  assert.equal(correction.dailyContext.start, "14:00");
  assert.equal(correction.dailyContext.finish, "20:00");
  assert.ok(
    correction.dailyContext.events.some(
      (e) => e.start === "16:00" && e.end === "17:30",
    ),
  );
  console.log("PASS real correction preserves the work window.");
  const pause = await ask(
    "stop planning and talk",
    [{ role: "user", content: "wait no i js wanna talk" }],
    correction.dailyContext,
  );
  assert.deepEqual(pause.dailyContext, correction.dailyContext);
  assert.doesNotMatch(
    pause.reply,
    /what happens after school|anything outside school|what time can you start|what events/i,
  );
  console.log(
    "PASS real conversation escape preserves context without an intake question.",
  );
  const unclear = await ask("event time missing", [
    {
      role: "user",
      content:
        "I have practice later and want to do homework. I do not know the practice times yet.",
    },
  ]);
  assert.equal(unclear.dailyContext.eventsDiscussed, false);
  assert.ok(unclear.dailyContext.events.every((e) => !e.start && !e.end));
  console.log("PASS missing practice time is not invented.");
  const recalled = await ask(
    "highlighted homework read-back",
    [{ role: "user", content: "What homework do I have highlighted today?" }],
    correction.dailyContext,
  );
  assert.match(recalled.reply, /chapter/i);
  assert.deepEqual(recalled.dailyContext, correction.dailyContext);
  console.log(
    "PASS real reply recalls the highlighted Notion homework without restarting intake.",
  );
  const calendar = await ask(
    "calendar event read-back",
    [
      {
        role: "user",
        content: "When is my dentist appointment from my imported calendar?",
      },
    ],
    correction.dailyContext,
    {
      externalCalendarEvents: [
        { title: "Dentist", start: "18:30", end: "19:00" },
      ],
    },
  );
  assert.match(calendar.reply, /(?:6:30\s*(?:pm|p\.m\.)|18:30)/i);
  assert.deepEqual(calendar.dailyContext, correction.dailyContext);
  console.log(
    "PASS real reply reads the imported event time without adding or changing appointments.",
  );
  const work = await ask(
    "actual homework and remaining focus",
    [
      {
        role: "user",
        content:
          "I spent 20 minutes on Review chapter and I still need 10 more minutes on it.",
      },
    ],
    correction.dailyContext,
  );
  assert.equal(work.homeworkCheckin?.sourceKey, "q");
  assert.equal(work.homeworkCheckin?.outcome, "worked");
  assert.equal(work.homeworkCheckin?.minutes, 20);
  assert.equal(work.homeworkCheckin?.remainingMinutes, 10);
  assert.deepEqual(work.dailyContext, correction.dailyContext);
  console.log(
    "PASS real work proposal separates actual minutes and requested remaining focus without applying it.",
  );
  const done = await ask(
    "completed assignment with unknown actual time",
    [{ role: "user", content: "I finished Review chapter." }],
    correction.dailyContext,
  );
  assert.equal(done.homeworkCheckin?.outcome, "complete");
  assert.equal(done.homeworkCheckin?.minutes, null);
  console.log(
    "PASS real completed proposal keeps unreported actual time unknown.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
