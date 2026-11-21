import {z} from 'zod';
import {localDeadline} from './assistant-brain';
import {dateKey,dayAt,type PlanningState} from './scheduling';
import {dailyAgenda} from './agenda';
import {taskInputSchema,type Task,type TaskInput} from './types';

export interface NotionCandidate{key:string;title:string;subject:string;minutes:number|null;deadline:string|null;url:string}
export interface NotionResource{id:string;title:string;kind:'page'|'database'|'data_source'}
export function notionId(value:string){
 let path=value.trim();if(path.includes('://')){let url:URL;try{url=new URL(path);}catch{throw new Error('Paste a Notion page or database link.');}if(url.protocol==='collection:')path=url.hostname;else{if(url.protocol!=='https:' || !/(^|\.)(notion\.so|notion\.site|notion\.com)$/.test(url.hostname))throw new Error('Use a Notion link, not another website.');path=url.pathname;}}
 const match=path.match(/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|[a-f\d]{32})\/?$/i);if(!match)throw new Error('This link does not contain a Notion page or database ID.');const id=match[1].replaceAll('-','').toLowerCase();return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
}
export const notionUrl=(id:string)=>'https://www.notion.so/'+notionId(id).replaceAll('-','');
type Obj=Record<string,unknown>;
export const object=(value:unknown):Obj=>value && typeof value==='object'&&!Array.isArray(value)?value as Obj:{};
export function richText(value:unknown){return Array.isArray(value)?value.map(v=>{const item=object(v);return typeof item.plain_text==='string'?item.plain_text:typeof object(item.text).content==='string'?object(item.text).content:'';}).join('').slice(0,10000):'';}
export function resourceTitle(value:unknown){const row=object(value);if(Array.isArray(row.title))return richText(row.title)||'Untitled';for(const prop of Object.values(object(row.properties))){const p=object(prop);if(p.type==='title')return richText(p.title)||'Untitled';}return 'Untitled';}
const key=(page:string,block:string,subject:string,title:string)=>`${page}/${block}/${encodeURIComponent((subject+'|'+title).normalize('NFKC').trim().toLowerCase())}`;
function candidate(page:string,block:string,title:string,subject:string,minutes:number|null=null,deadline:string|null=null):NotionCandidate|null{
 title=title.trim();subject=subject.trim();if(!title||title.length>200||!subject||subject.length>80)return null;
 return {key:key(page,block,subject,title),title,subject,minutes:minutes!==null&&Number.isInteger(minutes)&&minutes>=5&&minutes<=1440?minutes:null,deadline,url:notionUrl(page)+'#'+block.replaceAll('-','')};
}
export function pageCandidates(source:string,blocks:unknown[]){
 const items:NotionCandidate[]=[];let subject='Personal',skipped=0,nested=false,stopped=false;
 for(const value of blocks){const block=object(value),type=String(block.type??''),body=object(block[type]),text=richText(body.rich_text).trim();if(block.has_children)nested=true;
  if(/^(?:plan for (?:this|the) week|weekly plan|daylight (?:plan|check-ins|export))\b/i.test(text)){stopped=true;break;}
  if(/^heading_[123]$/.test(type)){if(text&&text.length<=80)subject=text;continue;}
  if(type==='to_do'&&body.checked){skipped++;continue;}if(!['paragraph','to_do','bulleted_list_item','numbered_list_item'].includes(type)||!text)continue;
  const prefix=text.match(/^([\p{L}][\p{L}\p{N} &/.'()_-]{0,79}):\s*(.+)$/u);
  if(prefix&&/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(prefix[1])){skipped++;continue;}
  const titles=prefix?prefix[2].split(/[,;]\s*/):type==='paragraph'?[]:[text],current=prefix?prefix[1]:subject;
  for(const title of titles){const estimate=title.match(/\b(\d+)\s*(?:minutes?|mins?)\b/i),item=candidate(source,String(block.id),title,current,estimate?Number(estimate[1]):null);if(item)items.push(item);else skipped++;}
 }
 return {items,skipped,nested,stopped};
}
export function databaseCandidates(rows:unknown[]){
 const items:NotionCandidate[]=[];let skipped=0;
 for(const value of rows){const row=object(value),props=Object.entries(object(row.properties));
  const done=props.some(([name,v])=>{const p=object(v);return (p.type==='status'||(p.type==='select'&&/^(status|state)$/i.test(name)))&&/^(done|complete|completed|submitted|turned in|cancelled|canceled)$/i.test(String(object(p[p.type as string]).name))||p.type==='checkbox'&&/^(done|complete|completed)$/i.test(name)&&p.checkbox===true;});if(row.in_trash||row.archived||done){skipped++;continue;}
  const field=(pattern:RegExp)=>object(props.find(([name])=>pattern.test(name))?.[1]);
  const course=field(/^(subject|course|class)$/i),estimate=field(/(?:minutes|mins|\bmin\b)/i),due=field(/(?:due|deadline)/i);
  const subject=String(object(course.select).name??richText(course.rich_text)??'').trim()||'Personal';
  const start=object(due.date).start,deadline=typeof start==='string'&&(/^\d{4}-\d{2}-\d{2}$/.test(start)||z.iso.datetime({offset:true}).safeParse(start).success)?start:null;
  const item=candidate(String(row.id),String(row.id),resourceTitle(row),subject,typeof estimate.number==='number'?estimate.number:null,deadline);if(item){item.key='page/'+notionId(String(row.id));items.push(item);}else skipped++;
 }
 return {items,skipped};
}
export const notionMarker=(key:string)=>`[Daylight Notion: ${key}]`;
export function isNotionImported(item:NotionCandidate,tasks:Task[]){return tasks.some(t=>t.description.includes(notionMarker(item.key)));}
export function similarNotionTask(item:NotionCandidate,tasks:Task[]){return tasks.some(t=>t.status!=='done'&&t.title.trim().toLowerCase()===item.title.trim().toLowerCase()&&t.subject.trim().toLowerCase()===item.subject.trim().toLowerCase());}
export function notionTask(item:NotionCandidate,minutes:number,deadline:string):TaskInput{
 return taskInputSchema.parse({title:item.title,subject:item.subject,description:`Imported from Notion: ${item.url}\n${notionMarker(item.key)}`,estimated_minutes:minutes,remaining_minutes:minutes,deadline:deadline?localDeadline(deadline):null,priority:'medium',energy_level:null,status:'not_started'});
}
export const notionExportSchema=z.object({operationId:z.uuid(),pageId:z.uuid(),title:z.string().trim().min(1).max(180),lines:z.array(z.string().min(1).max(2000)).min(1).max(90)}).strict();
export type NotionExport=z.infer<typeof notionExportSchema>;
export function exportToNotion(tasks:Task[],planning:PlanningState|null,kind:'plan'|'checkins',now=new Date()):{title:string;lines:string[]}{
 const day=dateKey(now),lines:string[]=[];
 if(kind==='checkins'){const notes=(planning?.daily_checkins??[]).slice(0,10);for(const note of notes)lines.push(`${note.day} · ${note.period}`,note.note);if(!notes.length)throw new Error('There are no saved check-ins to export.');return {title:'Daylight check-ins — '+day,lines};}
 lines.push('Saved schedule snapshot · '+now.toLocaleString()+'. Scheduled time does not mean completed work.');
 const entries=planning?dailyAgenda(tasks,planning,dayAt(now)).entries.slice(0,40):[];
 const time=(value:string)=>{const date=new Date(value);return date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+(dateKey(date)!==day?' ('+date.toLocaleDateString([],{weekday:'short'})+')':'');};
 for(const entry of entries)lines.push(`${time(entry.start)}–${time(entry.end)} · ${entry.kind==='fixed'?'Protected':entry.kind==='recovery'?'Recovery':'Focus'} · ${entry.title} · ${Math.round((Date.parse(entry.end)-Date.parse(entry.start))/60000)} min`);
 if(!entries.some(entry=>entry.kind==='study'))lines.push('No focus sessions are saved for today.');
 const due=tasks.filter(t=>t.status!=='done'&&t.deadline&&dateKey(new Date(t.deadline))<=day).slice(0,20);if(due.length)lines.push('Open work due today or earlier',...due.map(t=>`${t.title} · ${t.subject} · ${t.remaining_minutes} min remaining · due ${new Date(t.deadline!).toLocaleString()}`));
 return {title:'Daylight plan — '+day,lines};
}
