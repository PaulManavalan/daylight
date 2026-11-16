import {test} from "node:test";
import assert from "node:assert/strict";
import {dailyAgenda} from "../src/lib/agenda";
import {defaults} from "../src/lib/scheduling";
import type {Task} from "../src/lib/types";
const now=new Date(2026,9,27,18,15);
const task=(id:string):Task=>({id,user_id:"demo",title:id,subject:"School",description:"",deadline:null,estimated_minutes:45,remaining_minutes:45,priority:"high",energy_level:"high",status:"not_started",actual_minutes:0,created_at:now.toISOString(),updated_at:now.toISOString()});
const session=(id:string,taskId:string,start:number,end:number)=>({id,taskId,start:new Date(2026,9,27,start).toISOString(),end:new Date(2026,9,27,end).toISOString(),reason:"Planned"});
test("Today's agenda includes planned work regardless of deadline and ongoing recovery",()=>{
 const state=defaults();state.sessions=[session("later","undated",19,20)];
 const agenda=dailyAgenda([task("undated")],state,now);
 assert.equal(agenda.focusedMinutes,60);assert.ok(agenda.entries.some(e=>e.taskId==="undated"));
 assert.ok(agenda.entries.some(e=>e.kind==="recovery" && e.title.includes("Soccer")));assert.equal(agenda.earlier.length,0);
});
test("completed and set-aside sessions stay out of the actionable daily agenda",()=>{
 const state=defaults();state.skipped=["skip"];state.sessions=[session("a","done",19,20),session("b","skip",19,20),{...session("c","logged",17,18),completed:true}];
 const agenda=dailyAgenda([{...task("done"),status:"done",remaining_minutes:0},task("skip"),task("logged")],state,now);
 assert.equal(agenda.entries.some(e=>e.kind==="study"),false);assert.equal(agenda.earlier.length,0);assert.equal(agenda.focusedMinutes,0);
});
test("ongoing work counts only future minutes and earlier unconfirmed sessions are reviewable",()=>{
 const state=defaults();state.fixed=[];state.sessions=[session("a","active",18,19),session("b","earlier",15,16),session("c","earlier",16,17)];
 const agenda=dailyAgenda([task("active"),task("earlier")],state,now);
 assert.equal(agenda.focusedMinutes,45);assert.deepEqual(agenda.earlier,["earlier"]);assert.equal(agenda.entries[0].taskId,"active");
});
