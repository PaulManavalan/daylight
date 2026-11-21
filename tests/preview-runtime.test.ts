import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const { preparePreviewRuntime } = createRequire(import.meta.url)(
  "../scripts/preview-runtime.cjs",
);
test("a running preview snapshot retains its old assets when the source build is replaced", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daylight-preview-test-"));
  fs.mkdirSync(path.join(root, ".next", "static"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  fs.writeFileSync(path.join(root, ".next", "BUILD_ID"), "first-build");
  fs.writeFileSync(
    path.join(root, ".next", "static", "page-old.js"),
    "old page",
  );
  const first = preparePreviewRuntime(root);
  fs.unlinkSync(path.join(root, ".next", "static", "page-old.js"));
  fs.writeFileSync(path.join(root, ".next", "BUILD_ID"), "second-build");
  fs.writeFileSync(
    path.join(root, ".next", "static", "page-new.js"),
    "new page",
  );
  const second = preparePreviewRuntime(root);
  assert.notEqual(first, second);
  assert.equal(
    fs.readFileSync(path.join(first, ".next", "static", "page-old.js"), "utf8"),
    "old page",
  );
  assert.equal(
    fs.readFileSync(
      path.join(second, ".next", "static", "page-new.js"),
      "utf8",
    ),
    "new page",
  );
  assert.equal(preparePreviewRuntime(root), second);
});
