// Compile an isolated synthetic public-client configuration, then always restore the normal build.
// The running preview uses immutable build snapshots and is unaffected by these root builds.
const path = require("node:path"),
  { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  next = path.join(root, "node_modules/next/dist/bin/next"),
  run = (args, env) =>
    execFileSync(process.execPath, args, {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
try {
  run([next, "build", "--webpack"], {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "https://daylight-synthetic-test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
  });
  run(["tests/account-focused.browser.cjs"], process.env);
} catch (error) {
  process.exitCode = 1;
} finally {
  try {
    run([next, "build", "--webpack"], process.env);
  } catch (error) {
    process.exitCode = 1;
  }
}
