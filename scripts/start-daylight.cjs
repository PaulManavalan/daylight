// A Windows-friendly local launcher that does not require pnpm on PATH.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync, spawn} = require('node:child_process');
const {chooseLocalServer} = require('./local-server.cjs');
const {sourceFingerprint, buildIsCurrent, recordBuild} = require('./launcher-build.cjs');
const root = path.resolve(__dirname, '..');
const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  console.error('Daylight needs Node.js 20.9 or newer. Found ' + process.versions.node);
  process.exit(1);
}
if (!fs.existsSync(next)) {
  console.error('Daylight dependencies are missing. Install the project dependencies before starting.');
  process.exit(1);
}
if (process.argv.includes('--check')) {
  console.log('Node.js: ' + process.execPath);
  console.log('Version: ' + process.versions.node);
  console.log('Daylight dependencies: ready');
  console.log('Production build: ' + (buildIsCurrent(root) ? 'up to date' : 'will rebuild to include the latest code'));
  process.exit(0);
}
async function main() {
const {port, reuse} = await chooseLocalServer();
const url = 'http://127.0.0.1:' + port;
function openBrowser() {
  if (process.platform !== 'win32') return;
  const browser = spawn('explorer.exe', [url], {stdio:'ignore', windowsHide:true});
  browser.on('error', () => console.log('Open ' + url + ' in your browser.'));
  browser.unref();
}
if (reuse) {
  if (!buildIsCurrent(root)) {
    console.log('The running build has not been verified against the latest code. To apply updates, stop its server (Ctrl+C in its terminal), then relaunch. Opening the existing app for now; your browser data stays in place.');
  }
  console.log('\nDaylight is already running at ' + url);
  console.log('Opening the existing app. No other server was stopped.');
  openBrowser();
  return;
}
if (port !== 3102) console.log('Port 3102 is occupied. Using ' + port + ' instead. Browser data is separate for each port.');
if (!buildIsCurrent(root)) {
  console.log('Building the latest Daylight code. This may take a moment...');
  const source = sourceFingerprint(root);
  const build = spawnSync(process.execPath, [next, 'build', '--webpack'], {cwd:root, stdio:'inherit'});
  if (build.status !== 0) process.exit(build.status || 1);
  recordBuild(root, source);
}
console.log('\nStarting Daylight at ' + url);
console.log('Keep this window open while using the app. Press Ctrl+C to stop.\n');
const server = spawn(process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {cwd:root, stdio:['inherit','pipe','inherit']});
let opened = false;
server.stdout.on('data', chunk => {
  process.stdout.write(chunk);
  if (!opened && String(chunk).includes('Ready')) { opened = true; openBrowser(); }
});
server.on('error', error => { console.error(error.message); process.exitCode=1; });
server.on('exit', code => { process.exitCode=code || 0; });
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
