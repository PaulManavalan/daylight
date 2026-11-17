import type {AssistantPersona} from "@/lib/assistant-persona";
/** A code-native Daylight companion, crisp at every size and decorative to screen readers. */
export function AssistantAvatar({variant="sun",thinking=false,size=42}:{variant?:AssistantPersona["avatar"];thinking?:boolean;size?:number}){
 return <span className={"companion-avatar companion-"+variant+(thinking?" is-thinking":"")} style={{width:size,height:size}} aria-hidden="true"><svg viewBox="0 0 64 64" fill="none">
 {variant==="sun"?<><g className="companion-rays" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M32 5v5M32 54v5M5 32h5M54 32h5M13 13l4 4M47 47l4 4M13 51l4-4M47 17l4-4"/></g><circle className="companion-face" cx="32" cy="32" r="18"/></>:variant==="moon"?<><path className="companion-face" d="M44 12a23 23 0 1 0 8 34A24 24 0 0 1 44 12Z"/><path d="m47 10 1.7 3.6 4 .6-2.9 2.8.7 4-3.5-1.9-3.6 1.9.7-4-2.9-2.8 4-.6L47 10Z" fill="currentColor" opacity=".8"/></>:<><path d="M32 26C16 26 13 14 14 10c12 0 20 5 18 16Z" fill="currentColor" opacity=".65"/><path d="M32 26c0-15 9-21 19-19 0 11-6 20-19 19Z" fill="currentColor" opacity=".9"/><path d="M32 21v15" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><rect className="companion-face" x="13" y="30" width="38" height="27" rx="13"/></>}
 <g className="companion-eyes" stroke="var(--companion-ink)" strokeWidth="2.6" strokeLinecap="round"><path d={variant==="sprout"?"M25 40v2M39 40v2":variant==="moon"?"M19 33v2M32 33v2":"M25 28v2M39 28v2"}/></g>
 <path d={variant==="sprout"?"M27 47q5 5 10 0":variant==="moon"?"M21 41q5 4 10 0":"M27 37q5 5 10 0"} stroke="var(--companion-ink)" strokeWidth="2.2" strokeLinecap="round"/>
 </svg></span>;
}
