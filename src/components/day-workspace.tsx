"use client";
import {Fragment,useState,type ReactNode} from "react";
import {ArrowUpRight,Check,Clock3,LockKeyhole,RefreshCw,Sparkles,Sun} from "lucide-react";
import {dailyAgenda} from "@/lib/agenda";
import {selectCheckInTask} from "@/lib/check-ins";
import {dateKey,type PlanningState} from "@/lib/scheduling";
import type {Task} from "@/lib/types";
import {Button} from "./ui/button";
import {formatMinutes} from '@/lib/tasks';
interface Props{children:ReactNode;tasks:Task[];planning:PlanningState|null;now:Date|null;onCalendar:()=>void;onPlan:()=>Promise<void>;onCheck:(id:string)=>void;onEdit:(task:Task)=>void}
const time=(iso:string)=>new Date(iso).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
export function DayWorkspace({children,tasks,planning,now,onCalendar,onPlan,onCheck,onEdit}:Props){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const agenda=planning && now?dailyAgenda(tasks,planning,now):null;
 const suggestion=planning && now?selectCheckInTask(tasks,planning,now):null;
 const incomplete=tasks.filter(t=>t.status!=="done");
 const due=incomplete.filter(t=>t.deadline && now && dateKey(new Date(t.deadline))<=dateKey(now));
 const unplaced=planning?.lastPlan?.unplaced.filter(u=>incomplete.some(t=>t.id===u.taskId)) ?? [];
 const visible=agenda?.entries.slice(0,9)??[];
 const active=(entry:(typeof visible)[number])=>Boolean(now && Date.parse(entry.start)<=+now && Date.parse(entry.end)>+now);
 const period=(entry:(typeof visible)[number])=>active(entry)?'Happening now':new Date(entry.start).getHours()<12?'Morning':new Date(entry.start).getHours()<17?'Afternoon':'Evening';
 async function refresh(){if(busy)return;setBusy(true);setError("");try{await onPlan();}catch(e){setError(e instanceof Error?e.message:"Couldn't rebalance. Your saved plan is kept.");}finally{setBusy(false);}}
 return <div className="day-workspace"><div id="day-conversation" className="day-conversation">{children}</div><aside id="day-plan" className="day-plan" aria-label="Your day plan">
 <div className="day-plan-heading"><div><span className="section-overline">A LITTLE STRUCTURE, ROOM TO LIVE</span><h2>Today's plan<span className="live-dot"/></h2><p className="plan-date">{now?.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})}</p></div><button aria-label="Open full calendar" onClick={onCalendar}><ArrowUpRight size={19}/></button></div>
 <div className="day-metrics"><div><strong>{formatMinutes(agenda?.focusedMinutes??0)}</strong><span>focus ahead</span></div><div><strong>{agenda?.entries.filter(e=>e.kind==='fixed').length??0}</strong><span>protected plans</span></div><div><strong>{unplaced.length}</strong><span>need a decision</span></div></div>
 {suggestion && <div className="day-checkin"><Sparkles size={16}/><div><strong>How’s it going?</strong><p>{suggestion.title}</p></div><button onClick={()=>onCheck(suggestion.id)}>Check in</button></div>}
 <div className="day-timeline-heading"><h3><Sun size={14}/> Your timetable</h3><span>In your local time</span></div>
 {!planning?.lastPlan && <div className="day-first-plan"><span className="day-empty-orbit"><Sparkles size={21}/></span><strong>A day with room to breathe.</strong><p>Talk through what’s on your mind. I’ll shape your study time around the rest of your life.</p></div>}
 {visible.length>0 && <ol className="day-timeline">{visible.map((entry,index)=><Fragment key={entry.id}>
 {(index===0 || period(visible[index-1])!==period(entry)) && <li className="timeline-period" role="presentation">{period(entry)}</li>}
 <li data-kind={entry.kind} className={'timeline-'+entry.kind+(active(entry)?' timeline-active':'')}>
  <div className="timeline-time"><time dateTime={entry.start}>{time(entry.start)}</time><span>to {time(entry.end)}</span>{dateKey(new Date(entry.end))!==dateKey(new Date(entry.start)) && <small>{now && dateKey(new Date(entry.end))===dateKey(now)?'ends today':new Date(entry.end).toLocaleDateString([],{weekday:'short'})}</small>}</div>
  <div className="timeline-content"><div className="timeline-meta"><span className="timeline-kind">{entry.kind==='fixed'?<LockKeyhole size={11}/>:entry.kind==='recovery'?<Clock3 size={11}/>:<Sparkles size={11}/>} {entry.kind==='fixed'?'Protected':entry.kind==='recovery'?'Recharge':'Focus'}</span>{active(entry)?<b className="timeline-now">NOW</b>:<span className="timeline-duration">{formatMinutes(Math.max(1,Math.round((Date.parse(entry.end)-Date.parse(entry.start))/60000)))}</span>}</div>
   {entry.taskId?<button className="timeline-title" onClick={()=>{const t=tasks.find(t=>t.id===entry.taskId);if(t)onEdit(t);}}>{entry.title}</button>:<strong className="timeline-title">{entry.title}</strong>}
   {entry.taskId && <span className="timeline-subject">{tasks.find(t=>t.id===entry.taskId)?.subject}</span>}
   {active(entry) && <span className="timeline-remaining">{formatMinutes(Math.max(1,Math.ceil((Date.parse(entry.end)-+now!)/60000)))} left in this block</span>}
   {entry.taskId && <button className="timeline-check" onClick={()=>onCheck(entry.taskId!)}>Check in <ArrowUpRight size={12}/></button>}
  </div>
 </li></Fragment>)}</ol>}
 {planning?.lastPlan && !agenda?.entries.length && <div className="day-first-plan"><Check size={22}/><strong>The rest of today is clear.</strong><p>Add something in the conversation, or keep this space for yourself.</p></div>}
 {agenda && agenda.entries.length>9 && <button className="day-more" onClick={onCalendar}>View {agenda.entries.length-9} more in Calendar <ArrowUpRight size={12}/></button>}
 {unplaced.length>0 && <div className="day-overload"><strong>Let’s find a little more room.</strong><p>{unplaced.reduce((n,u)=>n+u.minutes,0)} minutes couldn’t fit around your deadlines and protected time.</p>{unplaced.map(u=><button key={u.taskId} onClick={()=>{const t=tasks.find(t=>t.id===u.taskId);if(t)onEdit(t);}}>{tasks.find(t=>t.id===u.taskId)?.title}<span>{u.minutes}m to review <ArrowUpRight size={11}/></span></button>)}</div>}
 {due.length>0 && <details className="day-due"><summary>Keep an eye on these <span>{due.length}</span></summary>{due.slice(0,5).map(t=><button key={t.id} onClick={()=>onCheck(t.id)}>{t.title}<ArrowUpRight size={12}/></button>)}</details>}
 <div className="day-plan-footer"><span><LockKeyhole size={12}/> Life stays protected.</span><Button size="sm" variant="ghost" disabled={busy || !planning} onClick={()=>void refresh()}><RefreshCw size={13} className={busy?"animate-spin":""}/>{busy?"Rebalancing…":"Rebalance"}</Button></div>
 {error && <p role="alert" className="error-banner">{error}</p>}
 </aside></div>;
}
