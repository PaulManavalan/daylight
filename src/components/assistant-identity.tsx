"use client";
import {ZodError} from "zod";
import {useEffect,useRef,useState} from "react";
import {SlidersHorizontal,Check} from "lucide-react";
import {AssistantAvatar} from "./assistant-avatar";
import {Button} from "./ui/button";
import {savePersona,toneDescriptions,toneLabels,type AssistantPersona} from "@/lib/assistant-persona";
export function AssistantIdentity({owner,persona,busy,onChange}:{owner:string;persona:AssistantPersona;busy:boolean;onChange:(next:AssistantPersona)=>void}){
 const [draft,setDraft]=useState(persona),[error,setError]=useState("");const panel=useRef<HTMLDetailsElement>(null),summary=useRef<HTMLElement>(null);
 useEffect(()=>setDraft(persona),[persona]);
 function save(){try{const next=savePersona(localStorage,owner,draft);onChange(next);setError("");if(panel.current)panel.current.open=false;summary.current?.focus();}catch(e){setError(e instanceof ZodError?e.issues[0].message:e instanceof Error?e.message:"Could not save this style.");}}
 return <details ref={panel} className="assistant-identity"><summary ref={summary} aria-label="Assistant personality and avatar"><span><AssistantAvatar variant={persona.avatar} thinking={busy}/><span><strong>{persona.name}</strong><small>Your Daylight companion · {toneLabels[persona.tone]}</small></span></span><span className="identity-edit"><SlidersHorizontal size={13}/><span>Personalize</span></span></summary>
 <div className="persona-settings"><div className="persona-preview"><AssistantAvatar variant={draft.avatar} size={70}/><p>A familiar face for your day.<span>Choose how your assistant talks. Your planning rules stay the same.</span></p></div><label className="field">Assistant name<input aria-label="Assistant name" maxLength={24} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} disabled={busy}/></label>
 <fieldset disabled={busy}><legend>Personality</legend><div className="persona-tones">{(["calm","direct","encouraging"] as const).map(tone=><button type="button" key={tone} aria-pressed={draft.tone===tone} onClick={()=>setDraft({...draft,tone})}><span>{toneLabels[tone]}{draft.tone===tone && <Check size={12}/>}</span><small>{toneDescriptions[tone]}</small></button>)}</div></fieldset>
 <fieldset disabled={busy}><legend>Avatar</legend><div className="persona-avatars">{(["sun","moon","sprout"] as const).map(avatar=><button type="button" key={avatar} aria-label={avatar+" avatar"} aria-pressed={draft.avatar===avatar} onClick={()=>setDraft({...draft,avatar})}><AssistantAvatar variant={avatar} size={47}/><span>{avatar}</span></button>)}</div></fieldset>
 {error && <p role="alert" className="persona-error">{error}</p>}<div className="persona-footer"><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setDraft(persona);setError("");if(panel.current)panel.current.open=false;summary.current?.focus();}}>Cancel</Button><Button size="sm" disabled={busy} onClick={save}>Save personality</Button></div></div>
 </details>;
}
