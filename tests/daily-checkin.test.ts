import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyCheckInDraft,recordDailyCheckIn,removeDailyCheckIn} from '../src/lib/daily-checkin';
import {defaults,planningSchema} from '../src/lib/scheduling';
import {brainContext} from '../src/lib/assistant-brain';
import {modelMessages,isPlanExplanation} from '../src/lib/model-messages';
import {PlanningStore} from '../src/lib/planning-store';
import {parseWorkspaceBackup} from '../src/lib/workspace-backup';
import {chatDecision} from '../src/lib/chat-actions';
const now=new Date(2026,10,21,8);
test('only explicit check-in notes create proposals; missing or oversized notes keep the draft',()=>{
 assert.equal(dailyCheckInDraft('I slept badly, can we talk?',now),null);
 assert.equal(dailyCheckInDraft('What is a morning check-in?',now),null);
 assert.throws(()=>dailyCheckInDraft('Morning check-in: ',now),/few words/);
 assert.throws(()=>dailyCheckInDraft('Evening check-in: '+'x'.repeat(2001),now),/2,000/);
 const entry=dailyCheckInDraft('Morning check-in: Slept 7 hours. Low energy.\nEssay first.',now)!;
 assert.equal(entry.day,'2026-11-21');assert.equal(entry.period,'morning');assert.match(entry.note,/\nEssay/);
});
test('daily notes are idempotent, bounded and never complete tasks or alter scheduling constraints',()=>{
 const state=defaults(),before=JSON.stringify(state),entry=dailyCheckInDraft('Evening check-in: Finished a draft; still need to proofread.',now)!;
 const next=recordDailyCheckIn(state,entry,now);assert.equal(JSON.stringify(state),before);assert.deepEqual(next.sessions,state.sessions);assert.deepEqual(next.preferences,state.preferences);assert.deepEqual(next.fixed,state.fixed);assert.deepEqual(next.history,state.history);
 assert.equal(recordDailyCheckIn(next,entry,now),next);
 assert.throws(()=>recordDailyCheckIn(next,{...entry,note:'Changed'},now),/changed/);
 assert.throws(()=>recordDailyCheckIn(state,entry,new Date(2026,10,22)),/day changed/);
 let many=next;for(let i=0;i<65;i++)many=recordDailyCheckIn(many,{...entry,id:crypto.randomUUID()},now);assert.equal(many.daily_checkins!.length,60);
});
test('check-ins survive planning and workspace backups; stale or failed writes preserve previous notes',()=>{
 const values=new Map<string,string>();let quota=false;const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{if(quota)throw Error('Quota');values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 const store=new PlanningStore(storage,'checkin-test'),loaded=store.load(),entry=dailyCheckInDraft('Morning check-in: Feeling rested.',now)!,next=recordDailyCheckIn(loaded.state,entry,now);
 const raw=store.save(next,loaded.raw);assert.equal(store.load().state.daily_checkins![0].note,entry.note);
 assert.throws(()=>store.save(loaded.state,loaded.raw),/another tab/);
 quota=true;assert.throws(()=>store.save(recordDailyCheckIn(next,{...entry,id:crypto.randomUUID()},now),raw),/storage/);assert.equal(storage.getItem(store.key),raw);
 assert.equal(planningSchema.parse(defaults()).daily_checkins,undefined);
 const restored=parseWorkspaceBackup(JSON.stringify({version:1,exported_at:now.toISOString(),tasks:[],planning:next}));assert.deepEqual(restored.planning?.daily_checkins,next.daily_checkins);
});
test('check-in approval stays separate from task plans and context remains bounded with long notes',()=>{
 assert.equal(chatDecision('save my check-in',['checkin','draft'],null)?.target,'checkin');
 assert.equal(chatDecision('save that plan',['checkin'],null),null);assert.equal(chatDecision('yes',['checkin'],null),null);
 assert.equal(chatDecision('yes but I slept six hours',['checkin'],'checkin'),null);
 assert.equal(chatDecision('discard check-in',['checkin'],null)?.action,'decline');
 const state=defaults();state.daily_checkins=Array.from({length:60},()=>dailyCheckInDraft('Morning check-in: '+'x'.repeat(1990),now)!);
 const context=brainContext([],state,[],[],now);assert.equal(JSON.parse(context).dailyCheckIns.length,6);
 const messages=modelMessages({context,messages:[{role:'user',content:'Can we talk about today?'}],persona:{name:'Sol',tone:'calm'}},true,'none');assert.ok(messages[0].content.length<12000);assert.equal(messages.at(-1)?.content,'Can we talk about today?');
});
test('recalling a saved check-in is read-only, while an explicit new task still routes normally',()=>{
 const request={context:'{}',messages:[{role:'user' as const,content:'What did I report in my morning check-in today? Just recap my note.'}],persona:{name:'Sol',tone:'calm' as const}};
 assert.equal(isPlanExplanation(request),true);
 for(const content of ['Can you recap my check-in?','Remind me what I said this morning.','Summarize my priorities.'])assert.equal(isPlanExplanation({...request,messages:[{role:'user',content}]}),true);
 assert.equal(isPlanExplanation({...request,messages:[{role:'user',content:'Add a new task: essay outline, 25 minutes.'}]}),false);
});
test('removing a check-in is idempotent and rejects a stale reviewed entry',()=>{
 const entry=dailyCheckInDraft('Morning check-in: Slept well.',now)!,state=recordDailyCheckIn(defaults(),entry,now);
 assert.throws(()=>removeDailyCheckIn({...state,daily_checkins:[{...entry,note:'Newer note'}]},entry),/changed in another tab/);
 const next=removeDailyCheckIn(state,entry);assert.equal(next.daily_checkins?.length,0);assert.equal(state.daily_checkins?.length,1);assert.deepEqual(next.sessions,state.sessions);assert.equal(removeDailyCheckIn(next,entry),next);
});
