import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../src/lib/scheduling';
import {PlanningStore} from '../src/lib/planning-store';
import {localRepository} from '../src/lib/repository';
import {LOCAL_TASKS,LOCAL_PLAN,RESTORE_PENDING,RESTORE_PREVIOUS,parseWorkspaceBackup,captureRestoreSnapshot,restoreWorkspaceBackup,recoverLocalRestore,previousWorkspaceExport} from '../src/lib/workspace-backup';
class Memory {
 values=new Map<string,string>();fail='';
 getItem(key:string){return this.values.get(key) ?? null;}
 setItem(key:string,value:string){if(key===this.fail){this.fail='';throw new Error('Quota exceeded');}this.values.set(key,value);}
 removeItem(key:string){this.values.delete(key);}
}
const task={id:'d82b1959-8a7e-4f40-8d4c-98d041c80a10',user_id:'exported-account',title:'English essay',description:'Draft two paragraphs',subject:'English',deadline:null,estimated_minutes:45,remaining_minutes:30,priority:'high',energy_level:'high',status:'in_progress',actual_minutes:15,created_at:'2026-11-19T12:00:00Z',updated_at:'2026-11-19T12:00:00Z'};
function exported(){const planning=defaults();planning.sessions=[{id:'session-one',taskId:task.id,start:'2026-11-20T20:00:00Z',end:'2026-11-20T20:30:00Z',reason:'Before the deadline'}];return {version:1,exported_at:'2026-11-19T12:00:00Z',tasks:[task],planning};}
function initial(){const memory=new Memory();memory.setItem(LOCAL_TASKS,'[]');memory.setItem(LOCAL_PLAN,JSON.stringify(defaults()));return memory;}
test('backup preview validates exports without writes and normalizes account ownership locally',()=>{
 const memory=initial(),before=JSON.stringify([...memory.values]);const backup=parseWorkspaceBackup(JSON.stringify(exported()));
 assert.equal(JSON.stringify([...memory.values]),before);assert.equal(backup.tasks[0].user_id,'local-demo');assert.equal(backup.tasks[0].actual_minutes,15);assert.equal(backup.tasks[0].remaining_minutes,30);
});
test('restore round trip preserves task IDs, sessions and preferences with a previous-workspace recovery copy',()=>{
 const memory=initial(),snapshot=captureRestoreSnapshot(memory),backup=parseWorkspaceBackup(JSON.stringify(exported()));
 restoreWorkspaceBackup(memory,backup,snapshot);
 assert.equal(JSON.parse(memory.getItem(LOCAL_TASKS)!)[0].id,task.id);
 assert.deepEqual(JSON.parse(memory.getItem(LOCAL_PLAN)!),backup.planning);
 assert.equal(memory.getItem(LOCAL_PLAN+'.backup'),memory.getItem(LOCAL_PLAN));
 assert.deepEqual(JSON.parse(memory.getItem(RESTORE_PREVIOUS)!),snapshot);assert.equal(memory.getItem(RESTORE_PENDING),null);
 assert.equal(recoverLocalRestore(memory),false);
 const previousExport=parseWorkspaceBackup(previousWorkspaceExport(memory,new Date('2026-11-19T13:00:00Z'))!);
 assert.equal(previousExport.tasks.length,0);assert.deepEqual(previousExport.planning,JSON.parse(snapshot.planning!));
});
test('interrupted restore recovers before calendar and repository reads without applying progress twice',async t=>{
 const memory=initial(),backup=parseWorkspaceBackup(JSON.stringify(exported()));memory.fail=LOCAL_PLAN;
 assert.throws(()=>restoreWorkspaceBackup(memory,backup,captureRestoreSnapshot(memory)),/unfinished/);
 assert.ok(memory.getItem(RESTORE_PENDING));assert.equal(JSON.parse(memory.getItem(RESTORE_PREVIOUS)!).tasks,'[]');
 const restored=new PlanningStore(memory,'local-demo').load();assert.equal(restored.state.sessions[0].taskId,task.id);assert.equal(memory.getItem(RESTORE_PENDING),null);
 const previous=globalThis.localStorage;Object.defineProperty(globalThis,'localStorage',{value:memory,configurable:true});
 t.after(()=>Object.defineProperty(globalThis,'localStorage',{value:previous,configurable:true}));
 assert.equal((await localRepository().list())[0].remaining_minutes,30);assert.equal((await localRepository().list())[0].actual_minutes,15);
});
test('staging failures, pending check-ins and stale reviews do not replace active data',()=>{
 const backup=parseWorkspaceBackup(JSON.stringify(exported())),memory=initial(),snapshot=captureRestoreSnapshot(memory);
 memory.fail=RESTORE_PENDING;assert.throws(()=>restoreWorkspaceBackup(memory,backup,snapshot),/not replaced/);assert.deepEqual(captureRestoreSnapshot(memory),snapshot);
 memory.setItem(LOCAL_PLAN+'.pending','pending');assert.throws(()=>restoreWorkspaceBackup(memory,backup,snapshot),/pending check-in/);memory.removeItem(LOCAL_PLAN+'.pending');
 memory.setItem(LOCAL_TASKS,'changed');assert.throws(()=>restoreWorkspaceBackup(memory,backup,snapshot),/workspace changed/);assert.equal(memory.getItem(LOCAL_TASKS),'changed');
});
test('invalid versions, duplicate tasks, missing session tasks and corrupt journals are rejected',()=>{
 assert.throws(()=>parseWorkspaceBackup('{'),/valid JSON/);
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...exported(),version:2})),/supported/);
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...exported(),tasks:[task,task]})),/duplicate/);
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...exported(),tasks:[]})),/missing/);
 const memory=initial();memory.setItem(RESTORE_PENDING,'broken');assert.throws(()=>recoverLocalRestore(memory),/needs recovery/);assert.equal(memory.getItem(LOCAL_TASKS),'[]');
});
test('task-only backups clear the old calendar and its fallback instead of retaining unrelated sessions',()=>{
 const memory=initial(),backup=parseWorkspaceBackup(JSON.stringify({...exported(),planning:null}));memory.setItem(LOCAL_PLAN+'.backup','previous calendar');
 restoreWorkspaceBackup(memory,backup,captureRestoreSnapshot(memory));assert.equal(memory.getItem(LOCAL_PLAN),null);assert.equal(memory.getItem(LOCAL_PLAN+'.backup'),null);
});
