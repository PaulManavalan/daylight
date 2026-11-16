import {addDays,dayAt,occurrences,planningLimits,protectedInterval,studyWindow,type PlanningState} from "./scheduling";
import type {Task} from "./types";
/** Suggestions are passive, bounded by study hours, and never interrupt protected life. */
export function selectCheckInTask(tasks:Task[],state:PlanningState,now:Date):Task|null {
 if(!state.preferences.checkIns || (!state.lastPlan && !state.sessions.length))return null;
 const p=planningLimits(state.preferences),window=studyWindow(now,p);
 if(!window || +now<window.start || +now>=window.end)return null;
 if(occurrences(state.fixed,addDays(dayAt(now),-1),addDays(dayAt(now),2)).some(f=>{const blocked=protectedInterval(f,p.commitmentBuffer);return +now>=blocked.start && +now<blocked.end;}))return null;
 const activeTasks=new Map(tasks.filter(t=>t.status!=="done" && !state.skipped?.includes(t.id)).map(t=>[t.id,t]));
 const sessions=state.sessions.filter(s=>!s.completed && activeTasks.has(s.taskId));
 const active=sessions.find(s=>Date.parse(s.start)<=+now && Date.parse(s.end)>+now);
 if(active && +now-Date.parse(active.start)<Math.min(15*60000,(Date.parse(active.end)-Date.parse(active.start))/2))return null;
 const available=tasks.filter(t=>activeTasks.has(t.id) && ![...state.history,...(state.work_records ?? [])].some(h=>h.taskId===t.id && Date.parse(h.at)>+now-90*60000));
 if(active){const task=available.find(t=>t.id===active.taskId);if(task)return task;return null;}
 const recent=[...sessions].filter(s=>Date.parse(s.end)<=+now && Date.parse(s.end)>+now-60*60000).sort((a,b)=>b.end.localeCompare(a.end));
 for(const session of recent){const task=available.find(t=>t.id===session.taskId);if(task)return task;}
 return available.filter(t=>t.deadline && Date.parse(t.deadline)<=+now+24*60*60000).sort((a,b)=>Date.parse(a.deadline!)-Date.parse(b.deadline!) || a.id.localeCompare(b.id))[0] ?? null;
}
