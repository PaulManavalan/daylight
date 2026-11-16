import {addDays,dateKey,dayAt,occurrences,planningLimits,type PlanningState} from "./scheduling";
import type {Task} from "./types";
export interface AgendaEntry {id:string;kind:"study"|"fixed"|"recovery";title:string;start:string;end:string;taskId?:string;locked?:boolean}
export function dailyAgenda(tasks:Task[],state:PlanningState,now:Date){
  const from=dayAt(now),to=addDays(from,1),limits=planningLimits(state.preferences);
  const entries:AgendaEntry[]=[];
  const active=new Map(tasks.filter(t=>t.status!=="done" && !state.skipped?.includes(t.id)).map(t=>[t.id,t]));
  const work=state.sessions.filter(s=>!s.completed && active.has(s.taskId) && new Date(s.start)>=from && new Date(s.start)<to);
  for(const s of work.filter(s=>new Date(s.end)>now))entries.push({id:s.id,kind:"study",title:active.get(s.taskId)!.title,start:s.start,end:s.end,taskId:s.taskId,locked:s.locked});
  for(const f of occurrences(state.fixed,from,to)){
    if(f.end>now)entries.push({id:f.id,kind:"fixed",title:f.title,start:f.start.toISOString(),end:f.end.toISOString()});
    const recoveryEnd=new Date(+f.end+Math.max(limits.commitmentBuffer,f.recovery_minutes ?? 0)*60000);
    if(recoveryEnd>now && f.end<to && recoveryEnd>f.end)entries.push({id:f.id+":recovery",kind:"recovery",title:`Recharge after ${f.title}`,start:f.end.toISOString(),end:recoveryEnd.toISOString()});
  }
  entries.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
  const earlier=[...new Set(work.filter(s=>new Date(s.end)<=now).map(s=>s.taskId))].filter(id=>!work.some(s=>s.taskId===id && new Date(s.end)>now));
  const focusedMinutes=entries.filter(e=>e.kind==="study").reduce((n,e)=>n+Math.max(0,Math.round((Date.parse(e.end)-Math.max(Date.parse(e.start),+now))/60000)),0);
  return {entries,earlier,focusedMinutes};
}
