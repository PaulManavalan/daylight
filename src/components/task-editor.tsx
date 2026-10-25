"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { energies, priorities, statuses, statusLabels, taskInputSchema, type Task, type TaskInput } from "@/lib/types";

function localDateTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function TaskEditor({ task, open, onClose, onSave, subjects }: {
  task: Task | null; open: boolean; onClose(): void; onSave(input: TaskInput, id?: string): Promise<void>; subjects: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    const deadline = String(form.get("deadline") || "");
    const minutes = Number(form.get("estimated_minutes"));
    const candidate = { title: form.get("title"), description: form.get("description"), subject: form.get("subject"),
      deadline: deadline ? new Date(deadline).toISOString() : null, estimated_minutes: minutes,
      remaining_minutes: Number(form.get("remaining_minutes")), priority: form.get("priority"),
      energy_level: form.get("energy_level") || null, status: form.get("status") };
    const result = taskInputSchema.safeParse(candidate);
    if (!result.success) { setError(result.error.issues[0].message); return; }
    if (result.data.status !== "done" && result.data.remaining_minutes === 0) { setError("Set remaining time, or mark this task as done."); return; }
    setBusy(true);
    try { await onSave(result.data, task?.id); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save this task."); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}><DialogContent>
    <DialogTitle className="text-xl font-semibold">{task ? "Edit task" : "Make a little room for progress."}</DialogTitle>
    <DialogDescription className="mt-1 mb-6 text-sm text-muted-foreground">{task ? "Update the details as your work changes." : "Get it out of your head and into your inbox."}</DialogDescription>
    <form onSubmit={submit} className="space-y-4">
      <label className="field">Task title<input name="title" defaultValue={task?.title} placeholder="What do you need to do?" maxLength={200} required autoFocus /></label>
      <label className="field">Subject / area<input name="subject" defaultValue={task?.subject ?? "Personal"} list="subject-options" maxLength={80} required /><datalist id="subject-options">{subjects.map(s => <option key={s} value={s} />)}</datalist></label>
      <label className="field">Deadline <span className="text-muted-foreground font-normal">(optional · your local time)</span><input name="deadline" type="datetime-local" defaultValue={localDateTime(task?.deadline ?? null)} /></label>
      <div className="grid grid-cols-2 gap-4">
        <label className="field">Estimate (minutes)<input name="estimated_minutes" type="number" min={5} max={1440} defaultValue={task?.estimated_minutes ?? 30} required onChange={e => { if (!task) { const remaining = e.currentTarget.form?.elements.namedItem("remaining_minutes") as HTMLInputElement; if (remaining) remaining.value = e.currentTarget.value; } }} /></label>
        <label className="field">Remaining (minutes)<input name="remaining_minutes" type="number" min={0} max={10080} defaultValue={task?.remaining_minutes ?? 30} required /></label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="field">Priority<select name="priority" defaultValue={task?.priority ?? "medium"}>{priorities.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label>
        <label className="field">Energy needed<select name="energy_level" defaultValue={task?.energy_level ?? ""}><option value="">Any energy</option>{energies.map(p => <option key={p} value={p}>{p === "high" ? "High focus" : p === "medium" ? "Medium" : "Low"}</option>)}</select></label>
      </div>
      <label className="field">Status<select name="status" defaultValue={task?.status ?? "not_started"}>{statuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>
      <label className="field">Notes <span className="text-muted-foreground font-normal">(optional)</span><textarea name="description" rows={3} maxLength={5000} defaultValue={task?.description} placeholder="A first step, a useful link, a reminder…" /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : task ? "Save changes" : "Add task"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
