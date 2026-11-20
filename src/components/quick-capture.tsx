"use client";
import {useEffect,useRef,useState} from "react";
import {Plus,Loader2,SlidersHorizontal} from "lucide-react";
import {taskInputSchema,type TaskInput} from "@/lib/types";
import {Button} from "./ui/button";
import {TaskEditor} from "./task-editor";
interface Props {subjects:string[];defaultSubject:string;disabled:boolean;onSave:(input:TaskInput,id?:string)=>Promise<void>}
export function QuickCapture({subjects,defaultSubject,disabled,onSave}:Props){
 const [title,setTitle]=useState(""),[subject,setSubject]=useState(defaultSubject),[estimate,setEstimate]=useState(30);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[expanded,setExpanded]=useState<TaskInput|null>(null);
 const operation=useRef(false),input=useRef<HTMLInputElement>(null);
 useEffect(()=>setSubject(defaultSubject),[defaultSubject]);
 const candidate=():TaskInput=>({title,subject,description:"",deadline:null,estimated_minutes:estimate,remaining_minutes:estimate,priority:"medium",energy_level:null,status:"not_started"});
 async function capture(){
  if(operation.current || disabled)return;
  const parsed=taskInputSchema.safeParse(candidate());if(!parsed.success){setError(parsed.error.issues[0].message);return;}
  operation.current=true;setBusy(true);setError("");
  try{await onSave(parsed.data);setTitle("");}
  catch(e){setError(e instanceof Error?e.message:"Could not capture this task. Your draft is still here.");}
  finally{operation.current=false;setBusy(false);requestAnimationFrame(()=>input.current?.focus());}
 }
 return <section className="quick-capture" aria-label="Quick task capture"><form onSubmit={e=>{e.preventDefault();void capture();}}>
  <div className="quick-capture-title"><Plus size={17}/><input ref={input} aria-label="Quick task title" placeholder="Add a task…" value={title} maxLength={200} disabled={disabled || busy} onChange={e=>setTitle(e.target.value)}/></div>
  <label className="quick-capture-subject"><span className="sr-only">Quick task subject</span><select aria-label="Quick task subject" disabled={disabled || busy} value={subject} onChange={e=>setSubject(e.target.value)}>{[...new Set([defaultSubject,subject,...subjects])].sort().map(s=><option key={s}>{s}</option>)}</select></label>
  <label className="quick-capture-time"><input aria-label="Quick estimate (minutes)" type="number" min={5} max={1440} required value={estimate} disabled={disabled || busy} onChange={e=>setEstimate(Number(e.target.value))}/><span>min</span></label>
  <Button type="submit" size="sm" disabled={disabled || busy || !title.trim()} aria-label="Capture task">{busy?<Loader2 size={14} className="animate-spin"/>:<Plus size={14}/>}Add</Button>
  <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} aria-label="Add task details" onClick={()=>{setError("");setExpanded(candidate());}}><SlidersHorizontal size={14}/><span className="hidden sm:inline">Details</span></Button>
 </form><p className="quick-capture-hint">Enter to capture. Add deadlines, priority, and notes in Details.</p>{error && <p role="alert" className="quick-capture-error">{error}</p>}
 {expanded && <TaskEditor task={null} draft={expanded} open subjects={subjects} onClose={()=>{setExpanded(null);requestAnimationFrame(()=>input.current?.focus());}} onSave={async(input,id)=>{await onSave(input,id);setTitle("");}}/>}
 </section>;
}
