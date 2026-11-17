import {test} from "node:test";
import assert from "node:assert/strict";
import {taskDrafts,eventDrafts,subjectList,sameTask,protectedDraft} from "../src/lib/planning-conversation";
const now=new Date(2026,10,16,14);
test("subjects are collected conversationally without duplicate questions",()=>{
 assert.deepEqual(subjectList("I have Math, English and math"),["math","English"]);
 assert.throws(()=>subjectList(Array.from({length:13},(_,i)=>"Course"+i).join(",")),/12/);
});
test("several assignments capture estimates and relative deadlines from one reply",()=>{
 const rows=taskDrafts("Worksheet 30 min due tomorrow; study for exam 1.5 hours due Friday","Math",now);
 assert.equal(rows.length,2);assert.equal(rows[0].title,"Worksheet");assert.equal(rows[0].remaining_minutes,30);
 assert.equal(new Date(rows[0].deadline!).getDate(),17);assert.equal(rows[1].estimated_minutes,90);
 assert.equal(rows[1].priority,"high");assert.equal(rows[1].energy_level,"high");assert.equal(new Date(rows[1].deadline!).getDay(),5);
});
test("unclear deadlines remain unset and original wording is retained for review",()=>{
 const [row]=taskDrafts("Read chapter 8 due next week","English",now);
 assert.equal(row.deadline,null);assert.equal(row.estimated_minutes,30);assert.equal(row.description,"Read chapter 8 due next week");
 assert.deepEqual(taskDrafts("no homework","English",now),[]);
});
test("after-school ranges infer a shared suffix but ambiguous clocks need clarification",()=>{
 const rows=eventDrafts("Soccer 4–6pm; dinner 7-7:30pm; shift 16:00-18:00; club 4-6; brunch 11-1pm",now);
 assert.deepEqual(rows.map(r=>[r.start,r.end]),[["16:00","18:00"],["19:00","19:30"],["16:00","18:00"],["",""],["",""]]);
 assert.throws(()=>protectedDraft(rows[3]));assert.equal(protectedDraft(rows[0]).days.length,0);
});
test("event dates and overnight commitments use the selected local day",()=>{
 const [row]=eventDrafts("shift Friday 9pm-1am",now);
 assert.equal(row.date,"2026-11-20");assert.equal(row.start,"21:00");assert.equal(row.end,"01:00");assert.equal(protectedDraft(row).end,"01:00");
 assert.equal(eventDrafts("Soccer tomorrow 4-6pm",now)[0].date,"2026-11-17");
 assert.throws(()=>eventDrafts("event 2026-02-30 4-6pm",now),/date/);
});
test("invalid estimates and impossible dates never silently become saved tasks",()=>{
 assert.throws(()=>taskDrafts("Study 500 hours","Math",now));assert.throws(()=>taskDrafts("Worksheet due 2026-02-30","Math",now),/date/);
 assert.throws(()=>taskDrafts(Array.from({length:31},()=>"Homework").join(";"),"Math",now),/30/);
});
test("matching homework is recognized across case and surrounding whitespace",()=>{
 assert.equal(sameTask({title:" Essay ",subject:"ENGLISH"},{title:"essay",subject:"English"}),true);
 assert.equal(sameTask({title:"Essay",subject:"History"},{title:"Essay",subject:"English"}),false);
});

test("specific deadline clocks are retained while ambiguous times stay unset",()=>{
 const [row]=taskDrafts("Worksheet 30 min due tomorrow at 4:30pm","Math",now);assert.equal(new Date(row.deadline!).getHours(),16);assert.equal(new Date(row.deadline!).getMinutes(),30);assert.equal(row.title,"Worksheet");
 assert.equal(taskDrafts("Worksheet due tomorrow at 4","Math",now)[0].deadline,null);assert.equal(taskDrafts("Worksheet due tomorrow morning","Math",now)[0].deadline,null);
});
test("natural no-work replies do not create placeholder assignments",()=>{
 assert.deepEqual(taskDrafts("I have no homework today","English",now),[]);assert.deepEqual(taskDrafts("I don't have anything today","English",now),[]);assert.deepEqual(eventDrafts("nothing else",now),[]);
});
