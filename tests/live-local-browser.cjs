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
 await page.screenshot({path:'artifacts/daylight-live-local-chat.png',fullPage:true});console.log('Live browser chat passed with '+data.model+': a real unmocked HTTP answer displayed, no tasks changed.');
 }catch(error){if(page)await page.screenshot({path:'artifacts/daylight-live-chat-failure.png',fullPage:true});throw error;}finally{await browser?.close();preview?.process.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
