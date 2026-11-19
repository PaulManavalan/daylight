// Layout and motion QA in an isolated browser context; no user records are changed.
const {chromium}=require(require('node:path').join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const temp=path.resolve('artifacts/visual-browser-temp');fs.mkdirSync(temp,{recursive:true});process.env.TEMP=temp;process.env.TMP=temp;
(async()=>{
 let server,browser,page;
 try{
  server=require('node:child_process').spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3104'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Preview timed out')),20000);server.stdout.on('data',d=>{if(String(d).includes('Ready')){clearTimeout(timer);resolve();}});server.on('error',reject);});
  browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1080},timezoneId:'America/New_York'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/assistant',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({available:false})}));
  await page.goto('http://127.0.0.1:3104',{waitUntil:'networkidle'});
  const assistant=page.getByRole('region',{name:'Planning assistant',exact:true});await assistant.waitFor();
  await assistant.getByRole('textbox',{name:'Your reply'}).fill('Keep this thought while I look at my tasks.');
  await page.screenshot({path:'artifacts/daylight-polish-desktop.png',fullPage:true});
  await page.getByRole('navigation',{name:'Workspace',exact:true}).getByRole('button',{name:'All tasks',exact:true}).click();
  await page.getByRole('button',{name:'Add task',exact:true}).first().click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await dialog.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const box=await dialog.boundingBox();assert.ok(Math.abs(box.x+box.width/2-720)<3,'animated dialog stays horizontally centered');assert.ok(box.y>=0 && box.y+box.height<=1080,'dialog stays inside viewport');
  await page.screenshot({path:'artifacts/daylight-polish-dialog.png',fullPage:true});
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('navigation',{name:'Workspace',exact:true}).getByRole('button',{name:'Today',exact:false}).click();
  assert.equal(await assistant.getByRole('textbox',{name:'Your reply'}).inputValue(),'Keep this thought while I look at my tasks.','navigation preserves the conversation');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await assistant.locator('.assistant-message').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await assistant.locator('.daylight-button').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  for(const width of [768,390]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at '+width);
   await page.screenshot({path:`artifacts/daylight-polish-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('Visual QA passed: desktop, tablet, mobile, centered animated dialogs, conversation preservation, and reduced motion.');
 }catch(e){if(page)await page.screenshot({path:'artifacts/daylight-polish-failure.png',fullPage:true});throw e;}
 finally{await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
