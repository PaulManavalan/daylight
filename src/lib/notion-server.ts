import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {object} from './notion-data';

export const NOTION_COOKIE='daylight_notion';
export const NOTION_STATE_COOKIE='daylight_notion_state';
export const NOTION_API_VERSION='2025-09-03';
export interface NotionConfig{clientId:string;clientSecret:string;redirectUri:string;cookieSecret:string;origin:string;secure:boolean}
export class NotionError extends Error{constructor(message:string,readonly status=400){super(message);}}
export function notionConfig(env:Record<string,string|undefined>=process.env):NotionConfig|null{
 const {NOTION_CLIENT_ID:clientId,NOTION_CLIENT_SECRET:clientSecret,NOTION_REDIRECT_URI:redirectUri,NOTION_COOKIE_SECRET:cookieSecret}=env;
 if(!clientId||!clientSecret||!redirectUri||!cookieSecret||cookieSecret.length<32)return null;
 try{const url=new URL(redirectUri),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);if((url.protocol!=='https:'&&!(url.protocol==='http:'&&local))||url.pathname!=='/api/notion/callback'||url.search||url.hash||url.username||url.password)return null;return {clientId,clientSecret,redirectUri,cookieSecret,origin:url.origin,secure:url.protocol==='https:'};}catch{return null;}
}
export function sealNotion(value:unknown,secret:string){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),nonce);cipher.setAAD(Buffer.from('daylight-notion-v1'));const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64url');}
export function unsealNotion(raw:string,secret:string):unknown{
 if(raw.length>6000)throw new NotionError('Reconnect Notion to continue.',401);
 try{const data=Buffer.from(raw,'base64url');if(data.length<29)throw Error();const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),data.subarray(0,12));decipher.setAAD(Buffer.from('daylight-notion-v1'));decipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));}catch{throw new NotionError('Reconnect Notion to continue.',401);}
}
export const notionSessionSchema=z.object({kind:z.literal('session'),owner:z.string().min(1).max(100),accessToken:z.string().min(1).max(1500),refreshToken:z.string().max(1500).optional(),workspaceId:z.string().min(1).max(100),workspaceName:z.string().max(200),expires:z.number()}).strict();
export type NotionSession=z.infer<typeof notionSessionSchema>;
export const notionStateSchema=z.object({kind:z.literal('state'),owner:z.string().min(1).max(100),nonce:z.string().min(32).max(100),expires:z.number()}).strict();
export function validateNotionState(raw:string,nonce:string,config:NotionConfig,now=Date.now()){
 const state=notionStateSchema.parse(unsealNotion(raw,config.cookieSecret)),a=Buffer.from(state.nonce),b=Buffer.from(nonce);if(state.expires<now||a.length!==b.length||!timingSafeEqual(a,b))throw new NotionError('This Notion sign-in expired. Start the connection again.',400);return state;
}
export function requireNotionOrigin(request:Request,config:NotionConfig){if(request.headers.get('origin')!==config.origin)throw new NotionError('Open Daylight at its primary address to use this Notion connection.',403);}
export function notionCookieOptions(config:NotionConfig,maxAge=30*24*60*60){return {httpOnly:true,secure:config.secure,sameSite:'lax' as const,path:'/api/notion',maxAge};}
export async function notionOwner(request:Request,fetcher:typeof fetch=fetch){
 const auth=request.headers.get('authorization');if(!auth)return 'local-demo';
 if(!/^Bearer [\w.-]+$/.test(auth))throw new NotionError('Sign in to your Daylight account again.',401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new NotionError('This Daylight account could not be verified.',401);
 let response:Response;try{response=await fetcher(new URL('/auth/v1/user',url),{headers:{authorization:auth,apikey:key},cache:'no-store',signal:AbortSignal.timeout(8000)});}catch{throw new NotionError('Your Daylight account could not be verified. Try again.',503);}
 const data=object(await response.json().catch(()=>null));if(!response.ok||typeof data.id!=='string'||!z.uuid().safeParse(data.id).success)throw new NotionError('Sign in to your Daylight account again.',401);return data.id;
}
export function readNotionSession(raw:string|undefined,config:NotionConfig,owner:string,now=Date.now()){
 if(!raw)return null;const parsed=notionSessionSchema.safeParse(unsealNotion(raw,config.cookieSecret));if(!parsed.success||parsed.data.expires<now)return null;if(parsed.data.owner!==owner)return null;return parsed.data;
}
export async function boundedJSON(response:Response,limit=1_500_000){
 const reader=response.body?.getReader();if(!reader)throw new NotionError('Notion returned an empty response.',502);let size=0,body='';const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new NotionError('This Notion result is too large. Choose a smaller page or database.',413);}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();try{return JSON.parse(body) as unknown;}catch{throw new NotionError('Notion returned an unreadable response. Try again.',502);}
}
export async function notionToken(config:NotionConfig,body:Record<string,string>,fetcher:typeof fetch=fetch){
 let response:Response;try{response=await fetcher('https://api.notion.com/v1/oauth/token',{method:'POST',headers:{'Content-Type':'application/json','Notion-Version':NOTION_API_VERSION,Authorization:'Basic '+Buffer.from(config.clientId+':'+config.clientSecret).toString('base64')},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});}catch{throw new NotionError('Notion sign-in could not finish. Reconnect and try again.',502);}
 const data=object(await boundedJSON(response,16000));if(!response.ok||typeof data.access_token!=='string')throw new NotionError('Notion sign-in expired or was not accepted. Reconnect to try again.',401);return data;
}
export class NotionClient{
 changed=false;
 constructor(public session:NotionSession,private config:NotionConfig,private fetcher:typeof fetch=fetch){}
 async call(path:string,method='GET',body?:unknown):Promise<Record<string,unknown>>{
  const url=new URL('https://api.notion.com/v1'+path);if(!path.startsWith('/')||url.origin!=='https://api.notion.com'||!url.pathname.startsWith('/v1/')||path.includes('..'))throw new NotionError('Invalid Notion request.');
  const send=async()=>{try{return await this.fetcher(url,{method,headers:{Authorization:'Bearer '+this.session.accessToken,'Notion-Version':NOTION_API_VERSION,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});}catch{throw new NotionError('Notion could not be reached. Your saved work is unchanged; try again.',502);}};
  let response=await send();if(response.status===401&&this.session.refreshToken){await response.body?.cancel();const fresh=await notionToken(this.config,{grant_type:'refresh_token',refresh_token:this.session.refreshToken},this.fetcher);this.session=notionSessionSchema.parse({...this.session,accessToken:fresh.access_token,refreshToken:typeof fresh.refresh_token==='string'?fresh.refresh_token:this.session.refreshToken});this.changed=true;response=await send();}
  if(!response.ok){await response.body?.cancel();throw new NotionError(response.status===401?'Reconnect Notion to continue.':response.status===403||response.status===404?'That Notion page is not available to Daylight. Share it with the connection, then try again.':response.status===429?'Notion is busy. Wait a moment before trying again.':'Notion could not finish this request. Check the result in Notion before retrying a save.',response.status>=400&&response.status<500?response.status:502);}
  return object(await boundedJSON(response));
 }
}
