"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, LockKeyhole, Plus, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { addDays, dateKey, dayAt, defaults, fixedSchema, moveProblem, occurrences, plan, planningSchema, preferencesSchema, responses, type FixedBlock, type PlanningState, type Response, type Session } from "@/lib/scheduling";
import type { Task, TaskInput } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";

type Props = { visible: boolean; tasks: Task[]; owner: string; preferencesOpen: boolean; closePreferences: () => void; saveTask: (input: TaskInput, id?: string) => Promise<void>; editTask: (task: Task) => void; registerExport: (state: PlanningState) => void };
const timeLabel = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const localInput = (iso: string) => { const d = new Date(iso); return `${dateKey(d)}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
export function PlanningCalendar({ visible, tasks, owner, preferencesOpen, closePreferences, saveTask, editTask, registerExport }: Props) {
  const [state, setState] = useState<PlanningState | null>(null);
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [mode, setMode] = useState<"day" | "week">("week");
  const [fixedEditor, setFixedEditor] = useState<FixedBlock | null>(null);
  const [moving, setMoving] = useState<Session | null>(null);
  const [checkTask, setCheckTask] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [unplaced, setUnplaced] = useState<ReturnType<typeof plan>["unplaced"]>([]);
  const [ai, setAi] = useState(false);
  const calendarScroll = useRef<HTMLDivElement>(null);
  const taskRef = useRef(tasks); taskRef.current = tasks;
  const key = `daylight.planning.v1.${owner}`;
  useEffect(() => {
    try { const raw = localStorage.getItem(key); setState(raw ? planningSchema.parse(JSON.parse(raw)) : defaults()); }
    catch { setProblem("Saved planning data could not be read. Your task list is safe; export your browser data before clearing planning storage."); }
    const refresh = (e: StorageEvent) => { if (e.key === key) { try { setState(e.newValue ? planningSchema.parse(JSON.parse(e.newValue)) : defaults()); } catch { setProblem("Planning data changed in another tab and could not be read."); } } };
    window.addEventListener("storage",refresh); return () => window.removeEventListener("storage",refresh);
  }, [key]);
  useEffect(() => { if (state) registerExport(state); }, [state,registerExport]);
  const ready = Boolean(state);
  useEffect(() => { if(visible && calendarScroll.current) calendarScroll.current.scrollTop=13*52; },[ready,date,mode,visible]);
  function commit(next: PlanningState) {
    // Write before replacing the optimistic UI so quota errors never silently lose a plan.
    localStorage.setItem(key,JSON.stringify(next)); setState(next);
  }
  function action(fn: () => void) { if(busy)return; try { setProblem(""); fn(); } catch(e) { setProblem(e instanceof Error ? e.message : "Could not save planning changes."); } }
  if (!state) return <div role="status">{problem || "Opening your calendar…"}</div>;
  const start = dayAt(new Date(`${date}T12:00:00`));
  if (mode === "week") start.setDate(start.getDate()-((start.getDay()+6)%7));
  const days = Array.from({ length: mode === "week" ? 7 : 1 },(_,i) => addDays(start,i));
  const fixed = occurrences(state.fixed,start,addDays(start,days.length));
  const liveSessions = state.sessions.filter(s => tasks.some(t => t.id === s.taskId && t.status !== "done"));
  const eligible = tasks.filter(t => t.status !== "done");
  const now = new Date();
  const suggested = eligible.find(t => state.sessions.some(s => s.taskId === t.id && +new Date(s.start) <= +now && +new Date(s.end) >= +now)) ?? eligible.find(t => t.deadline && +new Date(t.deadline) < +addDays(now,1));
  async function runPlan(horizon: number) {
    if (!state) return;
    setBusy(true); setProblem("");
    try {
      let order: string[] = [], source = "Local planner";
      if (ai) {
        try {
        const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
        const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ tasks: eligible, preferences: state.preferences, fixed: state.fixed, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
        if (res.ok) { order = (await res.json()).order; source = "AI-assisted planner"; }
        else source = "Local planner (AI unavailable)";
        } catch { source = "Local planner (AI unavailable)"; }
      }
      const result = plan(taskRef.current,state,new Date(),horizon);
      // Model advice only orders equal-priority, equal-deadline tasks; all placements use verified rules.
      const final = order.length ? plan(taskRef.current,state,new Date(),horizon,new Date(),order) : result;
      commit({ ...state, sessions: final.sessions }); setUnplaced(final.unplaced);
      const firstSession = final.sessions.filter(s => +new Date(s.end) > Date.now()).sort((a,b) => a.start.localeCompare(b.start))[0];
      setDate(horizon === 7 && firstSession ? dateKey(new Date(firstSession.start)) : dateKey(new Date())); setMode(horizon === 1 ? "day" : "week");
      setMessage(`${source}: ${final.sessions.filter(s => +new Date(s.end) > Date.now()).length} sessions arranged. ${final.unplaced.length ? "Some work needs more room below." : "Your protected time stays clear."}`);
    } catch(e) { setProblem(e instanceof Error ? e.message : "Planning failed. Your previous plan is still here."); }
    finally { setBusy(false); }
  }
  async function check(response: Response) {
    if (!state || busy) return;
    const task = tasks.find(t => t.id === checkTask); if (!task) return;
    setBusy(true); setProblem("");
    try {
      const left = response === "Done" ? 0 : response === "Making progress" ? Math.max(0,task.remaining_minutes-minutes) : response === "Need more time" || response === "Stuck" ? Math.min(10080,task.remaining_minutes+minutes) : task.remaining_minutes;
      const updated: Task = { ...task, remaining_minutes: left, status: left === 0 ? "done" : response === "Stuck" ? "stuck" : response === "Making progress" ? "in_progress" : task.status };
      await saveTask(updated,task.id);
      const next = { ...state, sessions: state.sessions.filter(s => s.taskId !== task.id || +new Date(s.end) <= Date.now()), history: [{ id: crypto.randomUUID(), taskId: task.id, title: task.title, response, minutes: response === "Done" || response === "Skip for now" ? 0 : minutes, at: new Date().toISOString() },...state.history].slice(0,50) };
      if (response !== "Done") {
        const candidates = tasks.map(t => t.id === task.id ? updated : t).filter(t => response !== "Skip for now" || t.id !== task.id);
        const result = plan(candidates,next,new Date(),7); next.sessions = result.sessions; setUnplaced(result.unplaced);
      }
      commit(next); setCheckTask(""); setMessage(response === "Stuck" ? "Let’s make the next step smaller. Remaining work has been replanned around your deadlines." : `${response} saved. Your plan is up to date.`);
    } catch(e) { setProblem(`Check-in could not finish: ${e instanceof Error ? e.message : "please retry"}. Task changes already saved remain in your task list.`); }
    finally { setBusy(false); }
  }
  return <section className="planning-space" aria-label="Planning calendar">
    <div className="planning-actions"><div><span className="chapter-label">MAKE ROOM FOR WHAT MATTERS</span><h2>Your week, with breathing room.</h2></div><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void runPlan(1)}><Sparkles size={15}/>{busy ? "Arranging…" : "Plan my day"}</Button><Button variant="outline" disabled={busy} onClick={() => void runPlan(7)}>Plan my week</Button><Button variant="outline" onClick={() => { setProblem(""); setFixedEditor({ id: crypto.randomUUID(),title:"",date,start:"16:00",end:"18:00",days:[] }); }}><Plus size={15}/>Protected time</Button></div></div>
    <div className="planning-caption"><span><LockKeyhole size={13}/> Fixed time stays protected · Drag study sessions, or click to move</span><label><input type="checkbox" checked={ai} onChange={e => setAi(e.target.checked)}/> AI assistance <small>(requires a configured server and sign-in)</small></label></div>
    {problem && <div role="alert" className="error-banner">{problem}</div>}
    {message && <div role="status" className="plan-message">{message}</div>}
    {state.preferences.checkIns && suggested && <div className="checkin-nudge"><div><strong>A small check-in?</strong><p>How is “{suggested.title}” going?</p></div><Button variant="outline" onClick={() => { setCheckTask(suggested.id); setMinutes(30); }}>Check in</Button></div>}
    <div className="calendar-card"><div className="calendar-toolbar"><div className="flex items-center gap-2"><button aria-label="Previous period" onClick={() => setDate(dateKey(addDays(start,-days.length)))}><ChevronLeft size={18}/></button><button aria-label="Next period" onClick={() => setDate(dateKey(addDays(start,days.length)))}><ChevronRight size={18}/></button><strong>{start.toLocaleDateString([], { month:"long",day:"numeric" })}{mode === "week" ? ` – ${days[6].toLocaleDateString([], { month:"short",day:"numeric" })}` : ""}</strong></div><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setDate(dateKey(new Date()))}>Today</Button><input aria-label="Calendar date" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)}/><div className="view-toggle">{(["day","week"] as const).map(v => <button key={v} aria-pressed={mode===v} onClick={() => setMode(v)}>{v}</button>)}</div></div></div>
    <div className="calendar-scroll" ref={calendarScroll}><div className={`calendar-grid ${mode}`} style={{ gridTemplateColumns:`48px repeat(${days.length}, minmax(${mode === "week" ? 115 : 240}px,1fr))` }}>
      <div className="calendar-zone">{Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replaceAll("_"," ")}</div>{days.map(d => <div className={`calendar-day ${dateKey(d) === dateKey(now) ? "is-today" : ""}`} key={dateKey(d)}>{d.toLocaleDateString([], { weekday:"short" })}<strong>{d.getDate()}</strong></div>)}
      <div className="calendar-hours">{Array.from({length:24},(_,h) => <span key={h} style={{top:h*52}}>{h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h-12}p`}</span>)}</div>
      {days.map(d => {
        const renderPosition = (a: Date,b: Date) => { const startMinute = a < d ? 0 : a.getHours()*60+a.getMinutes(), endMinute = b >= addDays(d,1) ? 1440 : b.getHours()*60+b.getMinutes(); return { top:startMinute/60*52, height:Math.max(22,(endMinute-startMinute)/60*52) }; };
        return <div className="calendar-column" key={dateKey(d)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if(busy)return; const s = liveSessions.find(s => s.id === e.dataTransfer.getData("text/plain")); if(!s)return; const bounds = e.currentTarget.getBoundingClientRect(); const offset = Math.max(0,Math.min(1425,Math.round((e.clientY-bounds.top)/52*4)*15)); const a = new Date(d); a.setMinutes(offset); const moved = { ...s,start:a.toISOString(),end:new Date(+a+(+new Date(s.end)-+new Date(s.start))).toISOString() }; action(() => { const task = tasks.find(t => t.id===s.taskId)!; const issue = moveProblem(moved,liveSessions,state.fixed,state.preferences,task); if(issue)throw new Error(issue); commit({...state,sessions:state.sessions.map(x => x.id===s.id ? moved:x)}); }); }}>
          {fixed.filter(f => f.start < addDays(d,1) && f.end > d).map(f => <div key={f.id} className="calendar-block fixed-block" style={renderPosition(f.start,f.end)} title={`${f.title} · protected`}><LockKeyhole size={11}/><strong>{f.title}</strong><small>{timeLabel(f.start)}–{timeLabel(f.end)}</small></div>)}
          {liveSessions.filter(s => dateKey(new Date(s.start))===dateKey(d)).map(s => { const task = tasks.find(t => t.id===s.taskId)!; return <button key={s.id} className={`calendar-block study-block energy-${task.energy_level}`} style={renderPosition(new Date(s.start),new Date(s.end))} draggable={!busy} onDragStart={e => e.dataTransfer.setData("text/plain",s.id)} onClick={() => {setMoving(s);setProblem("");}} title={`${task.title}: ${s.reason}`}><strong>{task.title}</strong><small>{timeLabel(new Date(s.start))} · {task.subject}</small></button>; })}
          {dateKey(d)===dateKey(now) && <div className="now-line" style={{top:(now.getHours()+now.getMinutes()/60)*52}}/>}
        </div>;
      })}
    </div></div></div>
    <div className="planning-details"><div><h3><LockKeyhole size={15}/> Protected time</h3><p>Recurring blocks begin on their start date. Overnight blocks continue into the next day.</p>{state.fixed.map(b => <button className="protected-row" key={b.id} onClick={() => {setFixedEditor(b);setProblem("");}}><strong>{b.title}</strong><span>{b.start}–{b.end} · {b.days.length ? b.days.map(d => ["Su","Mo","Tu","We","Th","Fr","Sa"][d]).join(", ") : b.date}</span></button>)}</div><div><h3><CalendarDays size={15}/> Work & progress</h3>{eligible.length === 0 && <p>Add a task to start planning.</p>}{eligible.map(t => <div key={t.id} className="progress-row"><button onClick={() => editTask(t)}>{t.title}<small>{t.remaining_minutes}m left · {t.priority} priority</small></button><Button variant="ghost" size="sm" onClick={() => {setCheckTask(t.id);setMinutes(30);}}>Check in</Button></div>)}</div></div>
    {unplaced.length > 0 && <div className="capacity-warning" role="status"><h3>A little more room is needed</h3>{unplaced.map(u => <p key={u.taskId}><strong>{tasks.find(t => t.id===u.taskId)?.title}</strong> · {u.minutes}m unscheduled. {u.reason}</p>)}</div>}
    {state.history.length > 0 && <details className="checkin-history"><summary>Recent check-ins ({state.history.length})</summary>{state.history.slice(0,10).map(h => <p key={h.id}><strong>{h.title}</strong> · {h.response}{h.minutes ? ` · ${h.minutes}m` : ""}<small>{new Date(h.at).toLocaleString()}</small></p>)}</details>}
    <p className="planning-storage">Calendar, preferences, and check-ins are saved in this browser for {owner === "local-demo" ? "demo mode" : "your account"}. Export includes planning data. Times follow this device’s timezone.</p>

    <Dialog open={Boolean(fixedEditor)} onOpenChange={open => !open && setFixedEditor(null)}><DialogContent><DialogTitle className="text-xl font-semibold">{state.fixed.some(b => b.id===fixedEditor?.id) ? "Edit protected time" : "Make space for life"}</DialogTitle><DialogDescription className="mt-2 text-sm">Classes, sport, sleep. Your planner keeps this time clear.</DialogDescription>{fixedEditor && <form className="planning-form" onSubmit={e => {e.preventDefault();action(() => {const parsed = fixedSchema.parse(fixedEditor); const next = {...state,fixed:[...state.fixed.filter(b=>b.id!==parsed.id),parsed]}; const conflicts = next.sessions.some(s => occurrences([parsed],new Date(s.start),new Date(s.end)).length > 0); if(conflicts) { next.sessions = next.sessions.filter(s => occurrences([parsed],new Date(s.start),new Date(s.end)).length === 0); const result = plan(tasks,next,new Date(),7); next.sessions=result.sessions;setUnplaced(result.unplaced);setMessage("Protected time saved; upcoming work has been rearranged."); } commit(next);setFixedEditor(null);});}}><label className="field">Title<input required maxLength={100} value={fixedEditor.title} onChange={e=>setFixedEditor({...fixedEditor,title:e.target.value})}/></label><label className="field">Starting date<input required type="date" value={fixedEditor.date} onChange={e=>setFixedEditor({...fixedEditor,date:e.target.value})}/></label><div className="form-pair"><label className="field">Start<input required type="time" value={fixedEditor.start} onChange={e=>setFixedEditor({...fixedEditor,start:e.target.value})}/></label><label className="field">End<input required type="time" value={fixedEditor.end} onChange={e=>setFixedEditor({...fixedEditor,end:e.target.value})}/></label></div><fieldset><legend>Repeat weekly · leave empty for once</legend><div className="weekday-picker">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((label,d)=><label key={d}><input type="checkbox" checked={fixedEditor.days.includes(d)} onChange={e=>setFixedEditor({...fixedEditor,days:e.target.checked ? [...fixedEditor.days,d] : fixedEditor.days.filter(x=>x!==d)})}/>{label}</label>)}</div></fieldset>{problem && <p role="alert" className="text-red-700 text-sm">{problem}</p>}<div className="flex justify-between gap-2">{state.fixed.some(b=>b.id===fixedEditor.id) && <Button type="button" variant="ghost" onClick={()=>action(()=>{commit({...state,fixed:state.fixed.filter(b=>b.id!==fixedEditor.id)});setFixedEditor(null);})}>Delete block</Button>}<Button type="submit">Save protected time</Button></div></form>}</DialogContent></Dialog>
    <Dialog open={preferencesOpen} onOpenChange={open=>!open && closePreferences()}><DialogContent><DialogTitle className="text-xl font-semibold">Your pace comes first.</DialogTitle><DialogDescription className="mt-2 text-sm">Daily study hours in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Saving preferences replans the next seven days.</DialogDescription><form className="planning-form" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);action(()=>{const preferences=preferencesSchema.parse({workStart:data.get("workStart"),workEnd:data.get("workEnd"),focusStart:data.get("focusStart"),focusEnd:data.get("focusEnd"),capacity:Number(data.get("capacity")),session:Number(data.get("session")),pause:Number(data.get("pause")),checkIns:data.get("checkIns")==="on"});const next={...state,preferences};const result=plan(tasks,next,new Date(),7);commit({...next,sessions:result.sessions});setUnplaced(result.unplaced);closePreferences();setMessage("Preferences saved. Your upcoming week has been rearranged.");});}}>{([["workStart","Study starts"],["workEnd","Study ends"],["focusStart","High focus starts"],["focusEnd","High focus ends"]] as const).map(([name,label])=><label className="field" key={name}>{label}<input required type="time" name={name} defaultValue={state.preferences[name]}/></label>)}<div className="form-pair">{([["capacity","Daily focus limit",15,720],["session","Session minutes",15,120],["pause","Break minutes",0,60]] as const).map(([name,label,min,max])=><label className="field" key={name}>{label}<input required type="number" name={name} min={min} max={max} defaultValue={state.preferences[name]}/></label>)}</div><label className="text-sm"><input name="checkIns" type="checkbox" defaultChecked={state.preferences.checkIns}/> Show a gentle check-in suggestion</label>{problem && <p role="alert" className="text-red-700 text-sm">{problem}</p>}<Button type="submit">Save preferences</Button></form></DialogContent></Dialog>
    <Dialog open={Boolean(moving)} onOpenChange={open=>!open && setMoving(null)}><DialogContent><DialogTitle className="text-xl font-semibold">Move study session</DialogTitle><DialogDescription className="mt-2 text-sm">{tasks.find(t=>t.id===moving?.taskId)?.title} · {moving?.reason}</DialogDescription>{moving && <form className="planning-form" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);action(()=>{const a=new Date(String(data.get("start")));const next={...moving,start:a.toISOString(),end:new Date(+a+(+new Date(moving.end)-+new Date(moving.start))).toISOString()};const issue=moveProblem(next,liveSessions,state.fixed,state.preferences,tasks.find(t=>t.id===next.taskId)!);if(issue)throw new Error(issue);commit({...state,sessions:state.sessions.map(s=>s.id===next.id?next:s)});setMoving(null);});}}><label className="field">New start time<input required type="datetime-local" name="start" defaultValue={localInput(moving.start)}/></label>{problem && <p role="alert" className="text-red-700 text-sm">{problem}</p>}<div className="flex justify-between"><Button type="button" variant="ghost" onClick={()=>action(()=>{commit({...state,sessions:state.sessions.filter(s=>s.id!==moving.id)});setMoving(null);})}>Unschedule</Button><Button type="submit">Move session</Button></div></form>}</DialogContent></Dialog>
    <Dialog open={Boolean(checkTask)} onOpenChange={open=>!open && !busy && setCheckTask("")}><DialogContent><DialogTitle className="text-xl font-semibold">How’s it going?</DialogTitle><DialogDescription className="mt-2 text-sm">{tasks.find(t=>t.id===checkTask)?.title}. A quick update helps your plan keep up with you.</DialogDescription><div className="planning-form"><label className="field">Minutes completed or extra time needed<input type="number" min={5} max={480} step={5} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><div className="checkin-options">{responses.map(r=><Button key={r} variant={r==="Done"?"default":"outline"} disabled={busy || !Number.isInteger(minutes) || minutes < 5 || minutes > 480} onClick={()=>void check(r)}>{r}</Button>)}</div><p className="text-sm text-muted-foreground">Progress subtracts minutes; extra time and stuck add minutes. Skip leaves this task out of this replan. Deadlines stay unchanged.</p>{problem && <p role="alert" className="text-red-700 text-sm">{problem}</p>}</div></DialogContent></Dialog>
  </section>;
}
