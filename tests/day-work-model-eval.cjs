// Real installed-model checks, synthetic homework only. No model downloads or external AI.
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
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const response = await original(input, init);
  if (init?.body) {
    const body = JSON.parse(init.body);
    if (
      body.format?.properties?.homeworkCheckin &&
      !body.format?.properties?.dailyContext
    ) {
      const result = await response.clone().json();
      console.log(
        "SYNTHETIC ACTION " + (result.message?.content ?? result.error),
      );
    }
  }
  return response;
};
const known = {
    ...emptyNotionDay(),
    start: "14:00",
    finish: "20:00",
    eventsDiscussed: true,
    extrasDiscussed: true,
  },
  context = JSON.stringify({
    today: "2026-11-22",
    localTime: "12:00",
    knownDay: known,
    source: {
      title: "Synthetic list",
      items: [
        {
          key: "q",
          title: "Review chapter",
          subject: "Literature",
          today: true,
        },
      ],
      omitted: 0,
    },
    homeworkProgress: [],
    externalCalendarEvents: [],
  });
(async () => {
  for (const [text, outcome] of [
    ["I finished Review chapter.", "complete"],
    ["I need 15 more minutes on Review chapter.", "more_time"],
    [
      "I spent 20 minutes on Review chapter and need 10 more minutes.",
      "worked",
    ],
    ["What if I finished Review chapter?", null],
  ]) {
    const result = await askLocalModel(
      {
        mode: "notion_day",
        persona: { name: "Daylight", tone: "calm" },
        messages: [{ role: "user", content: text }],
        context,
      },
      AbortSignal.timeout(90000),
    );
    console.log(
      JSON.stringify({
        text,
        reply: result.result.reply,
        proposal: result.result.homeworkCheckin,
      }),
    );
    assert.deepEqual(result.result.dailyContext, known);
    assert.equal(result.result.homeworkCheckin?.outcome ?? null, outcome);
    if (outcome) assert.equal(result.result.homeworkCheckin.sourceKey, "q");
    if (outcome === "complete" || outcome === "more_time")
      assert.equal(result.result.homeworkCheckin.minutes, null);
    if (outcome === "worked") {
      assert.equal(result.result.homeworkCheckin.minutes, 20);
      assert.equal(result.result.homeworkCheckin.remainingMinutes, 10);
    }
  }
  console.log(
    "PASS real complete/more-time/worked proposals and hypothetical safety; all remain unsaved.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
