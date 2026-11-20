import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudRepository} from '../src/lib/repository';
import type {Task} from '../src/lib/types';
test('cloud mutations include owner and snapshot conditions and reject changed or foreign records',async t=>{
 const previousFetch=globalThis.fetch,previousUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,previousKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://daylight-test.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-only-key';
 t.after(()=>{globalThis.fetch=previousFetch;if(previousUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=previousUrl;if(previousKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=previousKey;});
 const owner=crypto.randomUUID(),task:Task={id:crypto.randomUUID(),user_id:owner,title:'Synthetic cloud task',subject:'Testing',description:'',deadline:null,estimated_minutes:30,remaining_minutes:30,actual_minutes:0,status:'not_started',priority:'medium',energy_level:null,created_at:'2026-11-20T12:00:00Z',updated_at:'2026-11-20T12:00:00Z'};
 const calls:{url:URL;method:string}[]=[];let mode='save';
 globalThis.fetch=async(input,options)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);assert.equal(url.hostname,'daylight-test.invalid');assert.equal(url.pathname,'/rest/v1/tasks');calls.push({url,method:options?.method??'GET'});if(mode==='stale-save')return new Response(JSON.stringify({code:'PGRST116',message:'No rows'}),{status:406,headers:{'content-type':'application/json'}});return new Response(JSON.stringify(mode==='delete'?[]:task),{headers:{'content-type':'application/json'}});};
 const repo=cloudRepository(owner);await repo.save(task,task.id,task);assert.equal(calls[0].method,'PATCH');assert.equal(calls[0].url.searchParams.get('user_id'),'eq.'+owner);assert.equal(calls[0].url.searchParams.get('updated_at'),'eq.'+task.updated_at);
 mode='stale-save';await assert.rejects(()=>repo.save(task,task.id,task),/changed/);mode='delete';await assert.rejects(()=>repo.remove(task.id,task),/changed/);assert.equal(calls.at(-1)!.method,'DELETE');assert.equal(calls.at(-1)!.url.searchParams.get('updated_at'),'eq.'+task.updated_at);
 const count=calls.length;await assert.rejects(()=>repo.save(task,task.id,{...task,user_id:crypto.randomUUID()}),/changed/);assert.equal(calls.length,count,'A foreign snapshot must be rejected before a request.');
});
