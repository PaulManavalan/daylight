const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const marker = path.join('.next', 'daylight-source.sha256');
function sourceFingerprint(root) {
  const hash = crypto.createHash('sha256');
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) { hash.update(relative + '\0missing\0'); return; }
    if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error('Build inputs must not be symbolic links: ' + relative);
    if (fs.statSync(absolute).isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else {
      const data = fs.readFileSync(absolute);
      hash.update(relative.replaceAll('\\', '/') + '\0' + data.length + '\0');
      hash.update(data);
    }
  }
  for (const input of ['src', 'public', 'package.json', 'pnpm-lock.yaml', 'next.config.ts', 'next.config.mjs', 'next.config.js', 'postcss.config.mjs', 'tsconfig.json', '.env', '.env.local', '.env.production', '.env.production.local']) visit(input);
  return hash.digest('hex');
}
function buildIsCurrent(root) {
  if (!fs.existsSync(path.join(root, '.next', 'BUILD_ID'))) return false;
  try { return fs.readFileSync(path.join(root, marker), 'utf8').trim() === sourceFingerprint(root); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function recordBuild(root, expected = sourceFingerprint(root)) {
  if (sourceFingerprint(root) !== expected) throw new Error('Daylight source changed during the build. Launch again to build the latest version.');
  fs.writeFileSync(path.join(root, marker), expected + '\n');
}
module.exports = {sourceFingerprint, buildIsCurrent, recordBuild};
