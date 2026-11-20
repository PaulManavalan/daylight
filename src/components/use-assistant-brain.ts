"use client";
import {useEffect,useRef,useState} from "react";
import {brainRequestSchema,validateModelReply,type BrainRequest} from "@/lib/assistant-brain";
import type {Task} from "@/lib/types";
import type {BrowserModel} from "@/lib/browser-model";
export function useAssistantBrain(owner:string){
 const [provider,setProvider]=useState<"checking"|"planner"|"ollama"|"browser">("checking"),[model,setModel]=useState(""),[loading,setLoading]=useState(false),[thinking,setThinking]=useState(false),[progress,setProgress]=useState(0),[detail,setDetail]=useState("");
 const [localModels,setLocalModels]=useState<string[]>([]);
 const engine=useRef<BrowserModel|null>(null),active=useRef<AbortController|null>(null),lifetime=useRef(0);
 const source=useRef<{provider:typeof provider;model:string}>({provider:'checking',model:''});
 useEffect(()=>{source.current={provider,model};},[provider,model]);
 async function reconnect(){
  if(active.current)return source.current.provider==='ollama'||source.current.provider==='browser';
  const ticket=lifetime.current,previous=source.current;setDetail('');setProvider('checking');
  const fallback=()=>{const kept=previous.provider==='browser' && engine.current?previous:{provider:'planner' as const,model:''};source.current=kept;setProvider(kept.provider);setModel(kept.model);return kept.provider==='browser';};
  try{const response=await fetch('/api/assistant',{signal:AbortSignal.timeout(8000),cache:'no-store'});if(!response.ok)throw new Error('Chat connection unavailable.');const data=await response.json();if(ticket!==lifetime.current)return false;
   const models:string[]=Array.isArray(data.models)?data.models.filter((m:unknown)=>typeof m==='string'):data.model?[data.model]:[];setLocalModels(models);
   if(!data.available){const kept=fallback();if(!kept)setDetail('Local AI is not connected here. Open Daylight with Start Daylight.cmd on your computer, or explicitly enable the browser model.');return kept;}
   let saved='';try{saved=localStorage.getItem('daylight.ai.local-model.v1.'+owner)??'';}catch{}
   const selected=models.includes(previous.model)?previous.model:models.includes(saved)?saved:data.model??'';
   source.current={provider:'ollama',model:selected};setProvider('ollama');setModel(selected);return true;
  }catch{if(ticket!==lifetime.current)return false;const kept=fallback();if(!kept)setDetail('The AI connection could not be reached. Your message is kept; reconnect to continue chatting.');return kept;}
 }
 useEffect(()=>{lifetime.current++;void reconnect();return()=>{lifetime.current++;active.current?.abort();void engine.current?.dispose().catch(()=>{});engine.current=null;};},[owner]);
 async function enableBrowser(){if(loading || thinking)return;const ticket=lifetime.current,controller=new AbortController();active.current=controller;setLoading(true);setDetail("");setProgress(0);try{await engine.current?.dispose();const {BrowserModel}=await import("@/lib/browser-model");const next=new BrowserModel();engine.current=next;await next.load((amount,text)=>{if(ticket===lifetime.current){setProgress(amount);setDetail(text.slice(0,180));}},controller.signal);if(ticket!==lifetime.current){await next.dispose();return;}setProvider("browser");setModel("Qwen2.5 1.5B");setDetail("");}catch(e){if(ticket===lifetime.current){setProvider("planner");setDetail(e instanceof Error?e.message:"The browser model could not load. Planning still works.");}}finally{if(ticket===lifetime.current){setLoading(false);active.current=null;}}}
 function stop(){active.current?.abort();}
 async function plannerMode(){stop();await engine.current?.dispose();engine.current=null;setProvider("planner");setModel("");setDetail("");}
 async function ask(input:BrainRequest,tasks:Task[]){const current=source.current;if(thinking || loading || active.current)throw new Error("Wait for the current model request, or stop it first.");if(current.provider!=="ollama" && current.provider!=="browser")throw new Error("Reconnect AI to continue chatting. Basic planning remains available separately.");const request=brainRequestSchema.parse(current.provider==="ollama"?{...input,localModel:current.model}:input),controller=new AbortController(),ticket=lifetime.current;active.current=controller;setThinking(true);setDetail("");try{let raw:unknown;if(current.provider==="browser"){raw=await engine.current!.ask(request,controller.signal);}else{const response=await fetch("/api/assistant",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(request),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(95000)])});const data=await response.json();if(!response.ok)throw new Error(data.error ?? "The local model could not answer.");raw=data.result;}if(controller.signal.aborted || ticket!==lifetime.current)throw new Error("AI request stopped. Nothing was saved.");return validateModelReply(raw,tasks);}catch(e){if(controller.signal.aborted)throw new Error("AI request stopped. Your draft and plan are kept.");throw e;}finally{if(ticket===lifetime.current){setThinking(false);active.current=null;}}}
 function selectModel(name:string){if(provider==="ollama" && !thinking && !loading && localModels.includes(name)){setModel(name);setDetail("");try{localStorage.setItem("daylight.ai.local-model.v1."+owner,name);}catch{setDetail("Your model selection works for this session, but could not be saved in browser storage.");}}}
 return {provider,model,localModels,selectModel,loading,thinking,progress,detail,available:provider==="ollama" || provider==="browser",enableBrowser,reconnect,plannerMode,stop,ask};
}
export type AssistantBrain=ReturnType<typeof useAssistantBrain>;
