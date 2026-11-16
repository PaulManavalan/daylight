import {test} from "node:test";
import assert from "node:assert/strict";
import {defaults,adaptFromCheckIn,planningSchema} from "../src/lib/scheduling";
import {PlanningStore,type PlanningStorage} from "../src/lib/planning-store";
import type {Task} from "../src/lib/types";
class Memory implements PlanningStorage {
  values=new Map<string,string>(); fail="";
  getItem(key:string){return this.values.get(key) ?? null;}
  setItem(key:string,value:string){if(key===this.fail)throw new Error("Quota exceeded");this.values.set(key,value);}
  removeItem(key:string){this.values.delete(key);}
}
const now=new Date(2026,9,26,14);
const task:Task={id:"journal-task",user_id:"local-demo",title:"Essay",description:"",subject:"English",deadline:null,estimated_minutes:60,remaining_minutes:60,priority:"high",energy_level:"high",status:"not_started",actual_minutes:0,created_at:now.toISOString(),updated_at:now.toISOString()};
test("planning snapshots retain a valid backup and recover malformed primary data",()=>{
  const memory=new Memory(),store=new PlanningStore(memory,"demo"),first=store.load();
  const raw=store.save(first.state,null);store.save({...first.state,preferences:{...first.state.preferences,capacity:150}},raw);
  memory.setItem(store.key,"broken JSON");const recovered=store.load();
  assert.equal(recovered.state.preferences.capacity,180);assert.match(recovered.notice,/backup/);
  const repaired=store.save(recovered.state,recovered.raw);assert.ok(planningSchema.safeParse(JSON.parse(repaired)).success);
});
test("quota failures and stale tabs do not overwrite the last saved plan",()=>{
  const memory=new Memory(),store=new PlanningStore(memory,"demo"),raw=store.save(defaults(),null);
  memory.fail=store.key;assert.throws(()=>store.save({...defaults(),sessions:[]},raw),/storage/);
  assert.equal(memory.getItem(store.key),raw);memory.fail="";
  memory.setItem(store.key,JSON.stringify({...defaults(),preferences:{...defaults().preferences,capacity:100}}));
  assert.throws(()=>store.save(defaults(),raw),/another tab/);
  assert.equal(store.load().state.preferences.capacity,100);
});
test("an interrupted check-in recovers history and planning without applying extra minutes twice",()=>{
  const memory=new Memory(),store=new PlanningStore(memory,"demo"),state=defaults(),raw=store.save(state,null);
  const proposal=adaptFromCheckIn([task],state,task.id,"Need more time",30,now);
  store.stage(task,proposal.task,proposal.state.history[0],raw);
  const recovered=store.recover([proposal.task],now);
  assert.equal(recovered.state.history.length,1);assert.equal(recovered.state.history[0].minutes,30);assert.equal(proposal.task.remaining_minutes,90);assert.equal(store.hasPending(),false);
  assert.match(recovered.notice,/Recovered/);assert.equal(store.recover([proposal.task],now).state.history.length,1);
});
test("a check-in that never saved its task does not mutate newer task data",()=>{
  const memory=new Memory(),store=new PlanningStore(memory,"demo"),state=defaults(),raw=store.save(state,null);
  const proposal=adaptFromCheckIn([task],state,task.id,"Need more time",30,now);
  store.stage(task,proposal.task,proposal.state.history[0],raw);
  const recovered=store.recover([task],now);
  assert.equal(recovered.state.history.length,0);assert.equal(task.remaining_minutes,60);assert.equal(store.hasPending(),true);assert.equal(recovered.needsReview,true);
  store.dismissUnapplied([task]);assert.equal(store.hasPending(),false);assert.ok(store.rawBackup().unapplied);
});
test("an already-committed journal is cleared idempotently and accounts stay separate",()=>{
  const memory=new Memory(),store=new PlanningStore(memory,"demo"),state=defaults(),raw=store.save(state,null);
  const proposal=adaptFromCheckIn([task],state,task.id,"Stuck",15,now);
  store.stage(task,proposal.task,proposal.state.history[0],raw);store.save(proposal.state,raw);
  assert.equal(store.recover([proposal.task],now).state.history.length,1);assert.equal(store.hasPending(),false);
  assert.equal(new PlanningStore(memory,"other-account").load().state.history.length,0);
});
test("unreadable primary and backup data are preserved and never silently reset",()=>{
  const memory=new Memory(),store=new PlanningStore(memory,"demo");memory.setItem(store.key,"bad");memory.setItem(`${store.key}.backup`,"also bad");
  assert.throws(()=>store.load(),/recovery/);assert.equal(store.rawBackup().planning,"bad");assert.equal(store.rawBackup().backup,"also bad");
});

test("recovery preserves the same active progress archive as the successful check-in path",()=>{
  const memory=new Memory(),store=new PlanningStore(memory,"demo"),state=defaults(),at=new Date(2026,9,26,18,20);
  state.sessions=[{id:"active",taskId:task.id,start:new Date(2026,9,26,18).toISOString(),end:new Date(2026,9,26,18,45).toISOString(),reason:"Working"}];
  const raw=store.save(state,null),proposal=adaptFromCheckIn([task],state,task.id,"Making progress",15,at);
  store.stage(task,proposal.task,proposal.state.history[0],raw);
  const recovered=store.recover([proposal.task],at);
  assert.deepEqual(recovered.state.sessions.filter(s=>s.completed),proposal.state.sessions.filter(s=>s.completed));
  assert.equal(new Set(recovered.state.sessions.map(s=>s.id)).size,recovered.state.sessions.length);
});

test("another tab cannot overwrite a calendar while a check-in is pending",()=>{
 const memory=new Memory(),store=new PlanningStore(memory,"demo"),other=new PlanningStore(memory,"demo"),state=defaults(),raw=store.save(state,null);
 const proposal=adaptFromCheckIn([task],state,task.id,"Need more time",15,now);
 store.stage(task,proposal.task,proposal.state.history[0],raw);
 assert.throws(()=>other.save({...state,preferences:{...state.preferences,capacity:90}},raw),/check-in/);
 assert.equal(memory.getItem(store.key),raw);
 const saved=store.save(proposal.state,raw);store.finish();assert.equal(store.load().raw,saved);
});
test("an unreadable pending journal blocks unrelated saves without overwriting data",()=>{
 const memory=new Memory(),store=new PlanningStore(memory,"demo"),raw=store.save(defaults(),null);
 memory.setItem(`${store.key}.pending`,"invalid journal");
 assert.throws(()=>store.save(defaults(),raw),/recovery/);assert.equal(memory.getItem(store.key),raw);assert.equal(store.rawBackup().pending,"invalid journal");
});


test("another tab cannot discard an in-flight check-in through automatic recovery",()=>{
 const memory=new Memory(),store=new PlanningStore(memory,"demo"),other=new PlanningStore(memory,"demo"),state=defaults(),raw=store.save(state,null);
 const proposal=adaptFromCheckIn([task],state,task.id,"Need more time",30,now);
 store.stage(task,proposal.task,proposal.state.history[0],raw);
 const waiting=other.recover([task],now);assert.equal(waiting.needsReview,true);assert.equal(store.hasPending(),true);
 assert.throws(()=>other.save(state,raw),/check-in/);
 store.save(proposal.state,raw);store.finish();
 assert.equal(other.recover([proposal.task],now).state.history.length,1);
});

test("a task update that has arrived must be recovered rather than dismissed",()=>{
 const memory=new Memory(),store=new PlanningStore(memory,"demo"),state=defaults(),raw=store.save(state,null);
 const proposal=adaptFromCheckIn([task],state,task.id,"Making progress",15,now);store.stage(task,proposal.task,proposal.state.history[0],raw);
 assert.throws(()=>store.dismissUnapplied([proposal.task]),/recover/);assert.equal(store.hasPending(),true);
 const recovered=store.recover([proposal.task],now);assert.equal(recovered.state.history.length,1);assert.equal(store.hasPending(),false);
});
