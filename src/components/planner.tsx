"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowDownUp, ArrowRight, BookOpen, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, Circle, CircleHelp, Clock3, Download, Flower2, Inbox, LayoutGrid, ListTodo, Loader2, LogOut, MoreHorizontal, Plus, Search, Settings2, Sparkles, Sun, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { TaskEditor } from "./task-editor";
import { PlanningCalendar } from "./planning-calendar";
import type { PlanningState } from "@/lib/scheduling";
import { AuthDialog } from "./auth-dialog";
import { cloudRepository, localRepository } from "@/lib/repository";
import { getSupabase } from "@/lib/supabase";
import { filterTasks, formatMinutes, sortTasks, type DeadlineFilter } from "@/lib/tasks";
import { statusLabels, statuses, type Task, type TaskInput, type TaskStatus } from "@/lib/types";

type View = "all" | "today" | "inbox" | "done" | "calendar";
const viewNames: Record<View, string> = { all: "All tasks", today: "Today", inbox: "Inbox", done: "Completed", calendar: "Calendar" };
const subjectColors: Record<string, string> = { History: "peach", Math: "blue", Robotics: "purple", English: "yellow", Biology: "green", Personal: "stone" };
function Subject({ name }: { name: string }) { return <span className={`subject subject-${subjectColors[name] ?? "stone"}`}><span className="size-1.5 rounded-full bg-current opacity-60" />{name}</span>; }
function dueLabel(deadline: string | null, now: Date) {
  if (!deadline) return "No deadline";
  const d = new Date(deadline);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const afterTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  if (d >= today && d < tomorrow) return "Today";
  if (d >= tomorrow && d < afterTomorrow) return "Tomorrow";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}) });
}

export function Planner() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("all");
  const [subject, setSubject] = useState("all");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [deadline, setDeadline] = useState<DeadlineFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"deadline" | "priority" | "newest">("deadline");
  const [editor, setEditor] = useState<{ task: Task | null } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [info, setInfo] = useState<"help" | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [planningExport, setPlanningExport] = useState<PlanningState | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const epoch = useRef(0);
  const identity = useRef<string | null>(null);
  const repository = useMemo(() => user ? cloudRepository(user.id) : localRepository(), [user]);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60000);
    const db = getSupabase();
    if (!db) { setAuthReady(true); return () => clearInterval(timer); }
    let alive = true;
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      if (alive) {
        const nextId = session?.user.id ?? null;
        if (identity.current !== nextId) {
          identity.current = nextId; epoch.current++; setTasks([]); setEditor(null); setDeleting(null); setNotice("");
          setUser(session?.user ?? null);
        }
        setAuthReady(true); if (session) setAuthOpen(false);
      }
    });
    return () => { alive = false; clearInterval(timer); subscription.unsubscribe(); };
  }, []);

  const reload = useCallback(async () => {
    const current = ++epoch.current;
    setLoading(true); setError("");
    try { const rows = await repository.list(); if (current === epoch.current) setTasks(rows); }
    catch (e) { if (current === epoch.current) setError(e instanceof Error ? e.message : "Unable to load tasks."); }
    finally { if (current === epoch.current) setLoading(false); }
  }, [repository]);
  useEffect(() => { if (authReady) void reload(); }, [authReady, reload]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const listener = () => { if (!user) void reload(); };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [user, reload]);

  const subjects = useMemo(() => [...new Set(tasks.map(t => t.subject))].sort(), [tasks]);
  const incomplete = tasks.filter(t => t.status !== "done");
  const completed = tasks.length - incomplete.length;
  const dueToday = now ? filterTasks(incomplete, { search: "", subject: "all", status: "all", deadline: "today" }, now).length : 0;
  const visible = useMemo(() => {
    const base = view === "done" ? tasks.filter(t => t.status === "done") : view === "inbox" ? tasks.filter(t => t.status === "not_started") : view === "today" ? tasks.filter(t => t.status !== "done") : tasks;
    return sortTasks(filterTasks(base, { search, subject, status, deadline: view === "today" ? "today" : deadline }, now ?? new Date()), sort);
  }, [tasks, view, search, subject, status, deadline, sort, now]);

  async function save(input: TaskInput, id?: string) {
    const current = epoch.current;
    const saved = await repository.save(input, id);
    if (current !== epoch.current) return;
    setTasks(rows => id ? rows.map(row => row.id === id ? saved : row) : [saved, ...rows]);
    setNotice(id ? "Task updated. A little clearer already." : "Task added. One less thing to keep in your head.");
  }
  async function toggleDone(task: Task) {
    setPending(task.id); setError("");
    try { await save({ ...task, status: task.status === "done" ? "not_started" : "done", remaining_minutes: task.status === "done" ? task.estimated_minutes : 0 }, task.id); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update task."); }
    finally { setPending(null); }
  }
  async function remove() {
    if (!deleting) return;
    const id = deleting.id, current = epoch.current;
    setPending(id); setError("");
    try { await repository.remove(id); if (current === epoch.current) { setTasks(rows => rows.filter(t => t.id !== id)); setDeleting(null); setNotice("Task deleted."); } }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete task."); }
    finally { setPending(null); }
  }
  function navigate(next: View) { setView(next); setSubject("all"); setStatus("all"); setDeadline("all"); setSearch(""); }
  function exportTasks() {
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exported_at: new Date().toISOString(), tasks, planning: planningExport }, null, 2)], { type: "application/json" }));
    link.href = url; link.download = "daylight-tasks.json"; link.click(); URL.revokeObjectURL(url);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a href="/" className="brand"><span className="brand-mark"><Flower2 size={27} strokeWidth={1.6} /></span>daylight<span className="brand-period">.</span></a>
      <div className="workspace-label"><span className="workspace-avatar">S</span><span>My workspace<span className="block text-[10px] font-normal text-muted-foreground">A little space for everything</span></span><ChevronDown size={13} className="ml-auto opacity-50" /></div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Workspace" className="space-y-1">
        <button onClick={() => navigate("today")} className={`nav-item ${view === "today" ? "active" : ""}`}><Sun size={18} />Today{dueToday > 0 && <span className="nav-count">{dueToday}</span>}</button>
        <button onClick={() => navigate("inbox")} className={`nav-item ${view === "inbox" ? "active" : ""}`}><Inbox size={18} />Inbox<span className="nav-count">{tasks.filter(t => t.status === "not_started").length}</span></button>
        <button onClick={() => navigate("all")} className={`nav-item ${view === "all" ? "active" : ""}`}><LayoutGrid size={18} />All tasks</button>
        <button onClick={() => navigate("calendar")} className={`nav-item ${view === "calendar" ? "active" : ""}`}><CalendarDays size={18} />Calendar</button>
        <button onClick={() => navigate("done")} className={`nav-item ${view === "done" ? "active" : ""}`}><CheckCheck size={18} />Completed</button>
      </nav>
      <div className="mt-8 flex items-center justify-between"><p className="nav-label !mb-3">YOUR SUBJECTS</p><button title="Add a task with a new subject" aria-label="Add a task with a new subject" onClick={() => setEditor({ task: null })} className="mb-3 p-1 text-muted-foreground"><Plus size={14} /></button></div>
      <nav aria-label="Subjects" className="space-y-0.5">{subjects.map(s => <button key={s} className={`subject-nav ${subject === s ? "selected" : ""}`} onClick={() => { navigate("all"); setSubject(s); }}><span className={`subject-dot dot-${subjectColors[s] ?? "stone"}`} />{s}<span className="ml-auto text-xs text-muted-foreground">{tasks.filter(t => t.subject === s && t.status !== "done").length}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="quiet-card"><span className="flex items-center gap-2 font-medium text-primary"><Sparkles size={15} /> Room to breathe.</span><p>Your plans should make space for life, too.</p><span className="text-[10px] tracking-wide text-muted-foreground">BUILT FOR YOUR PACE</span></div>
        <button className="nav-item mt-4" onClick={() => setPreferencesOpen(true)}><Settings2 size={17} />Preferences</button>
        <button className="profile-button" onClick={() => setAuthOpen(true)}><span className="profile-avatar">{user?.email?.[0]?.toUpperCase() ?? "S"}</span><span className="min-w-0 text-left"><span className="block truncate text-xs font-medium">{user?.email ?? "Student workspace"}</span><span className="block text-[10px] text-muted-foreground">{user ? "Private account" : "Local demo · saved on this device"}</span></span><MoreHorizontal size={17} className="ml-auto shrink-0" /></button>
        {user && <button onClick={async () => { const { error } = await getSupabase()!.auth.signOut(); if (error) setError(error.message); }} className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><LogOut size={13} />Sign out</button>}
      </div>
    </aside>

    <div className="main-shell"><header className="topbar"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>My workspace</span><ChevronRight size={13} /><span className="text-foreground">{viewNames[view]}</span></div><div className="flex items-center gap-4"><span className="hidden sm:block text-xs text-muted-foreground">{now?.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) ?? "Your workspace"}</span><span className="topbar-divider" /><button className="text-muted-foreground hover:text-primary" aria-label="About Daylight" onClick={() => setInfo("help")}><CircleHelp size={17} /></button></div></header>
    <main className="main-content">
      <div className="page-heading"><div><div className="eyebrow"><span className="size-1.5 rounded-full bg-primary" /> LESS MENTAL CLUTTER, MORE DAYLIGHT</div><h1>{viewNames[view]}<span className="heading-dot">.</span></h1><p>{view === "done" ? "Small steps add up. Here’s what you’ve finished." : view === "today" ? "A little focus for what’s in front of you." : view === "inbox" ? "A home for everything you haven’t started yet." : "School, side quests, and everything in between. You’ve got this."}</p></div><Button onClick={() => setEditor({ task: null })} disabled={loading} className="add-button" aria-label="Add task"><Plus size={16} />Add task<span className="key-hint" aria-hidden="true">+</span></Button></div>

      <div hidden={view === "calendar"}><section className="stats-grid" aria-label="Task overview"><div className="stat-card"><div><span className="stat-label">On your plate</span><div className="stat-number">{incomplete.length}<span>tasks</span></div><p>A place for every little thing</p></div><span className="stat-icon green"><ListTodo size={21} /></span></div>
        <div className="stat-card"><div><span className="stat-label">Due today</span><div className="stat-number">{dueToday}<span>{dueToday === 1 ? "task" : "tasks"}</span></div><p>{dueToday ? "Let’s take it one step at a time" : "A little breathing room today"}</p></div><span className="stat-icon peach"><Sun size={22} /></span></div>
        <div className="stat-card"><div><span className="stat-label">Time to make progress</span><div className="stat-number time-number">{formatMinutes(incomplete.reduce((sum, t) => sum + t.remaining_minutes, 0))}</div><p>Estimated work remaining</p></div><span className="stat-icon purple"><Clock3 size={21} /></span></div>
      </section>

      <section className="gentle-banner"><span className="banner-icon"><Sparkles size={20} strokeWidth={1.6} /></span><div><h2>A plan that works around you.</h2><p>Protect time for life, then let Daylight arrange the work around it.</p></div><span className="foundation-badge"><span className="size-1.5 rounded-full bg-primary" /> YOUR PACE · PROTECTED</span></section>

      <section className="task-section" aria-label="Task database"><div className="database-heading"><div className="database-tab"><ListTodo size={16} /><span>{viewNames[view]}</span><span className="table-count">{visible.length}</span></div><Button variant="ghost" size="sm" onClick={exportTasks} disabled={loading || tasks.length === 0}><Download size={14} /><span className="hidden sm:inline">Export</span></Button></div>
        <div className="filterbar"><div className="filters"><label className="filter-select"><BookOpen size={13} /><select aria-label="Filter by subject" value={subject} onChange={e => setSubject(e.target.value)}><option value="all">All subjects</option>{subjects.map(s => <option key={s}>{s}</option>)}</select><ChevronDown size={12} /></label>
          <label className="filter-select"><Circle size={12} /><select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value as TaskStatus | "all")}><option value="all">Any status</option>{statuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select><ChevronDown size={12} /></label>
          {view !== "today" && <label className="filter-select"><CalendarDays size={13} /><select aria-label="Filter by deadline" value={deadline} onChange={e => setDeadline(e.target.value as DeadlineFilter)}><option value="all">Any deadline</option><option value="today">Today</option><option value="week">Next 7 days</option><option value="overdue">Overdue</option><option value="none">No deadline</option></select><ChevronDown size={12} /></label>}
          <label className="filter-select sort-select"><ArrowDownUp size={13} /><select aria-label="Sort tasks" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="deadline">Deadline</option><option value="priority">Priority</option><option value="newest">Newest</option></select></label>
        </div><label className="search-input"><Search size={15} /><input aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={13} /></button>}</label></div>
        {error && <div role="alert" className="error-banner">{error}<button className="underline ml-3" onClick={() => void reload()}>Retry loading</button></div>}
        <div className="table-scroll"><table><thead><tr><th className="check-column"><span className="sr-only">Complete</span></th><th className="title-column">Task name</th><th>Subject</th><th>Status</th><th>Deadline</th><th>Time left</th><th>Priority</th><th className="actions-column"><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {loading ? <tr><td colSpan={8} className="empty-state"><Loader2 className="mx-auto mb-3 animate-spin" size={22} />Making a little space…</td></tr> : visible.length === 0 ? <tr><td colSpan={8} className="empty-state"><Inbox className="mx-auto mb-3 text-primary" size={28} /><strong className="block text-foreground mb-1">{tasks.length === 0 ? "A fresh page. A little possibility." : "Nothing here just yet."}</strong>{tasks.length === 0 ? "Add your first task to get started." : "Try another filter, or add something new."}<Button className="mx-auto mt-4 flex" size="sm" onClick={() => setEditor({ task: null })}><Plus size={14} />Add task</Button></td></tr> : visible.map(task => <tr key={task.id} className={task.status === "done" ? "completed-row" : ""}>
            <td><button className={`task-checkbox ${task.status === "done" ? "checked" : ""}`} aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`} disabled={pending !== null} onClick={() => void toggleDone(task)}>{pending === task.id ? <Loader2 size={12} className="animate-spin" /> : task.status === "done" ? <Check size={12} /> : null}</button></td>
            <td><button className="task-title" onClick={() => setEditor({ task })}>{task.title}</button></td><td><Subject name={task.subject} /></td><td><span className={`status-pill status-${task.status}`}><span className="status-dot" />{statusLabels[task.status]}</span></td>
            <td><span title={task.deadline ? new Date(task.deadline).toLocaleString() : undefined} className={`due-label ${task.deadline && now && Date.parse(task.deadline) < now.getTime() && task.status !== "done" ? "overdue" : ""} ${now && dueLabel(task.deadline, now) === "Today" && task.status !== "done" ? "due-today" : ""}`}><CalendarDays size={12} />{now ? dueLabel(task.deadline, now) : "—"}</span></td>
            <td><span className="duration"><Clock3 size={12} />{formatMinutes(task.remaining_minutes)}</span></td><td><span className={`priority priority-${task.priority}`}><i /><i /><i /><span>{task.priority[0].toUpperCase() + task.priority.slice(1)}</span></span></td><td><button className="delete-button" aria-label={`Delete ${task.title}`} onClick={() => setDeleting(task)} disabled={pending !== null}><Trash2 size={14} /></button></td>
          </tr>)}
        </tbody></table></div>
        {!loading && <button className="add-row" onClick={() => setEditor({ task: null })}><Plus size={15} />Add a task<span>Get it out of your head</span></button>}
        <div className="table-footer"><span>{visible.length} {visible.length === 1 ? "task" : "tasks"}{subject !== "all" || status !== "all" || deadline !== "all" || search ? " matching your filters" : " in this view"}</span><span><span className="inline-block mr-1.5 size-1.5 rounded-full bg-primary/60" />{user ? "Saved to your account" : "Saved in this browser"}</span></div>
      </section>

      <div className="bottom-note"><span className="flex items-center gap-2"><CheckCheck size={15} />{completed ? `${completed} ${completed === 1 ? "task" : "tasks"} finished. That’s progress.` : "Progress is a few small steps, taken often."}</span><button onClick={() => setAuthOpen(true)} className="text-primary underline underline-offset-4">{user ? "Account" : "Connect account"}</button></div>
      <section className="next-chapter"><div><span className="chapter-label">THE NEXT CHAPTER</span><h2>Your time, thoughtfully arranged.</h2><p>Make space for school, study, and everything beyond it.</p></div><button onClick={() => navigate("calendar")} className="flex items-center gap-2 text-xs font-medium text-primary">Open calendar<ArrowRight size={15} /></button></section>
      </div>
      {authReady && !loading && <div hidden={view !== "calendar"}><PlanningCalendar visible={view === "calendar"} key={user?.id ?? "local-demo"} owner={user?.id ?? "local-demo"} tasks={tasks} preferencesOpen={preferencesOpen} closePreferences={() => setPreferencesOpen(false)} saveTask={save} editTask={task => setEditor({task})} registerExport={setPlanningExport}/></div>}
      <button className="mobile-preferences" onClick={() => setPreferencesOpen(true)}>Study preferences</button>
    </main></div>

    {editor && <TaskEditor key={editor.task?.id ?? "new"} task={editor.task} open onClose={() => setEditor(null)} onSave={save} subjects={subjects} />}
    <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    <Dialog open={Boolean(deleting)} onOpenChange={value => { if (!value && !pending) setDeleting(null); }}><DialogContent><DialogTitle className="text-xl font-semibold">Delete this task?</DialogTitle><DialogDescription className="mt-3 text-sm text-muted-foreground">“{deleting?.title}” and its saved task history will be removed. This can’t be undone.</DialogDescription><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleting(null)} disabled={Boolean(pending)}>Keep task</Button><Button className="bg-red-700 hover:bg-red-800" onClick={() => void remove()} disabled={Boolean(pending)}>{pending ? "Deleting…" : "Delete task"}</Button></div></DialogContent></Dialog>
    <Dialog open={Boolean(info)} onOpenChange={value => { if (!value) setInfo(null); }}><DialogContent><DialogTitle className="text-xl font-semibold">Welcome to Daylight.</DialogTitle><DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">Capture tasks, then open Calendar to protect time, plan your day or week, and check in as life changes. The planner respects deadlines and tells you when work cannot fit. Task accounts sync through Supabase; calendar data stays in this browser. Export saves both.</DialogDescription><Button className="mt-6" onClick={() => setInfo(null)}>Got it</Button></DialogContent></Dialog>
    {notice && <div role="status" className="toast"><Check size={16} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={14} /></button></div>}
  </div>;
}
