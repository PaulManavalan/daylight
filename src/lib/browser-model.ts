import type {MLCEngineInterface} from "@mlc-ai/web-llm";
import {dialogueSchema,proposalSchema,combineModelStages,modelResponseFormat,type BrainRequest} from "./assistant-brain";
import {modelMessages,isPlanExplanation,isExploratoryConversation,isExplicitNewTask,needsProgressClarification} from "./model-messages";
export const browserModelId="Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export function browserModelLoadMessage(cause:unknown){
 const reason=cause instanceof Error?cause.message:typeof cause==='string'?cause:'';
 return /failed to fetch|networkerror|network request failed|download.*failed/i.test(reason)?'Chat model files could not be downloaded. Check your connection and retry. Cached files can be reused; your message is kept.':'Browser chat could not load. Check your connection and try again, or use local AI. Your message is kept.';
}
export class BrowserModel{
 private worker:Worker|null=null;private engine:MLCEngineInterface|null=null;
 async load(progress:(amount:number,text:string)=>void,signal:AbortSignal){
  if(signal.aborted)throw new Error('Model loading stopped.');
  const gpu=(navigator as Navigator & {gpu?:{requestAdapter():Promise<{features:{has(name:string):boolean}}|null>}}).gpu;
  if(!gpu)throw new Error("This browser does not support WebGPU. Use a recent Chrome/Edge browser or local Ollama; planner mode still works.");
  let worker:Worker|null=null,abort=()=>{},crash=()=>{};
  const stopped=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('Model loading stopped. Cached files can be reused on retry.'));signal.addEventListener('abort',abort,{once:true});});
  try{
   const adapter=await Promise.race([gpu.requestAdapter(),stopped]);if(!adapter){const error=new Error('No usable GPU is available. Close other GPU-heavy apps or use local AI.');error.name='BrowserGPUUnavailable';throw error;}
   const modelId=adapter.features.has('shader-f16')?browserModelId:browserModelId.replace('q4f16','q4f32');
   const {CreateWebWorkerMLCEngine}=await Promise.race([import('@mlc-ai/web-llm'),stopped]);
   worker=new Worker(new URL('./browser-model.worker.ts',import.meta.url),{type:'module'});this.worker=worker;
   const failed=new Promise<never>((_,reject)=>{crash=()=>reject(new Error('The browser could not start chat.'));worker!.addEventListener('error',crash,{once:true});});
   this.engine=await Promise.race([CreateWebWorkerMLCEngine(worker,modelId,{initProgressCallback:report=>progress(report.progress,report.text),logLevel:'WARN'},{context_window_size:4096}),stopped,failed]);
  }catch(e){worker?.terminate();this.worker=null;if(signal.aborted)throw new Error('Model loading stopped. Cached files can be reused on retry.');if(e instanceof Error && e.name==='BrowserGPUUnavailable')throw e;throw new Error(browserModelLoadMessage(e),{cause:e});}finally{signal.removeEventListener('abort',abort);worker?.removeEventListener('error',crash);}
 }
 async ask(request:BrainRequest,signal:AbortSignal){if(!this.engine)throw new Error("Enable the browser model first.");if(signal.aborted)throw new Error('Chat request stopped.');const engine=this.engine,worker=this.worker;let stop=()=>{},crash=()=>{};
 const stopped=new Promise<never>((_,reject)=>{stop=()=>{try{void Promise.resolve(engine.interruptGenerate()).catch(()=>{});}catch{}reject(new Error(signal.reason?.name==='TimeoutError'?'Chat took too long. Try a shorter message; your plan is unchanged.':'Chat request stopped.'));};signal.addEventListener('abort',stop,{once:true});});
 const failed=new Promise<never>((_,reject)=>{crash=()=>{this.engine=null;this.worker=null;worker?.terminate();const error=new Error('Browser chat stopped unexpectedly. Enable it again to reconnect. Your message is kept.');error.name='BrowserModelUnavailable';reject(error);};worker?.addEventListener('error',crash,{once:true});});
 try{
 async function generate(kind?:"none"|"capture"|"progress"|"edit"|"replan",routing=false){const response=await Promise.race([engine.chat.completions.create({messages:modelMessages(request,true,kind,routing),temperature:0,max_tokens:routing?60:1000,response_format:{type:"json_object",schema:JSON.stringify(modelResponseFormat(routing?dialogueSchema:proposalSchema(kind ?? "none")))}}),stopped,failed]);if(signal.aborted)throw new Error("AI request stopped.");if(response.choices[0]?.finish_reason==="length")throw new Error("The browser model ran out of room. Try fewer changes.");return JSON.parse(response.choices[0]?.message.content ?? "");}
 const dialogue=(isPlanExplanation(request)||isExploratoryConversation(request)||needsProgressClarification(request))?{kind:"none" as const}:isExplicitNewTask(request)?{kind:'capture' as const}:dialogueSchema.parse(await generate(undefined,true));const proposal=await generate(dialogue.kind);return combineModelStages(dialogue,proposal);
 }finally{signal.removeEventListener("abort",stop);worker?.removeEventListener('error',crash);}}

 async dispose(){const worker=this.worker,engine=this.engine;this.worker=null;this.engine=null;try{await engine?.unload();}finally{worker?.terminate();}}
}
