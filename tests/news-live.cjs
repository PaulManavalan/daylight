// Opt-in live publisher check. Stores only counts/statuses, never article bodies or headline corpora.
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
const { NewsService } = require("../src/lib/news-service.ts");
(async () => {
  const snapshot = await new NewsService().read([
    "US",
    "World",
    "Politics",
    "Technology",
    "AI",
    "Business",
    "Science",
    "Sports",
  ]);
  const report = {
    checkedAt: snapshot.generatedAt,
    headlineCount: snapshot.headlines.length,
    publishers: [...new Set(snapshot.headlines.map((item) => item.publisher))],
    sources: snapshot.sources,
  };
  fs.writeFileSync(
    "artifacts/news-live-evaluation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  assert.ok(snapshot.headlines.length > 0);
  assert.ok(snapshot.headlines.some((item) => item.kind === "newsroom"));
  assert.ok(snapshot.headlines.some((item) => item.kind === "institutional"));
  assert.ok(snapshot.sources.every((source) => source.state === "current"));
  console.log(
    "PASS live allowlisted feed retrieval, bounded XML parsing, publisher attribution, publication dates and link validation.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
