import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectLocalModel,askLocalModel} from '../src/lib/local-model';
import {brainContext} from '../src/lib/assistant-brain';
import {defaults} from '../src/lib/scheduling';
const installed=['qwen3-vl:8b','qwen2.5vl:7b','gemma3:latest'];
test('local model selection uses installed chat models and rejects uninstalled or URL-like names',()=>{
 assert.equal(selectLocalModel(installed),'gemma3:latest');
 assert.equal(selectLocalModel(installed,'qwen3-vl:8b'),'qwen3-vl:8b');
 assert.equal(selectLocalModel(['nomic-embed-text:latest']),null);
 assert.throws(()=>selectLocalModel(installed,'not-installed:latest'),/not installed/);
 assert.throws(()=>selectLocalModel(installed,'https://other-service.invalid/model'),/not installed/);
});
test('selected-model conversation calls only the fixed local tags/chat endpoints and never downloads a model',async t=>{
 const original=globalThis.fetch;const calls:{url:string;body:any}[]=[];
 globalThis.fetch=async (input,options)=>{
  const url=String(input),body=options?.body?JSON.parse(String(options.body)):null;calls.push({url,body});
  if(url.endsWith('/api/tags'))return new Response(JSON.stringify({models:installed.map(name=>({name}))}));
  assert.equal(url,'http://127.0.0.1:11434/api/chat');
  return new Response(JSON.stringify({message:{content:JSON.stringify(body.format.properties.kind?{kind:'none'}:{reply:'Which assignment feels most urgent right now?'})},done_reason:'stop'}));
 };
 t.after(()=>{globalThis.fetch=original;});
 const reply=await askLocalModel({localModel:'qwen3-vl:8b',persona:{name:'Sol',tone:'calm'},context:brainContext([],defaults(),[],[]),messages:[{role:'user',content:'I have too much homework and I do not know where to start.'}]},AbortSignal.timeout(1000));
 assert.equal(reply.model,'qwen3-vl:8b');assert.equal(reply.result.kind,'none');assert.equal(reply.result.tasks.length,0);
 assert.equal(calls.length,3);assert.ok(calls.filter(c=>c.body).every(c=>c.body.model==='qwen3-vl:8b'));
 assert.ok(calls.every(c=>!c.url.includes('/pull') && c.url.startsWith('http://127.0.0.1:11434/')));
});
