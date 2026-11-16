"use client";
import {Clock3,LockKeyhole,Pin,Sparkles,ArrowRight} from "lucide-react";
import {selectCheckInTask} from "@/lib/check-ins";
import {dailyAgenda} from "@/lib/agenda";
import type {PlanningState} from "@/lib/scheduling";
import type {Task} from "@/lib/types";
import {Button} from "./ui/button";
interface Props{tasks:Task[];state:PlanningState|null;now:Date|null;onPlan:()=>void;onOpen:()=>void;onCheck:(id:string)=>void;onEdit:(task:Task)=>void}
const time=(iso:string)=>new Date(iso).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
export function TodayAgenda({tasks,state,now,onPlan,onOpen,onCheck,onEdit}:Props){
  const agenda=state && now?dailyAgenda(tasks,state,now):null;
  const suggestion=state && now?selectCheckInTask(tasks,state,now):null;
  return <section className="today-agenda" aria-label="Today's agenda"><div className="agenda-heading"><div><span className="chapter-label">YOUR DAY, AT YOUR PACE</span><h2>A little clarity for today.</h2><p>{agenda?`${agenda.focusedMinutes} focused minutes left on your plan. Fixed commitments and recovery stay protected.`:"Open your calendar to check your planning preferences and saved sessions."}</p></div><Button disabled={!state} onClick={onPlan}><Sparkles size={14}/>Plan my day</Button></div>
    {suggestion && <div className="agenda-suggestion"><p>A small check-in on <strong>{suggestion.title}</strong>?</p><Button variant="outline" size="sm" onClick={()=>onCheck(suggestion.id)}>Give an update</Button></div>}
    {agenda && <div className="agenda-list">{agenda.entries.slice(0,6).map(entry=><div key={entry.id} className={`agenda-entry agenda-${entry.kind}`}><div className="agenda-time">{time(entry.start)}<span>{time(entry.end)}</span></div><div className="agenda-label"><span>{entry.kind==="fixed"?<LockKeyhole size={13}/>:entry.kind==="recovery"?<Clock3 size={13}/>:entry.locked?<Pin size={13}/>:null}{entry.taskId?<button onClick={()=>{const task=tasks.find(t=>t.id===entry.taskId);if(task)onEdit(task);}}>{entry.title}</button>:<strong>{entry.title}</strong>}</span><small>{now && Date.parse(entry.start)<=+now?"Now · ":""}{entry.kind==="study"?"Study session":entry.kind==="fixed"?"Protected time":"Breathing room"}</small></div>{entry.taskId && <Button size="sm" variant="ghost" onClick={()=>onCheck(entry.taskId!)}>Check in</Button>}</div>)}{!agenda.entries.length && <p className="agenda-open">Nothing scheduled for the rest of today. Make a plan, or enjoy the breathing room.</p>}</div>}
    {agenda && agenda.earlier.length>0 && <details className="agenda-earlier"><summary>Earlier sessions to review ({agenda.earlier.length})</summary>{agenda.earlier.map(id=><div key={id}><span>{tasks.find(t=>t.id===id)?.title}</span><Button size="sm" variant="ghost" onClick={()=>onCheck(id)}>Check in</Button></div>)}<p>A scheduled time passing never marks your work as done.</p></details>}
    <button className="agenda-calendar-link" onClick={onOpen}>Open today's calendar<ArrowRight size={14}/></button>
  </section>;
}
