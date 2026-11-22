// Opt-in installed-model evaluation. Synthetic homework only; no downloads.
const ts = require("typescript"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
require.extensions[".ts"] = (module, file) =>
  module._compile(
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
const known = {
  ...emptyNotionDay(),
  start: "14:00",
  finish: "20:00",
  eventsDiscussed: true,
  extrasDiscussed: true,
};
const source = {
  title: "Synthetic list",
  items: [
    {
      key: "literature",
      title: "Read chapter 4",
      subject: "Literature",
      today: true,
    },
    {
      key: "history",
      title: "Read chapter 4",
      subject: "History",
      today: true,
    },
    {
      key: "physics",
      title: "Physics questions",
      subject: "Physics",
      today: true,
    },
  ],
};
const pending = {
  value: {
    sourceKey: "physics",
    outcome: "worked",
    minutes: 20,
    remainingMinutes: 10,
    note: "I spent 20 minutes on Physics questions and need 10 more minutes.",
  },
};
const cases = [
  {
    name: "duplicate titles require clarification",
    text: "I finished Read chapter 4.",
    expected: null,
  },
  {
    name: "subject resolves duplicate titles",
    text: "I finished Literature Read chapter 4.",
    expected: { sourceKey: "literature", outcome: "complete", minutes: null },
  },
  {
    name: "short subject answer completes the clarification",
    text: "Literature",
    history: [
      { role: "user", content: "I finished Read chapter 4." },
      {
        role: "assistant",
        content: "Which subject was that for, Literature or History?",
      },
    ],
    expected: { sourceKey: "literature", outcome: "complete", minutes: null },
  },
  {
    name: "short actual-duration answer retains the work report",
    text: "twenty minutes",
    history: [
      { role: "user", content: "I worked on Physics questions." },
      { role: "assistant", content: "How many minutes did you work?" },
    ],
    expected: { sourceKey: "physics", outcome: "worked", minutes: 20 },
  },
  {
    name: "unfinished actual work",
    text: "I worked 20 minutes on Physics questions but I did not finish them.",
    expected: { sourceKey: "physics", outcome: "worked", minutes: 20 },
  },
  { name: "unrelated completion", text: "I finished dinner.", expected: null },
  {
    name: "unsaved actual-time correction",
    text: "Actually 15 not 20.",
    pending,
    expected: {
      sourceKey: "physics",
      outcome: "worked",
      minutes: 15,
      remainingMinutes: 10,
    },
  },
  {
    name: "compound actual duration",
    text: "I spent one hour and thirty minutes on Physics questions and need 10 more minutes.",
    expected: {
      sourceKey: "physics",
      outcome: "worked",
      minutes: 90,
      remainingMinutes: 10,
    },
  },
];
(async () => {
  const results = [];
  for (const item of cases) {
    try {
      const output = await askLocalModel(
        {
          mode: "notion_day",
          persona: { name: "Daylight", tone: "calm" },
          messages: [
            ...(item.history ?? []),
            { role: "user", content: item.text },
          ],
          context: JSON.stringify({
            today: "2026-11-22",
            localTime: "12:00",
            knownDay: known,
            source,
            pendingHomeworkCheckin: item.pending ?? null,
            homeworkProgress: [],
            externalCalendarEvents: [],
          }),
        },
        AbortSignal.timeout(90000),
      );
      const result = output.result;
      assert.deepEqual(result.dailyContext, known);
      if (item.name === "duplicate titles require clarification") {
        assert.match(result.reply, /which|do you mean/i);
        assert.doesNotMatch(
          result.reply,
          /completing.*(?:and|both)|completed both/i,
        );
      }
      if (item.expected === null) assert.equal(result.homeworkCheckin, null);
      else
        for (const [key, value] of Object.entries(item.expected))
          assert.equal(result.homeworkCheckin?.[key], value, key);
      results.push({ name: item.name, passed: true, result });
    } catch (error) {
      results.push({ name: item.name, passed: false, error: error.message });
    }
    console.log(JSON.stringify(results.at(-1)));
    fs.writeFileSync(
      "artifacts/day-work-conversation-model-results.json",
      JSON.stringify(results, null, 2),
    );
  }
  if (results.some((item) => !item.passed)) process.exitCode = 1;
})();
