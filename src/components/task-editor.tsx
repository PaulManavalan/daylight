"use client";
import { useRef,useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { energies, priorities, statuses, statusLabels, taskInputSchema, type Task, type TaskInput } from "@/lib/types";

function localDateTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function TaskEditor({ task, open, onClose, onSave, subjects, draft }: {
  task: Task | null; draft?:Partial<TaskInput>; open: boolean; onClose(): void; onSave(input: TaskInput, id?: string,expected?:Task): Promise<void>; subjects: string[];
}) {
  const values=task ?? draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation=useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(operation.current)return;setError("");
    const form = new FormData(event.currentTarget);
    const deadline = String(form.get("deadline") || "");
    if(deadline && !Number.isFinite(Date.parse(deadline))){setError("Choose a valid deadline.");return;}
    if(deadline && localDateTime(new Date(deadline).toISOString())!==deadline){setError('That time does not exist in your local timezone. Choose another deadline.');return;}
    const minutes = Number(form.get("estimated_minutes"));
    const candidate = { title: form.get("title"), description: form.get("description"), subject: form.get("subject"),
      deadline: deadline && Number.isFinite(Date.parse(deadline)) ? new Date(deadline).toISOString() : null, estimated_minutes: minutes,
      remaining_minutes: Number(form.get("remaining_minutes")), priority: form.get("priority"),
      energy_level: form.get("energy_level") || null, status: form.get("status") };
    const result = taskInputSchema.safeParse(candidate);
    if (!result.success) { setError(result.error.issues[0].message); return; }
    if (result.data.status !== "done" && result.data.remaining_minutes === 0) { setError("Set remaining time, or mark this task as done."); return; }
    operation.current=true;setBusy(true);
    try { await onSave(result.data, task?.id,task??undefined); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save this task."); }
    finally { operation.current=false;setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}><DialogContent>
    <DialogTitle className="text-xl font-semibold">{task ? "Edit task" : "Add task"}</DialogTitle>
    <DialogDescription className="mt-1 mb-6 text-sm text-muted-foreground">{task ? "Update the details as your work changes." : "Add the details you know. You can change them later."}</DialogDescription>
    <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4 border-0 p-0 min-w-0">
      <label className="field">Task title<input name="title" defaultValue={values?.title} placeholder="What do you need to do?" maxLength={200} required autoFocus /></label>
      <label className="field">Subject / area<input name="subject" defaultValue={values?.subject ?? "Personal"} list="subject-options" maxLength={80} required /><datalist id="subject-options">{subjects.map(s => <option key={s} value={s} />)}</datalist></label>
      <label className="field">Deadline <span className="text-muted-foreground font-normal">(optional · your local time)</span><input name="deadline" type="datetime-local" defaultValue={localDateTime(values?.deadline ?? null)} /></label>
      <div className="grid grid-cols-2 gap-4">
        <label className="field">Estimate (minutes)<input name="estimated_minutes" type="number" min={5} max={1440} defaultValue={values?.estimated_minutes ?? 30} required onChange={e => { if (!task) { const remaining = e.currentTarget.form?.elements.namedItem("remaining_minutes") as HTMLInputElement; if (remaining) remaining.value = e.currentTarget.value; } }} /></label>
        <label className="field">Remaining (minutes)<input name="remaining_minutes" type="number" min={0} max={10080} defaultValue={values?.remaining_minutes ?? 30} required /></label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="field">Priority<select name="priority" defaultValue={values?.priority ?? "medium"}>{priorities.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label>
        <label className="field">Energy needed<select name="energy_level" defaultValue={values?.energy_level ?? ""}><option value="">Use planning preference</option>{energies.map(p => <option key={p} value={p}>{p === "high" ? "High focus" : p === "medium" ? "Medium" : "Low"}</option>)}</select></label>
      </div>
      <label className="field">Status<select name="status" defaultValue={values?.status ?? "not_started"}>{statuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>
      <label className="field">Notes <span className="text-muted-foreground font-normal">(optional)</span><textarea name="description" rows={3} maxLength={5000} defaultValue={values?.description} placeholder="A first step, a useful link, a reminder…" /></label>
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : task ? "Save changes" : "Add task"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
