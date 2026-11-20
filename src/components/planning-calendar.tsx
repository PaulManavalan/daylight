"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, LockKeyhole, Pin, Plus, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { adaptFromCheckIn, addDays, dateKey, dayAt, defaults, fixedSchema, moveProblem, occurrences, plan, planningLimits, responses, type PlanResult, type PlanningPreferences, type FixedBlock, type PlanningState, type Response, type Session } from "@/lib/scheduling";
import type { Task, TaskInput } from "@/lib/types";
import { selectCheckInTask } from "@/lib/check-ins";
import { SessionDetails } from "./session-details";
import { PlanningStore } from "@/lib/planning-store";
import { PlanningPreferencesDialog } from "./planning-preferences";

export interface CalendarCommand {id:number;action:"plan_day"|"show_day"|"check_in"|"conversation_plan";taskId?:string}
type Props = { command?:CalendarCommand|null; onCommandHandled?:(id:number)=>void; visible: boolean; addTask: () => void; openPreferences: () => void; tasks: Task[]; owner: string; preferencesOpen: boolean; closePreferences: () => void; saveTask: (input: TaskInput, id?: string,expected?:Task) => Promise<void>; editTask: (task: Task) => void; registerExport: (state: PlanningState) => void };
const timeLabel = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const localInput = (iso: string) => { const d = new Date(iso); return `${dateKey(d)}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
export function PlanningCalendar({ command, onCommandHandled, visible, addTask, openPreferences, tasks, owner, preferencesOpen, closePreferences, saveTask, editTask, registerExport }: Props) {
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
  const [needsRecovery,setNeedsRecovery]=useState(false);
  const [unappliedCheckIn,setUnappliedCheckIn]=useState(false);
  const [warnings,setWarnings]=useState<string[]>([]);
  const [unplaced, setUnplaced] = useState<ReturnType<typeof plan>["unplaced"]>([]);
  const [changes, setChanges] = useState<PlanResult["changes"]>([]);
  const [revision, setRevision] = useState(0);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ session: Session; issue: string | null } | null>(null);
  const dragOffset = useRef(0);
  const lastDrag = useRef(-Infinity);
  const operation = useRef(false);
  const handledCommand=useRef<number|null>(null);
  const calendarScroll = useRef<HTMLDivElement>(null);
  const taskRef = useRef(tasks); taskRef.current = tasks;
  const store=useMemo(()=>new PlanningStore({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value),removeItem:key=>window.localStorage.removeItem(key)},owner),[owner]);
  const savedRaw=useRef<string|null>(null);
  const observedTasks=useRef("");
  const taskSignature=(rows:Task[])=>JSON.stringify(rows.map(t=>[t.id,t.remaining_minutes,t.status,t.deadline,t.priority,t.energy_level]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  const key=store.key;
  useEffect(()=>{
    function load(){
      try {
        const loaded=store.recover(taskRef.current);savedRaw.current=loaded.raw;observedTasks.current=taskSignature(taskRef.current);
        setState(loaded.state);setUnplaced(loaded.state.lastPlan?.unplaced ?? []);setChanges(loaded.state.lastPlan?.changes ?? []);setWarnings(loaded.state.lastPlan?.warnings ?? []);
        setNeedsRecovery(Boolean(loaded.needsReview));setUnappliedCheckIn(Boolean(loaded.needsReview));setProblem(loaded.needsReview?loaded.notice:"");if(loaded.notice && !loaded.needsReview)setMessage(loaded.notice);
      }catch(e){setNeedsRecovery(true);setProblem(e instanceof Error?e.message:"Saved planning data could not be read.");}
    }
    load();
    const refresh=(event:StorageEvent)=>{if(event.key===key || event.key===null)load();};
    window.addEventListener("storage",refresh);return()=>window.removeEventListener("storage",refresh);
  },[key,store]);
  useEffect(()=>{
    if(!state)return;
    const signature=taskSignature(tasks);if(signature===observedTasks.current)return;observedTasks.current=signature;
    if(operation.current || needsRecovery || (!state.sessions.length && !state.lastPlan))return;
    try {const result=plan(tasks,state,new Date(),7);showResult(state,result,"Task changes saved. Your flexible work has been refreshed around your locks and deadlines.");}
    catch(e){setProblem(e instanceof Error?e.message:"Could not refresh the calendar after editing a task.");}
  },[tasks,store]);
  useEffect(()=>{
    if(!state || busy || needsRecovery || !command || handledCommand.current===command.id)return;
    handledCommand.current=command.id;onCommandHandled?.(command.id);
    if(command.action==="conversation_plan"){
      try {
        const loaded=store.load();savedRaw.current=loaded.raw;observedTasks.current=taskSignature(taskRef.current);setState(loaded.state);setProblem("");
        setUnplaced(loaded.state.lastPlan?.unplaced ?? []);setChanges(loaded.state.lastPlan?.changes ?? []);setWarnings(loaded.state.lastPlan?.warnings ?? []);
        setMessage("Your conversation is now a plan. Tasks and protected events are saved; anything that cannot fit is listed below.");
        setDate(dateKey(new Date()));setMode("day");setRevision(r=>r+1);
      }catch(e){setProblem(e instanceof Error?e.message:"The plan is saved, but could not be opened. Reload safely.");}
      return;
    }
    if(command.action==="plan_day"){void runPlan(1);return;}
    setDate(dateKey(new Date()));setMode("day");
    if(command.action==="check_in" && tasks.some(t=>t.id===command.taskId && t.status!=="done")){setCheckTask(command.taskId!);setMinutes(30);setProblem("");}
  },[command,state,busy,needsRecovery]);
  useEffect(() => { if (state) registerExport(state); }, [state,registerExport]);
  useEffect(()=>{if(!highlighted.length)return;const timer=setTimeout(()=>setHighlighted([]),5000);return ()=>clearTimeout(timer);},[highlighted]);
  const ready = Boolean(state);
  useEffect(() => { if(visible && calendarScroll.current) calendarScroll.current.scrollTop=13*52; },[ready,date,mode,visible]);
  function commit(next: PlanningState) {
    // Write before replacing the optimistic UI so quota errors never silently lose a plan.
    try{savedRaw.current=store.save(next,savedRaw.current);setState(next);}catch(error){try{if(store.hasPending())setNeedsRecovery(true);}catch{setNeedsRecovery(true);}throw error;}
  }
  function action(fn: () => void) { if(busy || operation.current || needsRecovery)return; try { setProblem(""); fn(); } catch(e) { if(e instanceof Error && /check-in.*(recovery|another tab)/i.test(e.message))setNeedsRecovery(true); setProblem(e instanceof Error ? e.message : "Could not save planning changes."); } }
  function downloadBackup(raw=false){
    try {
      const data=raw?store.rawBackup():{version:2,exported_at:new Date().toISOString(),tasks,planning:state};
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download=raw?"daylight-storage-recovery.json":"daylight-backup.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setProblem("This browser is blocking storage access. Allow site storage, then reload Daylight.");}
  }
  if (!state) return <div role={problem?"alert":"status"} className="planning-empty"><strong>{problem || "Opening your calendar…"}</strong>{problem && <Button variant="outline" onClick={()=>downloadBackup(true)}>Download storage backup</Button>}</div>;
  const start = dayAt(new Date(`${date}T12:00:00`));
  if (mode === "week") start.setDate(start.getDate()-((start.getDay()+6)%7));
  const days = Array.from({ length: mode === "week" ? 7 : 1 },(_,i) => addDays(start,i));
  const fixed = occurrences(state.fixed,start,addDays(start,days.length));
  const now = new Date();
  const limits=planningLimits(state.preferences);
  const liveSessions = state.sessions.filter(s => !s.completed && tasks.some(t => t.id === s.taskId && t.status !== "done"));
  const completedSessions=state.sessions.filter(s=>tasks.some(t=>t.id===s.taskId) && (s.completed || tasks.some(t=>t.id===s.taskId && t.status==="done" && +new Date(s.end)<=+now)));
  const eligible = tasks.filter(t => t.status !== "done");
  const suggested=selectCheckInTask(tasks,state,now);
  function showResult(next: PlanningState, result: PlanResult, text: string) {
    commit({ ...next, skipped:(next.skipped ?? []).filter(id=>taskRef.current.some(t=>t.id===id && t.status!=="done")), history:next.history.filter(h=>taskRef.current.some(t=>t.id===h.taskId)), sessions: result.sessions, lastPlan: {at:new Date().toISOString(),unplaced:result.unplaced,changes:result.changes,warnings:result.warnings} });
    setUnplaced(result.unplaced);setWarnings(result.warnings); setChanges(result.changes); setRevision(r=>r+1);
    setHighlighted([...new Set(result.changes.map(c=>c.taskId))]);
    setMessage(text);
  }
  async function runPlan(horizon: number) {
    if (!state || operation.current || needsRecovery) return;
    operation.current=true; setBusy(true);setProblem("");
    try {
      // Yield a frame so planning feedback paints before the bounded local computation.
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      // Planning today also rearranges the rest of the week, so tomorrow's sessions
      // cannot hide a high-priority task from today's available time.
      const next={...state,skipped:[]};
      const result=plan(taskRef.current,next,new Date(),7);
      const first=result.sessions.find(s=>+new Date(s.end)>Date.now());
      const at=new Date(),today=result.sessions.filter(s=>!s.completed && new Date(s.end)>at && dateKey(new Date(s.start))===dateKey(at));
      const todayMinutes=today.reduce((sum,s)=>sum+Math.round((Date.parse(s.end)-Math.max(Date.parse(s.start),+at))/60000),0);
      const later=result.sessions.filter(s=>!s.completed && new Date(s.end)>at && dateKey(new Date(s.start))!==dateKey(at)).length;
      const summary=today.length?`Today: ${todayMinutes} focused minutes across ${today.length} ${today.length===1?"session":"sessions"}.`:"No study sessions remain today.";
      showResult(next,result,`Local planner: ${summary} ${later?`${later} sessions arranged later this week. `:""}${result.unplaced.length?"Some work needs a scope or availability decision below.":"Your commitments and breathing room stay protected."}`);
      setDate(horizon===7 && first ? dateKey(new Date(first.start)) : dateKey(new Date()));
      setMode(horizon===1?"day":"week");
    } catch(e) {setProblem(e instanceof Error?e.message:"Could not arrange your plan.");}
    finally {operation.current=false;setBusy(false);}
  }
  async function check(response: Response) {
    if (!state || operation.current) return;
    operation.current=true;setBusy(true);setProblem("");
    try {
      const proposal=adaptFromCheckIn(taskRef.current,state,checkTask,response,minutes);
      const before=taskRef.current.find(t=>t.id===proposal.task.id)!;
      store.stage(before,proposal.task,proposal.state.history[0],savedRaw.current);
      observedTasks.current=taskSignature(taskRef.current.map(t=>t.id===proposal.task.id?proposal.task:t));
      await saveTask(proposal.task,proposal.task.id,before);
      const moved=proposal.result.changes.filter(c=>c.kind==="moved").length;
      const removed=proposal.result.changes.filter(c=>c.kind==="removed").length;
      showResult(proposal.state,proposal.result,`${response} saved. ${moved} sessions moved${removed?`, ${removed} displaced`:""}. ${response==="Stuck"?"Start with a small 15-minute restart; later work has been rearranged.":"The rest of your week has been rebalanced around hard deadlines."}`);
      store.finish();setCheckTask("");setDate(dateKey(new Date()));
    } catch(e) {setNeedsRecovery(true);setProblem(`Check-in could not finish: ${e instanceof Error?e.message:"please retry"}. Reload before trying again; a saved task update will be recovered without adding time twice.`);}
    finally {operation.current=false;setBusy(false);}
  }
  function savePreferences(preferences: PlanningPreferences) {
    if(!state)return;
    action(()=>{
      const next={...state,preferences};const result=plan(tasks,next,new Date(),7);
      showResult(next,result,"Preferences saved. Your week now follows these study hours, recovery breaks, and daily limits.");
      closePreferences();
    });
  }
  function proposedDrop(day: Date, clientY: number, top: number) {
    if(!state)return null;
    const original=liveSessions.find(s=>s.id===dragId);if(!original)return null;
    const offset=Math.max(0,Math.min(1425,Math.round(((clientY-top)*60/52-dragOffset.current)/15)*15));
    const at=new Date(day);at.setMinutes(offset);
    const session={...original,start:at.toISOString(),end:new Date(+at+(+new Date(original.end)-+new Date(original.start))).toISOString()};
    const task=tasks.find(t=>t.id===session.taskId)!;
    return {session,issue:moveProblem(session,liveSessions,state.fixed,state.preferences,task,new Date(),state.work_records ?? state.history)};
  }
  function moveSession(next:Session):boolean {
    if(!state || operation.current || needsRecovery)return false;
    try {
      setProblem("");const task=tasks.find(t=>t.id===next.taskId);if(!task)throw new Error("This task was removed.");
      const issue=moveProblem(next,liveSessions,state.fixed,state.preferences,task,new Date(),state.work_records ?? state.history);if(issue)throw new Error(issue);
      commit({...state,sessions:state.sessions.map(s=>s.id===next.id?next:s)});
      setHighlighted([next.taskId]);setMessage(`Session moved to ${new Date(next.start).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"})}. ${next.locked?"This time will be kept when replanning.":"Your other sessions stay in place."}`);return true;
    }catch(e){setProblem(e instanceof Error?e.message:"Could not move this session.");return false;}
  }
  function toggleSessionLock(){
    if(!moving || !state)return;
    action(()=>{
      const selected={...moving,locked:!moving.locked};
      if(selected.locked){const task=tasks.find(t=>t.id===selected.taskId)!;const issue=moveProblem(selected,liveSessions,state.fixed,state.preferences,task,new Date(),state.work_records ?? state.history);if(issue)throw new Error(issue);}
      commit({...state,sessions:state.sessions.map(s=>s.id===selected.id?selected:s)});setMoving(selected);
      setMessage(selected.locked?"This study time is kept for future plans. Fixed commitments and deadlines still come first.":"This session is flexible again.");
    });
  }
  return <section className="planning-space" aria-label="Planning calendar" aria-busy={busy}>
    <div className="planning-actions"><div><span className="chapter-label">MAKE ROOM FOR WHAT MATTERS</span><h2>Your week, with breathing room.</h2></div><div className="flex flex-wrap gap-2"><Button disabled={busy || needsRecovery} onClick={() => void runPlan(1)}><Sparkles size={15}/>{busy ? "Arranging…" : "Plan my day"}</Button><Button variant="outline" disabled={busy || needsRecovery} onClick={() => void runPlan(7)}>Plan my week</Button><Button variant="outline" disabled={busy} onClick={() => { setProblem(""); setFixedEditor({ id: crypto.randomUUID(),title:"",date,start:"16:00",end:"18:00",days:[] }); }}><Plus size={15}/>Protected time</Button><Button variant="ghost" aria-label="Export planner backup" onClick={()=>downloadBackup()}><Download size={15}/>Export</Button></div></div>
    <div className="planning-caption"><span><LockKeyhole size={13}/> Fixed time stays protected · Drag study sessions, or click to move</span><span className="local-planner-badge"><Sparkles size={13}/> Smart local planning · Free · No account needed</span></div>
    {problem && <div role="alert" className="error-banner">{problem}{needsRecovery && <div className="recovery-actions"><Button size="sm" variant="outline" onClick={()=>window.location.reload()}>Reload safely</Button><Button size="sm" variant="ghost" onClick={()=>downloadBackup(true)}>Download storage backup</Button>{unappliedCheckIn && <Button size="sm" variant="outline" onClick={()=>{try{store.dismissUnapplied(taskRef.current);window.location.reload();}catch(e){setProblem(e instanceof Error?e.message:"Could not dismiss this check-in. Your saved data is unchanged.");}}}>Keep current tasks & dismiss check-in</Button>}</div>}</div>}
    {message && <div role="status" className="plan-message" key={`message-${revision}`}>{message}</div>}
    <div className="planning-rules"><span>{limits.capacity-limits.dailyBuffer}m planned / day</span><span>{limits.dailyBuffer}m daily reserve</span><span>{limits.pause}m breaks</span><span>Deep work by {state.preferences.deepWorkEnd}</span></div>
    {(state.skipped ?? []).some(id=>eligible.some(t=>t.id===id)) && <div className="set-aside-note">Some tasks are set aside for now. Resume them under Work & progress, or make a new day/week plan to include them.</div>}
    {warnings.length>0 && <div className="capacity-warning" role="status"><strong>A manual placement needed attention</strong>{warnings.map((warning,i)=><p key={i}>{warning}</p>)}</div>}
    {changes.length>0 && <details className="plan-changes" key={`changes-${revision}`}><summary>What changed · {changes.filter(c=>c.kind==="moved").length} moved · {changes.filter(c=>c.kind==="added").length} added · {changes.filter(c=>c.kind==="removed").length} displaced</summary>{changes.slice(0,20).map((c,i)=><p key={i}><strong>{tasks.find(t=>t.id===c.taskId)?.title ?? "Completed task"}</strong><span>{c.before?new Date(c.before).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"}):"Unscheduled"} → {c.after?new Date(c.after).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"}):"Needs a new slot"}</span></p>)}</details>}
    {state.preferences.checkIns && suggested && <div className="checkin-nudge"><div><strong>A small check-in?</strong><p>How is “{suggested.title}” going?</p></div><Button variant="outline" onClick={() => { setCheckTask(suggested.id); setMinutes(30); }}>Check in</Button></div>}
    {!liveSessions.some(s=>new Date(s.start)<addDays(start,days.length) && new Date(s.end)>start) && <div className="planning-empty"><div><strong>{eligible.length?"No study sessions in this view.":"A clear page, ready for your next step."}</strong><p>{eligible.length?"Protected time stays clear. Plan from today, or jump to the next session. Work that cannot fit is listed below.":"Capture a task, protect your commitments, and let Daylight make a little room."}</p></div><div className="flex flex-wrap gap-2">{!eligible.length?<Button onClick={addTask}><Plus size={14}/>Add a task</Button>:<Button variant="outline" disabled={busy || needsRecovery} onClick={()=>void runPlan(1)}>Plan from today</Button>}{liveSessions.some(s=>new Date(s.end)>now) && <Button variant="ghost" onClick={()=>{const next=[...liveSessions].filter(s=>new Date(s.end)>now).sort((a,b)=>a.start.localeCompare(b.start))[0];setDate(dateKey(new Date(next.start)));setMode("day");}}>Next planned day</Button>}<Button variant="ghost" onClick={openPreferences}>Study preferences</Button></div></div>}
    <div className="calendar-legend"><span><i className="legend-fixed"/>Protected time</span><span><i className="legend-flexible"/>Flexible study</span><span><Pin size={11}/>Kept at this time</span><span><Check size={12}/>Completed session</span></div>
    <div className={`calendar-card ${busy?"is-planning":""}`}><div className="calendar-toolbar"><div className="flex items-center gap-2"><button aria-label="Previous period" onClick={() => setDate(dateKey(addDays(start,-days.length)))}><ChevronLeft size={18}/></button><button aria-label="Next period" onClick={() => setDate(dateKey(addDays(start,days.length)))}><ChevronRight size={18}/></button><strong>{start.toLocaleDateString([], { month:"long",day:"numeric" })}{mode === "week" ? ` – ${days[6].toLocaleDateString([], { month:"short",day:"numeric" })}` : ""}</strong></div><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setDate(dateKey(new Date()))}>Today</Button><input aria-label="Calendar date" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)}/><div className="view-toggle">{(["day","week"] as const).map(v => <button key={v} aria-pressed={mode===v} onClick={() => setMode(v)}>{v}</button>)}</div></div></div>
    <div className="calendar-scroll" ref={calendarScroll}><div key={mode+date} className={`calendar-grid ${mode}`} style={{ gridTemplateColumns:`48px repeat(${days.length}, minmax(${mode === "week" ? 115 : 240}px,1fr))` }}>
      <div className="calendar-zone">{Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replaceAll("_"," ")}</div>{days.map(d => <button type="button" onClick={()=>{setDate(dateKey(d));setMode("day");}} aria-label={`Open ${d.toLocaleDateString([], {weekday:"long",month:"long",day:"numeric"})}`} className={`calendar-day ${dateKey(d) === dateKey(now) ? "is-today" : ""}`} key={dateKey(d)}>{d.toLocaleDateString([], { weekday:"short" })}<strong>{d.getDate()}</strong></button>)}
      <div className="calendar-hours">{Array.from({length:24},(_,h) => <span key={h} style={{top:h*52}}>{h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h-12}p`}</span>)}</div>
      {days.map(d => {
        const renderPosition = (a: Date,b: Date) => { const startMinute = a < d ? 0 : a.getHours()*60+a.getMinutes(), endMinute = b >= addDays(d,1) ? 1440 : b.getHours()*60+b.getMinutes(); return { top:startMinute/60*52, height:Math.max(22,(endMinute-startMinute)/60*52) }; };
        return <div className={`calendar-column ${dragId?"drop-target":""}`} key={dateKey(d)} data-date={dateKey(d)} onDragOver={e=>{
          if(!dragId || busy)return;e.preventDefault();e.dataTransfer.dropEffect="move";
          const preview=proposedDrop(d,e.clientY,e.currentTarget.getBoundingClientRect().top);setDropPreview(preview);
          const scroll=calendarScroll.current;if(scroll){const rect=scroll.getBoundingClientRect();if(e.clientY>rect.bottom-45)scroll.scrollTop+=16;else if(e.clientY<rect.top+100)scroll.scrollTop-=16;if(e.clientX>rect.right-30)scroll.scrollLeft+=16;else if(e.clientX<rect.left+70)scroll.scrollLeft-=16;}
        }} onDrop={e=>{e.preventDefault();const preview=proposedDrop(d,e.clientY,e.currentTarget.getBoundingClientRect().top);setDragId(null);setDropPreview(null);lastDrag.current=performance.now();if(preview){if(preview.issue)setProblem(preview.issue);else moveSession({...preview.session,locked:true});}}}>
          {dropPreview && dateKey(new Date(dropPreview.session.start))===dateKey(d) && <div className={`drop-preview ${dropPreview.issue?"invalid":"valid"}`} style={renderPosition(new Date(dropPreview.session.start),new Date(dropPreview.session.end))}><strong>{timeLabel(new Date(dropPreview.session.start))}–{timeLabel(new Date(dropPreview.session.end))}</strong><small>{dropPreview.issue ?? "Release to move"}</small></div>}
          {fixed.filter(f => f.start < addDays(d,1) && f.end > d).map(f => <button type="button" key={f.id} aria-label={`Edit protected time: ${f.title}`} onClick={()=>{setProblem("");setFixedEditor(state.fixed.find(b=>f.id===`${b.id}:${dateKey(f.start)}`) ?? null);}} className="calendar-block fixed-block" style={renderPosition(f.start,f.end)} title={`${f.title} · protected`}><LockKeyhole size={11}/><strong>{f.title}</strong><small>{timeLabel(f.start)}–{timeLabel(f.end)}</small></button>)}
          {completedSessions.filter(s=>dateKey(new Date(s.start))===dateKey(d)).map(s=><button key={s.id} className="calendar-block completed-block" style={renderPosition(new Date(s.start),new Date(s.end))} onClick={()=>{const task=tasks.find(t=>t.id===s.taskId);if(task)editTask(task);}} title="Completed study session"><Check size={11}/><strong>{tasks.find(t=>t.id===s.taskId)?.title ?? "Completed study"}</strong></button>)}
          {liveSessions.filter(s => dateKey(new Date(s.start))===dateKey(d)).map(s => { const task = tasks.find(t => t.id===s.taskId)!; return <button key={s.id} data-session-id={s.id} data-task-id={task.id} aria-label={`${task.title}, ${new Date(s.start).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"})}. Click to move.`} className={`calendar-block study-block energy-${task.energy_level} ${s.kind==="restart"?"restart-block":""} ${highlighted.includes(task.id)?"recently-arranged":""} ${dragId===s.id?"is-dragging":""} ${s.locked?"locked-study":""}`} style={renderPosition(new Date(s.start),new Date(s.end))} disabled={busy} draggable={!busy && !needsRecovery && !s.locked && new Date(s.start)>now} onDragStart={e=>{e.dataTransfer.setData("text/plain",s.id);e.dataTransfer.effectAllowed="move";dragOffset.current=(e.clientY-e.currentTarget.getBoundingClientRect().top)*60/52;setDragId(s.id);}} onDragEnd={()=>{setDragId(null);setDropPreview(null);lastDrag.current=performance.now();}} onClick={()=>{if(performance.now()-lastDrag.current<350)return;setMoving(s);setProblem("");}} title={`${task.title}: ${s.reason}`}><strong>{s.locked && <Pin size={10}/>}{s.kind==="restart"?"↻ ":""}{task.title}</strong><small>{timeLabel(new Date(s.start))} · {task.subject}</small></button>; })}
          {dateKey(d)===dateKey(now) && <div className="now-line" style={{top:(now.getHours()+now.getMinutes()/60)*52}}/>}
        </div>;
      })}
    </div></div></div>
    <div className="planning-details"><div><h3><LockKeyhole size={15}/> Protected time</h3><p>Recurring blocks begin on their start date. Overnight blocks continue into the next day.</p>{state.fixed.map(b => <button className="protected-row" key={b.id} onClick={() => {setFixedEditor(b);setProblem("");}}><strong>{b.title}</strong><span>{b.start}–{b.end}{b.recovery_minutes?` + ${b.recovery_minutes}m recovery`:""} · {b.days.length ? b.days.map(d => ["Su","Mo","Tu","We","Th","Fr","Sa"][d]).join(", ") : b.date}</span></button>)}</div><div><h3><CalendarDays size={15}/> Work & progress</h3>{eligible.length === 0 && <p>Add a task to start planning.</p>}{eligible.map(t => <div key={t.id} className="progress-row"><button onClick={() => editTask(t)}>{t.title}<small>{t.remaining_minutes}m left · {t.priority} priority{state.skipped?.includes(t.id)?" · Set aside":""}</small></button><Button variant="ghost" size="sm" onClick={() => {if(state.skipped?.includes(t.id)){action(()=>{const next={...state,skipped:state.skipped?.filter(id=>id!==t.id)};showResult(next,plan(tasks,next,new Date(),7),"Task resumed. Your flexible work has been rearranged.");});}else{setCheckTask(t.id);setMinutes(30);}}}>{state.skipped?.includes(t.id)?"Resume":"Check in"}</Button></div>)}</div></div>
    {unplaced.some(u=>eligible.some(t=>t.id===u.taskId)) && <div className="capacity-warning" role="status"><h3>A little more room is needed</h3>{unplaced.filter(u=>eligible.some(t=>t.id===u.taskId)).map(u => <p key={u.taskId}><button className="unscheduled-task" onClick={()=>{const task=tasks.find(t=>t.id===u.taskId);if(task)editTask(task);}}>{tasks.find(t => t.id===u.taskId)?.title}</button> · {u.minutes}m unscheduled. {u.reason}</p>)}<Button variant="outline" size="sm" onClick={openPreferences}>Review study availability</Button></div>}
    {state.history.length > 0 && <details className="checkin-history"><summary>Recent check-ins ({state.history.length})</summary>{state.history.slice(0,10).map(h => <p key={h.id}><strong>{h.title}</strong> · {h.response}{h.minutes ? ` · ${h.minutes}m` : ""}<small>{new Date(h.at).toLocaleString()}</small></p>)}</details>}
    <p className="planning-storage">Calendar, preferences, and check-ins are saved in this browser for {owner === "local-demo" ? "demo mode" : "your account"}. Export includes planning data. Times follow this device’s timezone.</p>

    <Dialog open={Boolean(fixedEditor)} onOpenChange={open => !open && setFixedEditor(null)}><DialogContent><DialogTitle className="text-xl font-semibold">{state.fixed.some(b => b.id===fixedEditor?.id) ? "Edit protected time" : "Make space for life"}</DialogTitle><DialogDescription className="mt-2 text-sm">Classes, sport, sleep. Your planner keeps this time clear.</DialogDescription>{fixedEditor && <form className="planning-form" onSubmit={e => {e.preventDefault();action(() => {const parsed = fixedSchema.parse(fixedEditor); const next = {...state,fixed:[...state.fixed.filter(b=>b.id!==parsed.id),parsed]}; showResult(next,plan(tasks,next,new Date(),7),"Protected time saved. Your week has been rearranged with recovery time around commitments.");setFixedEditor(null);});}}><label className="field">Title<input required maxLength={100} value={fixedEditor.title} onChange={e=>setFixedEditor({...fixedEditor,title:e.target.value})}/></label><label className="field">Starting date<input required type="date" value={fixedEditor.date} onChange={e=>setFixedEditor({...fixedEditor,date:e.target.value})}/></label><div className="form-pair"><label className="field">Start<input required type="time" value={fixedEditor.start} onChange={e=>setFixedEditor({...fixedEditor,start:e.target.value})}/></label><label className="field">End<input required type="time" value={fixedEditor.end} onChange={e=>setFixedEditor({...fixedEditor,end:e.target.value})}/></label></div><label className="field">Recovery after this commitment (minutes)<input type="number" min={0} max={120} value={fixedEditor.recovery_minutes ?? state.preferences.commitmentBuffer} onChange={e=>setFixedEditor({...fixedEditor,recovery_minutes:Number(e.target.value)})}/><span className="block mt-2 text-xs text-muted-foreground">Allow time to travel, eat, or recharge after practice. Your general transition buffer still applies.</span></label><fieldset><legend>Repeat weekly · leave empty for once</legend><div className="weekday-picker">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((label,d)=><label key={d}><input type="checkbox" checked={fixedEditor.days.includes(d)} onChange={e=>setFixedEditor({...fixedEditor,days:e.target.checked ? [...fixedEditor.days,d] : fixedEditor.days.filter(x=>x!==d)})}/>{label}</label>)}</div></fieldset>{problem && <p role="alert" className="text-red-700 text-sm">{problem}</p>}<div className="flex justify-between gap-2">{state.fixed.some(b=>b.id===fixedEditor.id) && <Button type="button" variant="ghost" onClick={()=>action(()=>{commit({...state,fixed:state.fixed.filter(b=>b.id!==fixedEditor.id)});setFixedEditor(null);})}>Delete block</Button>}<Button type="submit">Save protected time</Button></div></form>}</DialogContent></Dialog>
    <PlanningPreferencesDialog open={preferencesOpen} onClose={closePreferences} preferences={state.preferences} busy={busy || needsRecovery} onSave={savePreferences} error={problem}/>
    <SessionDetails session={moving} task={tasks.find(t=>t.id===moving?.taskId)} busy={busy || needsRecovery} error={problem} onClose={()=>setMoving(null)} onMove={moveSession} onToggleLock={toggleSessionLock} onUnschedule={()=>action(()=>{if(!moving)return;commit({...state,sessions:state.sessions.filter(s=>s.id!==moving.id)});setMoving(null);setMessage("Study session removed. The task and its remaining time are unchanged.");})} onCheck={()=>{if(!moving)return;setCheckTask(moving.taskId);setMinutes(30);setMoving(null);setProblem("");}} onEdit={()=>{const task=tasks.find(t=>t.id===moving?.taskId);setMoving(null);if(task)editTask(task);}}/>
    <Dialog open={Boolean(checkTask)} onOpenChange={open=>!open && !busy && setCheckTask("")}><DialogContent><DialogTitle className="text-xl font-semibold">How’s it going?</DialogTitle><DialogDescription className="mt-2 text-sm">{tasks.find(t=>t.id===checkTask)?.title}. A quick update helps your plan keep up with you.</DialogDescription><div className="planning-form"><label className="field">Minutes completed or extra time needed<input type="number" min={5} max={480} step={5} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><div className="checkin-options">{responses.map(r=><Button key={r} variant={r==="Done"?"default":"outline"} disabled={busy || needsRecovery || ((r!=="Done" && r!=="Skip for now") && (!Number.isInteger(minutes) || minutes<5 || minutes>480))} onClick={()=>void check(r)}>{r}</Button>)}</div><p className="text-sm text-muted-foreground">Progress subtracts completed minutes. Extra time and stuck add remaining work; stuck starts with a small restart session. Lower-priority work can move later. Skip excludes this task from this replan.</p>{problem && <p role="alert" className="text-red-700 text-sm">{problem}</p>}</div></DialogContent></Dialog>
  </section>;
}
