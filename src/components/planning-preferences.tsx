"use client";
import { useState } from "react";
import { preferencesSchema, type PlanningPreferences } from "@/lib/scheduling";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
interface Props {
  open: boolean; onClose: () => void; preferences: PlanningPreferences;
  busy: boolean; error: string; onSave: (preferences: PlanningPreferences) => void;
}
function PreferencesForm({preferences:p,busy,onSave,error}:Omit<Props,"open"|"onClose">) {
  const [days,setDays]=useState(p.studyDays);
  const [validation,setValidation]=useState("");
  const time=(name:"workStart"|"workEnd"|"weekendStart"|"weekendEnd"|"focusStart"|"focusEnd"|"deepWorkEnd",label:string)=>
    <label className="field" key={name}>{label}<input required type="time" name={name} defaultValue={p[name]}/></label>;
  const number=(name:"capacity"|"session"|"pause"|"commitmentBuffer"|"dailyBuffer"|"longBreak"|"longBreakAfter",label:string,min:number,max:number)=>
    <label className="field" key={name}>{label}<input required type="number" name={name} min={min} max={max} defaultValue={p[name]}/></label>;
  return <form className="planning-form" onSubmit={e=>{
    e.preventDefault();const data=new FormData(e.currentTarget);
    const result=preferencesSchema.safeParse({
      ...Object.fromEntries(["workStart","workEnd","weekendStart","weekendEnd","focusStart","focusEnd","deepWorkEnd"].map(k=>[k,data.get(k)])),
      ...Object.fromEntries(["capacity","session","pause","commitmentBuffer","dailyBuffer","longBreak","longBreakAfter"].map(k=>[k,Number(data.get(k))])),
      studyDays:days,checkIns:data.get("checkIns")==="on",pace:data.get("pace"),defaultEnergy:data.get("defaultEnergy"),
    });
    if(!result.success){setValidation(result.error.issues[0]?.message ?? "Check your preferences.");return;}
    setValidation("");onSave(result.data);
  }}>
    <fieldset className="preferences-group"><legend>Your study rhythm</legend>
      <div className="form-pair">{time("workStart","Study starts")}{time("workEnd","Study ends")}</div>
      <div className="form-pair">{time("weekendStart","Weekend starts")}{time("weekendEnd","Weekend ends")}</div>
      <p>Weekday hours work around school. Weekends have their own, earlier window.</p>
      <div className="weekday-picker">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((label,d)=><label key={d}><input aria-label={`Study on ${label}`} type="checkbox" checked={days.includes(d)} onChange={e=>setDays(e.target.checked?[...days,d]:days.filter(x=>x!==d))}/>{label}</label>)}</div>
    </fieldset>
    <fieldset className="preferences-group"><legend>Energy & focus</legend>
      <label className="field">Default task energy<select name="defaultEnergy" defaultValue={p.defaultEnergy}><option value="low">Light work</option><option value="medium">Medium focus</option><option value="high">High focus</option></select></label>
      <p>Used only when a task has no energy level of its own.</p>
      <div className="form-pair">{time("focusStart","High focus starts")}{time("focusEnd","High focus ends")}</div>
      {time("deepWorkEnd","Deep work ends by")}
      <p>High-energy work gets better windows and stops at this cutoff. Lighter tasks can use the rest of your study hours.</p>
    </fieldset>
    <fieldset className="preferences-group"><legend>A sustainable workload</legend>
      <label className="field">Planning pace<select name="pace" defaultValue={p.pace}><option value="gentle">Gentle · shorter sessions, extra breathing room</option><option value="balanced">Balanced · follow my limits</option><option value="compact">Compact · prefer earlier, fuller sessions</option></select></label>
      <p>Gentle adds a 15% reserve, caps sessions at 35 minutes, and leaves at least 15-minute breaks. Compact favors earlier placement while keeping every explicit break and limit.</p>
      <div className="form-pair">{number("capacity","Daily focus limit",15,720)}{number("dailyBuffer","Daily reserve minutes",0,120)}</div>
      <div className="form-pair">{number("session","Session minutes",15,120)}{number("pause","Break minutes",0,60)}</div>
      <div className="form-pair">{number("longBreakAfter","Long break after focused minutes",30,180)}{number("longBreak","Long break minutes",5,60)}</div>
      {number("commitmentBuffer","Recovery around commitments (minutes)",0,60)}
      <p>The daily reserve stays unfilled. Recovery time is kept before and after fixed events, including school and sports. Breaks are separate from focused minutes.</p>
    </fieldset>
    <label className="text-sm"><input name="checkIns" type="checkbox" defaultChecked={p.checkIns}/> Show a gentle check-in suggestion</label>
    {(validation || error) && <p role="alert" className="text-red-700 text-sm">{validation || error}</p>}
    <Button disabled={busy} type="submit">Save preferences</Button>
  </form>;
}
export function PlanningPreferencesDialog({open,onClose,...props}:Props) {
  return <Dialog open={open} onOpenChange={next=>!next && !props.busy && onClose()}><DialogContent>
    <DialogTitle className="text-xl font-semibold">Your pace comes first.</DialogTitle>
    <DialogDescription className="mt-2 text-sm">Times follow {Intl.DateTimeFormat().resolvedOptions().timeZone}. Saving rearranges the next seven days. No AI service is needed.</DialogDescription>
    <PreferencesForm key={JSON.stringify(props.preferences)} {...props}/>
  </DialogContent></Dialog>;
}
