"use client";
import { Pin, Check, Pencil } from "lucide-react";
import type { Session } from "@/lib/scheduling";
import type { Task } from "@/lib/types";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
function localInput(iso:string){const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;}
interface Props {
  session:Session|null;task:Task|undefined;busy:boolean;error:string;
  onClose:()=>void;onMove:(session:Session)=>boolean;onToggleLock:()=>void;
  onUnschedule:()=>void;onCheck:()=>void;onEdit:()=>void;
}
export function SessionDetails({session,task,busy,error,onClose,onMove,onToggleLock,onUnschedule,onCheck,onEdit}:Props){
  const future=session && Date.parse(session.start)>Date.now();
  return <Dialog open={Boolean(session)} onOpenChange={open=>!open && !busy && onClose()}><DialogContent>
    <DialogTitle className="text-xl font-semibold">{task?.title ?? "Study session"}</DialogTitle>
    <DialogDescription className="mt-2 text-sm leading-6">{session && `${new Date(session.start).toLocaleString([], {weekday:"long",hour:"numeric",minute:"2-digit"})}–${new Date(session.end).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}. ${session.reason}`}</DialogDescription>
    {session && task && <>
      <div className="session-quick-actions"><Button disabled={busy} onClick={onCheck}><Check size={14}/>Check in</Button><Button disabled={busy} variant="outline" onClick={onEdit}><Pencil size={14}/>Edit task</Button></div>
      {future ? <form key={`${session.id}:${session.start}:${session.locked}`} className="planning-form" onSubmit={e=>{
        e.preventDefault();const data=new FormData(e.currentTarget),start=new Date(String(data.get("start")));
        if(!Number.isFinite(+start))return;
        const next={...session,start:start.toISOString(),end:new Date(+start+Date.parse(session.end)-Date.parse(session.start)).toISOString(),locked:data.get("keep")==="on"};
        if(onMove(next))onClose();
      }}>
        <label className="field">New start time<input required type="datetime-local" name="start" defaultValue={localInput(session.start)}/></label>
        <label className="session-keep"><input type="checkbox" name="keep" defaultChecked={session.locked ?? true}/> Keep this placement when replanning</label>
        <p className="text-xs text-muted-foreground leading-5">Protected time and deadlines always take precedence. A conflicting lock is released with an explanation.</p>
        <div className="session-lock-row"><Button type="button" disabled={busy} variant="ghost" aria-pressed={Boolean(session.locked)} onClick={onToggleLock}><Pin size={14}/>{session.locked?"Allow replanning":"Keep this time"}</Button><Button type="submit" disabled={busy}>Move session</Button></div>
      </form>:<p className="session-past-note">This time has already started. Check in to update your progress and rearrange remaining work.</p>}
      {error && <p role="alert" className="text-sm text-red-700 mt-4">{error}</p>}
      <div className="session-footer"><span>{task.remaining_minutes}m remaining · {task.priority} priority</span><Button disabled={busy} variant="ghost" size="sm" onClick={onUnschedule}>Unschedule</Button></div>
    </>}
  </DialogContent></Dialog>;
}
