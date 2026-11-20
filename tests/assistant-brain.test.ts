import {test} from "node:test";
import assert from "node:assert/strict";
import {brainContext,modelDrafts,taskEdits,validateModelReply,checkReviewedEdits,combineModelStages,type ModelReply} from "../src/lib/assistant-brain";
import {modelMessages,isPlanExplanation,isExploratoryConversation,isExplicitNewTask,needsProgressClarification} from "../src/lib/model-messages";
import {localModelAllowed} from "../src/lib/local-model";
import {defaults} from "../src/lib/scheduling";
import type {Task} from "../src/lib/types";
const now=new Date(2026,10,18,15),task:Task={id:"essay-1",title:"English essay",subject:"English",description:"PRIVATE NOTE: do not send",deadline:null,estimated_minutes:60,remaining_minutes:60,priority:"medium",energy_level:"high",status:"not_started",user_id:"local-demo",actual_minutes:0,created_at:now.toISOString(),updated_at:now.toISOString()};
const empty=():ModelReply=>({reply:"Let's review this.",kind:"none",tasks:[],events:[],edits:[],progress:[]});
test('an unambiguous combined ISO model date is separated without guessing ambiguous or conflicting values',()=>{
 const proposal={reply:'Review this task.',tasks:[{title:'Museum essay',subject:'History',minutes:25,priority:'medium',energy:'low',dueDate:'2026-11-21,17:00',dueTime:null}],events:[]};
 const parsed=combineModelStages({kind:'capture'},proposal);assert.equal(parsed.tasks[0].dueDate,'2026-11-21');assert.equal(parsed.tasks[0].dueTime,'17:00');
 for(const date of ['11/21/2026','2026-02-30,17:00','2026-11-21,25:00'])assert.throws(()=>combineModelStages({kind:'capture'},{...proposal,tasks:[{...proposal.tasks[0],dueDate:date}]}));
 assert.throws(()=>combineModelStages({kind:'capture'},{...proposal,tasks:[{...proposal.tasks[0],dueTime:'18:00'}]}));
});
test('explicit new assignments with supplied durations cannot be confused with editing saved work',()=>{
 const request=(content:string)=>({persona:{name:'Sol',tone:'calm' as const},context:brainContext([task],defaults(),[],[],now),messages:[{role:'user' as const,content}]});
 assert.equal(isExplicitNewTask(request('Please add a new task: outline a museum essay. It will take 25 minutes and is due tomorrow at 5pm.')),true);
 for(const text of ['Change the English essay to 25 minutes.','Maybe add a new task for 25 minutes.','Add a new task: write an essay.'])assert.equal(isExplicitNewTask(request(text)),false);
 const context=modelMessages(request('What is next?'),false,undefined,true)[0].content;assert.match(context,/English essay/);assert.doesNotMatch(context,/remaining_minutes/);
});
test('exploratory support stays conversational even with saved assignments, while concrete actions remain available',()=>{
 const request=(content:string)=>({persona:{name:'Sol',tone:'calm' as const},context:brainContext([task],defaults(),[],[],now),messages:[{role:'user' as const,content}]});
 for(const text of ['I feel overwhelmed with homework. Can we talk through where to start?','I do not know where to start.','Could you help me think through my priorities?']){
  const input=request(text);assert.equal(isExploratoryConversation(input),true);assert.match(modelMessages(input,false,'none')[0].content,/EXPLORATORY CONVERSATION/);
 }
 for(const text of ['I am overwhelmed. Add a math worksheet for 30 minutes.','I am overwhelmed; plan my day.','I finished the English essay.'])assert.equal(isExploratoryConversation(request(text)),false);
});
test("model responses cannot reference unknown tasks, mixed actions, or invalid progress",()=>{assert.throws(()=>validateModelReply({...empty(),kind:"progress",progress:[{taskId:"made-up",response:"Done",minutes:0}]},[task]),/identify/);assert.throws(()=>validateModelReply({...empty(),kind:"none",progress:[{taskId:task.id,response:"Done",minutes:0}]},[task]),/mixed/);assert.throws(()=>validateModelReply({...empty(),kind:"progress",progress:[{taskId:task.id,response:"Need more time",minutes:0}]},[task]),/five minutes/);assert.throws(()=>validateModelReply({...empty(),kind:"edit"},[task]),/incomplete/);});
test("draft conversion keeps explicit local deadlines and never changes source tasks",()=>{const response=validateModelReply({...empty(),kind:"capture",tasks:[{title:"Study biology",subject:"Biology",minutes:45,priority:"high",energy:"high",dueDate:"2026-11-19",dueTime:"09:00"}],events:[{title:"Soccer",date:"2026-11-18",start:"16:00",end:"18:00"}]},[task]);const before=JSON.stringify(task),draft=modelDrafts(response,"original words");assert.equal(new Date(draft.tasks[0].deadline!).getHours(),9);assert.equal(draft.tasks[0].remaining_minutes,45);assert.equal(draft.events[0].end,"18:00");assert.equal(JSON.stringify(task),before);});
test("date/time uncertainty and invalid clocks are rejected before saving",()=>{assert.throws(()=>validateModelReply({...empty(),kind:"capture",tasks:[{title:"Study",subject:"Math",minutes:30,priority:"medium",energy:null,dueDate:null,dueTime:"09:00"}]},[]),/confirm a date/);assert.throws(()=>validateModelReply({...empty(),kind:"capture",events:[{title:"Club",date:"2026-02-30",start:"16:00",end:"18:00"}]},[]));assert.throws(()=>taskEdits({...empty(),kind:"edit",edits:[{taskId:task.id,field:"deadline",value:"2026-11-20T28:00"}]},[task]),/real date and time/);});
test("reviewed corrections combine only approved fields and preserve private notes",()=>{const result=taskEdits({...empty(),kind:"edit",edits:[{taskId:task.id,field:"deadline",value:"2026-11-20T17:00"},{taskId:task.id,field:"remaining_minutes",value:"40"}]},[task]);assert.equal(result.length,1);assert.equal(result[0].before.remaining_minutes,60);assert.equal(result[0].after.remaining_minutes,40);assert.equal(new Date(result[0].after.deadline!).getHours(),17);assert.equal(result[0].after.description,task.description);assert.equal(task.remaining_minutes,60);});
test("stale saved-task edits fail closed and retrying an already saved edit is safe",()=>{const [edit]=taskEdits({...empty(),kind:"edit",edits:[{taskId:task.id,field:"remaining_minutes",value:"40"}]},[task]);assert.doesNotThrow(()=>checkReviewedEdits([task],[edit]));assert.doesNotThrow(()=>checkReviewedEdits([{...task,...edit.after}],[edit]));assert.throws(()=>checkReviewedEdits([{...task,remaining_minutes:55}],[edit]),/changed/);assert.throws(()=>checkReviewedEdits([],[edit]),/deleted/);assert.throws(()=>checkReviewedEdits([task],[edit,edit]),/duplicate/);});
test("model context excludes notes and clearly counts omitted saved tasks",()=>{const tasks=Array.from({length:60},(_,i)=>({...task,id:"task-"+i})),context=brainContext(tasks,defaults(),[],[],now);assert.equal(context.includes("PRIVATE NOTE"),false);assert.equal(context.includes("user_id"),false);const data=JSON.parse(context);assert.equal(data.tasks.length,45);assert.equal(data.omittedTasks,15);});
test("bounded model messages preserve the latest user request and valid context JSON",()=>{const request={persona:{name:"Sol",tone:"calm" as const},messages:[{role:"user" as const,content:"What should I do next?"}],context:brainContext(Array.from({length:45},(_,i)=>({...task,id:"task-"+i})),defaults(),[],[],now)};const messages=modelMessages(request,true);assert.equal(messages.at(-1)?.content,request.messages[0].content);assert.ok(messages[0].content.includes("omittedTasks"));assert.throws(()=>modelMessages({...request,messages:[{role:"user",content:"x".repeat(2100)}]},true),/shorter/);});
test("deployed or remote app URLs never enable the server's loopback model service",()=>{assert.equal(localModelAllowed("https://daylightv50.vercel.app/api/assistant"),false);const previous=process.env.VERCEL;try{process.env.VERCEL="1";assert.equal(localModelAllowed("http://localhost/api/assistant"),false);}finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}});

test("literal day cues are anchored to each item's sentence instead of a model date guess",()=>{const result={reply:'Review this',kind:'capture' as const,tasks:[{title:'Biology review',subject:'Biology',minutes:45,priority:'high' as const,energy:'high' as const,dueDate:'2026-11-20',dueTime:'09:00'}],events:[{title:'Soccer',date:'2026-11-19',start:'16:00',end:'18:00'}],edits:[],progress:[]};const drafts=modelDrafts(result,'Tomorrow at 9am I have a biology quiz. Soccer is 4-6pm today.',now);assert.equal(new Date(drafts.tasks[0].deadline!).getDate(),19);assert.equal(drafts.events[0].date,'2026-11-18');});
test("ambiguous or negated day cues do not silently overwrite a model proposal",()=>{const response={reply:'Review',kind:'capture' as const,tasks:[],events:[{title:'Soccer',date:'2026-11-20',start:'16:00',end:'18:00'}],edits:[],progress:[]};assert.equal(modelDrafts(response,'Soccer is not today.',now).events[0].date,'2026-11-20');assert.equal(modelDrafts(response,'Soccer today or tomorrow, not sure.',now).events[0].date,'2026-11-20');});

test("context retrieval brings an older mentioned task into a bounded model window",()=>{const tasks=Array.from({length:70},(_,i)=>({...task,id:"task-"+i,title:"Other assignment "+i,subject:"Math"}));tasks.push({...task,id:"older-essay"});const context=JSON.parse(brainContext(tasks,defaults(),[],[],now,[],"Actually change my English essay to Friday"));assert.equal(context.tasks[0].id,"older-essay");assert.equal(context.tasks.length,45);assert.equal(context.omittedTasks,26);});

test("schedule explanations cannot route into edits while explicit requests still can",()=>{
 const request={persona:{name:"Sol",tone:"calm" as const},context:brainContext([task],defaults(),[],[],now),messages:[{role:"user" as const,content:"Why is my English essay at 6:30 instead of during soccer?"}]};
 assert.equal(isPlanExplanation(request),true);
 assert.equal(isPlanExplanation({...request,messages:[{role:"user",content:"Change the English essay deadline to Friday"}]}),false);
});
test("short clarification answers retain the original task and assistant question",()=>{
 const request={persona:{name:"Sol",tone:"calm" as const},context:brainContext([],defaults(),[],[],now),messages:[{role:"user" as const,content:"I need to work on my history essay"},{role:"assistant" as const,content:"How long will it need, and when is it due?"},{role:"user" as const,content:"45 minutes, Friday"}]};
 const messages=modelMessages(request,false,"capture");
 assert.deepEqual(messages.slice(1),request.messages);
 assert.ok(messages[0].content.includes("conversation"));
});
test("a single resolved task grounds a short deadline answer even when the model guessed a wrong day",()=>{
 const response={...empty(),kind:'capture' as const,tasks:[{title:'History essay',subject:'History',minutes:45,priority:'medium' as const,energy:null,dueDate:'2026-11-19',dueTime:'17:00'}]};
 const draft=modelDrafts(response,'About 45 minutes. Friday at 5pm.',now);
 assert.equal(new Date(draft.tasks[0].deadline!).getDate(),20);
 assert.equal(new Date(draft.tasks[0].deadline!).getHours(),17);
});
test("hypothetical schedule questions remain read-only and negated ISO dates do not override drafts",()=>{
 const request={persona:{name:'Sol',tone:'calm' as const},context:brainContext([task],defaults(),[],[],now),messages:[{role:'user' as const,content:'What if I skip the English essay today?'}]};
 assert.equal(isPlanExplanation(request),true);
 const response={...empty(),kind:'capture' as const,events:[{title:'Soccer',date:'2026-11-20',start:'16:00',end:'18:00'}]};
 assert.equal(modelDrafts(response,'Soccer is not due 2026-11-19.',now).events[0].date,'2026-11-20');
});

test("explanations retain actual sessions, commitments and preferences in the model context",()=>{
 const state=defaults();state.fixed.push({id:"soccer",title:"Soccer practice",date:"2026-11-18",start:"16:00",end:"18:00",days:[],recovery_minutes:30});state.sessions=[{id:"essay-session",taskId:task.id,start:new Date(2026,10,18,18,30).toISOString(),end:new Date(2026,10,18,19,15).toISOString(),reason:"After soccer recovery"}];
 const request={persona:{name:"Sol",tone:"calm" as const},context:brainContext([task],state,[],[],now),messages:[{role:"user" as const,content:"Why is my essay after soccer?"}]};
 const prompt=modelMessages(request,false,"none")[0].content;
 assert.ok(prompt.includes("Soccer practice"));assert.ok(prompt.includes("After soccer recovery"));assert.ok(prompt.includes('"preferences"'));
});

test("vague progress needs a target and a supplied duration while natural duration words are accepted",()=>{
 const request={persona:{name:'Sol',tone:'calm' as const},context:brainContext([task,{...task,id:'math-two',title:'Math worksheet',subject:'Math'}],defaults(),[],[],now),messages:[{role:'user' as const,content:'I need more time.'}]};
 assert.equal(needsProgressClarification(request),true);
 assert.equal(needsProgressClarification({...request,messages:[{role:'user',content:'I need more time on my English essay.'}]}),true);
 assert.equal(needsProgressClarification({...request,messages:[{role:'user',content:'I need half an hour more time on my English essay.'}]}),false);
 assert.equal(needsProgressClarification({...request,messages:[{role:'user',content:'I finished my English essay.'}]}),false);
});
