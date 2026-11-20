import {brainRequestSchema,dialogueSchema,proposalSchema,combineModelStages,modelResponseFormat,type BrainRequest} from "./assistant-brain";
import {modelMessages,isPlanExplanation,needsProgressClarification} from "./model-messages";
const base="http://127.0.0.1:11434";
export function localModelAllowed(url:string){const host=new URL(url).hostname;return process.env.VERCEL!=="1" && ["localhost","127.0.0.1","[::1]"].includes(host);}
export function selectLocalModel(names:string[],requested?:string){
 const supported=names.filter(n=>/^(?:qwen[23](?:\.\d+)?(?:vl|-vl)?|gemma3|llama3(?:\.\d+)?)(?::|$)/.test(n));
 if(requested){if(!supported.includes(requested))throw new Error('That chat model is not installed or supported. Refresh the local model list and choose an available model.');return requested;}
 return supported.find(n=>/^qwen2\.5:/.test(n)) ?? supported.find(n=>/^gemma3:/.test(n)) ?? supported.find(n=>/^qwen2\.5vl:/.test(n)) ?? supported[0] ?? null;
}
export async function localModelOptions(){const response=await fetch(base+'/api/tags',{signal:AbortSignal.timeout(3000),cache:'no-store'});if(!response.ok)throw new Error('Local model service unavailable.');const body=await response.json();return (body.models ?? []).map((m:{name:string})=>m.name).filter((name:unknown):name is string=>typeof name==='string' && selectLocalModel([name])!==null) as string[];}
export async function localModelName(){return selectLocalModel(await localModelOptions());}
export async function askLocalModel(input:BrainRequest,signal:AbortSignal){
 const request=brainRequestSchema.parse(input),model=selectLocalModel(await localModelOptions(),request.localModel);if(!model)throw new Error("No supported local model is installed. The planner still works without AI.");
 async function generate(messages:ReturnType<typeof modelMessages>,schema:Record<string,unknown>,routing=false){const response=await fetch(base+"/api/chat",{method:"POST",headers:{"content-type":"application/json"},signal,body:JSON.stringify({model,messages,stream:false,format:schema,options:{temperature:0,num_ctx:8192,num_predict:routing?60:1600}})});if(!response.ok)throw new Error("The local model could not answer. No changes were saved.");const data=await response.json();if(data.done_reason==="length")throw new Error("The model ran out of room. Try a shorter message.");return JSON.parse(data.message?.content ?? "");}
 const dialogue=(isPlanExplanation(request)||needsProgressClarification(request))?{kind:"none" as const}:dialogueSchema.parse(await generate(modelMessages(request,false,undefined,true),modelResponseFormat(dialogueSchema),true));
 const proposal=await generate(modelMessages(request,false,dialogue.kind),modelResponseFormat(proposalSchema(dialogue.kind)));
 return {model,result:combineModelStages(dialogue,proposal)};
}
