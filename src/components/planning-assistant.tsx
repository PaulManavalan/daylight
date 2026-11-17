"use client";
import {z,ZodError} from "zod";
import {useEffect,useRef,useState} from "react";
import {Sparkles,Send,ArrowRight,Loader2} from "lucide-react";
import {Button} from "./ui/button";
import {AssistantAvatar} from "./assistant-avatar";
import {AssistantIdentity} from "./assistant-identity";
import {defaultPersona,loadPersona,toneLabels,voiceText,type AssistantPersona} from "@/lib/assistant-persona";
import {dailyAgenda} from "@/lib/agenda";
import {parseDayBrief,progressIntent} from "@/lib/day-assistant";
import {eventDrafts,nothing,protectedDraft,sameTask,subjectList,taskDrafts,type EventDraft} from "@/lib/planning-conversation";
import {taskInputSchema,type Task,type TaskInput} from "@/lib/types";
import {dateKey,type FixedBlock,type PlanningState,type Response} from "@/lib/scheduling";
type Message={role:"assistant"|"you";text:string};
interface Props {owner:string;onProgress:(taskId:string,response:Response,minutes:number)=>Promise<string>;onPreferences:()=>void;subjects:string[];tasks:Task[];planning:PlanningState|null;onBuild:(tasks:TaskInput[],fixed:FixedBlock[])=>Promise<void>}
const localDateTime=(iso:string)=>{const d=new Date(iso);return dateKey(d)+"T"+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
const welcome="Hey. Let's make a day that works for you. Tell me about school, homework, practice, work—whatever is on your plate. You can share it all at once, or I can walk you through it.";
const conversationSchema=z.object({day:z.string(),messages:z.array(z.object({role:z.enum(["assistant","you"]),text:z.string()})).max(200),subjects:z.array(z.string()),step:z.number().int(),drafts:z.array(taskInputSchema),events:z.array(z.object({id:z.string(),title:z.string(),date:z.string(),start:z.string(),end:z.string()})),finished:z.boolean()});
export function PlanningAssistant({owner,onProgress,onPreferences,subjects:known,tasks,planning,onBuild}:Props){
 const [persona,setPersona]=useState<AssistantPersona>(defaultPersona);
 const [messages,setMessages]=useState<Message[]>([{role:"assistant",text:voiceText(welcome,persona.tone)}]);
 const [subjects,setSubjects]=useState<string[]>([]),[step,setStep]=useState(-2),[answer,setAnswer]=useState("");
 const [drafts,setDrafts]=useState<TaskInput[]>([]),[events,setEvents]=useState<EventDraft[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[finished,setFinished]=useState(false);
 const [pendingProgress,setPendingProgress]=useState<ReturnType<typeof progressIntent>>(null);
 const [restored,setRestored]=useState(false);
 useEffect(()=>{let next={...defaultPersona};try{next=loadPersona(localStorage,owner);}catch{}setPersona(next);setMessages(rows=>rows.length===1?[{role:"assistant",text:voiceText(welcome,next.tone)}]:rows);},[owner]);
 useEffect(()=>{try{const raw=sessionStorage.getItem("daylight.conversation.v1."+owner);if(raw){const saved=conversationSchema.safeParse(JSON.parse(raw));if(saved.success && saved.data.day===dateKey(new Date())){const d=saved.data;setMessages(d.messages);setSubjects(d.subjects);setStep(d.step);setDrafts(d.drafts);setEvents(d.events);setFinished(d.finished);}}}catch{}setRestored(true);},[owner]);
 useEffect(()=>{if(!restored)return;try{const data=conversationSchema.safeParse({day:dateKey(new Date()),messages:messages.slice(-200),subjects,step,drafts,events,finished});if(data.success)sessionStorage.setItem("daylight.conversation.v1."+owner,JSON.stringify(data.data));}catch{}},[restored,owner,messages,subjects,step,drafts,events,finished]);
 const operation=useRef(false),last=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const review=step>=subjects.length+2 && step!==-1;
 useEffect(()=>{last.current?.parentElement?.scrollTo({top:last.current.parentElement.scrollHeight,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});},[messages.length,review]);
 async function reply(text:string){
  if(operation.current || (review && !finished) || !text.trim())return;
  try{
   if(step===-2 || finished){
    setPendingProgress(null);
    if(/^(thanks|thank you|okay|ok|cool|got it)[!. ]*$/i.test(text)){setAnswer("");setMessages(rows=>[...rows,{role:"you",text},{role:"assistant",text:voiceText("Anytime. I'm here when the day changes.",persona.tone)}]);return;}
    if(/what(?:[’']s| is) (?:next|my plan)|what do I have|how does my day look/i.test(text)){
      const agenda=planning?dailyAgenda(tasks,planning,new Date()):null;
      const summary=agenda?.entries.slice(0,5).map(e=>new Date(e.start).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})+" — "+e.title).join("\n");
      setAnswer("");setMessages(rows=>[...rows,{role:"you",text},{role:"assistant",text:voiceText(summary?"Here's what's ahead:\n"+summary+"\nYour full timeline is right here alongside us.":"No sessions are planned for the rest of today. Tell me what needs doing, or choose Rebalance my day to arrange your saved work.",persona.tone)}]);return;
    }
    if(/\b(tired|exhausted|overwhelmed)\b/i.test(text) && text.length<160){setAnswer("");setMessages(rows=>[...rows,{role:"you",text},{role:"assistant",text:voiceText("Let's make this feel lighter. Open Study preferences above to lower your daily focus allowance or choose Gentle pace, and I'll rebuild around it. You can also tell me to set a task aside. Fixed commitments, breaks and hard deadlines will stay protected.",persona.tone)}]);return;}
    const intent=progressIntent(text,tasks);
    if(intent){setAnswer("");setPendingProgress(intent);setMessages(rows=>[...rows,{role:"you",text},{role:"assistant",text:voiceText(intent.matches.length?`You said “${intent.response}”${intent.response==="Done" || intent.response==="Skip for now"?"":` · ${intent.minutes} minutes`}. Which task should we update? Pick it below and I’ll rebalance the remaining work.`:"There isn't a saved task to update yet. Tell me what you need to work on, and we'll make a plan first.",persona.tone)}]);return;}
    if(/^(?:plan (?:my |the )?day|plan around saved work|rebalance(?: my day)?|make (?:a |my )?plan)[.! ]*$/i.test(text)){
     operation.current=true;setBusy(true);setError("");setAnswer("");
     try{await onBuild([],[]);setFinished(true);setMessages(rows=>[...rows,{role:"you",text},{role:"assistant",text:voiceText("Your day is rebalanced. The timeline beside us has the new plan. If something couldn't fit, we'll keep it visible rather than crowding out your life.",persona.tone)}]);}finally{operation.current=false;setBusy(false);}return;
    }
    if(/^(walk me through(?: today)?|ask me questions|help me get started)[.! ]*$/i.test(text)){setStep(-1);setFinished(false);setMessages(rows=>[...rows,{role:"you",text},{role:"assistant",text:voiceText("What subjects do you have work for? Say their names, like Math, English and Biology. Or say ‘none’ to start with life outside school.",persona.tone)}]);setAnswer("");return;}
    const names=text.length<200 && !/[0-9;:\n]/.test(text)?subjectList(text):[];
    if(names.length>1 && names.every(name=>known.some(k=>k.toLowerCase()===name.toLowerCase()))){setSubjects(names);setStep(0);setFinished(false);setAnswer("");setMessages(rows=>[...rows,{role:"you",text},{role:"assistant",text:voiceText("What work do you have for "+names[0]+"? Tell me the assignments, rough estimates and deadlines. You can give several together, or say ‘none’.",persona.tone)}]);return;}
    const brief=parseDayBrief(text,known,new Date());setDrafts(brief.tasks);setEvents(brief.events);setFinished(false);setStep(subjects.length+2);setAnswer("");setError("");setMessages(rows=>[...rows,{role:"you",text},{role:"assistant",text:voiceText("I've pulled out the work and fixed plans. Check the details below—especially dates and any times I couldn't read confidently. Then I'll make room for everything.",persona.tone)}]);return;
   }
   let nextSubjects=subjects,nextStep=step+1;let response="";
   if(step===-1){nextSubjects=nothing(text)?[]:subjectList(text);setSubjects(nextSubjects);nextStep=0;}
   else if(step<subjects.length){const parsed=taskDrafts(text,subjects[step],new Date());setDrafts(rows=>[...rows,...parsed]);}
   else if(step===subjects.length){setEvents(eventDrafts(text,new Date()));}
   else {setDrafts(rows=>[...rows,...taskDrafts(text,"Personal",new Date())]);}
   if(nextStep<nextSubjects.length){const existing=tasks.filter(t=>t.subject.toLowerCase()===nextSubjects[nextStep].toLowerCase() && t.status!=="done");response=`What work do you have for ${nextSubjects[nextStep]}? Tell me the assignments, roughly how long they'll take, and when they're due.${existing.length?" I already have: "+existing.map(t=>t.title).join(", ")+". Only mention new work.":""} You can give me several, separated by semicolons, or say ‘none’.`;}
   else if(nextStep===nextSubjects.length)response="What happens after school—practice, a job shift, clubs, appointments, or family time? For example: ‘Soccer 4–6pm; dinner 7–7:30pm’. Your saved protected time stays in place. Say ‘none’ if there's nothing new.";
   else if(nextStep===nextSubjects.length+1)response="Anything outside school to make room for—chores, a personal project, applications, or work? Tell me everything in one message. For example: ‘Laundry 20 min; work on portfolio 45 min due Friday’. Or say ‘none’.";
   else response="Here's what I understood. Check my estimates and dates below, and fill in any event times I couldn't read confidently. Then I'll add everything and arrange your day around your saved commitments, breaks, and study preferences.";
   setMessages(rows=>[...rows,{role:"you",text},{role:"assistant",text:voiceText(response,persona.tone)}]);setStep(nextStep);setAnswer("");setError("");requestAnimationFrame(()=>input.current?.focus());
  }catch(e){setError(e instanceof ZodError?e.issues[0].message:e instanceof Error?e.message:"I couldn't read that. Try a shorter message.");}
 }
 function reset(){setStep(-2);setPendingProgress(null);setSubjects([]);setDrafts([]);setEvents([]);setMessages([{role:"assistant",text:voiceText(welcome,persona.tone)}]);setError("");setFinished(false);setAnswer("");}
 async function build(){
  if(operation.current)return;operation.current=true;setBusy(true);setError("");
  try{const validated=drafts.map(t=>taskInputSchema.parse(t));const fixed=events.map(protectedDraft);await onBuild(validated,fixed);setFinished(true);setPendingProgress(null);setMessages(rows=>[...rows,{role:"assistant",text:voiceText("Your day is ready. The timeline has updated without moving your fixed commitments. Come back here when plans change—tell me you need more time, made progress, or got stuck.",persona.tone)}]);}
  catch(e){setError((e instanceof ZodError?e.issues[0].message:e instanceof Error?e.message:"Could not save the plan.")+" Your draft is still here. Any tasks already saved will be kept; retrying skips matching tasks.");}
  finally{operation.current=false;setBusy(false);}
 }
 async function updateProgress(task:Task){
  if(!pendingProgress || operation.current)return;operation.current=true;setBusy(true);setError("");
  try{const summary=await onProgress(task.id,pendingProgress.response,pendingProgress.minutes);setMessages(rows=>[...rows,{role:"you",text:task.title},{role:"assistant",text:voiceText(summary,persona.tone)}]);setPendingProgress(null);setFinished(true);}
  catch(e){setError(e instanceof Error?e.message:"Could not update this task. Your previous plan is kept.");}
  finally{operation.current=false;setBusy(false);}
 }
 return <section className="planning-assistant" aria-label="Planning assistant"><AssistantIdentity owner={owner} persona={persona} busy={busy} onChange={next=>{setPersona(next);setMessages(rows=>rows.length===1 && step===-2?[{role:"assistant",text:voiceText(welcome,next.tone)}]:[...rows,{role:"assistant",text:"I'll keep things "+toneLabels[next.tone].toLowerCase()+". Your planning preferences and saved work stay as they are."}]);}}/>
 <div className="assistant-context"><span>School, work, and a life outside both.</span><button onClick={onPreferences}>Study preferences ↗</button></div>
 <div className="assistant-messages" role="log" aria-label="Planning conversation" aria-live="polite" aria-relevant="additions">{messages.map((m,i)=><div key={i} className={`assistant-message ${m.role=== "you"?"from-you":"from-daylight"}`}><small>{m.role==="assistant" && <AssistantAvatar variant={persona.avatar} size={22}/>} {m.role==="you"?"You":persona.name}</small><p>{m.text}</p></div>)}<div ref={last}/></div>
 {(!review || finished) && <><div className="assistant-suggestions">{(step===-2 || finished) && <><Button size="sm" variant="outline" disabled={busy} onClick={()=>void reply("Walk me through today")}>Help me get started</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void reply("Plan around saved work")}>Rebalance my day</Button></>}{(step===-1?known.slice(0,8):[]).map(s=><Button key={s} size="sm" variant="outline" onClick={()=>setAnswer(current=>current?current+", "+s:s)}>{s}</Button>)}{step===-1 && known.length>0 && <Button size="sm" variant="ghost" onClick={()=>reply(known.join(", "))}>Use my subjects</Button>}{step>=-1 && !finished && <Button size="sm" variant="ghost" onClick={()=>void reply("none")}>{step===-1?"Outside school only":"Nothing new here"}</Button>}</div>
 <form className="assistant-composer" onSubmit={e=>{e.preventDefault();reply(answer);}}><label className="sr-only" htmlFor="assistant-answer">Your reply</label><textarea disabled={busy} id="assistant-answer" ref={input} value={answer} maxLength={5000} rows={3} onChange={e=>setAnswer(e.target.value)} placeholder={step===-2 || finished?"Math: worksheet 30 min due tomorrow; soccer 4–6pm; laundry 20 min…":step===-1?"Math, English and Biology…":"Tell me what’s on your mind…"}/><Button type="submit" disabled={busy || !answer.trim()}>{busy?<Loader2 size={15} className="animate-spin"/>:<Send size={15}/>}Send</Button></form><p className="assistant-hint">Share a few things at once, separated by semicolons or new lines. Estimates and dates are always yours to adjust.</p></>}
 {pendingProgress && <div className="assistant-task-picks">{pendingProgress.matches.map(task=><Button variant="outline" size="sm" disabled={busy} key={task.id} onClick={()=>void updateProgress(task)}>{task.title}<small>{task.remaining_minutes}m left</small></Button>)}<Button variant="ghost" size="sm" disabled={busy} onClick={()=>setPendingProgress(null)}>Cancel update</Button></div>}
 {review && !finished && <div className="assistant-review"><h2>Your day, ready to review</h2><p>Estimates default to 30 minutes; day-only deadlines mean 11:59pm. Dates and estimates are editable. Nothing new is saved until you choose “Build my day”. Events apply once on their selected date; recurring commitments stay in Calendar.</p>
 {drafts.map((t,i)=><fieldset className="assistant-draft" key={i} disabled={busy}><legend>{t.subject}{tasks.some(existing=>existing.status!=="done" && sameTask(existing,t))?" · Already on your list; won't duplicate":""}</legend><label className="field">Task<input aria-label={`Task ${i+1} title`} value={t.title} maxLength={200} onChange={e=>setDrafts(rows=>rows.map((r,n)=>n===i?{...r,title:e.target.value}:r))}/></label><div className="form-pair"><label className="field">Subject<input value={t.subject} maxLength={80} onChange={e=>setDrafts(rows=>rows.map((r,n)=>n===i?{...r,subject:e.target.value}:r))}/></label><label className="field">Minutes<input type="number" min={5} max={1440} value={t.estimated_minutes} onChange={e=>setDrafts(rows=>rows.map((r,n)=>n===i?{...r,estimated_minutes:Number(e.target.value),remaining_minutes:Number(e.target.value)}:r))}/></label></div><div className="form-pair"><label className="field">Due date & time<input type="datetime-local" value={t.deadline?localDateTime(t.deadline):""} onChange={e=>{const deadline=e.target.value?new Date(e.target.value).toISOString():null;setDrafts(rows=>rows.map((r,n)=>n===i?{...r,deadline}:r));}}/></label><label className="field">Priority<select value={t.priority} onChange={e=>setDrafts(rows=>rows.map((r,n)=>n===i?{...r,priority:e.target.value as TaskInput["priority"]}:r))}>{["high","medium","low"].map(p=><option key={p}>{p}</option>)}</select></label><label className="field">Focus needed<select value={t.energy_level ?? ""} onChange={e=>setDrafts(rows=>rows.map((r,n)=>n===i?{...r,energy_level:(e.target.value || null) as TaskInput["energy_level"]}:r))}><option value="">Use preferences</option>{["high","medium","low"].map(p=><option key={p}>{p}</option>)}</select></label></div><Button variant="ghost" size="sm" onClick={()=>setDrafts(rows=>rows.filter((_,n)=>n!==i))}>Remove draft</Button></fieldset>)}
 {events.map((event,i)=><fieldset className="assistant-draft" key={event.id} disabled={busy}><legend>Protected time{!event.start || !event.end?" · Please confirm times":""}</legend><label className="field">Event<input value={event.title} maxLength={100} onChange={e=>setEvents(rows=>rows.map((r,n)=>n===i?{...r,title:e.target.value}:r))}/></label><div className="form-pair">{(["date","start","end"] as const).map(key=><label className="field" key={key}>{key}<input type={key==="date"?"date":"time"} value={event[key]} onChange={e=>setEvents(rows=>rows.map((r,n)=>n===i?{...r,[key]:e.target.value}:r))}/></label>)}</div><Button variant="ghost" size="sm" onClick={()=>setEvents(rows=>rows.filter((_,n)=>n!==i))}>Remove draft</Button></fieldset>)}
 {!drafts.length && !events.length && <p>No new items. I can still arrange the tasks you already have.</p>}
 {planning && <p>{planning.fixed.length} saved protected-time definitions and your study preferences will also be respected.</p>}
 <Button disabled={busy} onClick={()=>void build()}>{busy?<Loader2 size={16} className="animate-spin"/>:<Sparkles size={16}/>} {busy?"Building your day…":"Build my day"}<ArrowRight size={15}/></Button></div>}
 {finished && <p role="status" className="assistant-success">Your day is up to date. Keep talking whenever something changes.</p>}
 {error && <p role="alert" className="error-banner">{error}</p>}
 {(step!==-2 || finished) && <Button disabled={busy} variant="ghost" size="sm" onClick={reset}>{finished?"Start a fresh conversation":"Start conversation over"}</Button>}
 </section>;
}
