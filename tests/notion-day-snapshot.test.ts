import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../src/app/api/running-list-snapshot/route';
test('private snapshots are unavailable on Vercel, remote hosts and cross-origin requests',async()=>{
 const previous={flag:process.env.DAYLIGHT_LOCAL_NOTION_SNAPSHOT,vercel:process.env.VERCEL};
 try{
  process.env.DAYLIGHT_LOCAL_NOTION_SNAPSHOT='1';process.env.VERCEL='1';
  assert.equal((await GET(new Request('http://127.0.0.1:3104/api/running-list-snapshot',{headers:{host:'127.0.0.1:3104'}}))).status,404);
  delete process.env.VERCEL;
  assert.equal((await GET(new Request('https://example.com/api/running-list-snapshot',{headers:{host:'example.com'}}))).status,404);
  assert.equal((await GET(new Request('http://127.0.0.1:3104/api/running-list-snapshot',{headers:{host:'127.0.0.1:3104',origin:'https://example.com'}}))).status,404);
  delete process.env.DAYLIGHT_LOCAL_NOTION_SNAPSHOT;
  assert.equal((await GET(new Request('http://127.0.0.1:3104/api/running-list-snapshot',{headers:{host:'127.0.0.1:3104'}}))).status,404);
 }finally{for(const [key,value] of [['DAYLIGHT_LOCAL_NOTION_SNAPSHOT',previous.flag],['VERCEL',previous.vercel]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}}
});
