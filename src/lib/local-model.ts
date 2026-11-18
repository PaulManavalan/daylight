import {brainRequestSchema,dialogueSchema,proposalSchema,combineModelStages,modelResponseFormat,type BrainRequest} from "./assistant-brain";
import {modelMessages,isPlanExplanation} from "./model-messages";
const base="http://127.0.0.1:11434";
export function localModelAllowed(url:string){const host=new URL(url).hostname;return process.env.VERCEL!=="1" && ["localhost","127.0.0.1","[::1]"].includes(host);}
export async function localModelName(){const response=await fetch(base+"/api/tags",{signal:AbortSignal.timeout(3000),cache:"no-store"});if(!response.ok)throw new Error("Local model service unavailable.");const body=await response.json();const names=(body.models ?? []).map((m:{name:string})=>m.name) as string[];return names.find(n=>/^qwen2\.5(?::|$)/.test(n)) ?? names.find(n=>/^gemma3(?::|$)/.test(n)) ?? names.find(n=>/^qwen2\.5vl(?::|$)/.test(n)) ?? names.find(n=>/^llama3/.test(n)) ?? null;}
export async function askLocalModel(input:BrainRequest,signal:AbortSignal){
 const request=brainRequestSchema.parse(input),model=await localModelName();if(!model)throw new Error("No supported local model is installed. The planner still works without AI.");
 async function generate(messages:ReturnType<typeof modelMessages>,schema:Record<string,unknown>,routing=false){const response=await fetch(base+"/api/chat",{method:"POST",headers:{"content-type":"application/json"},signal,body:JSON.stringify({model,messages,stream:false,format:schema,options:{temperature:0,num_ctx:8192,num_predict:routing?60:1600}})});if(!response.ok)throw new Error("The local model could not answer. No changes were saved.");const data=await response.json();if(data.done_reason==="length")throw new Error("The model ran out of room. Try a shorter message.");return JSON.parse(data.message?.content ?? "");}
 const dialogue=isPlanExplanation(request)?{kind:"none" as const}:dialogueSchema.parse(await generate(modelMessages(request,false,undefined,true),modelResponseFormat(dialogueSchema),true));
 const proposal=await generate(modelMessages(request,false,dialogue.kind),modelResponseFormat(proposalSchema(dialogue.kind)));
 return {model,result:combineModelStages(dialogue,proposal)};
}
