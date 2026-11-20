import type {MLCEngineInterface} from "@mlc-ai/web-llm";
import {dialogueSchema,proposalSchema,combineModelStages,modelResponseFormat,type BrainRequest} from "./assistant-brain";
import {modelMessages,isPlanExplanation,isExploratoryConversation,needsProgressClarification} from "./model-messages";
export const browserModelId="Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export class BrowserModel{
 private worker:Worker|null=null;private engine:MLCEngineInterface|null=null;
 async load(progress:(amount:number,text:string)=>void,signal:AbortSignal){
  const gpu=(navigator as Navigator & {gpu?:{requestAdapter():Promise<{features:{has(name:string):boolean}}|null>}}).gpu;
  if(!gpu)throw new Error("This browser does not support WebGPU. Use a recent Chrome/Edge browser or local Ollama; planner mode still works.");
  const adapter=await gpu.requestAdapter();if(signal.aborted)throw new Error("Model loading stopped.");if(!adapter)throw new Error("No usable GPU is available. Close other GPU-heavy apps or use local Ollama. Planner mode still works.");
  const modelId=adapter.features.has("shader-f16")?browserModelId:browserModelId.replace("q4f16","q4f32");
  const {CreateWebWorkerMLCEngine}=await import("@mlc-ai/web-llm");if(signal.aborted)throw new Error("Model loading stopped.");
  const worker=new Worker(new URL("./browser-model.worker.ts",import.meta.url),{type:"module"});this.worker=worker;
  const stopped=new Promise<never>((_,reject)=>signal.addEventListener("abort",()=>{worker.terminate();reject(new Error("Model loading stopped. Cached weights can be reused on retry."));},{once:true}));
  try{this.engine=await Promise.race([CreateWebWorkerMLCEngine(worker,modelId,{initProgressCallback:report=>progress(report.progress,report.text),logLevel:"WARN"},{context_window_size:4096}),stopped]);}catch(e){worker.terminate();this.worker=null;throw e;}
 }
 async ask(request:BrainRequest,signal:AbortSignal){if(!this.engine)throw new Error("Enable the browser model first.");const engine=this.engine;const stop=()=>{void engine.interruptGenerate();};signal.addEventListener("abort",stop,{once:true});try{
 async function generate(kind?:"none"|"capture"|"progress"|"edit"|"replan",routing=false){const response=await engine.chat.completions.create({messages:modelMessages(request,true,kind,routing),temperature:0,max_tokens:routing?60:1000,response_format:{type:"json_object",schema:JSON.stringify(modelResponseFormat(routing?dialogueSchema:proposalSchema(kind ?? "none")))}});if(signal.aborted)throw new Error("AI request stopped.");if(response.choices[0]?.finish_reason==="length")throw new Error("The browser model ran out of room. Try fewer changes.");return JSON.parse(response.choices[0]?.message.content ?? "");}
 const dialogue=(isPlanExplanation(request)||isExploratoryConversation(request)||needsProgressClarification(request))?{kind:"none" as const}:dialogueSchema.parse(await generate(undefined,true));const proposal=await generate(dialogue.kind);return combineModelStages(dialogue,proposal);
 }finally{signal.removeEventListener("abort",stop);}}

 async dispose(){const worker=this.worker;this.worker=null;try{await this.engine?.unload();}finally{this.engine=null;worker?.terminate();}}
}
