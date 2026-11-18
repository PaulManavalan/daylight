// Export the hosted browser-AI app without changing the localhost Ollama API.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, {recursive: true});
const staging = fs.mkdtempSync(path.join(artifacts, 'static-build-'));
fs.cpSync(path.join(root, 'src'), path.join(staging, 'src'), {
  recursive: true,
  filter: source => source !== path.join(root, 'src', 'app', 'api'),
});
for (const name of ['package.json', 'tsconfig.json', 'postcss.config.mjs', 'next-env.d.ts']) {
  fs.copyFileSync(path.join(root, name), path.join(staging, name));
}
if (fs.existsSync(path.join(root, 'public'))) fs.cpSync(path.join(root, 'public'), path.join(staging, 'public'), {recursive:true});
fs.writeFileSync(path.join(staging, 'next.config.mjs'), 'export default {output:"export",poweredByHeader:false};\n');
const build = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], {cwd:staging, stdio:'inherit'});
if (build.status !== 0) process.exit(build.status || 1);
const exported = path.join(staging, 'out');
if (!fs.existsSync(path.join(exported, 'index.html'))) throw new Error('Static export is missing its home page.');
const output = path.resolve(root, 'out');
if (path.dirname(output) !== root || (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())) throw new Error('Unexpected output location.');
fs.rmSync(output, {recursive:true, force:true});
fs.cpSync(exported, output, {recursive:true});
console.log('Hosted build ready in out/. Browser AI is optional; the Ollama API remains localhost-only.');
