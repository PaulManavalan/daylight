import {NextRequest,NextResponse} from 'next/server';
import {NOTION_COOKIE,NOTION_STATE_COOKIE,notionConfig,notionCookieOptions,notionSessionSchema,notionToken,sealNotion,validateNotionState} from '@/lib/notion-server';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const config=notionConfig();if(!config)return NextResponse.json({error:'Notion connection setup is missing.'},{status:503,headers:{'Cache-Control':'no-store'}});
 let response:NextResponse;
 try{const cookie=request.cookies.get(NOTION_STATE_COOKIE)?.value;if(!cookie)throw Error('Missing state');const state=validateNotionState(cookie,request.nextUrl.searchParams.get('state')??'',config);if(request.nextUrl.searchParams.has('error'))throw Error('Authorization declined');const code=request.nextUrl.searchParams.get('code');if(!code||code.length>1000)throw Error('Missing code');
 const token=await notionToken(config,{grant_type:'authorization_code',code,redirect_uri:config.redirectUri}),session=notionSessionSchema.parse({kind:'session',owner:state.owner,accessToken:token.access_token,refreshToken:token.refresh_token,workspaceId:token.workspace_id,workspaceName:typeof token.workspace_name==='string'?token.workspace_name.slice(0,200):'Notion workspace',expires:Date.now()+30*24*60*60*1000}),sealed=sealNotion(session,config.cookieSecret);if(sealed.length>3800)throw Error('Connection is too large');
 response=NextResponse.redirect(config.origin+'/?notion=connected',303);response.cookies.set(NOTION_COOKIE,sealed,notionCookieOptions(config));
 }catch{response=NextResponse.redirect(config.origin+'/?notion=retry',303);}
 response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');response.cookies.set(NOTION_STATE_COOKIE,'',notionCookieOptions(config,0));return response;
}
