import { z } from "zod";
import type { Task } from "./types";
import {dailyCheckInSchema} from './daily-checkin';

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const preferencesSchema = z.object({
  workStart: clock, workEnd: clock, focusStart: clock, focusEnd: clock,
  capacity: z.number().int().min(15).max(720), session: z.number().int().min(15).max(120),
  pause: z.number().int().min(0).max(60), checkIns: z.boolean(),
  weekendStart: clock.default("10:00"), weekendEnd: clock.default("18:00"),
  studyDays: z.array(z.number().int().min(0).max(6)).min(1).default([0,1,2,3,4,5,6]),
  commitmentBuffer: z.number().int().min(0).max(60).default(10),
  dailyBuffer: z.number().int().min(0).max(120).default(15),
  deepWorkEnd: clock.default("20:30"),
  longBreak: z.number().int().min(5).max(60).default(25),
  longBreakAfter: z.number().int().min(30).max(180).default(90),
  pace: z.enum(["gentle","balanced","compact"]).default("balanced"),
  defaultEnergy: z.enum(["high","medium","low"]).default("medium"),
}).refine(p => p.workStart < p.workEnd && p.focusStart < p.focusEnd && p.weekendStart < p.weekendEnd, "Windows must end after they start.")
  .refine(p => p.dailyBuffer < p.capacity, "Leave at least some focus capacity after the daily buffer.");
export type PlanningPreferences = z.infer<typeof preferencesSchema>;
export const fixedSchema = z.object({
  id: z.string(), title: z.string().trim().min(1).max(100), date: z.iso.date(),
  recovery_minutes:z.number().int().min(0).max(120).optional(),
  start: clock, end: clock, days: z.array(z.number().int().min(0).max(6)),
}).refine(b => b.start !== b.end, "Choose different start and end times.");
export type FixedBlock = z.infer<typeof fixedSchema>;
export const sessionSchema = z.object({ id: z.string(), taskId: z.string(), start: z.iso.datetime(), end: z.iso.datetime(), reason: z.string(), kind: z.enum(["study", "restart"]).optional(), locked: z.boolean().optional(), completed: z.boolean().optional() }).refine(s=>Date.parse(s.end)>Date.parse(s.start),"Session must end after it starts.");
export type Session = z.infer<typeof sessionSchema>;
export const responses = ["Done", "Making progress", "Need more time", "Stuck", "Skip for now"] as const;
export type Response = typeof responses[number];
export interface ProgressCheck { covered_session_ids?:string[]; id: string; taskId: string; title: string; response: Response; minutes: number; at: string }
export const progressCheckSchema=z.object({covered_session_ids:z.array(z.string()).optional(),id:z.string(),taskId:z.string(),title:z.string(),response:z.enum(responses),minutes:z.number().int().min(0).max(10080),at:z.iso.datetime()});
export const planningSchema = z.object({
  lastPlan: z.object({warnings:z.array(z.string()).optional(),at:z.iso.datetime(),unplaced:z.array(z.object({taskId:z.string(),minutes:z.number(),reason:z.string(),cause:z.enum(["deadline","focus","availability","protected","capacity","constraints"]).optional()})),changes:z.array(z.object({taskId:z.string(),before:z.string().nullable(),after:z.string().nullable(),kind:z.enum(["added","moved","removed"])}))}).optional(),
  skipped: z.array(z.string()).optional(),
  preferences: preferencesSchema, fixed: z.array(fixedSchema), sessions: z.array(sessionSchema),
  history: z.array(progressCheckSchema),
  work_records: z.array(progressCheckSchema).optional(),
  daily_checkins:z.array(dailyCheckInSchema).max(60).refine(rows=>new Set(rows.map(row=>row.id)).size===rows.length,"Check-in IDs must be unique.").optional(),
});
export type PlanningState = z.infer<typeof planningSchema>;
/** The visible history is capped; recent focus credits must not disappear with it. */
export function retainWorkRecords(state:PlanningState,entry:ProgressCheck,now:Date):ProgressCheck[] {
  const cutoff=+addDays(dayAt(now),-14);
  const records=[...(state.work_records ?? []),...state.history,entry].filter(h=>h.response==="Making progress" && +new Date(h.at)>=cutoff);
  return [...new Map(records.map(h=>[h.id,h])).values()].sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
}
export function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
export function dayAt(d: Date, time = "00:00") { return new Date(`${dateKey(d)}T${time}:00`); }
export function addDays(d: Date, n: number) { const next = new Date(d); next.setDate(next.getDate()+n); return next; }
export function defaults(): PlanningState {
  return { preferences: preferencesSchema.parse({ workStart: "15:00", workEnd: "21:30", focusStart: "15:30", focusEnd: "19:30", capacity: 180, session: 45, pause: 10, checkIns: true }),
    fixed: [
      { id: "school", title: "School", date: "2020-01-01", start: "08:00", end: "15:00", days: [1,2,3,4,5] },
      { id: "soccer", title: "Soccer practice", recovery_minutes:30, date: "2020-01-01", start: "16:00", end: "18:00", days: [2,4] },
      { id: "sleep", title: "Sleep", date: "2020-01-01", start: "23:00", end: "07:00", days: [0,1,2,3,4,5,6] },
    ], sessions: [], history: [] };
}
export interface Occurrence { id: string; title: string; start: Date; end: Date; recovery_minutes?:number }
export function occurrences(fixed: FixedBlock[], from: Date, to: Date): Occurrence[] {
  const result: Occurrence[] = [];
  for (let d = addDays(dayAt(from),-1); d < to; d = addDays(d,1)) {
    for (const b of fixed) {
      if (dateKey(d) < b.date || (b.days.length ? !b.days.includes(d.getDay()) : dateKey(d) !== b.date)) continue;
      const start = dayAt(d,b.start), end = dayAt(b.end < b.start ? addDays(d,1) : d,b.end);
      if (end > from && start < to) result.push({ id: `${b.id}:${dateKey(d)}`, title: b.title, start, end, recovery_minutes:b.recovery_minutes });
    }
  }
  return result;
}
export const overlaps = (a: number, b: number, c: number, d: number) => a < d && b > c;
const minute = 60_000;
export function protectedInterval(f:Occurrence,buffer:number){return {start:+f.start-buffer*minute,end:+f.end+Math.max(buffer,f.recovery_minutes ?? 0)*minute};}
const length = (s: Session) => (+new Date(s.end) - +new Date(s.start)) / minute;
const rank = { high: 0, medium: 1, low: 2 };
type Interval = { start: number; end: number };
export interface PlanChange { taskId: string; before: string | null; after: string | null; kind: "added" | "moved" | "removed" }
export interface PlanResult {
  sessions: Session[];
  unplaced: { taskId: string; minutes: number; reason: string; cause?:"deadline"|"focus"|"availability"|"protected"|"capacity"|"constraints" }[];
  changes: PlanChange[];
  warnings: string[];
}
export interface PlanOptions { focusTaskId?: string; interruptTaskId?: string; skipTaskId?: string }

/** Pace adds softness without reducing any explicit user-set break or reserve. */
export function planningLimits(preferences: PlanningPreferences) {
  const p=preferencesSchema.parse(preferences);
  const extra=p.pace==="gentle"?Math.ceil((p.capacity-p.dailyBuffer)*.15):0;
  return {...p,dailyBuffer:p.dailyBuffer+extra,pause:Math.max(p.pause,p.pace==="gentle"?15:0),session:p.pace==="gentle"?Math.min(p.session,35):p.session};
}

export function studyWindow(day: Date, p: PlanningPreferences): Interval | null {
  if (!p.studyDays.includes(day.getDay())) return null;
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  return { start: +dayAt(day, weekend ? p.weekendStart : p.workStart), end: +dayAt(day, weekend ? p.weekendEnd : p.workEnd) };
}

/** Subtract a union of unavailable intervals. Works for overlapping fixed events too. */
function subtract(window: Interval, obstacles: Interval[]): Interval[] {
  let cursor = window.start;
  const free: Interval[] = [];
  for (const o of [...obstacles].sort((a,b) => a.start-b.start)) {
    if (o.end <= cursor || o.start >= window.end) continue;
    if (o.start > cursor) free.push({ start: cursor, end: Math.min(o.start,window.end) });
    cursor = Math.max(cursor,o.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

function restProblem(sessions: Session[], p: PlanningPreferences, validateAfter = -Infinity): string | null {
  const rows = [...sessions].sort((a,b) => a.start.localeCompare(b.start));
  let continuous = 0;
  for (let i=0; i<rows.length; i++) {
    const previous = rows[i-1], current = rows[i];
    if (previous && dateKey(new Date(previous.start)) === dateKey(new Date(current.start))) {
      const gap = (+new Date(current.start)-+new Date(previous.end))/minute;
      if (+new Date(current.start)>=validateAfter && gap < p.pause) return "Leave breathing room between study sessions.";
      if (+new Date(current.start)>=validateAfter && continuous >= p.longBreakAfter && gap < Math.max(p.pause,p.longBreak)) return `Take a ${Math.max(p.pause,p.longBreak)}-minute recovery break after ${p.longBreakAfter} focused minutes.`;
      if (gap >= p.longBreak) continuous = 0;
    } else continuous = 0;
    continuous += length(current);
  }
  return null;
}

/** Confirmed progress consumes today's capacity even when an old session is replaced. */
function usedMinutes(day: Date, sessions: Session[], history: ProgressCheck[], now: Date) {
  const onDay = sessions.filter(s => dateKey(new Date(s.start)) === dateKey(day));
  // Confirmed sessions and explicit progress overlap conceptually: use the larger
  // amount per task, never sum the same work twice. Missed plans consume no capacity.
  const completed=onDay.filter(s=>s.completed && +new Date(s.end)<=+now);
  const entries=history.filter(h=>h.response==="Making progress" && dateKey(new Date(h.at))===dateKey(day));
  let spent=0;
  for(const id of new Set([...completed.map(s=>s.taskId),...entries.map(h=>h.taskId)])) {
    const rows=completed.filter(s=>s.taskId===id),updates=entries.filter(h=>h.taskId===id);
    const total=updates.reduce((n,h)=>n+Math.max(0,h.minutes),0);
    if(updates.some(h=>h.covered_session_ids===undefined)) {spent+=Math.max(total,rows.reduce((n,s)=>n+length(s),0));continue;}
    const uncredited=new Map(rows.map(s=>[s.id,length(s)]));
    for(const h of updates) {let credit=Math.max(0,h.minutes);for(const sessionId of h.covered_session_ids ?? []){const amount=Math.min(credit,uncredited.get(sessionId) ?? 0);uncredited.set(sessionId,(uncredited.get(sessionId) ?? 0)-amount);credit-=amount;}}
    spent+=total+[...uncredited.values()].reduce((n,value)=>n+value,0);
  }
  return spent+onDay.filter(s=>!s.completed && +new Date(s.end)>+now).reduce((n,s)=>n+length(s),0);
}

/** Stable IDs let the calendar animate moved sessions and keep unchanged blocks steady. */
function comparePlans(previous: Session[], next: Session[], floor: number, end: number): { sessions: Session[]; changes: PlanChange[] } {
  const old = previous.filter(s => +new Date(s.end) > floor && +new Date(s.start) < end);
  const used = new Set<string>(), reserved = new Set<string>(), exact = new Map<Session,Session>(), changes: PlanChange[] = [];
  for(const s of next){const match=old.find(o=>!reserved.has(o.id) && o.taskId===s.taskId && o.start===s.start && o.end===s.end);if(match){exact.set(s,match);reserved.add(match.id);}}
  const sessions = next.map(s => {
    if (+new Date(s.end) <= floor || +new Date(s.start) >= end) return s;
    const match = exact.get(s) ?? old.find(o => !used.has(o.id) && !reserved.has(o.id) && o.taskId === s.taskId);
    if (match) used.add(match.id);
    if (!match || match.start !== s.start || match.end !== s.end) changes.push({ taskId:s.taskId,before:match?.start ?? null,after:s.start,kind:match ? "moved" : "added" });
    return match ? { ...s,id:match.id } : s;
  });
  for (const s of old) if (!used.has(s.id)) changes.push({taskId:s.taskId,before:s.start,after:null,kind:"removed"});
  return {sessions,changes};
}

/**
 * Free, deterministic planning. At each allocation, recompute shared deadline pressure,
 * choose the next task, and score its free slots for focus, fragmentation and time of day.
 * Local dates and recurring wall times follow the browser timezone across DST.
 */
export function plan(tasks: Task[], state: PlanningState, from: Date, days: number, now = new Date(), order: string[] = [], options: PlanOptions = {}): PlanResult {
  const rawPreferences=preferencesSchema.parse(state.preferences);
  const p = planningLimits(rawPreferences);
  const start = dayAt(from), end = addDays(start,Math.max(1,Math.min(14,days)));
  const floor = Math.max(+start,+now), ready = Math.ceil(Math.max(+start,+now+5*minute)/(5*minute))*5*minute;
  const activeTasks = tasks.filter(t => t.status !== "done" && t.id !== options.skipTaskId && !(state.skipped ?? []).includes(t.id)).map(t=>({...t,energy_level:t.energy_level ?? p.defaultEnergy}));
  const fixed = occurrences(state.fixed,addDays(start,-1),addDays(end,1));
  const protectedIntervals = fixed.map(f => protectedInterval(f,p.commitmentBuffer));
  const sessions:Session[]=[];
  const warnings:string[]=[];
  const budget=new Map(activeTasks.map(t=>[t.id,t.remaining_minutes]));
  for(const original of [...state.sessions].filter(s=>tasks.some(t=>t.id===s.taskId)).sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id))) {
    if (+new Date(original.end)<=floor) {sessions.push({...original,completed:original.completed || tasks.some(t=>t.id===original.taskId && t.status==="done")});continue;}
    const task=activeTasks.find(t=>t.id===original.taskId);if(!task){if(+new Date(original.start)<floor && tasks.some(t=>t.id===original.taskId && t.status==="done"))sessions.push({...original,end:new Date(floor).toISOString(),completed:true,locked:false});continue;}
    const ongoing=+new Date(original.start)<=+now && +new Date(original.end)>+now && task.id!==options.interruptTaskId;
    if(!ongoing && !original.locked && +new Date(original.start)<+end)continue;
    if(task.id===options.interruptTaskId && +new Date(original.start)<=+now)continue;
    const available=budget.get(task.id) ?? 0;
    if(available<=0) {if(original.locked)warnings.push(`Released an unnecessary lock for “${task.title}”; its remaining work is already covered.`);continue;}
    const keep={...original,end:new Date(+new Date(original.start)+Math.min(available,length(original))*minute).toISOString()};
    if(ongoing && task.deadline && Date.parse(keep.end)>Date.parse(task.deadline)){
      const due=Date.parse(task.deadline);
      warnings.push(`The session for “${task.title}” was shortened at its deadline. Remaining work needs a scope or deadline review.`);
      if(due<=+now){
        // Retain elapsed, unconfirmed time without reserving work after the deadline
        // or claiming that merely being on the calendar means it was completed.
        if(due>Date.parse(keep.start))sessions.push({...keep,end:task.deadline,locked:false});
        continue;
      }
      keep.end=task.deadline;
    }
    const conflict=ongoing
      ? protectedIntervals.some(f=>overlaps(+new Date(keep.start),+new Date(keep.end),f.start,f.end)) ? "That time is protected." : null
      : moveProblem(keep,sessions,state.fixed,rawPreferences,task,now,state.work_records ?? state.history);
    if(conflict){if(original.locked)warnings.push(`Released the lock for “${task.title}”: ${conflict} Remaining work has been reconsidered.`);continue;}
    if(original.locked && keep.end!==original.end)warnings.push(`Shortened the locked session for “${task.title}” to match its remaining work.`);
    sessions.push(keep);budget.set(task.id,available-length(keep));
  }
  const left = new Map(activeTasks.map(t => [t.id,Math.max(0,t.remaining_minutes-sessions.filter(s=>s.taskId===t.id && +new Date(s.end)>floor).reduce((n,s)=>n+length(s),0))]));
  const restarted = new Set<string>();

  function freeDays() {
    const obstacles = [...protectedIntervals,...sessions.map(s=>({start:+new Date(s.start)-p.pause*minute,end:+new Date(s.end)+p.pause*minute}))];
    return Array.from({length:Math.round((+end-+start)/(24*60*minute))},(_,i)=>addDays(start,i)).map(day=> {
      const window = studyWindow(day,p);
      return { day, capacity:Math.max(0,p.capacity-p.dailyBuffer-usedMinutes(day,sessions,state.work_records ?? state.history,now)),
        free:window ? subtract({start:Math.max(window.start,ready),end:window.end},obstacles) : [] };
    });
  }
  // Session count is bounded by the available capacity; never loop on infeasible work.
  while (true) {
    const available = freeDays();
    const queue = activeTasks.filter(t=>(left.get(t.id) ?? 0)>0);
    if (!queue.length) break;
    function supply(task: Task, deadline: number) {
      return available.reduce((sum,d) => {
        const cutoff = task.energy_level === "high" ? Math.min(deadline,+dayAt(d.day,p.deepWorkEnd)) : deadline;
        const free = d.free.reduce((n,f)=>n+Math.max(0,(Math.min(f.end,cutoff)-f.start)/minute),0);
        return sum+Math.min(d.capacity,Math.max(0,free-Math.floor(free/(p.session+p.pause))*p.pause));
      },0);
    }
    // A hard deadline can have an earlier practical cutoff: deep work, school,
    // or a protected evening may remove its last usable window. Reserve that
    // scarce time before flexible work with a similar written deadline.
    const effectiveDue=new Map(queue.map(t=>{
      const due=t.deadline?Date.parse(t.deadline):Infinity;
      if(due>+end || due<=floor)return [t.id,due];
      const minimum=Math.min(15,left.get(t.id)!)*minute;
      const ends=available.flatMap(d=>d.capacity<minimum/minute?[]:d.free.flatMap(f=>{
        const cutoff=Math.min(f.end,due,t.energy_level==="high"?+dayAt(d.day,p.deepWorkEnd):Infinity);
        return cutoff-f.start>=minimum?[cutoff]:[];
      }));
      return [t.id,ends.length?Math.max(...ends):due];
    }));
    const pressure = new Map(queue.map(t=> {
      const due = effectiveDue.get(t.id)!;
      const demand = queue.filter(o=>o.deadline && effectiveDue.get(o.id)!>floor && effectiveDue.get(o.id)!<=due).reduce((n,o)=>n+(left.get(o.id) ?? 0),0);
      const slack = due === Infinity ? Infinity : supply(t,due)-demand;
      const urgent = due <= floor+120*minute || slack < p.session+p.pause;
      return [t.id,{due,slack,urgent}];
    }));
    queue.sort((a,b)=> {
      const ap=pressure.get(a.id)!, bp=pressure.get(b.id)!;
      if (ap.urgent !== bp.urgent) return ap.urgent ? -1 : 1;
      if (ap.urgent && ap.due !== bp.due) return ap.due-bp.due;
      const ar=a.id===options.focusTaskId ? -1 : rank[a.priority], br=b.id===options.focusTaskId ? -1 : rank[b.priority];
      return ar-br || ap.due-bp.due || rank[a.energy_level ?? "medium"]-rank[b.energy_level ?? "medium"] ||
        (order.indexOf(a.id)<0?999:order.indexOf(a.id))-(order.indexOf(b.id)<0?999:order.indexOf(b.id)) || a.id.localeCompare(b.id);
    });
    let placed = false;
    for (const task of queue) {
      const remaining = left.get(task.id)!;
      const restart = task.status === "stuck" && !restarted.has(task.id);
      const maximum = Math.min(remaining,restart ? 15 : p.session);
      const due = task.deadline ? +new Date(task.deadline) : Infinity;
      const choices: {session:Session; score:number; duration:number}[] = [];
      for (let index=0; index<available.length; index++) {
        const day = available[index];
        if (day.capacity < Math.min(15,remaining)) continue;
        const cutoff = task.energy_level === "high" ? Math.min(due,+dayAt(day.day,p.deepWorkEnd)) : due;
        for (const f of day.free) {
          for (let at=Math.ceil(f.start/(5*minute))*5*minute; at<Math.min(f.end,cutoff); at+=5*minute) {
            const duration = Math.min(maximum,day.capacity,Math.floor((Math.min(f.end,cutoff)-at)/minute));
            if (duration < Math.min(15,remaining)) continue;
            const finish=at+duration*minute;
            const candidate:Session={id:"candidate",taskId:task.id,start:new Date(at).toISOString(),end:new Date(finish).toISOString(),kind:restart?"restart":"study",reason:""};
            if (restProblem([...sessions.filter(s=>+new Date(s.start)<+end),candidate],p,floor)) continue;
            const focusMinutes = Math.max(0,(Math.min(finish,+dayAt(day.day,p.focusEnd))-Math.max(at,+dayAt(day.day,p.focusStart)))/minute);
            const focusFraction=focusMinutes/duration;
            // Earlier days dominate. Within a day, strong focus matches can offset a modest wait.
            const clockMinutes = new Date(at).getHours()*60+new Date(at).getMinutes();
            const energyPenalty = task.energy_level==="high" ? (1-focusFraction)*(p.pace==="compact"?25:70) : task.energy_level==="low" ? focusFraction*15 : (1-focusFraction)*10;
            const latestRisk = due < +end && remaining-duration > supply(task,due)-duration ? (at-f.start)/minute : 0;
            choices.push({session:candidate,duration,score:index*10000+clockMinutes*.22+energyPenalty+(maximum-duration)*3+latestRisk});
          }
        }
        // Never wait for a later day just for a nicer focus window.
        if (choices.length) break;
      }
      choices.sort((a,b)=>a.score-b.score || a.session.start.localeCompare(b.session.start));
      const choice=choices[0];
      if (!choice) continue;
      const urgent=pressure.get(task.id)!.urgent;
      choice.session.id=`session:${task.id}:${choice.session.start}:${choice.duration}:${choice.session.kind}`;
      choice.session.reason=restart ? "A 15-minute restart: identify the blocker and try one small next step." :
        `${urgent ? "Deadline pressure takes precedence. " : task.priority==="high" ? "High-priority work gets an earlier window. " : "Fits your remaining capacity. "}${task.energy_level==="high" ? "Deep work stays before your evening cutoff. " : ""}Breaks and recovery around commitments are reserved.`;
      sessions.push(choice.session);left.set(task.id,remaining-choice.duration);restarted.add(task.id);placed=true;break;
    }
    if (!placed) break;
  }
  const dayStates=freeDays();
  const unplaced:PlanResult["unplaced"]=activeTasks.filter(t=>(left.get(t.id) ?? 0)>0).map(t=>{
    const due=t.deadline?+new Date(t.deadline):+end;
    const item={taskId:t.id,minutes:left.get(t.id)!};
    if(due<=floor)return {...item,cause:"deadline",reason:"The deadline has passed. Review the task's scope or deadline; no work was placed after it."};
    const windows=dayStates.flatMap(d=>{const window=studyWindow(d.day,p);if(!window)return [];const start=Math.max(window.start,ready),end=Math.min(window.end,due);return end>start?[{...d,start,end}]:[];});
    if(!windows.length)return {...item,cause:"availability",reason:"No study window remains before this deadline or the end of the planning week. Review study days, hours, or the task's scope."};
    const energyWindows=windows.map(w=>({...w,end:t.energy_level==="high"?Math.min(w.end,+dayAt(w.day,p.deepWorkEnd)):w.end})).filter(w=>w.end>w.start);
    if(!energyWindows.length)return {...item,cause:"focus",reason:`Deep work ends at ${p.deepWorkEnd}. The remaining study windows fall after that cutoff. Review scope or the deadline rather than borrowing sleep time.`};
    const free=energyWindows.map(w=>({...w,open:subtract(w,protectedIntervals).reduce((n,f)=>n+(f.end-f.start)/minute,0)}));
    if(free.every(w=>w.open===0))return {...item,cause:"protected",reason:"Fixed commitments and their recovery periods cover the available study windows. Those commitments remain protected; review scope or the deadline."};
    if(free.filter(w=>w.open>0).every(w=>w.capacity===0))return {...item,cause:"capacity",reason:"Your daily focus allowance is already used or reserved on the available days. Review the workload or your capacity preference; breathing room stays intact."};
    return {...item,cause:"constraints",reason:"No safe session was found around other work, recovery breaks, and the deadline. Try a smaller next step or review study availability. Protected time and focus limits remain intact."};
  });
  const compared=comparePlans(state.sessions,sessions.sort((a,b)=>a.start.localeCompare(b.start)),floor,+end);
  return {...compared,unplaced,warnings};
}

export function moveProblem(session: Session, sessions: Session[], fixed: FixedBlock[], preferences: PlanningPreferences, task: Task, now = new Date(), history: ProgressCheck[] = []): string | null {
  const p=planningLimits(preferences), a=+new Date(session.start), b=+new Date(session.end), day=new Date(a);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b<=a || a<+now) return "Choose a future time.";
  const window=studyWindow(day,p);
  if (!window || a<window.start || b>window.end) return "Keep sessions inside your study days and hours.";
  if (task.deadline && b>+new Date(task.deadline)) return "This session would finish after its deadline.";
  if ((task.energy_level ?? p.defaultEnergy)==="high" && b>+dayAt(day,p.deepWorkEnd)) return `Deep work should finish by ${p.deepWorkEnd}.`;
  const commitments=occurrences(fixed,addDays(dayAt(day),-1),addDays(dayAt(day),2));
  if (commitments.some(f=>overlaps(a,b,+f.start,+f.end))) return "That time is protected.";
  if (commitments.some(f=>overlaps(a,b,protectedInterval(f,p.commitmentBuffer).start,protectedInterval(f,p.commitmentBuffer).end))) return "Leave the configured recovery time around this commitment.";
  const others=sessions.filter(s=>s.id!==session.id);
  const rest=restProblem([...others.filter(s=>dateKey(new Date(s.start))===dateKey(day)),session],p,+now);
  if (rest) return rest;
  return usedMinutes(day,others,history,now)+length(session)>p.capacity-p.dailyBuffer ? "That exceeds your daily focus limit after the breathing-room reserve." : null;
}

/** Preserve observed work without painting unreported missed time as progress. */
export function archiveCheckInSessions(sessions:Session[],taskId:string,response:Response,minutes:number,now:Date):Session[] {
  if(response==="Done")return sessions.map(s=>s.taskId===taskId && +new Date(s.start)<+now?{...s,end:new Date(Math.min(+new Date(s.end),+now)).toISOString(),completed:true,locked:false}:s);
  if(response!=="Making progress" || minutes<=0)return sessions;
  const active=[...sessions].filter(s=>s.taskId===taskId && !s.completed && +new Date(s.start)<+now && +new Date(s.end)>+now).sort((a,b)=>b.start.localeCompare(a.start))[0];
  if(!active)return sessions;
  const logged:Session={...active,id:active.id+":logged:"+now.toISOString(),start:new Date(Math.max(+new Date(active.start),+now-minutes*minute)).toISOString(),end:now.toISOString(),completed:true,locked:false};
  return sessions.map(s=>s.id===active.id?logged:s);
}

/** A pure check-in transaction proposal; the UI persists task changes before the snapshot. */
export function adaptFromCheckIn(tasks: Task[], state: PlanningState, taskId: string, response: Response, minutes: number, now = new Date()) {
  const task=tasks.find(t=>t.id===taskId);
  if (!task || task.status==="done") throw new Error("This task is no longer available for a check-in.");
  if (response!=="Done" && response!=="Skip for now" && (!Number.isInteger(minutes) || minutes<5 || minutes>480)) throw new Error("Choose between 5 and 480 minutes.");
  if ((response==="Need more time" || response==="Stuck") && task.remaining_minutes+minutes>10080) throw new Error("Edit this task to reduce its remaining work before adding more time.");
  const remaining=response==="Done" ? 0 : response==="Making progress" ? Math.max(0,task.remaining_minutes-minutes) : response==="Need more time" || response==="Stuck" ? task.remaining_minutes+minutes : task.remaining_minutes;
  const updated:Task={...task,remaining_minutes:remaining,status:remaining===0?"done":response==="Stuck"?"stuck":response==="Making progress" || response==="Need more time"?"in_progress":task.status};
  const archived=archiveCheckInSessions(state.sessions,taskId,response,response==="Making progress"?Math.min(minutes,task.remaining_minutes):minutes,now);
  const history:ProgressCheck={covered_session_ids:archived.filter(s=>s.taskId===taskId && +new Date(s.start)<+now && dateKey(new Date(s.start))===dateKey(now)).map(s=>s.id),id:crypto.randomUUID(),taskId,title:task.title,response,minutes:response==="Done" || response==="Skip for now"?0:response==="Making progress"?Math.min(minutes,task.remaining_minutes):minutes,at:now.toISOString()};
  const skipped=response==="Skip for now"?[...new Set([...(state.skipped ?? []),taskId])]:(state.skipped ?? []).filter(id=>id!==taskId);
  const next={...state,skipped,sessions:archived,work_records:retainWorkRecords(state,history,now),history:[history,...state.history].slice(0,50)};
  const result=plan(tasks.map(t=>t.id===taskId?updated:t),next,now,7,now,[],{interruptTaskId:taskId,focusTaskId:response==="Need more time" || response==="Stuck"?taskId:undefined,skipTaskId:response==="Skip for now"?taskId:undefined});
  return {task:updated,state:{...next,sessions:result.sessions,lastPlan:{at:now.toISOString(),unplaced:result.unplaced,changes:result.changes,warnings:result.warnings}},result};
}
