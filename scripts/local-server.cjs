const http = require('node:http');
const net = require('node:net');

async function inspectPort(port) {
  const daylight = await new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const request = http.get({hostname:'127.0.0.1', port, path:'/', agent:false}, response => {
      let html = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        html += chunk;
        if (/<title>Daylight(?:\s|\s*·)/i.test(html) && response.statusCode === 200) { finish(true); request.destroy(); }
        else if (html.length > 65536) { finish(false); request.destroy(); }
      });
      response.on('end', () => finish(false));
      response.on('error', () => finish(false));
    });
    const timer = setTimeout(() => { finish(false); request.destroy(); }, 1500);
    request.on('close', () => clearTimeout(timer));
    request.on('error', () => finish(false));
  });
  if (daylight) return 'daylight';
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => error.code === 'EADDRINUSE' ? resolve('busy') : reject(error));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve('free')));
  });
}

async function chooseLocalServer(inspect = inspectPort, first = 3102, last = 3112) {
  for (let port = first; port <= last; port++) {
    const state = await inspect(port);
    if (state === 'daylight') return {port, reuse:true};
    if (state === 'free') return {port, reuse:false};
  }
  throw new Error(`Ports ${first}–${last} are busy. Close an old Daylight server window, then try again.`);
}

module.exports = {inspectPort, chooseLocalServer};
