"use client";
import {ZodError} from "zod";
import {useEffect,useRef,useState} from "react";
import {Sparkles,Send,ArrowRight,Loader2} from "lucide-react";
import {Button} from "./ui/button";
import {eventDrafts,nothing,protectedDraft,sameTask,subjectList,taskDrafts,type EventDraft} from "@/lib/planning-conversation";
import {taskInputSchema,type Task,type TaskInput} from "@/lib/types";
import {dateKey,type FixedBlock,type PlanningState} from "@/lib/scheduling";
type Message={role:"assistant"|"you";text:string};
interface Props {subjects:string[];tasks:Task[];planning:PlanningState|null;onBuild:(tasks:TaskInput[],fixed:FixedBlock[])=>Promise<void>}
const localDateTime=(iso:string)=>{const d=new Date(iso);return dateKey(d)+"T"+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
const welcome="Let's talk through your day. What subjects do you have work for? You can say ‘Math, English and Biology’, or just ‘skip’ if it's all outside school.";
export function PlanningAssistant({subjects:known,tasks,planning,onBuild}:Props){
 const [messages,setMessages]=useState<Message[]>([{role:"assistant",text:welcome}]);
 const [subjects,setSubjects]=useState<string[]>([]),[step,setStep]=useState(-1),[answer,setAnswer]=useState("");
 const [drafts,setDrafts]=useState<TaskInput[]>([]),[events,setEvents]=useState<EventDraft[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[finished,setFinished]=useState(false);
 const operation=useRef(false),last=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const review=step>=subjects.length+2 && step!==-1;
 useEffect(()=>{last.current?.scrollIntoView({block:"nearest",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});},[messages.length,review]);
 function reply(text:string){
  if(operation.current || review || !text.trim())return;
  try{
   let nextSubjects=subjects,nextStep=step+1;let response="";
   if(step===-1){nextSubjects=nothing(text)?[]:subjectList(text);setSubjects(nextSubjects);nextStep=0;}
   else if(step<subjects.length){const parsed=taskDrafts(text,subjects[step],new Date());setDrafts(rows=>[...rows,...parsed]);}
   else if(step===subjects.length){setEvents(eventDrafts(text,new Date()));}
   else {setDrafts(rows=>[...rows,...taskDrafts(text,"Personal",new Date())]);}
   if(nextStep<nextSubjects.length){const existing=tasks.filter(t=>t.subject.toLowerCase()===nextSubjects[nextStep].toLowerCase() && t.status!=="done");response=`What work do you have for ${nextSubjects[nextStep]}? Tell me the assignments, roughly how long they'll take, and when they're due.${existing.length?" I already have: "+existing.map(t=>t.title).join(", ")+". Only mention new work.":""} You can give me several, separated by semicolons, or say ‘none’.`;}
   else if(nextStep===nextSubjects.length)response="What happens after school—practice, a job shift, clubs, appointments, or family time? For example: ‘Soccer 4–6pm; dinner 7–7:30pm’. Your saved protected time stays in place. Say ‘none’ if there's nothing new.";
   else if(nextStep===nextSubjects.length+1)response="Anything outside school to make room for—chores, a personal project, applications, or work? Tell me everything in one message. For example: ‘Laundry 20 min; work on portfolio 45 min due Friday’. Or say ‘none’.";
   else response="Here's what I understood. Check my estimates and dates below, and fill in any event times I couldn't read confidently. Then I'll add everything and arrange your day around your saved commitments, breaks, and study preferences.";
   setMessages(rows=>[...rows,{role:"you",text},{role:"assistant",text:response}]);setStep(nextStep);setAnswer("");setError("");requestAnimationFrame(()=>input.current?.focus());
  }catch(e){setError(e instanceof ZodError?e.issues[0].message:e instanceof Error?e.message:"I couldn't read that. Try a shorter message.");}
 }
 function reset(){setStep(-1);setSubjects([]);setDrafts([]);setEvents([]);setMessages([{role:"assistant",text:welcome}]);setError("");setFinished(false);setAnswer("");}
 async function build(){
  if(operation.current)return;operation.current=true;setBusy(true);setError("");
  try{const validated=drafts.map(t=>taskInputSchema.parse(t));const fixed=events.map(protectedDraft);await onBuild(validated,fixed);setFinished(true);}
  catch(e){setError((e instanceof ZodError?e.issues[0].message:e instanceof Error?e.message:"Could not save the plan.")+" Your draft is still here. Any tasks already saved will be kept; retrying skips matching tasks.");}
  finally{operation.current=false;setBusy(false);}
 }
 return <section className="planning-assistant" aria-label="Planning assistant"><div className="assistant-heading"><span><Sparkles size={18}/> Let's make room for your day</span><small>Guided conversation · free on this device</small></div>
 <p className="assistant-intro">Tell me what's on your plate. I'll ask the questions and build the task list with you. Your existing tasks are included when planning.</p>
 <div className="assistant-messages" role="log" aria-label="Planning conversation" aria-live="polite" aria-relevant="additions">{messages.map((m,i)=><div key={i} className={`assistant-message ${m.role=== "you"?"from-you":"from-daylight"}`}><small>{m.role==="you"?"You":"Daylight"}</small><p>{m.text}</p></div>)}<div ref={last}/></div>
 {!review && <><div className="assistant-suggestions">{(step===-1?known.slice(0,8):[]).map(s=><Button key={s} size="sm" variant="outline" onClick={()=>setAnswer(current=>current?current+", "+s:s)}>{s}</Button>)}{step===-1 && known.length>0 && <Button size="sm" variant="ghost" onClick={()=>reply(known.join(", "))}>Use my subjects</Button>}<Button size="sm" variant="ghost" onClick={()=>reply("none")}>{step===-1?"Outside school only":"Nothing new here"}</Button></div>
 <form className="assistant-composer" onSubmit={e=>{e.preventDefault();reply(answer);}}><label className="sr-only" htmlFor="assistant-answer">Your reply</label><textarea id="assistant-answer" ref={input} value={answer} maxLength={5000} rows={3} onChange={e=>setAnswer(e.target.value)} placeholder={step===-1?"Math, English and Biology…":"Write it the way you'd tell a friend…"}/><Button type="submit" disabled={!answer.trim()}><Send size={15}/>Send</Button></form><p className="assistant-hint">Several tasks? Separate them with semicolons or new lines. Estimates default to 30 minutes. Day-only deadlines mean 11:59pm. Unrecognized deadlines stay unset for you to review.</p></>}
 {review && !finished && <div className="assistant-review"><h2>Your day, ready to review</h2><p>Dates and estimates are editable. Nothing new is saved until you choose “Build my day”. Events apply once on their selected date; recurring commitments stay in Calendar.</p>
 {drafts.map((t,i)=><fieldset className="assistant-draft" key={i} disabled={busy}><legend>{t.subject}{tasks.some(existing=>existing.status!=="done" && sameTask(existing,t))?" · Already on your list; won't duplicate":""}</legend><label className="field">Task<input aria-label={`Task ${i+1} title`} value={t.title} maxLength={200} onChange={e=>setDrafts(rows=>rows.map((r,n)=>n===i?{...r,title:e.target.value}:r))}/></label><div className="form-pair"><label className="field">Subject<input value={t.subject} maxLength={80} onChange={e=>setDrafts(rows=>rows.map((r,n)=>n===i?{...r,subject:e.target.value}:r))}/></label><label className="field">Minutes<input type="number" min={5} max={1440} value={t.estimated_minutes} onChange={e=>setDrafts(rows=>rows.map((r,n)=>n===i?{...r,estimated_minutes:Number(e.target.value),remaining_minutes:Number(e.target.value)}:r))}/></label></div><div className="form-pair"><label className="field">Due date & time<input type="datetime-local" value={t.deadline?localDateTime(t.deadline):""} onChange={e=>{const deadline=e.target.value?new Date(e.target.value).toISOString():null;setDrafts(rows=>rows.map((r,n)=>n===i?{...r,deadline}:r));}}/></label><label className="field">Priority<select value={t.priority} onChange={e=>setDrafts(rows=>rows.map((r,n)=>n===i?{...r,priority:e.target.value as TaskInput["priority"]}:r))}>{["high","medium","low"].map(p=><option key={p}>{p}</option>)}</select></label><label className="field">Focus needed<select value={t.energy_level ?? ""} onChange={e=>setDrafts(rows=>rows.map((r,n)=>n===i?{...r,energy_level:(e.target.value || null) as TaskInput["energy_level"]}:r))}><option value="">Use preferences</option>{["high","medium","low"].map(p=><option key={p}>{p}</option>)}</select></label></div><Button variant="ghost" size="sm" onClick={()=>setDrafts(rows=>rows.filter((_,n)=>n!==i))}>Remove draft</Button></fieldset>)}
 {events.map((event,i)=><fieldset className="assistant-draft" key={event.id} disabled={busy}><legend>Protected time{!event.start || !event.end?" · Please confirm times":""}</legend><label className="field">Event<input value={event.title} maxLength={100} onChange={e=>setEvents(rows=>rows.map((r,n)=>n===i?{...r,title:e.target.value}:r))}/></label><div className="form-pair">{(["date","start","end"] as const).map(key=><label className="field" key={key}>{key}<input type={key==="date"?"date":"time"} value={event[key]} onChange={e=>setEvents(rows=>rows.map((r,n)=>n===i?{...r,[key]:e.target.value}:r))}/></label>)}</div><Button variant="ghost" size="sm" onClick={()=>setEvents(rows=>rows.filter((_,n)=>n!==i))}>Remove draft</Button></fieldset>)}
 {!drafts.length && !events.length && <p>No new items. I can still arrange the tasks you already have.</p>}
 {planning && <p>{planning.fixed.length} saved protected-time definitions and your study preferences will also be respected.</p>}
 <Button disabled={busy} onClick={()=>void build()}>{busy?<Loader2 size={16} className="animate-spin"/>:<Sparkles size={16}/>} {busy?"Building your day…":"Build my day"}<ArrowRight size={15}/></Button></div>}
 {finished && <p role="status" className="assistant-success">Your tasks and commitments are saved. Your calendar shows the plan, including anything that could not fit.</p>}
 {error && <p role="alert" className="error-banner">{error}</p>}
 {(step!==-1 || finished) && <Button disabled={busy} variant="ghost" size="sm" onClick={reset}>{finished?"Talk through another day":"Start conversation over"}</Button>}
 </section>;
}
