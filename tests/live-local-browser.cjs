// Opt-in real Ollama browser check. Uses only an isolated synthetic demo workspace.
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const temp=path.resolve('artifacts/live-chat-browser-temp');fs.mkdirSync(temp,{recursive:true});process.env.TEMP=temp;process.env.TMP=temp;
(async()=>{let preview,browser,page;try{
 preview=await require('./browser-server.cjs').startBrowserServer();browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1080},timezoneId:'America/New_York'});await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(preview.url,{waitUntil:'networkidle'});const assistant=page.getByRole('region',{name:'Planning assistant',exact:true});await assistant.locator('.brain-state').filter({hasText:'Real AI ·'}).waitFor();
 const before=await page.evaluate(()=>localStorage.getItem('daylight.tasks.v1'));
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/assistant') && r.request().method()==='POST',{timeout:95000});
 await assistant.getByRole('textbox',{name:'Your reply',exact:true}).fill('I feel overwhelmed with homework. Can we talk through where to start?');await assistant.getByRole('button',{name:'Send',exact:true}).click();
 const response=await responsePromise;assert.equal(response.status(),200);const data=await response.json();assert.equal(data.result.kind,'none',JSON.stringify(data.result));await assistant.getByText(data.result.reply,{exact:true}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('daylight.tasks.v1')),before);assert.equal(await assistant.locator('.assistant-review').count(),0);
 await page.screenshot({path:'artifacts/daylight-live-local-chat.png',fullPage:true});console.log('Live browser conversation passed with '+data.model+': a real unmocked HTTP answer displayed, no tasks changed.');
 const capturePromise=page.waitForResponse(r=>r.url().endsWith('/api/assistant') && r.request().method()==='POST',{timeout:95000});
 await assistant.getByRole('textbox',{name:'Your reply',exact:true}).fill('Please add a new task: outline a fictional museum essay. It will take 25 minutes and is due tomorrow at 5pm.');await assistant.getByRole('button',{name:'Send',exact:true}).click();
 const captureResponse=await capturePromise;if(captureResponse.status()!==200)fs.writeFileSync('artifacts/live-model-failed-request.json',JSON.stringify(captureResponse.request().postDataJSON(),null,2));assert.equal(captureResponse.status(),200);const capture=await captureResponse.json();assert.equal(capture.result.kind,'capture',JSON.stringify(capture.result));assert.equal(capture.result.tasks.length,1);assert.equal(capture.result.tasks[0].minutes,25);
 await assistant.locator('.chat-plan-summary').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('daylight.tasks.v1')),before,'The real model cannot save a proposal by itself.');assert.equal(await assistant.locator('.chat-plan-details').getAttribute('open'),null);
 await page.screenshot({path:'artifacts/daylight-live-chat-proposal.png',fullPage:true});
 let extraCalls=0;page.on('request',r=>{if(r.url().endsWith('/api/assistant') && r.method()==='POST')extraCalls++;});
 await assistant.getByRole('textbox',{name:'Your reply',exact:true}).fill('yeah, do that');await assistant.getByRole('button',{name:'Send',exact:true}).click();await assistant.getByRole('status').filter({hasText:'Your day is up to date'}).waitFor();assert.equal(extraCalls,0);
 const concrete=await page.evaluate(()=>{const tasks=JSON.parse(localStorage.getItem('daylight.tasks.v1')),task=tasks.find(t=>/museum/i.test(t.title)),planning=JSON.parse(localStorage.getItem('daylight.planning.v1.local-demo'));return {task,minutes:task?planning.sessions.filter(s=>s.taskId===task.id).reduce((n,s)=>n+(Date.parse(s.end)-Date.parse(s.start))/60000,0):0};});assert.equal(concrete.task.remaining_minutes,25);assert.equal(concrete.minutes,25);
 await page.screenshot({path:'artifacts/daylight-live-chat-scheduled.png',fullPage:true});console.log('Real model proposal and chat approval produced a concrete 25-minute study session without opening a form. Synthetic workspace only.');
 }catch(error){if(page)await page.screenshot({path:'artifacts/daylight-live-chat-failure.png',fullPage:true});throw error;}finally{await browser?.close();preview?.process.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
