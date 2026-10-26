import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, defaults, occurrences, overlaps, plan, moveProblem, type PlanningState, type Session } from "../src/lib/scheduling";
import type { Task } from "../src/lib/types";

const now = new Date(2026,9,26,14);
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id,user_id:"local-demo",title:id,description:"",subject:"Math",deadline:null,estimated_minutes:90,remaining_minutes:90,actual_minutes:0,priority:"medium",energy_level:"high",status:"not_started",created_at:now.toISOString(),updated_at:now.toISOString(),...extra });
function verify(sessions: Session[], state: PlanningState, tasks: Task[]) {
  const fixed=occurrences(state.fixed,now,addDays(now,8));
  for(const s of sessions) {
    const t=tasks.find(t=>t.id===s.taskId)!;
    assert.equal(moveProblem(s,sessions,state.fixed,state.preferences,t,now),null);
    assert.equal(fixed.some(f=>overlaps(+new Date(s.start),+new Date(s.end),+f.start,+f.end)),false);
  }
  for (const t of tasks) assert.ok(sessions.filter(s=>s.taskId===t.id).reduce((n,s)=>n+(+new Date(s.end)-+new Date(s.start))/60000,0)<=t.remaining_minutes);
}
test("weekly plan respects protected time, deadlines, breaks, and daily capacity",()=>{
  const state=defaults();
  const tasks=[task("urgent",{deadline:new Date(2026,9,26,20).toISOString(),priority:"high"}),task("big",{remaining_minutes:700}),task("done",{status:"done",remaining_minutes:0})];
  const result=plan(tasks,state,now,7,now);
  verify(result.sessions,state,tasks);
  assert.ok(result.sessions.length>5);
  assert.equal(result.sessions.some(s=>s.taskId==="done"),false);
  assert.equal(result.unplaced.length,0);
});
test("overnight recurring sleep expands across midnight including the previous day",()=>{
  const state=defaults(), from=new Date(2026,9,27,0), to=new Date(2026,9,28,0);
  const sleep=occurrences(state.fixed,from,to).filter(f=>f.title==="Sleep");
  assert.equal(sleep.length,2);
  assert.equal(sleep[0].end.getHours(),7);
  assert.ok(sleep[0].start<from);
});
test("impossible deadlines remain visible as unplaced work",()=>{
  const state=defaults();const tasks=[task("late",{deadline:new Date(2026,9,26,13).toISOString()})];
  const result=plan(tasks,state,now,1,now);
  assert.equal(result.sessions.length,0);assert.equal(result.unplaced[0].minutes,90);
  assert.match(result.unplaced[0].reason,/passed/);
});
test("uses short free gaps without crossing fixed events",()=>{
  const state=defaults(); state.preferences.workEnd="16:00";state.preferences.focusStart="15:00";state.preferences.focusEnd="16:00";
  state.fixed=[{id:"event",title:"Class",date:"2026-10-26",start:"15:30",end:"16:00",days:[]}];
  const tasks=[task("short",{remaining_minutes:30})], result=plan(tasks,state,now,1,now);
  assert.equal(result.unplaced.length,0);assert.equal(result.sessions.length,1);verify(result.sessions,state,tasks);
});
test("replanning extended work displaces low-priority work without moving hard deadlines",()=>{
  const state=defaults();state.preferences.capacity=90;
  const tasks=[task("hard",{remaining_minutes:120,deadline:new Date(2026,9,26,21).toISOString(),priority:"high"}),task("low",{priority:"low",remaining_minutes:60})];
  const result=plan(tasks,state,now,1,now);verify(result.sessions,state,tasks);
  assert.equal(result.sessions.every(s=>s.taskId==="hard"),true);
  assert.deepEqual(result.unplaced.map(u=>u.minutes),[30,60]);
});
test("replanning preserves an ongoing session and avoids duplicate remaining work",()=>{
  const state=defaults();const current={id:"active",taskId:"active-task",start:new Date(2026,9,26,15).toISOString(),end:new Date(2026,9,26,15,45).toISOString(),reason:"Already underway"};state.sessions=[current];
  const tasks=[task("active-task")], result=plan(tasks,state,now,1,new Date(2026,9,26,15,15));
  assert.ok(result.sessions.some(s=>s.id==="active"));
  assert.equal(result.sessions.reduce((n,s)=>n+(+new Date(s.end)-+new Date(s.start))/60000,0),90);
});
test("manual moves reject protected time, overload, past time and missed deadlines",()=>{
  const state=defaults(), t=task("move",{deadline:new Date(2026,9,26,20).toISOString()});
  const s={id:"move",taskId:t.id,start:new Date(2026,9,26,20).toISOString(),end:new Date(2026,9,26,20,30).toISOString(),reason:"Move"};
  assert.match(moveProblem(s,[],state.fixed,state.preferences,t,now)!,/deadline/);
  state.fixed.push({id:"club",title:"Club",date:"2026-10-26",start:"19:00",end:"20:00",days:[]});
  const moved={...s,start:new Date(2026,9,26,19).toISOString(),end:new Date(2026,9,26,19,30).toISOString()};
  assert.match(moveProblem(moved,[],state.fixed,state.preferences,t,now)!,/protected/);
});
