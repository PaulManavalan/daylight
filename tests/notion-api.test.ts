import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {GET,POST} from '../src/app/api/notion/route';
import {GET as callback} from '../src/app/api/notion/callback/route';
import {NOTION_COOKIE,NOTION_STATE_COOKIE,sealNotion,notionConfig,unsealNotion,type NotionSession} from '../src/lib/notion-server';
const origin='https://daylight.example',pageId='12345678-1234-4234-8234-123456789012';
function setup(t:{after:(fn:()=>void)=>void}){const names=['NOTION_CLIENT_ID','NOTION_CLIENT_SECRET','NOTION_REDIRECT_URI','NOTION_COOKIE_SECRET','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const,before=Object.fromEntries(names.map(k=>[k,process.env[k]])),fetcher=globalThis.fetch;Object.assign(process.env,{NOTION_CLIENT_ID:'synthetic-client',NOTION_CLIENT_SECRET:'synthetic-secret',NOTION_REDIRECT_URI:origin+'/api/notion/callback',NOTION_COOKIE_SECRET:'synthetic-cookie-key-with-more-than-32-characters'});t.after(()=>{for(const name of names){if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];}globalThis.fetch=fetcher;});return notionConfig()!;}
const request=(body:unknown,cookie?:string,requestOrigin=origin)=>new NextRequest(origin+'/api/notion',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
test('unconfigured Notion is explicit and cannot perform unauthenticated operations',async t=>{setup(t);delete process.env.NOTION_CLIENT_SECRET;const response=await GET(new NextRequest(origin+'/api/notion'));assert.deepEqual(await response.json(),{configured:false,connected:false});assert.equal((await POST(request({op:'search',query:'Tasks'}))).status,503);});
test('OAuth callback verifies state and uses encrypted HttpOnly connection cookies',async t=>{
 const config=setup(t);let exchanges=0;globalThis.fetch=(async(input,init)=>{assert.equal(String(input),'https://api.notion.com/v1/oauth/token');assert.equal(new Headers(init?.headers).get('authorization'),'Basic '+Buffer.from('synthetic-client:synthetic-secret').toString('base64'));assert.equal(JSON.parse(String(init?.body)).redirect_uri,config.redirectUri);exchanges++;return new Response(JSON.stringify({access_token:'synthetic-private-access',refresh_token:'synthetic-private-refresh',workspace_id:pageId,workspace_name:'Test workspace'}));}) as typeof fetch;
 const connect=await POST(request({op:'connect'}));assert.equal(connect.status,200);const data=await connect.json(),stateCookie=connect.cookies.get(NOTION_STATE_COOKIE)!;assert.ok(stateCookie);const auth=new URL(data.url);assert.equal(auth.origin,'https://api.notion.com');assert.equal(auth.searchParams.get('owner'),'user');assert.doesNotMatch(JSON.stringify(data),/synthetic-secret|private-access/);
 const response=await callback(new NextRequest(config.redirectUri+'?code=synthetic-code&state='+auth.searchParams.get('state'),{headers:{Cookie:stateCookie.name+'='+stateCookie.value}}));assert.equal(response.status,303);assert.equal(response.headers.get('location'),origin+'/?notion=connected');assert.equal(exchanges,1);const cookie=response.cookies.get(NOTION_COOKIE)!;assert.ok(cookie);const header=response.headers.get('set-cookie')!;assert.match(header,/HttpOnly/);assert.match(header,/Secure/);assert.match(header,/SameSite=lax/i);assert.doesNotMatch(header,/synthetic-private-access|synthetic-private-refresh/);assert.equal((unsealNotion(cookie.value,config.cookieSecret) as NotionSession).owner,'local-demo');assert.equal(response.headers.get('cache-control'),'no-store');
 const connected=await GET(new NextRequest(origin+'/api/notion',{headers:{Cookie:cookie.name+'='+cookie.value}}));assert.deepEqual(await connected.json(),{configured:true,connected:true,workspace:'Test workspace'});
});
test('missing, mismatched, expired and denied OAuth state never exchanges a code',async t=>{
 const config=setup(t);let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Must not call Notion');}) as typeof fetch;
 const cases=[{cookie:'',state:'wrong'},{cookie:sealNotion({kind:'state',owner:'local-demo',nonce:'a'.repeat(43),expires:Date.now()+10000},config.cookieSecret),state:'b'.repeat(43)},{cookie:sealNotion({kind:'state',owner:'local-demo',nonce:'a'.repeat(43),expires:Date.now()-1000},config.cookieSecret),state:'a'.repeat(43)}];
 for(const value of cases){const response=await callback(new NextRequest(config.redirectUri+'?code=fake&state='+value.state,{headers:{Cookie:NOTION_STATE_COOKIE+'='+value.cookie}}));assert.equal(response.headers.get('location'),origin+'/?notion=retry');assert.match(response.headers.get('set-cookie')!,/Max-Age=0/i);}
 const valid=sealNotion({kind:'state',owner:'local-demo',nonce:'a'.repeat(43),expires:Date.now()+10000},config.cookieSecret),denied=await callback(new NextRequest(config.redirectUri+'?error=access_denied&state='+'a'.repeat(43),{headers:{Cookie:NOTION_STATE_COOKIE+'='+valid}}));assert.equal(denied.headers.get('location'),origin+'/?notion=retry');assert.equal(calls,0);
});
test('cross-origin requests, missing credentials and account mismatches cannot read private Notion content',async t=>{
 const config=setup(t);let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Not expected');}) as typeof fetch;
 const session:NotionSession={kind:'session',owner:'local-demo',accessToken:'private-access',workspaceId:pageId,workspaceName:'Personal',expires:Date.now()+60000},cookie=NOTION_COOKIE+'='+sealNotion(session,config.cookieSecret);
 for(const hostile of ['https://evil.example','null'])assert.equal((await POST(request({op:'search',query:'private'},cookie,hostile))).status,403);assert.equal((await POST(request({op:'search',query:'private'}))).status,401);assert.equal(calls,0);
 const foreign=NOTION_COOKIE+'='+sealNotion({...session,owner:pageId},config.cookieSecret);assert.equal((await POST(request({op:'search',query:'private'},foreign))).status,401);assert.equal(calls,0);
 const disconnected=await POST(request({op:'disconnect'},cookie));assert.equal(disconnected.status,200);assert.match(disconnected.headers.get('set-cookie')!,/Max-Age=0/i);assert.equal(calls,0);
});
test('a Supabase identity is verified before matching a Notion connection',async t=>{
 const config=setup(t);process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic-project.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='synthetic-public-key';const other='23456789-2345-4345-8345-234567890123';let calls=0;
 globalThis.fetch=(async(input)=>{assert.equal(String(input),'https://synthetic-project.supabase.co/auth/v1/user');calls++;return new Response(JSON.stringify({id:other}));}) as typeof fetch;
 const cookie=NOTION_COOKIE+'='+sealNotion({kind:'session',owner:pageId,accessToken:'private-token',workspaceId:pageId,workspaceName:'Other account',expires:Date.now()+60000},config.cookieSecret);
 const response=await GET(new NextRequest(origin+'/api/notion',{headers:{Cookie:cookie,Authorization:'Bearer synthetic.jwt.token'}}));assert.deepEqual(await response.json(),{configured:true,connected:false});assert.equal(calls,1);
});
test('invalid and oversized API bodies are rejected before accessing Notion',async t=>{
 setup(t);let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Unexpected request');}) as typeof fetch;
 const invalid=await POST(request({op:'export',data:{pageId:'https://evil.example'}}));assert.equal(invalid.status,400);
 const oversized=await POST(request({op:'search',query:'x'.repeat(130000)}));assert.equal(oversized.status,413);assert.equal(calls,0);
 const malformed=await POST(new NextRequest(origin+'/api/notion',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{'}));assert.equal(malformed.status,400);assert.equal(calls,0);
});
