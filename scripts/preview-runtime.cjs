const fs = require("node:fs");
const path = require("node:path");
/** Each running preview keeps its own complete build. Rebuilding .next cannot remove its chunks. */
function preparePreviewRuntime(root) {
  root = fs.realpathSync(root);
  const source = path.join(root, ".next");
  const build = fs.readFileSync(path.join(source, "BUILD_ID"), "utf8").trim();
  if (!/^[\w-]{1,100}$/.test(build))
    throw new Error("The preview build ID is invalid. Rebuild Daylight.");
  const parent = path.join(root, "artifacts", "preview-runtime"),
    destination = path.join(parent, build);
  if (!destination.startsWith(parent + path.sep))
    throw new Error("The preview runtime must stay inside its workspace.");
  fs.mkdirSync(parent, { recursive: true });
  if (fs.existsSync(destination)) {
    if (
      fs.lstatSync(destination).isSymbolicLink() ||
      !fs.existsSync(path.join(destination, "preview-ready.json"))
    )
      throw new Error(
        "An incomplete preview snapshot exists. Build a new version before starting.",
      );
    return destination;
  }
  fs.mkdirSync(destination);
  fs.cpSync(source, path.join(destination, ".next"), {
    recursive: true,
    filter: (entry) =>
      !path.relative(source, entry).split(path.sep).includes("cache"),
  });
  // Resolve dependencies from the owning project's node_modules. No dependency copy or account tokens are needed.
  fs.copyFileSync(
    path.join(root, "package.json"),
    path.join(destination, "package.json"),
  );
  fs.writeFileSync(
    path.join(destination, "next.config.mjs"),
    "export default { poweredByHeader:false };\n",
  );
  if (fs.existsSync(path.join(root, "public")))
    fs.cpSync(path.join(root, "public"), path.join(destination, "public"), {
      recursive: true,
    });
  if (fs.readFileSync(path.join(source, "BUILD_ID"), "utf8").trim() !== build)
    throw new Error(
      "Daylight changed while the preview was being copied. Start again after the build completes.",
    );
  fs.writeFileSync(
    path.join(destination, "preview-ready.json"),
    JSON.stringify({ build, sourceRoot: root }),
  );
  return destination;
}
module.exports = { preparePreviewRuntime };
