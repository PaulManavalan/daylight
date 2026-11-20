const {chromium}=require(require('node:path').join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const temp=path.resolve('artifacts/backup-browser-temp');fs.mkdirSync(temp,{recursive:true});process.env.TEMP=temp;process.env.TMP=temp;
(async()=>{let server,browser,page;try{
 const preview=await require('./browser-server.cjs').startBrowserServer();server=preview.process;
 browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1440,height:1080}});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/assistant',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({available:false})}));
 await page.goto(preview.url,{waitUntil:'networkidle'});await page.getByRole('region',{name:'Planning assistant',exact:true}).waitFor();
 const original=await page.evaluate(()=>localStorage.getItem('daylight.tasks.v1'));
 const backup={version:1,exported_at:'2026-11-19T12:00:00Z',planning:null,tasks:[{id:'aa858ecb-10bd-4319-9a75-e14b0f54c80a',user_id:'old-account',title:'Restored personal essay',subject:'English',description:'Backup browser fixture',deadline:null,estimated_minutes:45,remaining_minutes:30,priority:'high',energy_level:'medium',status:'in_progress',actual_minutes:15,created_at:'2026-11-19T12:00:00Z',updated_at:'2026-11-19T12:00:00Z'}]};
 async function select(data){await page.locator('input[type=file]').setInputFiles({name:'daylight-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});}
 await select({...backup,version:2});await page.getByRole('alert').filter({hasText:'not a supported'}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('daylight.tasks.v1')),original);
 await select(backup);let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Keep current workspace'}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('daylight.tasks.v1')),original,'canceling preview saves nothing');
 await select(backup);await page.evaluate(()=>{const rows=JSON.parse(localStorage.getItem('daylight.tasks.v1'));rows[0].title='Newer task edit';localStorage.setItem('daylight.tasks.v1',JSON.stringify(rows));});
 await dialog.getByRole('button',{name:'Replace local workspace'}).click();await dialog.getByRole('alert').filter({hasText:'workspace changed'}).waitFor();assert.ok((await page.evaluate(()=>localStorage.getItem('daylight.tasks.v1'))).includes('Newer task edit'));
 await dialog.getByRole('button',{name:'Keep current workspace'}).click();
 const beforeRestore=await page.evaluate(()=>localStorage.getItem('daylight.tasks.v1'));
 await select(backup);await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),dialog.getByRole('button',{name:'Replace local workspace'}).click()]);
 await page.getByRole('region',{name:'Planning assistant',exact:true}).waitFor();
 const restored=await page.evaluate(()=>({tasks:JSON.parse(localStorage.getItem('daylight.tasks.v1')),previous:JSON.parse(localStorage.getItem('daylight.restore.previous.v1')),pending:localStorage.getItem('daylight.restore.pending.v1')}));
 assert.equal(restored.tasks.length,1);assert.equal(restored.tasks[0].title,'Restored personal essay');assert.equal(restored.tasks[0].user_id,'local-demo');assert.equal(restored.tasks[0].remaining_minutes,30);assert.equal(restored.previous.tasks,beforeRestore);assert.equal(restored.pending,null);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/daylight-backup-mobile.png',fullPage:true});
 console.log('Backup browser QA passed: invalid files, cancel, stale preview, approved restore, local ownership, recovery copy, reload, and mobile layout.');
 }catch(e){if(page)await page.screenshot({path:'artifacts/daylight-backup-failure.png',fullPage:true});throw e;}finally{await browser?.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
