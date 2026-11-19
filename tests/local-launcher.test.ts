import {test} from 'node:test';
import assert from 'node:assert/strict';
// The launcher uses CommonJS so it also runs in a plain Windows shell.
const {chooseLocalServer} = require('../scripts/local-server.cjs');
test('launcher reuses a responding Daylight server without choosing another port', async () => {
  const seen:number[]=[];
  const result=await chooseLocalServer(async (port:number)=>{seen.push(port);return 'daylight';});
  assert.deepEqual(result,{port:3102,reuse:true});assert.deepEqual(seen,[3102]);
});
test('launcher skips an occupied or unresponsive server and finds a free port', async () => {
  const result=await chooseLocalServer(async (port:number)=>port===3102?'busy':'free');
  assert.deepEqual(result,{port:3103,reuse:false});
});
test('launcher reports exhausted ports and does not hide permission errors', async () => {
  await assert.rejects(chooseLocalServer(async ()=>'busy',3102,3103),/Ports 3102–3103 are busy/);
  await assert.rejects(chooseLocalServer(async ()=>{throw new Error('permission denied');}),/permission denied/);
});
