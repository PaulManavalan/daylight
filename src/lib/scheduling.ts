import { z } from "zod";
import type { Task } from "./types";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const preferencesSchema = z.object({
  workStart: clock, workEnd: clock, focusStart: clock, focusEnd: clock,
  capacity: z.number().int().min(15).max(720), session: z.number().int().min(15).max(120),
  pause: z.number().int().min(0).max(60), checkIns: z.boolean(),
}).refine(p => p.workStart < p.workEnd && p.focusStart < p.focusEnd, "Windows must end after they start.");
export type PlanningPreferences = z.infer<typeof preferencesSchema>;
export const fixedSchema = z.object({
  id: z.string(), title: z.string().trim().min(1).max(100), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: clock, end: clock, days: z.array(z.number().int().min(0).max(6)),
}).refine(b => b.start !== b.end, "Choose different start and end times.");
export type FixedBlock = z.infer<typeof fixedSchema>;
export const sessionSchema = z.object({ id: z.string(), taskId: z.string(), start: z.iso.datetime(), end: z.iso.datetime(), reason: z.string() });
export type Session = z.infer<typeof sessionSchema>;
export const responses = ["Done", "Making progress", "Need more time", "Stuck", "Skip for now"] as const;
export type Response = typeof responses[number];
export interface ProgressCheck { id: string; taskId: string; title: string; response: Response; minutes: number; at: string }
export const planningSchema = z.object({
  preferences: preferencesSchema, fixed: z.array(fixedSchema), sessions: z.array(sessionSchema),
  history: z.array(z.object({ id: z.string(), taskId: z.string(), title: z.string(), response: z.enum(responses), minutes: z.number(), at: z.iso.datetime() })),
});
export type PlanningState = z.infer<typeof planningSchema>;
export function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
export function dayAt(d: Date, time = "00:00") { return new Date(`${dateKey(d)}T${time}:00`); }
export function addDays(d: Date, n: number) { const next = new Date(d); next.setDate(next.getDate()+n); return next; }
export function defaults(): PlanningState {
  return { preferences: { workStart: "15:00", workEnd: "21:30", focusStart: "18:00", focusEnd: "20:00", capacity: 180, session: 45, pause: 10, checkIns: true },
    fixed: [
      { id: "school", title: "School", date: "2020-01-01", start: "08:00", end: "15:00", days: [1,2,3,4,5] },
      { id: "soccer", title: "Soccer practice", date: "2020-01-01", start: "16:00", end: "18:00", days: [2,4] },
      { id: "sleep", title: "Sleep", date: "2020-01-01", start: "23:00", end: "07:00", days: [0,1,2,3,4,5,6] },
    ], sessions: [], history: [] };
}
export interface Occurrence { id: string; title: string; start: Date; end: Date }
export function occurrences(fixed: FixedBlock[], from: Date, to: Date): Occurrence[] {
  const result: Occurrence[] = [];
  for (let d = addDays(dayAt(from),-1); d < to; d = addDays(d,1)) {
    for (const b of fixed) {
      if (dateKey(d) < b.date || (b.days.length ? !b.days.includes(d.getDay()) : dateKey(d) !== b.date)) continue;
      const start = dayAt(d,b.start), end = dayAt(b.end < b.start ? addDays(d,1) : d,b.end);
      if (end > from && start < to) result.push({ id: `${b.id}:${dateKey(d)}`, title: b.title, start, end });
    }
  }
  return result;
}
export const overlaps = (a: number, b: number, c: number, d: number) => a < d && b > c;
export interface PlanResult { sessions: Session[]; unplaced: { taskId: string; minutes: number; reason: string }[] }
// Local wall-time windows intentionally follow the browser timezone, including DST.
export function plan(tasks: Task[], state: PlanningState, from: Date, days: number, now = new Date(), order: string[] = []): PlanResult {
  const p = state.preferences, start = dayAt(from), end = addDays(start,days), floor = Math.max(+start,+now);
  const fixed = occurrences(state.fixed,start,end);
  // Keep earlier work and future work outside this planning horizon. Missed sessions are reclaimed.
  const kept = state.sessions.filter(s => tasks.some(t => t.id === s.taskId && t.status !== "done") && (
    +new Date(s.start) >= +end || +new Date(s.end) <= +start && +new Date(s.end) <= +now ||
    +new Date(s.start) <= +now && +new Date(s.end) > +now));
  const sessions = [...kept], unplaced: PlanResult["unplaced"] = [];
  const rank = { high: 0, medium: 1, low: 2 };
  const sorted = tasks.filter(t => t.status !== "done").sort((a,b) => {
    const ad = a.deadline ? +new Date(a.deadline) : Infinity, bd = b.deadline ? +new Date(b.deadline) : Infinity;
    return ad-bd || rank[a.priority]-rank[b.priority] || (order.indexOf(a.id) < 0 ? 999 : order.indexOf(a.id))-(order.indexOf(b.id) < 0 ? 999 : order.indexOf(b.id));
  });
  for (const task of sorted) {
    let left = Math.max(0,task.remaining_minutes - kept.filter(s => s.taskId === task.id && +new Date(s.end) > +now).reduce((n,s) => n+(+new Date(s.end)-+new Date(s.start))/60000,0));
    while (left > 0) {
      const candidates: { start: number; minutes: number; focus: boolean }[] = [];
      for (let d = start; d < end; d = addDays(d,1)) {
        const a = +dayAt(d,p.workStart), b = Math.min(+dayAt(d,p.workEnd),task.deadline ? +new Date(task.deadline) : Infinity);
        const used = sessions.filter(s => dateKey(new Date(s.start)) === dateKey(d)).reduce((n,s) => n+(+new Date(s.end)-+new Date(s.start))/60000,0);
        const maximum = Math.min(left,p.session,p.capacity-used);
        if (maximum <= 0) continue;
        for (let t = Math.ceil(Math.max(a,floor)/300000)*300000; t < b; t+=300000) {
          const obstacles = [...fixed.map(f => ({start:+f.start,end:+f.end})),...sessions.map(s => ({start:+new Date(s.start)-p.pause*60000,end:+new Date(s.end)+p.pause*60000}))];
          if (obstacles.some(o => t >= o.start && t < o.end)) continue;
          const freeEnd = Math.min(b,...obstacles.filter(o=>o.start>=t).map(o=>o.start));
          const duration = Math.min(maximum,Math.floor((freeEnd-t)/60000));
          if (duration < Math.min(15,left)) continue;
          const finish = t+duration*60000;
          candidates.push({ start: t, minutes: duration, focus: t >= +dayAt(d,p.focusStart) && finish <= +dayAt(d,p.focusEnd) });
        }
      }
      // Prefer focus time on the earliest available day; never delay urgent work to a later day for energy.
      const firstDay = candidates[0] ? dateKey(new Date(candidates[0].start)) : "";
      const chosen = task.energy_level === "high" ? candidates.find(c => c.focus && dateKey(new Date(c.start)) === firstDay) ?? candidates[0] : candidates[0];
      if (!chosen) break;
      sessions.push({ id: crypto.randomUUID(), taskId: task.id, start: new Date(chosen.start).toISOString(), end: new Date(chosen.start+chosen.minutes*60000).toISOString(), reason: chosen.focus ? "A clear focus window, with room for a break." : "Fits your study hours, capacity, and deadline." });
      left -= chosen.minutes;
    }
    if (left > 0) unplaced.push({ taskId: task.id, minutes: left, reason: task.deadline && +new Date(task.deadline) < floor ? "Deadline has passed. Review the deadline or scope." : "Not enough free time before the deadline or planning horizon. Reduce scope or adjust availability." });
  }
  return { sessions, unplaced };
}
export function moveProblem(session: Session, sessions: Session[], fixed: FixedBlock[], preferences: PlanningPreferences, task: Task, now = new Date()): string | null {
  const a = +new Date(session.start), b = +new Date(session.end), d = new Date(a);
  if (!Number.isFinite(a) || b <= a || a < +now) return "Choose a future time.";
  if (a < +dayAt(d,preferences.workStart) || b > +dayAt(d,preferences.workEnd)) return "Keep sessions inside your study hours.";
  if (task.deadline && b > +new Date(task.deadline)) return "This session would finish after its deadline.";
  if (occurrences(fixed,d,new Date(b)).some(f => overlaps(a,b,+f.start,+f.end))) return "That time is protected.";
  if (sessions.some(s => s.id !== session.id && overlaps(a,b,+new Date(s.start)-preferences.pause*60000,+new Date(s.end)+preferences.pause*60000))) return "Leave room for other sessions and breaks.";
  const used = sessions.filter(s => s.id !== session.id && dateKey(new Date(s.start)) === dateKey(d)).reduce((n,s) => n+(+new Date(s.end)-+new Date(s.start))/60000,0);
  return used+(b-a)/60000 > preferences.capacity ? "That exceeds your daily focus capacity." : null;
}
