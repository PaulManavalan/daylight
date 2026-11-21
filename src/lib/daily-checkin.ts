import {z} from 'zod';
import type {PlanningState} from './scheduling';

export const dailyCheckInSchema=z.object({id:z.uuid(),day:z.iso.date(),period:z.enum(['morning','evening']),note:z.string().trim().min(1).max(2000),at:z.iso.datetime()}).strict();
export type DailyCheckIn=z.infer<typeof dailyCheckInSchema>;
const localDay=(now:Date)=>`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
/** Only an explicit journal prefix creates a proposal; ordinary chat remains chat. */
export function dailyCheckInDraft(text:string,now=new Date()):DailyCheckIn|null{
 const match=text.match(/^\s*(morning|evening)\s+check[ -]?in\s*:\s*([\s\S]*)$/i);
 if(!match)return null;
 const note=match[2].trim();if(!note)throw new Error('Write a few words about your day before saving a check-in.');
 if(note.length>2000)throw new Error('Keep this check-in under 2,000 characters. Your draft is kept.');
 return dailyCheckInSchema.parse({id:crypto.randomUUID(),day:localDay(now),period:match[1].toLowerCase(),note,at:now.toISOString()});
}
export function recordDailyCheckIn(state:PlanningState,input:DailyCheckIn,now=new Date()):PlanningState{
 const entry=dailyCheckInSchema.parse(input),rows=state.daily_checkins??[];
 const existing=rows.find(row=>row.id===entry.id);
 if(existing){if(JSON.stringify(existing)!==JSON.stringify(entry))throw new Error('This check-in changed. Review it again before saving.');return state;}
 if(entry.day!==localDay(now))throw new Error('The day changed while this check-in was open. Start a fresh check-in for today.');
 return {...state,daily_checkins:[entry,...rows].slice(0,60)};
}
export function removeDailyCheckIn(state:PlanningState,input:DailyCheckIn):PlanningState{
 const entry=dailyCheckInSchema.parse(input),rows=state.daily_checkins??[],current=rows.find(row=>row.id===entry.id);
 if(!current)return state;
 if(JSON.stringify(current)!==JSON.stringify(entry))throw new Error('This check-in changed in another tab. Reload before removing it.');
 return {...state,daily_checkins:rows.filter(row=>row.id!==entry.id)};
}
