import {NextRequest,NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {ZodError} from 'zod';
import {NOTION_COOKIE,NOTION_STATE_COOKIE,NotionClient,NotionError,boundedJSON,notionConfig,notionCookieOptions,notionOwner,readNotionSession,requireNotionOrigin,sealNotion} from '@/lib/notion-server';
import {notionActionSchema,notionPreview,notionSave,notionSearch} from '@/lib/notion-operations';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
function failure(error:unknown){return NextResponse.json({error:error instanceof ZodError?'This Notion request is incomplete or invalid. Nothing new was requested.':error instanceof NotionError?error.message:'The Notion request could not finish. Check the destination before retrying a save.'},{status:error instanceof NotionError?error.status:400,headers});}
async function clientBody(request:NextRequest){try{return await boundedJSON(new Response(request.body),128000);}catch(error){if(error instanceof NotionError&&error.status===413)throw new NotionError('This request is too large. Review fewer items before continuing.',413);throw new NotionError('Send a valid JSON request.',400);}}
export async function GET(request:NextRequest){
 const config=notionConfig();if(!config)return NextResponse.json({configured:false,connected:false},{headers});
 try{const owner=await notionOwner(request);let session;try{session=readNotionSession(request.cookies.get(NOTION_COOKIE)?.value,config,owner);}catch{session=null;}
 return NextResponse.json({configured:true,connected:Boolean(session),...(session?{workspace:session.workspaceName}:{})},{headers});}catch(e){return failure(e);}
}
export async function POST(request:NextRequest){
 const config=notionConfig();if(!config)return NextResponse.json({error:'Notion needs its one-time setup on this deployment before it can connect.'},{status:503,headers});
 let client:NotionClient|undefined;
 try{requireNotionOrigin(request,config);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new NotionError('Send a JSON request.',415);
 const body=notionActionSchema.parse(await clientBody(request)),owner=await notionOwner(request);
 if(body.op==='connect'){const nonce=randomBytes(32).toString('base64url'),url=new URL('https://api.notion.com/v1/oauth/authorize');url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',owner:'user',state:nonce}).toString();const response=NextResponse.json({url:url.href},{headers});response.cookies.set(NOTION_STATE_COOKIE,sealNotion({kind:'state',owner,nonce,expires:Date.now()+600000},config.cookieSecret),notionCookieOptions(config,600));return response;}
 const session=readNotionSession(request.cookies.get(NOTION_COOKIE)?.value,config,owner);if(!session)throw new NotionError('Connect Notion in this Daylight workspace first.',401);
 if(body.op==='disconnect'){const response=NextResponse.json({connected:false},{headers});response.cookies.set(NOTION_COOKIE,'',notionCookieOptions(config,0));response.cookies.set(NOTION_STATE_COOKIE,'',notionCookieOptions(config,0));return response;}
 client=new NotionClient(session,config);const result=body.op==='search'?await notionSearch(client,body.query):body.op==='preview'?await notionPreview(client,body.source,body.kind,body.cursor):await notionSave(client,body.data,config.origin);
 const response=NextResponse.json(result,{headers});if(client.changed)response.cookies.set(NOTION_COOKIE,sealNotion(client.session,config.cookieSecret),notionCookieOptions(config));return response;
 }catch(error){const response=failure(error);if(client?.changed)response.cookies.set(NOTION_COOKIE,sealNotion(client.session,config.cookieSecret),notionCookieOptions(config));return response;}
}
