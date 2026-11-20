import {routingPrompt,proposalPrompt,dialoguePrompt,type BrainRequest,type ModelReply} from "./assistant-brain";
// Explanations and hypothetical discussion must never become task mutations.
export function isPlanExplanation(request:BrainRequest){return /^\s*(?:what\s+if|hypothetically|suppose|why\s+(?:is|are|was|were|did|does)|how\s+(?:does|did)\s+(?:my|the|this)|(?:can|could)\s+you\s+explain|explain\s+(?:why|my|the|this))\b/i.test(request.messages.at(-1)?.content ?? "");}
/** A vague check-in is a conversation, not permission to guess a task or time. */
export function needsProgressClarification(request:BrainRequest){
 const latest=request.messages.at(-1)?.content ?? '';
 const more=/\b(?:more|extra)\s+(?:time|minutes?|mins?|hours?|hrs?)\b|\b(?:taking|need)\s+longer\b|\b(?:stuck|blocked|can't start|cannot start)\b/i;
 const previous=[...request.messages.slice(0,-1)].reverse().find(m=>m.role==='user')?.content ?? '';
 const shortAnswer=latest.length<120 && !/[?]/.test(latest) && !/\b(?:plan|rebalance|schedule|change|set|add|remove|new|finished|done|complete)\b/i.test(latest);
 const direct=more.test(latest),continuing=shortAnswer && more.test(previous);
 const completion=/\b(?:finished|completed|done|skip|set aside|worked on|made progress)\b/i.test(latest);
 if(!direct && !continuing && !completion)return false;
 let data:{tasks?:{id:string;title:string}[];omittedTasks?:number};try{data=JSON.parse(request.context);}catch{return false;}
 const tasks=Array.isArray(data.tasks)?data.tasks.filter(t=>typeof t.title==='string'):[];
 const matches=(text:string)=>{
  const exact=tasks.filter(t=>text.toLowerCase().includes(t.title.toLowerCase()));if(exact.length)return exact;
  const words=new Set(text.toLowerCase().split(/\W+/));return tasks.filter(t=>t.title.toLowerCase().split(/\W+/).some(w=>w.length>3 && words.has(w)));
 };
 let targets=matches(latest);
 if(!targets.length){for(const entry of [...request.messages.slice(0,-1)].reverse()){const prior=matches(entry.content);if(prior.length){targets=prior;break;}}}
 if(!targets.length && tasks.length===1 && !data.omittedTasks)targets=tasks;
 if(targets.length!==1)return true;
 if(direct || continuing){
  const source=direct?latest:latest+' '+previous;
  const quantity=/\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty|ninety|half|quarter|an?|another)\s*(?:(?:more|extra|an?|of an?)\s+)?(?:min(?:ute)?s?|mins?|hours?|hrs?|m|h)\b/i;
  const bareNumber=/^\s*\d+(?:\.\d+)?[.! ]*$/.test(latest) && /minutes?|hours?/i.test(request.messages.at(-2)?.content ?? '');
  if(!quantity.test(source) && !bareNumber)return true;
 }
 return false;
}
export function modelMessages(request:BrainRequest,compact=false,kind?:ModelReply["kind"],routeOnly=false){
 let data:Record<string,unknown>;try{data=JSON.parse(request.context);}catch{throw new Error("The planning context could not be read.");}
 if(routeOnly || (kind && kind!=="none" && kind!=="replan")){delete data.commitments;delete data.sessions;delete data.unplaced;delete data.preferences;if(kind==="capture"){data.savedTaskTitles=Array.isArray(data.tasks)?(data.tasks as {id:string;title:string}[]).map(t=>({id:t.id,title:t.title})):[];delete data.tasks;}}
 const array=(key:string,max:number)=>{if(Array.isArray(data[key]))data[key]=(data[key] as unknown[]).slice(0,max);};
 array("tasks",compact?6:30);array("sessions",compact?6:25);array("commitments",compact?8:25);array("unplaced",compact?4:10);
 const original=JSON.parse(request.context);data.omittedTasks=(Number(original.omittedTasks)||0)+(Array.isArray(original.tasks)?original.tasks.length:0)-(Array.isArray(data.tasks)?data.tasks.length:0);
 const limit=compact?4500:12000;let context=JSON.stringify(data);
 while(context.length>limit){const key=["sessions","commitments","tasks","savedTaskTitles","unsavedTasks","unsavedEvents"].find(k=>Array.isArray(data[k]) && (data[k] as unknown[]).length>0);if(!key)throw new Error("Too much planning context for this model. Try a shorter message.");(data[key] as unknown[]).pop();if(key==="tasks")data.omittedTasks=Number(data.omittedTasks)+1;context=JSON.stringify(data);}
 const latest=request.messages.at(-1)!;if(compact && latest.content.length>2000)throw new Error("The browser model needs a shorter message (under 2,000 characters). Your draft is still here.");
 const history:BrainRequest["messages"]=[];let budget=compact?2500:6000;
 for(const message of [...request.messages].reverse()){if(message.content.length>budget){if(!history.length)throw new Error("Please send a shorter message.");break;}history.unshift(message);budget-=message.content.length;}
 const discussion=isPlanExplanation(request)?"\nREAD-ONLY DISCUSSION: Explain possible consequences using conditional language. Skipping or postponing work leaves its remaining minutes unchanged; it does not complete or erase the work. Never say you changed, reduced, completed, moved or saved anything. If a deadline is at risk, explain that risk and ask about an achievable alternative.":"";
 const clarification=needsProgressClarification(request)?"\nCLARIFICATION REQUIRED: Do not propose any task changes yet. Ask for the missing task or amount of time, acknowledging details already supplied. Never guess a duration.":"";
 return [{role:"system" as const,content:(routeOnly?routingPrompt():kind && kind!=="none" && kind!=="replan"?proposalPrompt(kind,request.persona):dialoguePrompt(request.persona)+"\nRESPONSE PHASE: return only a natural conversational reply; no kind or proposals. Say what actually fits or ask a clarification. No changes are saved by this reply."+discussion+clarification)+"\nCurrent planning DATA (may be truncated; do not invent omitted items):\n"+context},...history];
}
