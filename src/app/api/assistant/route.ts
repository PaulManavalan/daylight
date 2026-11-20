import {NextResponse} from "next/server";
import {brainRequestSchema} from "@/lib/assistant-brain";
import {askLocalModel,localRequestOrigin,sameLocalOrigin,localModelOptions,selectLocalModel} from "@/lib/local-model";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
let active=false;
export async function GET(request:Request){if(!localRequestOrigin(request))return NextResponse.json({available:false,reason:"Enable the free browser model to use AI on this site."},{headers});try{const models=await localModelOptions(),model=selectLocalModel(models);return NextResponse.json({available:Boolean(model),model,models},{headers});}catch{return NextResponse.json({available:false,reason:"No local model service is available. You can enable browser AI."},{headers});}}
export async function POST(request:Request){
 if(!localRequestOrigin(request))return NextResponse.json({error:"Server-side local AI is only available on localhost. Use the free browser model here."},{status:503,headers});
 if(!sameLocalOrigin(request))return NextResponse.json({error:"Cross-origin AI requests are not allowed."},{status:403,headers});
 if(!request.headers.get("content-type")?.startsWith("application/json"))return NextResponse.json({error:"Send a JSON request."},{status:415,headers});
 if(active)return NextResponse.json({error:"The local model is answering another request. Try again in a moment."},{status:429,headers});
 let text="";const reader=request.body?.getReader();if(!reader)return NextResponse.json({error:"Missing message."},{status:400,headers});
 try{const decoder=new TextDecoder();let length=0;while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>80000){await reader.cancel();return NextResponse.json({error:"The conversation is too large. Send a shorter message."},{status:413,headers});}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}catch{return NextResponse.json({error:"The request was interrupted."},{status:400,headers});}
 const parsed=brainRequestSchema.safeParse((()=>{try{return JSON.parse(text);}catch{return null;}})());if(!parsed.success)return NextResponse.json({error:"The conversation request could not be read. No changes were made."},{status:400,headers});
 if(active)return NextResponse.json({error:"The local model is answering another request. Try again in a moment."},{status:429,headers});
 active=true;try{return NextResponse.json(await askLocalModel(parsed.data,AbortSignal.any([request.signal,AbortSignal.timeout(90000)])),{headers});}catch{return NextResponse.json({error:request.signal.aborted?"AI request stopped. No planning changes were saved.":"The local model did not finish a valid answer. Your plan is unchanged. Retry or use planner mode."},{status:503,headers});}finally{active=false;}
}
