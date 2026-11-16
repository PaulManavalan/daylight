import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptFromCheckIn, planningLimits, fixedSchema, preferencesSchema, planningSchema, addDays, defaults, occurrences, overlaps, plan, moveProblem, type PlanningState, type Session } from "../src/lib/scheduling";
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
  const state=defaults(); state.preferences.commitmentBuffer=0; state.preferences.workEnd="16:00";state.preferences.focusStart="15:00";state.preferences.focusEnd="16:00";
  state.fixed=[{id:"event",title:"Class",date:"2026-10-26",start:"15:30",end:"16:00",days:[]}];
  const tasks=[task("short",{remaining_minutes:30})], result=plan(tasks,state,now,1,now);
  assert.equal(result.unplaced.length,0);assert.equal(result.sessions.length,1);verify(result.sessions,state,tasks);
});
test("replanning extended work displaces low-priority work without moving hard deadlines",()=>{
  const state=defaults();state.preferences.capacity=90;state.preferences.dailyBuffer=0;
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

function openAfternoon() {
  const state=defaults();state.fixed=[];
  Object.assign(state.preferences,{workStart:"15:00",workEnd:"18:00",focusStart:"15:00",focusEnd:"18:00",capacity:120,dailyBuffer:0,commitmentBuffer:0,session:45});
  return state;
}
test("priority influences early placement when a later deadline has plenty of slack",()=>{
  const state=openAfternoon();
  const tasks=[task("low",{priority:"low",remaining_minutes:30,deadline:new Date(2026,9,28,18).toISOString()}),task("high",{priority:"high",remaining_minutes:45})];
  const result=plan(tasks,state,now,7,now);
  assert.equal(result.sessions[0].taskId,"high");verify(result.sessions,state,tasks);
});
test("urgent low-priority work is protected ahead of a high-priority undated task",()=>{
  const state=openAfternoon();state.preferences.capacity=60;
  const tasks=[task("urgent-low",{priority:"low",remaining_minutes:45,deadline:new Date(2026,9,26,16).toISOString()}),task("important",{priority:"high",remaining_minutes:60})];
  const result=plan(tasks,state,now,1,now);
  assert.equal(result.sessions[0].taskId,"urgent-low");assert.equal(result.unplaced.some(u=>u.taskId==="urgent-low"),false);
});
test("school and soccer leave recovery time on both sides",()=>{
  const state=defaults(), tuesday=new Date(2026,9,27,14);
  const tasks=[task("soccer-day",{remaining_minutes:150})];
  const result=plan(tasks,state,tuesday,1,tuesday);
  for(const s of result.sessions) {
    const a=new Date(s.start),b=new Date(s.end);
    assert.ok(a.getHours()>=15);
    assert.ok(+a>=+new Date(2026,9,27,15,10));
    assert.ok(+b<=+new Date(2026,9,27,15,50) || +a>=+new Date(2026,9,27,18,10));
  }
});
test("high-focus windows change placement and deep work never runs late",()=>{
  const state=openAfternoon();state.preferences.workEnd="22:00";
  const early=plan([task("focus",{remaining_minutes:45})],state,now,1,now).sessions[0];
  state.preferences.focusStart="18:00";state.preferences.focusEnd="19:00";
  const later=plan([task("focus",{remaining_minutes:45})],state,now,1,now).sessions[0];
  assert.ok(+new Date(later.start)>+new Date(early.start));
  const night=new Date(2026,9,26,20,30);
  const result=plan([task("deep"),task("light",{energy_level:"low",remaining_minutes:30})],state,night,1,night);
  assert.equal(result.sessions.some(s=>s.taskId==="deep"),false);
  assert.ok(result.sessions.some(s=>s.taskId==="light"));assert.match(result.unplaced[0].reason,/Deep work/);
});
test("daily reserve and longer recovery breaks are honored",()=>{
  const state=openAfternoon();state.preferences.workEnd="21:00";state.preferences.capacity=180;state.preferences.dailyBuffer=15;
  const tasks=[task("big",{remaining_minutes:300,energy_level:"low"})];
  const result=plan(tasks,state,now,1,now);
  const rows=result.sessions;
  assert.equal(rows.reduce((n,s)=>n+(+new Date(s.end)-+new Date(s.start))/60000,0),165);
  assert.ok((+new Date(rows[2].start)-+new Date(rows[1].end))/60000>=25);
});
test("weekend windows and selected study days actually control planning",()=>{
  const state=openAfternoon(), saturday=new Date(2026,9,31,9);
  state.preferences.studyDays=[6];state.preferences.weekendStart="10:00";state.preferences.weekendEnd="12:00";
  const result=plan([task("weekend",{remaining_minutes:45})],state,saturday,2,saturday);
  assert.equal(new Date(result.sessions[0].start).getHours(),10);
  assert.equal(result.sessions.every(s=>new Date(s.start).getDay()===6),true);
});
test("need more time visibly pushes lower-priority work later while keeping deadlines",()=>{
  const state=openAfternoon();
  const tasks=[task("essay",{priority:"high",remaining_minutes:45,deadline:new Date(2026,9,26,18).toISOString()}),task("portfolio",{priority:"low",remaining_minutes:45})];
  state.sessions=plan(tasks,state,now,7,now).sessions;
  const original=state.sessions.find(s=>s.taskId==="portfolio")!;
  const adapted=adaptFromCheckIn(tasks,state,"essay","Need more time",60,now);
  assert.equal(adapted.task.remaining_minutes,105);
  assert.ok(adapted.result.sessions.some(s=>s.taskId==="portfolio" && +new Date(s.start)>+new Date(original.start)));
  assert.ok(adapted.result.changes.some(c=>c.taskId==="portfolio" && c.kind==="moved"));
  assert.ok(adapted.result.sessions.filter(s=>s.taskId==="essay").every(s=>s.end<=tasks[0].deadline!));
  verify(adapted.result.sessions,state,[adapted.task,tasks[1]]);
});
test("stuck creates an actual small restart session and progress consumes capacity",()=>{
  const state=openAfternoon(), tasks=[task("blocked",{remaining_minutes:45}),task("other",{priority:"low",remaining_minutes:90})];
  const adapted=adaptFromCheckIn(tasks,state,"blocked","Stuck",15,now);
  const first=adapted.result.sessions.find(s=>s.taskId==="blocked")!;
  assert.equal(first.kind,"restart");assert.equal((+new Date(first.end)-+new Date(first.start))/60000,15);
  const progress=adaptFromCheckIn(tasks,state,"blocked","Making progress",30,now);
  const today=progress.result.sessions.filter(s=>new Date(s.start).getDate()===now.getDate());
  assert.ok(today.reduce((n,s)=>n+(+new Date(s.end)-+new Date(s.start))/60000,0)<=90);
  assert.equal(progress.task.remaining_minutes,15);
});
test("done reclaims time for other work, skip stays out of the replan",()=>{
  const state=openAfternoon(),tasks=[task("done-soon",{remaining_minutes:45,priority:"high"}),task("other",{remaining_minutes:45,priority:"low"})];
  state.sessions=plan(tasks,state,now,7,now).sessions;
  const old=state.sessions.find(s=>s.taskId==="other")!;
  const done=adaptFromCheckIn(tasks,state,"done-soon","Done",30,now);
  assert.equal(done.task.status,"done");assert.equal(done.result.sessions.some(s=>s.taskId==="done-soon"),false);
  assert.ok(+new Date(done.result.sessions.find(s=>s.taskId==="other")!.start)<+new Date(old.start));
  const skipped=adaptFromCheckIn(tasks,state,"done-soon","Skip for now",30,now);
  assert.equal(skipped.result.sessions.some(s=>s.taskId==="done-soon"),false);
});
test("old planning snapshots migrate and repeat plans keep session IDs stable",()=>{
  const state=openAfternoon();
  const old={...state,preferences:{workStart:"15:00",workEnd:"21:30",focusStart:"18:00",focusEnd:"20:00",capacity:180,session:45,pause:10,checkIns:true}};
  const migrated=planningSchema.parse(old);assert.equal(migrated.preferences.deepWorkEnd,"20:30");assert.equal(migrated.preferences.commitmentBuffer,10);
  const tasks=[task("stable",{remaining_minutes:90})];
  const first=plan(tasks,state,now,7,now);state.sessions=first.sessions;
  const repeated=plan(tasks,state,now,7,now);
  assert.deepEqual(repeated.sessions.map(s=>s.id),first.sessions.map(s=>s.id));assert.equal(repeated.changes.length,0);
  assert.equal(preferencesSchema.safeParse({...state.preferences,dailyBuffer:state.preferences.capacity}).success,false);
});

test("manual locks survive replanning and reserve their task minutes exactly once",()=>{
  const state=openAfternoon(), tasks=[task("kept",{remaining_minutes:90}),task("other",{remaining_minutes:45,priority:"high"})];
  const locked:Session={id:"kept-session",taskId:"kept",start:new Date(2026,9,27,16).toISOString(),end:new Date(2026,9,27,16,45).toISOString(),reason:"My choice",locked:true};
  state.sessions=[locked];const result=plan(tasks,state,now,7,now);
  assert.deepEqual(result.sessions.find(s=>s.id===locked.id),locked);
  assert.equal(result.sessions.filter(s=>s.taskId==="kept").reduce((n,s)=>n+(+new Date(s.end)-+new Date(s.start))/60000,0),90);
  verify(result.sessions,state,tasks);assert.equal(result.warnings.length,0);
});
test("a lock cannot override protected time, a deadline, or another locked session",()=>{
  const state=openAfternoon(), tasks=[task("kept",{remaining_minutes:45,deadline:new Date(2026,9,26,17).toISOString()})];
  state.sessions=[{id:"bad-lock",taskId:"kept",start:new Date(2026,9,26,17).toISOString(),end:new Date(2026,9,26,17,45).toISOString(),reason:"Old choice",locked:true}];
  let result=plan(tasks,state,now,1,now);assert.ok(result.warnings.some(w=>w.includes("deadline")));verify(result.sessions,state,tasks);
  state.fixed=[{id:"club",title:"Club",date:"2026-10-26",start:"15:00",end:"16:00",days:[]}];
  state.sessions[0]={...state.sessions[0],start:new Date(2026,9,26,15).toISOString(),end:new Date(2026,9,26,15,45).toISOString()};
  result=plan(tasks,state,now,1,now);assert.ok(result.warnings.some(w=>w.includes("protected")));verify(result.sessions,state,tasks);
  state.fixed=[];state.sessions.push({...state.sessions[0],id:"duplicate-lock"});
  result=plan(tasks,state,now,1,now);assert.equal(result.sessions.filter(s=>s.locked).length,1);
});
test("progress trims an oversized future lock, and skip releases it",()=>{
  const state=openAfternoon(), tasks=[task("kept",{remaining_minutes:60})];
  state.sessions=[{id:"kept-session",taskId:"kept",start:new Date(2026,9,26,16).toISOString(),end:new Date(2026,9,26,17).toISOString(),reason:"My choice",locked:true}];
  const progress=adaptFromCheckIn(tasks,state,"kept","Making progress",45,now);
  assert.equal(progress.task.remaining_minutes,15);
  const kept=progress.result.sessions.find(s=>s.id==="kept-session")!;assert.equal((+new Date(kept.end)-+new Date(kept.start))/60000,15);assert.ok(progress.result.warnings.some(w=>w.includes("Shortened")));
  assert.equal(adaptFromCheckIn(tasks,state,"kept","Skip for now",0,now).result.sessions.length,0);
});
test("planning pace and unspecified energy both influence scheduling",()=>{
  const state=openAfternoon();state.preferences.workEnd="22:00";state.preferences.capacity=180;state.preferences.dailyBuffer=15;
  const tasks=[task("pace",{energy_level:"low",remaining_minutes:300})];
  const balanced=plan(tasks,state,now,1,now);state.preferences.pace="gentle";
  const gentle=plan(tasks,state,now,1,now);
  const sum=(rows:Session[])=>rows.reduce((n,s)=>n+(+new Date(s.end)-+new Date(s.start))/60000,0);
  assert.ok(sum(gentle.sessions)<sum(balanced.sessions));assert.ok(gentle.sessions.every(s=>(+new Date(s.end)-+new Date(s.start))/60000<=35));
  assert.ok(planningLimits(state.preferences).pause>=15);
  const night=new Date(2026,9,26,20,30);state.preferences.pace="balanced";state.preferences.defaultEnergy="high";
  assert.equal(plan([task("unspecified",{energy_level:null})],state,night,1,night).sessions.length,0);
  state.preferences.defaultEnergy="low";assert.ok(plan([task("unspecified",{energy_level:null})],state,night,1,night).sessions.length>0);
});
test("identical inputs and reordered task arrays produce identical plans",()=>{
  const state=openAfternoon(), tasks=[task("b",{remaining_minutes:45}),task("a",{remaining_minutes:30})];
  assert.deepEqual(plan(tasks,state,now,7,now),plan([...tasks].reverse(),state,now,7,now));
});
test("completed ongoing work is archived and cannot block the next plan",()=>{
  const state=openAfternoon(), at=new Date(2026,9,26,15,20),tasks=[task("finish",{remaining_minutes:45}),task("next",{remaining_minutes:30})];
  state.sessions=[{id:"active-finish",taskId:"finish",start:new Date(2026,9,26,15).toISOString(),end:new Date(2026,9,26,15,45).toISOString(),reason:"Working",locked:true}];
  const done=adaptFromCheckIn(tasks,state,"finish","Done",0,at);
  const archive=done.result.sessions.find(s=>s.id==="active-finish")!;
  assert.equal(archive.completed,true);assert.equal(archive.end,at.toISOString());assert.equal(archive.locked,false);
  assert.ok(done.result.sessions.some(s=>s.taskId==="next"));
});
test("partial days, DST-adjacent weekends, and invalid fixed dates are handled",()=>{
  const state=defaults(), late=new Date(2026,9,31,17,45),tasks=[task("weekend",{energy_level:"low",remaining_minutes:90})];
  const result=plan(tasks,state,late,3,late);
  assert.ok(result.sessions.every(s=>+new Date(s.start)>+late));assert.ok(result.sessions.some(s=>new Date(s.start).getDate()===1));
  assert.equal(fixedSchema.safeParse({id:"bad",title:"Bad date",date:"2026-02-31",start:"15:00",end:"16:00",days:[]}).success,false);
});

test("skipped work stays out of subsequent adaptive plans until explicitly resumed",()=>{
  const state=openAfternoon(),tasks=[task("later",{remaining_minutes:45}),task("now",{remaining_minutes:45})];
  const skipped=adaptFromCheckIn(tasks,state,"later","Skip for now",0,now);
  const another=adaptFromCheckIn(tasks,skipped.state,"now","Need more time",15,now);
  assert.equal(another.result.sessions.some(s=>s.taskId==="later"),false);assert.deepEqual(another.state.skipped,["later"]);
  const resumed=plan(tasks,{...another.state,skipped:[]},now,7,now);
  assert.ok(resumed.sessions.some(s=>s.taskId==="later"));
});

test("completing a session does not reset the day's available focus capacity",()=>{
  const state=openAfternoon(),at=new Date(2026,9,26,16),tasks=[task("finished",{remaining_minutes:45}),task("later",{remaining_minutes:120,energy_level:"low"})];
  state.sessions=[{id:"spent",taskId:"finished",start:new Date(2026,9,26,15).toISOString(),end:new Date(2026,9,26,15,45).toISOString(),reason:"Study"}];
  const completed=adaptFromCheckIn(tasks,state,"finished","Done",0,at);
  const today=completed.result.sessions.filter(s=>s.taskId==="later" && new Date(s.start).getDate()===at.getDate());
  assert.ok(today.reduce((n,s)=>n+(+new Date(s.end)-+new Date(s.start))/60000,0)<=75);
});
test("confirmed progress and completed sessions never count the same work twice",()=>{
  const state=openAfternoon(),at=new Date(2026,9,26,16);
  state.sessions=[{id:"spent",taskId:"finished",start:new Date(2026,9,26,15).toISOString(),end:new Date(2026,9,26,15,45).toISOString(),reason:"Study",completed:true}];
  state.history=[{id:"progress",taskId:"finished",title:"Finished",response:"Making progress",minutes:30,at:at.toISOString()}];
  const result=plan([task("finished",{status:"done",remaining_minutes:0}),task("later",{remaining_minutes:75,energy_level:"low"})],state,at,1,at);
  assert.equal(result.unplaced.length,0);
});
test("per-commitment recovery protects time after sport in planning and manual moves",()=>{
  const state=openAfternoon();state.preferences.workEnd="21:00";
  state.fixed=[{id:"sports",title:"Sport",date:"2026-10-26",start:"16:00",end:"18:00",days:[],recovery_minutes:45}];
  const tasks=[task("work",{remaining_minutes:120})],result=plan(tasks,state,now,1,now);
  assert.ok(result.sessions.every(s=>+new Date(s.end)<=+new Date(2026,9,26,16) || +new Date(s.start)>=+new Date(2026,9,26,18,45)));
  const move={id:"move",taskId:"work",start:new Date(2026,9,26,18,15).toISOString(),end:new Date(2026,9,26,18,45).toISOString(),reason:"Move"};
  assert.match(moveProblem(move,[],state.fixed,state.preferences,tasks[0],now)!,/recovery/);
});

test("progress outside a planned session and later completed work consume separate capacity",()=>{
  const state=openAfternoon(),at=new Date(2026,9,26,16);
  state.history=[{id:"earlier",taskId:"finished",title:"Finished",response:"Making progress",minutes:30,at:new Date(2026,9,26,14).toISOString(),covered_session_ids:[]}];
  state.sessions=[{id:"later-work",taskId:"finished",start:new Date(2026,9,26,15).toISOString(),end:new Date(2026,9,26,15,45).toISOString(),reason:"Study",completed:true}];
  const result=plan([task("finished",{remaining_minutes:0,status:"done"}),task("next",{remaining_minutes:90,energy_level:"low"})],state,at,1,at);
  assert.equal(result.sessions.filter(s=>s.taskId==="next").reduce((n,s)=>n+(+new Date(s.end)-+new Date(s.start))/60000,0),45);
});
test("session-linked progress credits are bounded by the completed session duration",()=>{
  const state=openAfternoon(),at=new Date(2026,9,26,16);
  state.sessions=[{id:"session",taskId:"finished",start:new Date(2026,9,26,15).toISOString(),end:new Date(2026,9,26,15,45).toISOString(),reason:"Study",completed:true}];
  state.history=[{id:"progress",taskId:"finished",title:"Finished",response:"Making progress",minutes:60,at:at.toISOString(),covered_session_ids:["session"]}];
  const result=plan([task("finished",{remaining_minutes:0,status:"done"}),task("next",{remaining_minutes:90,energy_level:"low"})],state,at,1,at);
  assert.equal(result.sessions.filter(s=>s.taskId==="next").reduce((n,s)=>n+(+new Date(s.end)-+new Date(s.start))/60000,0),60);
});

test("an active progress check-in keeps the reported portion visible and replans the remainder",()=>{
  const state=openAfternoon(),at=new Date(2026,9,26,15,20),tasks=[task("working",{remaining_minutes:90})];
  state.sessions=[{id:"active",taskId:"working",start:new Date(2026,9,26,15).toISOString(),end:new Date(2026,9,26,15,45).toISOString(),reason:"Work"}];
  const progress=adaptFromCheckIn(tasks,state,"working","Making progress",10,at);
  const logged=progress.result.sessions.find(s=>s.completed)!;
  assert.equal(logged.start,new Date(2026,9,26,15,10).toISOString());assert.equal(logged.end,at.toISOString());
  assert.equal(progress.task.remaining_minutes,80);
  assert.ok(progress.state.history[0].covered_session_ids?.includes(logged.id));
  assert.equal(new Set(progress.result.sessions.map(s=>s.id)).size,progress.result.sessions.length);
  assert.ok(progress.result.sessions.filter(s=>!s.completed).every(s=>+new Date(s.start)>+at));
});

test("trimming the visible check-in history never restores already-used daily capacity",()=>{
  let state=openAfternoon();state.preferences.capacity=360;state.preferences.workEnd="22:00";
  let current=task("frequent",{remaining_minutes:1000,energy_level:"low"});
  for(let i=0;i<60;i++){const check=adaptFromCheckIn([current],state,current.id,"Making progress",5,now);current=check.task;state=check.state;}
  assert.equal(state.history.length,50);assert.equal(state.work_records?.length,60);
  const today=state.sessions.filter(s=>new Date(s.start).getDate()===now.getDate() && !s.completed);
  assert.ok(today.reduce((n,s)=>n+(+new Date(s.end)-+new Date(s.start))/60000,0)<=60);
});

test("overload diagnostics distinguish protected commitments from exhausted capacity",()=>{
  const state=openAfternoon();state.fixed=[{id:"busy",title:"Family time",date:"2026-10-26",start:"15:00",end:"18:00",days:[]}];
  const blocked=plan([task("work")],state,now,1,now);
  assert.equal(blocked.unplaced[0].cause,"protected");assert.equal(blocked.sessions.length,0);
  state.fixed=[];state.history=[{id:"spent",taskId:"work",title:"Work",response:"Making progress",minutes:120,at:now.toISOString()}];
  const full=plan([task("work")],state,now,1,now);
  assert.equal(full.unplaced[0].cause,"capacity");assert.equal(full.sessions.length,0);
});
test("closed focus windows and excluded study days receive different explanations",()=>{
  const state=openAfternoon();state.preferences.workStart="20:30";state.preferences.workEnd="22:00";
  const late=plan([task("deep")],state,now,1,now);
  assert.equal(late.unplaced[0].cause,"focus");
  state.preferences.studyDays=[2];const unavailable=plan([task("deep")],state,now,1,now);
  assert.equal(unavailable.unplaced[0].cause,"availability");
});

test("a flexible tonight deadline does not consume the only usable deep-work window",()=>{
  const state=openAfternoon();Object.assign(state.preferences,{workStart:"18:00",workEnd:"21:00",focusStart:"18:00",focusEnd:"19:00",deepWorkEnd:"19:00",capacity:120});
  const tasks=[task("light-tonight",{remaining_minutes:60,priority:"low",energy_level:"low",deadline:new Date(2026,9,26,21).toISOString()}),task("deep",{remaining_minutes:45,priority:"high",energy_level:"high"})];
  const result=plan(tasks,state,now,1,now);
  assert.equal(result.unplaced.length,0);
  const deep=result.sessions.find(s=>s.taskId==="deep")!;
  assert.ok(+new Date(deep.end)<=+new Date(2026,9,26,19));
  assert.ok(result.sessions.filter(s=>s.taskId==="light-tonight").every(s=>s.end<=tasks[0].deadline!));
  verify(result.sessions,state,tasks);
});


test("deadline ordering protects the last deep-work window before flexible work",()=>{
 const state=defaults();state.fixed=[];Object.assign(state.preferences,{workStart:"15:00",workEnd:"17:00",focusStart:"15:00",focusEnd:"17:00",deepWorkEnd:"16:00",capacity:180,dailyBuffer:0,pause:10,session:45});
 for(const minute of [0,-10]){
  const tasks=[task("flexible",{remaining_minutes:45,priority:"high",energy_level:"low",deadline:new Date(2026,9,26,17,minute).toISOString()}),task("deep",{remaining_minutes:45,priority:"medium",energy_level:"high",deadline:new Date(2026,9,26,17).toISOString()})];
  const result=plan(tasks,state,now,1,now);verify(result.sessions,state,tasks);
  assert.deepEqual(result.unplaced,[],"both deadlines fit when deep work uses the earlier window");
  assert.equal(result.sessions[0].taskId,"deep");
 }
});


test("an ongoing session is shortened when a changed deadline removes its remaining window",()=>{
 const state=defaults(),at=new Date(2026,9,26,15,15);state.fixed=[];
 const tasks=[task("active-deadline",{remaining_minutes:60,deadline:new Date(2026,9,26,15,30).toISOString()})];
 state.sessions=[{id:"underway",taskId:tasks[0].id,start:new Date(2026,9,26,15).toISOString(),end:new Date(2026,9,26,16).toISOString(),reason:"Already underway"}];
 const result=plan(tasks,state,at,1,at);
 assert.ok(result.sessions.every(s=>Date.parse(s.end)<=Date.parse(tasks[0].deadline!)));
 assert.equal(result.sessions.find(s=>s.id==="underway")?.end,tasks[0].deadline);
 assert.equal(result.unplaced[0]?.minutes,30);
});

test("a deadline that has passed cannot retain an ongoing future reservation",()=>{
 const state=defaults(),at=new Date(2026,9,26,15,30);state.fixed=[];
 const tasks=[task("expired-active",{remaining_minutes:60,deadline:new Date(2026,9,26,15,20).toISOString()})];
 state.sessions=[{id:"underway",taskId:tasks[0].id,start:new Date(2026,9,26,15).toISOString(),end:new Date(2026,9,26,16).toISOString(),reason:"Already underway"}];
 const result=plan(tasks,state,at,1,at);assert.ok(result.sessions.every(s=>Date.parse(s.end)<=+at));
 assert.equal(result.unplaced[0]?.minutes,60);assert.equal(result.unplaced[0]?.cause,"deadline");
});


test("new commitment recovery also releases an ongoing session inside the buffer",()=>{
 const state=defaults(),at=new Date(2026,9,27,18,15),tasks=[task("recovery-active",{remaining_minutes:45})];
 state.sessions=[{id:"underway",taskId:tasks[0].id,start:new Date(2026,9,27,18,10).toISOString(),end:new Date(2026,9,27,18,55).toISOString(),reason:"Already underway"}];
 const result=plan(tasks,state,at,1,at);
 assert.equal(result.sessions.some(s=>s.id==="underway" && s.start===state.sessions[0].start),false);
 assert.ok(result.sessions.every(s=>Date.parse(s.start)>=+new Date(2026,9,27,18,30)));
 assert.equal(result.unplaced.length,0);
});
