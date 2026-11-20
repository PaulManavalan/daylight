import { z } from "zod";
import { archiveCheckInSessions, defaults, plan, retainWorkRecords, planningSchema, type PlanningState, type ProgressCheck } from "./scheduling";
import type { Task } from "./types";
import {recoverLocalRestore} from './workspace-backup';

export interface PlanningStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
  removeItem(key:string):void;
}
const progressSchema=planningSchema.shape.history.element;
const journalSchema=z.object({
  taskId:z.string(),before:z.object({remaining_minutes:z.number(),status:z.string()}),
  after:z.object({remaining_minutes:z.number(),status:z.string()}),entry:progressSchema,
});
type Journal=z.infer<typeof journalSchema>;
function parse(raw:string|null):PlanningState|null {
  try {return raw===null?null:planningSchema.parse(JSON.parse(raw));}catch{return null;}
}
export function planningKey(owner:string){return `daylight.planning.v1.${owner}`;}

/** Versioned snapshots, a last-known-valid backup, and a recoverable check-in journal. */
export class PlanningStore {
  readonly key:string;
  constructor(private storage:PlanningStorage,owner:string){this.key=planningKey(owner);}
  load():{state:PlanningState;raw:string|null;notice:string} {
    if(this.key===planningKey('local-demo'))recoverLocalRestore(this.storage);
    const raw=this.storage.getItem(this.key),state=parse(raw);
    if(state)return {state,raw,notice:""};
    const backupRaw=this.storage.getItem(`${this.key}.backup`),backup=parse(backupRaw);
    if(backup)return {state:backup,raw,notice:"Recovered your last valid calendar backup. Your tasks are unchanged."};
    if(raw!==null || backupRaw!==null)throw new Error("Saved planning data needs recovery. Download the storage backup before making changes; no data has been reset.");
    return {state:defaults(),raw:null,notice:""};
  }
  save(state:PlanningState,expected:string|null):string {
    const next=JSON.stringify(planningSchema.parse(state));
    const pendingRaw=this.storage.getItem(`${this.key}.pending`);
    if(pendingRaw){
      let pending:Journal;try{pending=journalSchema.parse(JSON.parse(pendingRaw));}catch{throw new Error("An interrupted check-in needs recovery before calendar changes. Reload safely or download a storage backup.");}
      if(!state.history.some(h=>h.id===pending.entry.id))throw new Error("A check-in is being saved in another tab or needs recovery. Reload before changing the calendar.");
    }
    const previous=this.storage.getItem(this.key);
    if(previous!==expected)throw new Error("Your calendar changed in another tab. Reload to use the latest plan before saving.");
    try {
      if(parse(previous))this.storage.setItem(`${this.key}.backup`,previous!);
      this.storage.setItem(this.key,next);
    }catch{throw new Error("Browser storage could not save this plan. Export a backup and free space, then reload. Your previous saved plan is preserved.");}
    return next;
  }
  stage(before:Task,after:Task,entry:ProgressCheck,expected:string|null) {
    if(this.storage.getItem(this.key)!==expected)throw new Error("Your calendar changed in another tab. Reload before checking in.");
    if(this.hasPending())throw new Error("A previous check-in needs recovery. Reload before submitting another response.");
    const pending:Journal={taskId:before.id,before:{remaining_minutes:before.remaining_minutes,status:before.status},after:{remaining_minutes:after.remaining_minutes,status:after.status},entry};
    this.storage.setItem(`${this.key}.pending`,JSON.stringify(journalSchema.parse(pending)));
  }
  hasPending(){return this.storage.getItem(`${this.key}.pending`)!==null;}
  finish(){this.storage.removeItem(`${this.key}.pending`);}
  dismissUnapplied(tasks:Task[]) {
    const pendingRaw=this.storage.getItem(`${this.key}.pending`);
    if(!pendingRaw)return;
    const pending=journalSchema.parse(JSON.parse(pendingRaw));
    const task=tasks.find(t=>t.id===pending.taskId);
    if(task && task.remaining_minutes===pending.after.remaining_minutes && task.status===pending.after.status)throw new Error("The task update has arrived. Reload safely to recover this check-in instead.");
    this.storage.setItem(`${this.key}.pending.unapplied`,pendingRaw);this.finish();
  }
  recover(tasks:Task[],now=new Date()):{state:PlanningState;raw:string|null;notice:string;needsReview?:boolean} {
    const loaded=this.load(),pendingRaw=this.storage.getItem(`${this.key}.pending`);
    if(!pendingRaw)return loaded;
    let pending:Journal;
    try{pending=journalSchema.parse(JSON.parse(pendingRaw));}
    catch{throw new Error("An interrupted check-in could not be read. Download the storage backup before repairing it; your task list is safe.");}
    if(loaded.state.history.some(h=>h.id===pending.entry.id)){this.finish();return loaded;}
    const task=tasks.find(t=>t.id===pending.taskId);
    if(!task || task.remaining_minutes!==pending.after.remaining_minutes || task.status!==pending.after.status){
      // A second tab may see this journal while the first is still saving the task.
      // Keep it intact until the task arrives or the user explicitly keeps current values.
      return {...loaded,needsReview:true,notice:"A check-in is unfinished and its task update has not arrived. If another tab is saving, let it finish and reload. You can also keep the current task values and dismiss this check-in."};
    }
    const at=+new Date(pending.entry.at);
    const archived=archiveCheckInSessions(loaded.state.sessions,task.id,pending.entry.response,pending.entry.minutes,new Date(at));
    const skipped=pending.entry.response==="Skip for now"?[...new Set([...(loaded.state.skipped ?? []),task.id])]:(loaded.state.skipped ?? []).filter(id=>id!==task.id);
    const next={...loaded.state,skipped,sessions:archived,work_records:retainWorkRecords(loaded.state,pending.entry,now),history:[pending.entry,...loaded.state.history].slice(0,50)};
    const result=plan(tasks,next,now,7,now,[],{interruptTaskId:task.id,focusTaskId:pending.entry.response==="Stuck" || pending.entry.response==="Need more time"?task.id:undefined,skipTaskId:pending.entry.response==="Skip for now"?task.id:undefined});
    const recovered={...next,sessions:result.sessions,lastPlan:{at:now.toISOString(),unplaced:result.unplaced,changes:result.changes,warnings:result.warnings}};
    const raw=this.save(recovered,loaded.raw);this.finish();
    return {state:recovered,raw,notice:"Recovered your interrupted check-in and refreshed the plan. No extra minutes were added twice."};
  }
  rawBackup(){return {planning:this.storage.getItem(this.key),backup:this.storage.getItem(`${this.key}.backup`),pending:this.storage.getItem(`${this.key}.pending`),unapplied:this.storage.getItem(`${this.key}.pending.unapplied`)};}
}
