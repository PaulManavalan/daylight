const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const { preparePreviewRuntime } = require("./preview-runtime.cjs");
const {
  sourceFingerprint,
  buildIsCurrent,
  recordBuild,
} = require("./launcher-build.cjs");
const root = path.resolve(__dirname, ".."),
  next = path.join(root, "node_modules", "next", "dist", "bin", "next"),
  port = 3104;
// Load server configuration from the owning workspace without copying credential files into snapshots.
require(
  require.resolve("@next/env", {
    paths: [path.dirname(require.resolve("next/package.json"))],
  }),
).loadEnvConfig(root, false);
function get(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { agent: false }, (response) => {
      let text = "";
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => resolve({ status: response.statusCode, text }));
    });
    request.setTimeout(5000, () =>
      request.destroy(new Error("Preview request timed out.")),
    );
    request.on("error", reject);
  });
}
async function healthy(url) {
  try {
    const response = await get(url + "/day");
    if (response.status !== 200 || !response.text.includes("Daylight"))
      return false;
    const assets = [
      ...new Set(
        [
          ...response.text.matchAll(
            /(?:src|href)="([^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/g,
          ),
        ]
          .map((m) => m[1])
          .filter((value) => value.startsWith("/_next/")),
      ),
    ];
    if (!assets.length) return false;
    const results = await Promise.all(assets.map((asset) => get(url + asset)));
    return results.every((result) => result.status === 200);
  } catch {
    return false;
  }
}
function open(url) {
  if (process.argv.includes("--no-open")) return;
  const child = spawn("explorer.exe", [url], {
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => console.log("Open " + url));
  child.unref();
}
async function main() {
  const url = "http://127.0.0.1:" + port;
  if (await healthy(url)) {
    console.log(
      "Daylight preview is already responding, including its JavaScript and styles: " +
        url +
        "/day",
    );
    open(url + "/day");
    return;
  }
  if (!buildIsCurrent(root)) {
    console.log("Building the current Daylight preview...");
    const fingerprint = sourceFingerprint(root),
      result = spawnSync(process.execPath, [next, "build", "--webpack"], {
        cwd: root,
        stdio: "inherit",
        windowsHide: true,
      });
    if (result.status !== 0) throw new Error("The preview build failed.");
    recordBuild(root, fingerprint);
  }
  const runtime = preparePreviewRuntime(root);
  const server = spawn(
    process.execPath,
    [next, "start", runtime, "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: runtime,
      env: {
        ...process.env,
        DAYLIGHT_LOCAL_NOTION_SNAPSHOT: "1",
        DAYLIGHT_LOCAL_DATA_ROOT: root,
      },
      stdio: ["inherit", "pipe", "inherit"],
      windowsHide: true,
    },
  );
  let announced = false;
  server.stdout.on("data", async (chunk) => {
    process.stdout.write(chunk);
    if (!announced && String(chunk).includes("Ready")) {
      announced = true;
      if (await healthy(url)) {
        console.log(
          "\nVerified Daylight preview: " +
            url +
            "/day\nKeep this window open. Future builds use separate files.",
        );
        open(url + "/day");
      } else
        console.error(
          "The preview did not pass its page-and-assets check. Check the error above.",
        );
    }
  });
  server.on("error", (error) => console.error(error.message));
  server.on("exit", (code) => {
    process.exitCode = code || 0;
  });
  const stop = () => server.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { healthy };
