import {test} from 'node:test';
import assert from 'node:assert/strict';
import {databaseCandidates,pageCandidates,notionId,notionTask,isNotionImported,similarNotionTask,notionMarker,exportToNotion} from '../src/lib/notion-data';
import {NotionClient,notionConfig,sealNotion,unsealNotion,readNotionSession,validateNotionState,requireNotionOrigin,type NotionConfig,type NotionSession} from '../src/lib/notion-server';
import {notionPreview,notionSave} from '../src/lib/notion-operations';
import {defaults} from '../src/lib/scheduling';
import {dailyCheckInDraft,recordDailyCheckIn} from '../src/lib/daily-checkin';
const id='12345678-1234-4234-8234-123456789012',block='23456789-2345-4345-8345-234567890123';
const config:NotionConfig={clientId:'synthetic-client',clientSecret:'synthetic-client-secret',cookieSecret:'synthetic-encryption-key-that-is-long-enough',redirectUri:'https://daylight.example/api/notion/callback',origin:'https://daylight.example',secure:true};
const session:NotionSession={kind:'session',owner:'local-demo',accessToken:'synthetic-access',refreshToken:'synthetic-refresh',workspaceId:id,workspaceName:'Synthetic workspace',expires:Date.now()+600000};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const paragraph=(text:string,type='paragraph',checked=false)=>({id:block,type,[type]:{rich_text:[{plain_text:text}],checked}});

test('Notion links resolve only to IDs and never permit arbitrary fetch targets',()=>{
 assert.equal(notionId('https://app.notion.com/p/'+id.replaceAll('-','')+'?v='+block),id);
 assert.equal(notionId('https://workspace.notion.site/Tasks-'+id.replaceAll('-','')+'#'+block),id);
 assert.equal(notionId('collection://'+id),id);
 for(const value of ['https://example.com/'+id,'http://notion.so/'+id,'https://notion.so.evil.test/'+id,'https://notion.so/no-id'])assert.throws(()=>notionId(value));
});
test('plain homework pages split subject lists, skip completed items and never import a weekly schedule',()=>{
 const result=pageCandidates(id,[paragraph('Math: Worksheet, Review for quiz'),paragraph('Read chapter 4','to_do'),paragraph('Already submitted','to_do',true),paragraph('PLAN FOR THIS WEEK:'),paragraph('Monday: School, Practice')]);
 assert.deepEqual(result.items.map(t=>[t.title,t.subject,t.minutes]),[['Worksheet','Math',null],['Review for quiz','Math',null],['Read chapter 4','Personal',null]]);assert.equal(result.skipped,1);assert.equal(result.stopped,true);
 const script=pageCandidates(id,[paragraph('<script>alert(1)</script>','to_do')]);assert.equal(script.items[0].title,'<script>alert(1)</script>');
});
test('database imports preserve explicit dates, subjects and minute units; completed work is skipped',()=>{
 const row={id,properties:{Name:{type:'title',title:[{plain_text:'Essay'}]},Subject:{type:'select',select:{name:'History'}},'Estimated minutes':{type:'number',number:45},Due:{type:'date',date:{start:'2026-11-24'}}}};
 const result=databaseCandidates([row,{...row,properties:{...row.properties,Status:{type:'status',status:{name:'Done'}}}},{...row,properties:{...row.properties,Status:{type:'select',select:{name:'Completed'}}}}]);assert.equal(result.items.length,1);assert.equal(result.skipped,2);assert.equal(result.items[0].minutes,45);assert.equal(result.items[0].deadline,'2026-11-24');assert.equal(result.items[0].subject,'History');
 const hours=databaseCandidates([{id,properties:{Name:row.properties.Name,'Estimated hours':{type:'number',number:6}}}]);assert.equal(hours.items[0].minutes,null,'Unlabeled or hour-based values must not silently become minutes.');
});
test('reviewed imports require actual estimates and reject nonexistent deadlines; retries keep source identity',()=>{
 const item=pageCandidates(id,[paragraph('Math: Worksheet')]).items[0];assert.throws(()=>notionTask(item,0,''));const input=notionTask(item,25,'2026-11-24T17:00');assert.equal(input.remaining_minutes,25);assert.match(input.description,/Imported from Notion/);assert.ok(input.description.includes(notionMarker(item.key)));
 const saved={...input,id:block,user_id:'local-demo',actual_minutes:0,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};assert.equal(isNotionImported({...item,title:'Renamed locally'},[saved]),true);assert.equal(isNotionImported(item,[{...saved,status:'done'}]),true);
 const timezone=process.env.TZ;try{process.env.TZ='America/New_York';assert.throws(()=>notionTask(item,25,'2026-03-08T02:30'),/does not exist/);}finally{if(timezone===undefined)delete process.env.TZ;else process.env.TZ=timezone;}
});
test('Notion credentials are encrypted and authenticated, owner-bound and expired sessions cannot be reused',()=>{
 const sealed=sealNotion(session,config.cookieSecret);assert.doesNotMatch(sealed,/synthetic-access|synthetic-refresh/);assert.deepEqual(unsealNotion(sealed,config.cookieSecret),session);assert.equal(readNotionSession(sealed,config,'another-account'),null);assert.equal(readNotionSession(sealed,config,'local-demo',session.expires+1),null);
 const bytes=Buffer.from(sealed,'base64url');bytes[30]^=1;assert.throws(()=>unsealNotion(bytes.toString('base64url'),config.cookieSecret),/Reconnect/);assert.throws(()=>unsealNotion(sealed,'different-key'),/Reconnect/);
 const state=sealNotion({kind:'state',owner:'local-demo',nonce:'x'.repeat(43),expires:Date.now()+1000},config.cookieSecret);assert.equal(validateNotionState(state,'x'.repeat(43),config).owner,'local-demo');assert.throws(()=>validateNotionState(state,'y'.repeat(43),config));assert.throws(()=>validateNotionState(state,'x'.repeat(43),config,Date.now()+5000));
});
test('OAuth setup requires private configuration and unsafe origins cannot start or change the connection',()=>{
 assert.equal(notionConfig({}),null);const env={NOTION_CLIENT_ID:'client',NOTION_CLIENT_SECRET:'secret',NOTION_COOKIE_SECRET:config.cookieSecret,NOTION_REDIRECT_URI:config.redirectUri};assert.ok(notionConfig(env));assert.equal(notionConfig({...env,NOTION_REDIRECT_URI:'http://public.example/api/notion/callback'}),null);assert.equal(notionConfig({...env,NOTION_REDIRECT_URI:'https://daylight.example/redirect?next=evil'}),null);
 assert.doesNotThrow(()=>requireNotionOrigin(new Request(config.origin,{headers:{Origin:config.origin}}),config));for(const origin of ['https://evil.example','null','https://daylight.example.evil.test'])assert.throws(()=>requireNotionOrigin(new Request(config.origin,{headers:{Origin:origin}}),config));assert.throws(()=>requireNotionOrigin(new Request(config.origin),config));
});
test('expired access refreshes once and rotates the cookie payload without exposing tokens in returned page data',async()=>{
 const calls:{url:string;auth:string|null}[]=[];let first=true;const fetcher=(async(input,init)=>{const url=String(input);calls.push({url,auth:new Headers(init?.headers).get('authorization')});if(url.endsWith('/oauth/token'))return json({access_token:'synthetic-new',refresh_token:'synthetic-rotated'});if(first){first=false;return json({},401);}return json({id,title:[]});}) as typeof fetch;
 const client=new NotionClient(session,config,fetcher),result=await client.call('/pages/'+id);assert.equal(client.changed,true);assert.equal(client.session.refreshToken,'synthetic-rotated');assert.equal(calls.length,3);assert.equal(calls[2].auth,'Bearer synthetic-new');assert.doesNotMatch(JSON.stringify(result),/synthetic-new|synthetic-rotated/);
});
test('page reads use the fixed Notion API and return candidates without writing to Notion',async()=>{
 const calls:string[]=[];const fetcher=(async(input,init)=>{calls.push(String(init?.method));return String(input).includes('/children')?json({results:[paragraph('Math: Worksheet')],has_more:false}):json({id,object:'page',properties:{title:{type:'title',title:[{plain_text:'Synthetic homework'}]}}});}) as typeof fetch;
 const data=await notionPreview(new NotionClient(session,config,fetcher),id,'page');assert.equal(data.items.length,1);assert.ok(calls.every(method=>method==='GET'));
});
test('reviewed exports append and verify; retrying a lost response finds the marker instead of duplicating content',async()=>{
 const blocks:unknown[]=[];let patches=0,loseResponse=true;const fetcher=(async(input,init)=>{const url=String(input);if(init?.method==='PATCH'){patches++;blocks.push(...JSON.parse(String(init.body)).children);if(loseResponse){loseResponse=false;throw Error('Network interruption after write');}return json({results:blocks});}return url.includes('/children')?json({results:blocks,has_more:false}):json({id,object:'page'});}) as typeof fetch;
 const client=new NotionClient(session,config,fetcher),data={operationId:crypto.randomUUID(),pageId:id,title:'Daylight plan — synthetic',lines:['3:00 PM · Essay · 25 min','This is a schedule, not confirmed completion.']};
 await assert.rejects(()=>notionSave(client,data,config.origin),/could not be reached/);const retry=await notionSave(client,data,config.origin);assert.equal(retry.alreadySaved,true);assert.equal(patches,1);assert.equal(blocks.length,4);
});
test('check-in export contains only reviewed recent notes and a plan never infers completion',()=>{
 const now=new Date(2026,10,21,9),state=recordDailyCheckIn(defaults(),dailyCheckInDraft('Morning check-in: Slept well. Essay first.',now)!,now),before=JSON.stringify(state);assert.match(exportToNotion([],state,'checkins',now).lines.join('\n'),/Slept well/);assert.match(exportToNotion([],state,'plan',now).lines.join('\n'),/does not mean completed work/);assert.equal(JSON.stringify(state),before);assert.throws(()=>exportToNotion([],defaults(),'checkins',now),/no saved/);
});
test('database URLs tolerate wrong-object responses and require choosing among multiple data sources',async()=>{
 const second='34567890-3456-4456-8456-345678901234';let queries=0;
 const fetcher=(async(input)=>{const url=String(input);if(url.includes('/pages/'))return json({},400);if(url.includes('/databases/'))return json({title:[{plain_text:'Multi-table database'}],data_sources:[{id,name:'First table'},{id:second,name:'Second table'}]});queries++;return json({results:[],has_more:false});}) as typeof fetch;
 const result=await notionPreview(new NotionClient(session,config,fetcher),id,'auto');assert.equal(result.choices?.length,2);assert.equal(queries,0,'A table must not be silently chosen.');
});
test('a fresh Notion save rereads the destination and verifies the appended section',async()=>{
 const blocks:unknown[]=[];const methods:string[]=[];const fetcher=(async(input,init)=>{methods.push(String(init?.method));if(String(input).includes('/pages/'))return json({id});if(init?.method==='PATCH'){blocks.push(...JSON.parse(String(init.body)).children);return json({results:blocks});}return json({results:blocks,has_more:false});}) as typeof fetch;
 const result=await notionSave(new NotionClient(session,config,fetcher),{operationId:crypto.randomUUID(),pageId:id,title:'Reviewed note',lines:['My explicit note.']},config.origin);assert.equal(result.alreadySaved,false);assert.deepEqual(methods,['GET','GET','PATCH','GET']);
});
test('renaming a Notion database task does not change its import identity',()=>{
 const row=(title:string)=>({id,properties:{Name:{type:'title',title:[{plain_text:title}]}}});
 assert.equal(databaseCandidates([row('First title')]).items[0].key,databaseCandidates([row('Renamed assignment')]).items[0].key);
});
test('plan exports include protected commitments and recovery from the actual timetable',()=>{
 const now=new Date(2026,10,21,9),state=defaults();state.fixed.push({id:'synthetic-appointment',title:'Family appointment',date:'2026-11-21',start:'12:00',end:'13:00',days:[],recovery_minutes:20});
 const snapshot=exportToNotion([],state,'plan',now);assert.ok(snapshot.lines.some(line=>line.includes('Protected · Family appointment')));assert.ok(snapshot.lines.some(line=>line.includes('Recovery · Recharge after Family appointment')));assert.ok(snapshot.lines.length<=90);
});
test('identical task names from different Notion records remain reviewable rather than silently skipped',()=>{
 const item=pageCandidates(id,[paragraph('Math: Worksheet')]).items[0],input=notionTask(item,25,'');
 const saved={...input,id:block,user_id:'local-demo',actual_minutes:0,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},other={...item,key:'different-source/'+item.key};
 assert.equal(isNotionImported(other,[saved]),false);assert.equal(similarNotionTask(other,[saved]),true);assert.equal(isNotionImported(item,[saved]),true);
});
