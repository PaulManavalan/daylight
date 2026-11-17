import {eventDrafts,splitItems,taskDrafts,type EventDraft} from "./planning-conversation";
import type {Task,TaskInput} from "./types";
import type {Response} from "./scheduling";
const escape=(text:string)=>text.split("").map(char=>".*+?^$()|[]\\".includes(char)?"\\"+char:char).join("");
/** Explicit phrases only: never guess which assignment should receive a progress update. */
export function progressIntent(text:string,tasks:Task[]):{response:Response;minutes:number;matches:Task[]}|null {
 const response:Response|null=/\b(stuck|blocked|can't start|cannot start)\b/i.test(text)?"Stuck":/\b(more time|extra time|taking longer|need longer|more (?:minutes?|mins?|hours?))\b/i.test(text)?"Need more time":/\b(finished|completed|done with)\b/i.test(text)?"Done":/\b(made progress|worked on|making progress)\b/i.test(text)?"Making progress":/\b(skip|set aside)\b/i.test(text)?"Skip for now":null;
 if(!response || /\b(not (?:stuck|finished|done|completed|blocked)|haven['’]t finished|don['’]t skip|do not skip)\b/i.test(text))return null;
 const duration=text.match(/\b(\d+(?:\.\d+)?)\s*(?:(?:more|extra)\s+)?(min(?:ute)?s?|hours?|hrs?)\b/i),minutes=duration?Math.round(Number(duration[1])*(/^h/i.test(duration[2])?60:1)):response==="Stuck"?15:30;
 const eligible=tasks.filter(t=>t.status!=="done");
 const exact=eligible.filter(t=>text.toLowerCase().includes(t.title.toLowerCase()));
 const mentioned=exact.length?exact:eligible.filter(t=>t.title.toLowerCase().split(/\W+/).filter(word=>word.length>3).some(word=>new RegExp("\\b"+escape(word)+"\\b","i").test(text)));
 return {response,minutes,matches:mentioned.length?mentioned:eligible};
}
export function parseDayBrief(text:string,subjects:string[],now:Date):{tasks:TaskInput[];events:EventDraft[]} {
 const tasks:TaskInput[]=[],events:EventDraft[]=[];
 for(const item of splitItems(text)){
  const withoutDates=item.replace(/\b\d{4}-\d{2}-\d{2}\b/g,"");
  const eventKind=/\b(practice|soccer|shift|appointment|dinner|class|school|club|meeting|sleep|family time)\b/i.test(item);
  const range=/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(withoutDates) && (eventKind || /\d(?::\d{2}|\s*(?:am|pm))\b/i.test(withoutDates));
  const fixed=/\b(practice|soccer|shift|appointment|dinner|class|school|club|meeting|sleep|family time)\b/i.test(item) && /\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(item) && !/\bdue\b/i.test(item);
  if(range || fixed){events.push(...eventDrafts(item,now));continue;}
  const explicit=item.match(/^\s*([\w &'-]{1,80}):\s+(?=\S)/);
  const subject=explicit?.[1] ?? [...subjects].sort((a,b)=>b.length-a.length).find(s=>new RegExp("\\b"+escape(s)+"\\b","i").test(item)) ?? "Personal";
  tasks.push(...taskDrafts(explicit?item.slice(explicit[0].length):item,subject,now));
 }
 return {tasks,events};
}
