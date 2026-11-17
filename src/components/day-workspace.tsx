"use client";
import {useState,type ReactNode} from "react";
import {ArrowUpRight,Check,Clock3,LockKeyhole,RefreshCw,Sparkles,Sun} from "lucide-react";
import {dailyAgenda} from "@/lib/agenda";
import {selectCheckInTask} from "@/lib/check-ins";
import {dateKey,type PlanningState} from "@/lib/scheduling";
import type {Task} from "@/lib/types";
import {Button} from "./ui/button";
interface Props{children:ReactNode;tasks:Task[];planning:PlanningState|null;now:Date|null;onCalendar:()=>void;onPlan:()=>Promise<void>;onCheck:(id:string)=>void;onEdit:(task:Task)=>void}
const time=(iso:string)=>new Date(iso).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
export function DayWorkspace({children,tasks,planning,now,onCalendar,onPlan,onCheck,onEdit}:Props){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const agenda=planning && now?dailyAgenda(tasks,planning,now):null;
 const suggestion=planning && now?selectCheckInTask(tasks,planning,now):null;
 const incomplete=tasks.filter(t=>t.status!=="done");
 const due=incomplete.filter(t=>t.deadline && now && dateKey(new Date(t.deadline))<=dateKey(now));
 const unplaced=planning?.lastPlan?.unplaced.filter(u=>incomplete.some(t=>t.id===u.taskId)) ?? [];
 async function refresh(){if(busy)return;setBusy(true);setError("");try{await onPlan();}catch(e){setError(e instanceof Error?e.message:"Couldn't rebalance. Your saved plan is kept.");}finally{setBusy(false);}}
 return <div className="day-workspace"><div id="day-conversation" className="day-conversation">{children}</div><aside id="day-plan" className="day-plan" aria-label="Your day plan">
 <div className="day-plan-heading"><div><span className="section-overline">THE BIG PICTURE</span><h2>Your day<span className="live-dot"/></h2></div><button aria-label="Open full calendar" onClick={onCalendar}><ArrowUpRight size={19}/></button></div>
 <div className="day-metrics"><div><strong>{agenda?.focusedMinutes ?? 0}<small>min</small></strong><span>focus ahead</span></div><div><strong>{due.length}</strong><span>due today or earlier</span></div><div><strong>{tasks.filter(t=>t.status==="done").length}</strong><span>finished</span></div></div>
 {suggestion && <div className="day-checkin"><Sparkles size={16}/><div><strong>How’s it going?</strong><p>{suggestion.title}</p></div><button onClick={()=>onCheck(suggestion.id)}>Check in</button></div>}
 <div className="day-timeline-heading"><h3><Sun size={14}/> Today’s rhythm</h3><span>{now?.toLocaleDateString([],{month:"short",day:"numeric"})}</span></div>
 {!planning?.lastPlan && <div className="day-first-plan"><span className="day-empty-orbit"><Sparkles size={21}/></span><strong>A day with room to breathe.</strong><p>Talk through what’s on your mind. I’ll shape your study time around the rest of your life.</p></div>}
 {agenda && agenda.entries.length>0 && <ol className="day-timeline">{agenda.entries.slice(0,9).map(entry=><li key={entry.id} className={"timeline-"+entry.kind}><span className="timeline-node">{entry.kind==="fixed"?<LockKeyhole size={11}/>:entry.kind==="recovery"?<Clock3 size={11}/>:<span/>}</span><div className="timeline-content"><span className="timeline-clock">{time(entry.start)} — {time(entry.end)}{now && Date.parse(entry.start)<=+now && Date.parse(entry.end)>+now?<b>NOW</b>:null}</span>{entry.taskId?<button onClick={()=>{const t=tasks.find(t=>t.id===entry.taskId);if(t)onEdit(t);}}>{entry.title}</button>:<strong>{entry.title}</strong>}<span className="timeline-kind">{entry.kind==="fixed"?"Protected · stays put":entry.kind==="recovery"?"Time to recharge":"Flexible focus"}</span>{entry.taskId && <button className="timeline-check" onClick={()=>onCheck(entry.taskId!)}>Update progress <ArrowUpRight size={11}/></button>}</div></li>)}</ol>}
 {planning?.lastPlan && !agenda?.entries.length && <div className="day-first-plan"><Check size={22}/><strong>The rest of today is clear.</strong><p>Add something in the conversation, or keep this space for yourself.</p></div>}
 {agenda && agenda.entries.length>9 && <button className="day-more" onClick={onCalendar}>View {agenda.entries.length-9} more in Calendar <ArrowUpRight size={12}/></button>}
 {unplaced.length>0 && <div className="day-overload"><strong>Let’s find a little more room.</strong><p>{unplaced.reduce((n,u)=>n+u.minutes,0)} minutes couldn’t fit around your deadlines and protected time.</p>{unplaced.map(u=><button key={u.taskId} onClick={()=>{const t=tasks.find(t=>t.id===u.taskId);if(t)onEdit(t);}}>{tasks.find(t=>t.id===u.taskId)?.title}<span>{u.minutes}m to review <ArrowUpRight size={11}/></span></button>)}</div>}
 {due.length>0 && <details className="day-due"><summary>Keep an eye on these <span>{due.length}</span></summary>{due.slice(0,5).map(t=><button key={t.id} onClick={()=>onCheck(t.id)}>{t.title}<ArrowUpRight size={12}/></button>)}</details>}
 <div className="day-plan-footer"><span><LockKeyhole size={12}/> Life stays protected.</span><Button size="sm" variant="ghost" disabled={busy || !planning} onClick={()=>void refresh()}><RefreshCw size={13} className={busy?"animate-spin":""}/>{busy?"Rebalancing…":"Rebalance"}</Button></div>
 {error && <p role="alert" className="error-banner">{error}</p>}
 </aside></div>;
}
