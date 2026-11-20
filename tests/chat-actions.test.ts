import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatDecision,wantsOpenChat} from '../src/lib/chat-actions';
import {ChatHistory,chatHistoryKey} from '../src/lib/chat-history';
test('asking to talk or pause intake exits guided setup without treating the words as tasks',()=>{
 for(const text of ['wait no i js wanna talk','I just want to chat','can we talk?','stop asking questions','pause the intake'])assert.equal(wantsOpenChat(text),true);
 for(const text of ['Math worksheet 25 minutes','I finished the essay','cancel that update'])assert.equal(wantsOpenChat(text),false);
});
test('chat approval belongs to the latest visible proposal and never treats a qualification as consent',()=>{
 for(const text of ['yes','yeah, do that','go ahead','sounds good','yes, that works for me','looks good','go ahead and save it'])assert.deepEqual(chatDecision(text,['draft'],'draft'),{action:'approve',target:'draft'});
 for(const text of ['yes, but make it 30 minutes','maybe yes','what if I say yes?','yes'])assert.equal(chatDecision(text,['draft'],text==='yes'?null:'draft'),null);
 assert.equal(chatDecision('yes',[],null),null);
 assert.deepEqual(chatDecision('save that plan',['draft'],null),{action:'approve',target:'draft'});
 assert.equal(chatDecision('save that plan',['draft','replan'],null),null);
 assert.equal(chatDecision('save that plan',['progress'],null),null);
 assert.deepEqual(chatDecision('yes',['draft','progress'],'progress'),{action:'approve',target:'progress'});
 assert.deepEqual(chatDecision('not now',['draft'],'draft'),{action:'decline',target:'draft'});
 assert.deepEqual(chatDecision('discard that proposal',['draft'],null),{action:'decline',target:'draft'});
 assert.equal(chatDecision('no',['draft'],null),null);
});
function storage(){const map=new Map<string,string>();return {map,getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};}
test('bounded chat history survives a new store and day while staying separate by owner',()=>{
 const s=storage(),a=new ChatHistory(s,'local-demo');assert.equal(a.load(),null);a.save('2026-11-20',[{role:'you',text:'I want room for soccer.',at:'2026-11-20T12:00:00Z'}]);
 assert.equal(new ChatHistory(s,'local-demo').load()?.messages[0].text,'I want room for soccer.');assert.equal(new ChatHistory(s,'account-b').load(),null);
 a.save('2026-11-21',Array.from({length:140},(_,i)=>({role:'you',text:String(i)})));const loaded=new ChatHistory(s,'local-demo').load();assert.equal(loaded?.messages.length,100);assert.equal(loaded?.messages[0].text,'40');assert.equal(loaded?.day,'2026-11-21');
});
test('corrupt and concurrently changed chat histories are preserved rather than overwritten',()=>{
 const s=storage();s.setItem(chatHistoryKey('demo'),'damaged');const bad=new ChatHistory(s,'demo');assert.throws(()=>bad.load(),/preserved/);bad.save('2026-11-20',[]);assert.equal(s.getItem(chatHistoryKey('demo')),'damaged');
 const a=new ChatHistory(s,'other'),b=new ChatHistory(s,'other');a.load();b.load();a.save('2026-11-20',[{role:'you',text:'First tab'}]);assert.throws(()=>b.save('2026-11-20',[{role:'you',text:'Second tab'}]),/Another tab/);assert.equal(new ChatHistory(s,'other').load()?.messages[0].text,'First tab');
});
test('escaped message content stays reloadable within the storage bound and a failed write preserves previous chat',()=>{
 const s=storage(),a=new ChatHistory(s,'demo');a.load();a.save('2026-11-20',Array.from({length:100},()=>({role:'you',text:'\u0000'.repeat(5000)})));assert.ok(s.getItem(chatHistoryKey('demo'))!.length<=250000);assert.ok(new ChatHistory(s,'demo').load()!.messages.length>0);
 const before=s.getItem(chatHistoryKey('demo'));s.setItem=()=>{throw new Error('Quota');};assert.throws(()=>a.save('2026-11-20',[{role:'you',text:'Keep this draft'}]),/could not be saved/);assert.equal(s.getItem(chatHistoryKey('demo')),before);
});
