import {test} from "node:test";
import assert from "node:assert/strict";
import {selectCheckInTask} from "../src/lib/check-ins";
import {defaults,type PlanningState} from "../src/lib/scheduling";
import type {Task} from "../src/lib/types";
const at=(hour:number,minute=0)=>new Date(2026,9,27,hour,minute);
const task:Task={id:"essay",user_id:"demo",title:"Essay",subject:"School",description:"",deadline:at(20).toISOString(),estimated_minutes:45,remaining_minutes:45,actual_minutes:0,priority:"high",energy_level:"high",status:"in_progress",created_at:at(12).toISOString(),updated_at:at(12).toISOString()};
function planned():PlanningState {const state=defaults();state.sessions=[{id:"work",taskId:task.id,start:at(18,30).toISOString(),end:at(19,15).toISOString(),reason:"Study"}];return state;}
test("suggestions respect school, sports recovery, and quiet hours",()=>{
 const state=planned();for(const now of [at(14,30),at(16,30),at(18,15),at(22)])assert.equal(selectCheckInTask([task],state,now),null);
 assert.equal(selectCheckInTask([task],state,at(19))?.id,task.id);
});
test("a study session gets a quiet start before any suggestion appears",()=>{
 const state=planned();assert.equal(selectCheckInTask([task],state,at(18,31)),null);assert.equal(selectCheckInTask([task],state,at(18,50))?.id,task.id);
});
test("deferred, completed, recently checked, or disabled tasks are not prompted",()=>{
 const state=planned();state.skipped=[task.id];assert.equal(selectCheckInTask([task],state,at(19)),null);
 state.skipped=[];assert.equal(selectCheckInTask([{...task,status:"done",remaining_minutes:0}],state,at(19)),null);
 state.history=[{id:"answer",taskId:task.id,title:task.title,response:"Need more time",minutes:15,at:at(18,45).toISOString()}];assert.equal(selectCheckInTask([task],state,at(19)),null);
 state.history=[];state.preferences.checkIns=false;assert.equal(selectCheckInTask([task],state,at(19)),null);
});
test("fresh unplanned work does not trigger a check-in before the first plan",()=>{
 assert.equal(selectCheckInTask([task],defaults(),at(19)),null);
});
test("a recent ended session is reviewable during the next available study window",()=>{
 assert.equal(selectCheckInTask([task],planned(),at(19,30))?.id,task.id);
});

test("recent progress outside the visible history still suppresses a repeated prompt",()=>{
 const state=planned();state.work_records=[{id:"older-visible-entry",taskId:task.id,title:task.title,response:"Making progress",minutes:10,at:at(18,45).toISOString(),covered_session_ids:[]}];
 assert.equal(selectCheckInTask([task],state,at(19)),null);
});
