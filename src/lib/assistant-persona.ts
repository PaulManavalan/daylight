import {z} from "zod";
export const personaSchema=z.object({name:z.string().trim().min(1,"Give your assistant a name.").max(24,"Keep the name under 25 characters."),tone:z.enum(["calm","direct","encouraging"]),avatar:z.enum(["sun","moon","sprout"])});
export type AssistantPersona=z.infer<typeof personaSchema>;
export const defaultPersona:AssistantPersona={name:"Sol",tone:"calm",avatar:"sun"};
export const toneLabels={calm:"Calm",direct:"Straightforward",encouraging:"Encouraging"};
export const toneDescriptions={calm:"Gentle, steady, and one step at a time.",direct:"Clear answers and practical next steps.",encouraging:"A little momentum, without the pressure."};
const key=(owner:string)=>"daylight.assistant-persona.v1."+owner;
export interface PersonaStorage{getItem(key:string):string|null;setItem(key:string,value:string):void}
export function loadPersona(storage:PersonaStorage,owner:string):AssistantPersona{try{const raw=storage.getItem(key(owner));return raw?personaSchema.parse(JSON.parse(raw)):{...defaultPersona};}catch{return {...defaultPersona};}}
export function savePersona(storage:PersonaStorage,owner:string,value:AssistantPersona):AssistantPersona{const parsed=personaSchema.parse(value);try{storage.setItem(key(owner),JSON.stringify(parsed));}catch{throw new Error("I couldn't save that style in this browser. Your previous settings are kept.");}return parsed;}
/** Voice changes presentation only. Estimates, deadlines and planner decisions stay factual. */
export function voiceText(text:string,tone:AssistantPersona["tone"]):string{
 if(text.startsWith("Hey. What's on your mind?"))return tone==='direct'?"Let's plan your day. What's on your mind? We can think it through and turn your decisions into a plan.":tone==='encouraging'?"Hey! What's on your mind? We can untangle it together, find one useful next step, and make room for it today.":text;
 if(text.startsWith("Hey. Let's make a day that works for you."))return tone==="direct"?"Let's plan your day. Send your homework, deadlines, and fixed events in one message—or choose Help me get started for questions.":tone==="encouraging"?"Hey! Let's find a little momentum for today. Tell me about school, homework, practice—whatever's on your plate. We'll turn it into a plan with space to breathe.":"Hey. We don't have to solve the whole day at once. Tell me about school, homework, practice—whatever's on your plate. We'll take it one step at a time.";
 if(text==="Anytime. I'm here when the day changes.")return tone==="direct"?"You're welcome. Send an update whenever your plan changes.":tone==="encouraging"?"You got it. One small step counts—come back when you need the next one.":"Anytime. There's room to take this at your pace.";
 if(text.startsWith("Your day is ready."))return tone==="direct"?"Plan saved. Your timeline is updated and fixed commitments are protected. Tell me when work is finished, blocked, or needs more time.":tone==="encouraging"?"That's one less thing to carry in your head. Your day is ready, and your fixed commitments stay protected. If anything gets tricky, tell me—we can adjust the plan.":text;
 if(text.startsWith("Your day is rebalanced."))return tone==="direct"?"Day rebalanced. Check the timeline and any work that couldn't fit. Protected commitments and deadlines are unchanged.":tone==="encouraging"?"Fresh plan, same breathing room. Your timeline has the update. Anything that couldn't fit stays visible so we can make a realistic choice.":text;
 if(text.startsWith("I've pulled out the work and fixed plans."))return tone==="direct"?"Draft captured. Review the tasks, estimates, deadlines and fixed-event times below, then choose Build my day.":tone==="encouraging"?"Good brain dump. I've sorted the work from the fixed plans. Give the details a quick check—especially uncertain dates or times—and we'll make room for the day.":text;
 if(text.includes("is done. I've reclaimed") || text.includes("sessions rearranged around your fixed plans"))return tone==="calm"?"One step at a time. "+text:tone==="encouraging"?"That update helps us make a better plan. "+text:text;
 if(tone==="direct" && text.startsWith("What work do you have for "))return text.replace("Tell me the assignments, roughly how long they'll take, and when they're due.","List assignments, estimates, and deadlines.");
 if(tone==="encouraging" && text.startsWith("What work do you have for "))return "Let's tackle one subject at a time. "+text;
 return text;
}
