import {routingPrompt,proposalPrompt,dialoguePrompt,type BrainRequest,type ModelReply} from "./assistant-brain";
// Explanations about the existing plan must never become a task mutation.
export function isPlanExplanation(request:BrainRequest){return /^\s*(?:why\s+(?:is|are|was|were|did|does)|how\s+(?:does|did)\s+(?:my|the|this)|(?:can|could)\s+you\s+explain|explain\s+(?:why|my|the|this))\b/i.test(request.messages.at(-1)?.content ?? "");}
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
 return [{role:"system" as const,content:(routeOnly?routingPrompt():kind && kind!=="none" && kind!=="replan"?proposalPrompt(kind,request.persona):dialoguePrompt(request.persona)+"\nRESPONSE PHASE: return only a natural conversational reply; no kind or proposals. Say what actually fits or ask a clarification. No changes are saved by this reply.")+"\nCurrent planning DATA (may be truncated; do not invent omitted items):\n"+context},...history];
}
