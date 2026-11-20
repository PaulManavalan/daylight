import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SatStore,defaultSat,satScoreSchema,satSummary,satReviewTask,satKey} from '../src/lib/sat';
import {brainContext} from '../src/lib/assistant-brain';
import {defaults} from '../src/lib/scheduling';
import {captureRestoreSnapshot,parseWorkspaceBackup,restoreWorkspaceBackup,recoverLocalRestore,previousWorkspaceExport,RESTORE_PENDING} from '../src/lib/workspace-backup';
class Memory{values=new Map<string,string>();fail='';getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){if(k===this.fail){this.fail='';throw new Error('Quota');}this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}}
const score={id:'9418698f-e3d6-4022-9fcf-f329b0092acd',date:'2026-11-19',label:'Practice A',kind:'practice' as const,math:700,reading_writing:690};
const error={id:'e953af26-c3f6-4cc8-8a5b-87d04402f316',date:'2026-11-19',section:'math' as const,topic:'Algebra',note:'PRIVATE explanation that should not appear in the summary',reviewed:false};
test('SAT starts at the confirmed goal without inventing scores or a test date',()=>{const state=defaultSat(),summary=satSummary(state);assert.equal(summary.goal,1550);assert.equal(summary.latest,null);assert.equal(summary.bestTotal,null);assert.equal(state.nextTestDate,null);assert.throws(()=>satScoreSchema.parse({...score,math:160}));assert.throws(()=>satScoreSchema.parse({...score,reading_writing:810}));});
test('section results and repeated logged mistakes stay distinct from mastery claims',()=>{
 const state={...defaultSat(),scores:[score],errors:[error,{...error,id:'7d8c3d3d-c777-4fc6-9814-235384995558',topic:' algebra ',reviewed:true}]};const summary=satSummary(state);
 assert.equal(summary.latest?.total,1390);assert.equal(summary.latest?.math,700);assert.equal(summary.focus[0].logged,2);assert.equal(summary.focus[0].unreviewed,1);assert.equal(summary.focus[0].topic,'Algebra');assert.match(summary.evidence,/not a diagnostic/);
 const context=brainContext([],defaults(),[],[],new Date(),[],'SAT practice',state);assert.ok(context.includes('1550'));assert.ok(context.includes('Algebra'));assert.ok(!context.includes('PRIVATE explanation'));
});
test('SAT review tasks use the requested time and only a confirmed test-date deadline',()=>{
 const state=defaultSat(),task=satReviewTask(state,'math','Algebra',25);assert.equal(task.estimated_minutes,25);assert.equal(task.remaining_minutes,25);assert.equal(task.deadline,null);assert.equal(task.status,'not_started');assert.equal(state.scores.length,0);assert.throws(()=>satReviewTask(state,'math','Algebra',0));
 const dated=satReviewTask({...state,nextTestDate:'2027-03-01'},'reading_writing','Punctuation',30);assert.equal(new Date(dated.deadline!).getDate(),1);assert.equal(new Date(dated.deadline!).getHours(),23);
});
test('SAT storage isolates identities, rejects stale writes and preserves corrupt or quota-blocked data',()=>{
 const memory=new Memory(),store=new SatStore(memory,'local-demo'),start=store.load();const raw=store.save({...start.state,scores:[score]},start.raw);assert.equal(new SatStore(memory,'another-account').load().state.scores.length,0);
 assert.throws(()=>store.save(defaultSat(),null),/another tab/);memory.fail=store.key;assert.throws(()=>store.save(defaultSat(),raw),/previous data/);assert.equal(memory.getItem(store.key),raw);memory.setItem(store.key,'broken');assert.throws(()=>store.load(),/recovery/);assert.equal(memory.getItem(store.key),'broken');
});
test('backup restore includes SAT recovery and older backups preserve existing SAT data',()=>{
 const memory=new Memory(),key=satKey('local-demo'),original={...defaultSat(),scores:[score]};memory.setItem(key,JSON.stringify(original));
 const old=parseWorkspaceBackup(JSON.stringify({version:1,exported_at:new Date().toISOString(),tasks:[],planning:null}));restoreWorkspaceBackup(memory,old,captureRestoreSnapshot(memory));assert.deepEqual(JSON.parse(memory.getItem(key)!),original);
 const updated={...defaultSat(),errors:[error]},backup=parseWorkspaceBackup(JSON.stringify({...old,sat:updated}));memory.fail=key;assert.throws(()=>restoreWorkspaceBackup(memory,backup,captureRestoreSnapshot(memory)),/unfinished/);assert.ok(memory.getItem(RESTORE_PENDING));assert.throws(()=>new SatStore(memory,'local-demo').load(),/finish/);recoverLocalRestore(memory);assert.deepEqual(JSON.parse(memory.getItem(key)!),updated);
 const previous=parseWorkspaceBackup(previousWorkspaceExport(memory)!);assert.deepEqual(previous.sat,original);
 restoreWorkspaceBackup(memory,{...backup,sat:null},captureRestoreSnapshot(memory));assert.equal(memory.getItem(key),null);
});
