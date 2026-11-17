import {addDays,dateKey,dayAt,fixedSchema,type FixedBlock} from "./scheduling";
import {taskInputSchema,type TaskInput} from "./types";
export const nothing=(text:string)=>/^(?:(?:I have|there is)\s+)?(?:none|nothing|no|nope|skip|all done|no (?:homework|work|events|plans|new work))(?:\s+(?:today|for today|new|else))?[.! ]*$/i.test(text.trim()) || /^I (?:don't|do not) have (?:any(?:thing)?|homework|work)(?: today)?[.! ]*$/i.test(text.trim());
export const splitItems=(text:string)=>{const items=text.split(/[;\n]+/).map(s=>s.replace(/^[-•]\s*/,"").trim()).filter(Boolean);if(items.length>30)throw new Error("Capture up to 30 items at a time.");return items;};
export function subjectList(text:string){const subjects=[...new Map(text.replace(/^I (?:have|take)\s+/i,"").split(/[,;\n]+|\s+and\s+/i).map(s=>s.trim()).filter(Boolean).map(s=>[s.toLowerCase(),s])).values()];if(subjects.length>12 || subjects.some(s=>s.length>80))throw new Error("Choose up to 12 subjects, each under 80 characters.");return subjects;}
export function taskDrafts(text:string,subject:string,now:Date):TaskInput[]{
 if(nothing(text))return [];
 return splitItems(text).map(source=>{
  const duration=source.match(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i);
  const minutes=duration?Math.round(Number(duration[1])*(/^h/i.test(duration[2])?60:1)):30;
  let deadline:string|null=null,dueText="";
  const due=source.match(/\bdue\s+(today|tonight|tomorrow|\d{4}-\d{2}-\d{2}|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if(due){
   dueText=due[0];
   const word=due[1].toLowerCase();let day=new Date(now);
   if(word==="tomorrow")day=addDays(day,1);
   else if(/^\d{4}/.test(word)){day=new Date(word+"T12:00:00");if(dateKey(day)!==word)throw new Error("That due date does not exist. Use a real YYYY-MM-DD date.");}
   else if(!["today","tonight"].includes(word)){const weekday=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"].indexOf(word);day=addDays(day,(weekday-day.getDay()+7)%7);}
   const tail=source.slice((due.index ?? 0)+due[0].length);
   const time=tail.match(/^\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
   if(time){dueText+=time[0];const hour=Number(time[1]),minute=Number(time[2] ?? 0);if(hour<1 || hour>12 || minute>59)throw new Error("Please check that deadline time.");day.setHours(hour%12+(time[3].toLowerCase()==="pm"?12:0),minute,0,0);deadline=day.toISOString();}
   else if(!/^\s+(?:at\b|\d|morning\b|afternoon\b|evening\b|noon\b)/i.test(tail))deadline=dayAt(day,"23:59").toISOString();
  }
  const title=source.replace(duration?.[0] ?? /$^/,"").replace(dueText || /$^/,"").replace(/\s+/g," ").replace(/[ ,–-]+$/,"").trim();
  return taskInputSchema.parse({title,subject,description:source,deadline,estimated_minutes:minutes,remaining_minutes:minutes,priority:/\b(urgent|important|test|exam)\b/i.test(source)?"high":"medium",energy_level:/\b(essay|test|exam|study|problem)\b/i.test(source)?"high":null,status:"not_started"});
 });
}
export interface EventDraft {id:string;title:string;date:string;start:string;end:string}
export function eventDrafts(text:string,now:Date):EventDraft[]{
 if(nothing(text))return [];
 return splitItems(text).map(source=>{
  const range=source.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  let start="",end="";
  if(range){
   const [,a,am="00",ap,b,bm="00",bp]=range;
   const clock=(h:string,m:string,period?:string)=>{const n=Number(h);if(Number(m)>59 || n>23 || (period && (n<1 || n>12)))return "";return String(period?(n%12)+(period.toLowerCase()==="pm"?12:0):n).padStart(2,"0")+":"+m;};
   // A shared suffix is safe only for ascending 1–12 ranges; 11–1pm needs clarification.
   const shared=bp && !ap && Number(a)*60+Number(am)<Number(b)*60+Number(bm)?bp:undefined;
   const explicit24=Number(a)>12 || Number(b)>12 || /^0/.test(a);
   if((ap || shared) && bp || explicit24){start=clock(a,am,ap ?? shared);end=clock(b,bm,bp);}
  }
  let day=new Date(now);
  const named=source.match(/\b(\d{4}-\d{2}-\d{2}|sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow)\b/i)?.[0].toLowerCase();
  if(named==="tomorrow")day=addDays(day,1);
  else if(named && /^\d/.test(named)){day=new Date(named+"T12:00:00");if(!Number.isFinite(+day) || dateKey(day)!==named)throw new Error("That event date does not exist.");}
  else if(named){const index=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"].indexOf(named);day=addDays(day,(index-day.getDay()+7)%7);}
  return {id:crypto.randomUUID(),title:source.replace(range?.[0] ?? /$^/,"").replace(named ?? /$^/,"").replace(/\b(today|tomorrow)\b/ig,"").replace(/\s+/g," ").replace(/[ ,–-]+$/,"").trim() || "Commitment",date:dateKey(day),start,end};
 });
}
export function protectedDraft(event:EventDraft):FixedBlock{return fixedSchema.parse({...event,days:[]});}
export const sameTask=(a:Pick<TaskInput,"title"|"subject">,b:Pick<TaskInput,"title"|"subject">)=>a.title.trim().toLowerCase()===b.title.trim().toLowerCase() && a.subject.trim().toLowerCase()===b.subject.trim().toLowerCase();
