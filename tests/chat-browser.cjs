const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const temp=path.resolve('artifacts/chat-browser-temp');fs.mkdirSync(temp,{recursive:true});process.env.TEMP=temp;process.env.TMP=temp;
(async()=>{let preview,browser,page;try{
 preview=await require('./browser-server.cjs').startBrowserServer();browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1080},timezoneId:'America/New_York'});page=await context.newPage();await page.clock.setFixedTime(new Date('2026-11-18T15:00:00-05:00'));await page.emulateMedia({reducedMotion:'reduce'});
 let mode='clarify',minutes=45,calls=0;const requests=[];
 await context.route('**/api/assistant',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{available:true,model:'mock-local',models:['mock-local']}});
  calls++;const request=route.request().postDataJSON();requests.push(request);const data=JSON.parse(request.context),task=data.tasks.find(t=>t.title==='Chat history essay');
  const result={reply:'What work do you mean?',kind:'none',tasks:[],events:[],edits:[],progress:[]};
  if(mode==='draft')Object.assign(result,{reply:'I can make room for this essay. Does that look right?',kind:'capture',tasks:[{title:'Chat history essay',subject:'History',minutes,priority:'medium',energy:'high',dueDate:'2026-11-20',dueTime:'17:00'}]});
  if(mode==='progress')Object.assign(result,{reply:'You finished the essay. Confirm this update?',kind:'progress',progress:[{taskId:task.id,response:'Done',minutes:0}]});
  await route.fulfill({json:{model:'mock-local',result}});
 });
 await page.goto(preview.url,{waitUntil:'networkidle'});let assistant=page.getByRole('region',{name:'Planning assistant',exact:true});await assistant.locator('.brain-state').filter({hasText:'Real AI'}).waitFor();
 const tasks=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('daylight.tasks.v1')));
 const say=async text=>{await assistant.getByRole('textbox',{name:'Your reply',exact:true}).fill(text);await assistant.getByRole('button',{name:'Send',exact:true}).click();await assistant.getByRole('button',{name:'Send',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.brain-thinking') && !document.querySelector('#assistant-answer')?.disabled);};
 const before=(await tasks()).length;await say('hi i have work');await assistant.getByText('What work do you mean?',{exact:true}).waitFor();assert.equal((await tasks()).length,before);
 mode='draft';await say('A history essay, about 45 minutes, Friday at five.');await assistant.locator('.chat-plan-summary').waitFor();assert.equal(await assistant.locator('.chat-plan-details').getAttribute('open'),null);assert.equal((await tasks()).length,before);
 const card=await assistant.locator('.assistant-review').boundingBox(),composer=await assistant.locator('.assistant-composer').boundingBox();assert.ok(card.y+card.height<=composer.y,'The proposal belongs in the conversation before the next reply.');assert.equal(await assistant.getByRole('button',{name:'Nothing new here',exact:true}).count(),0,'Guided-intake controls must not leak into model chat.');
 minutes=30;await say('Actually make that 30 minutes.');assert.match(await assistant.locator('.chat-plan-summary').innerText(),/30 min/);
 minutes=25;const previousCalls=calls;await say('yes, but make it 25 minutes');assert.equal(calls,previousCalls+1,'Qualified yes is a correction, never consent.');assert.equal((await tasks()).length,before);
 const proposalCalls=calls;await say('yeah, do that');await assistant.getByRole('status').filter({hasText:'Your day is up to date'}).waitFor();assert.equal(calls,proposalCalls,'Approval uses the displayed proposal without another model guess.');const saved=(await tasks()).find(t=>t.title==='Chat history essay');assert.equal(saved.remaining_minutes,25);assert.equal((await tasks()).length,before+1);
 const planned=await page.evaluate(id=>JSON.parse(localStorage.getItem('daylight.planning.v1.local-demo')).sessions.filter(s=>s.taskId===id).reduce((n,s)=>n+(Date.parse(s.end)-Date.parse(s.start))/60000,0),saved.id);assert.equal(planned,25);
 mode='progress';await say('I finished the Chat history essay.');assert.notEqual((await tasks()).find(t=>t.id===saved.id).status,'done');await say('yes');assert.equal((await tasks()).find(t=>t.id===saved.id).status,'done');
 mode='draft';await say('Add a new essay for 25 minutes.');const count=(await tasks()).length;mode='clarify';await say('Can you explain what happens?');const clarificationCalls=calls;await say('yes');assert.equal(calls,clarificationCalls+1,'Yes after a question must not approve an older proposal.');assert.equal((await tasks()).length,count);
 await page.screenshot({path:'artifacts/daylight-conversational-chat.png',fullPage:true});
 // A new tab has no session draft, but retains the durable transcript across days.
 const next=await context.newPage();await next.clock.setFixedTime(new Date('2026-11-19T15:00:00-05:00'));await next.goto(preview.url,{waitUntil:'networkidle'});page=next;assistant=page.getByRole('region',{name:'Planning assistant',exact:true});await assistant.getByText('hi i have work',{exact:true}).waitFor();assert.equal(await assistant.locator('.assistant-review').count(),0,'Old proposals are not restored into a new day or tab.');
 const downloadPromise=page.waitForEvent('download');await assistant.getByRole('button',{name:'Download conversation',exact:true}).click();const download=await downloadPromise,exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.ok(exported.messages.some(m=>m.text==='yeah, do that'));
 await say('What did we talk about?');assert.ok(requests.at(-1).messages.some(m=>m.content.includes('[Earlier conversation on 2026-11-18]')),'Historical messages are dated before reaching the model.');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/daylight-chat-mobile.png',fullPage:true});
 console.log('Chat UI passed: conversational clarification, compact proposal, qualified correction, chat approval, real scheduled work, confirmed completion, question-safe yes, durable cross-day transcript, download and mobile width. Model transport was mocked.');
 }catch(error){if(page)await page.screenshot({path:'artifacts/daylight-chat-failure.png',fullPage:true});throw error;}finally{await browser?.close();preview?.process.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
