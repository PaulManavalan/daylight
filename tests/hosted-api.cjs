const assert=require('node:assert/strict');
(async()=>{const preview=await require('./browser-server.cjs').startBrowserServer({hosted:true});try{
 const discovery=await fetch(preview.url+'/api/assistant',{signal:AbortSignal.timeout(10000)});assert.equal(discovery.status,200);const data=await discovery.json();assert.equal(data.available,false,'The hosted server must never advertise its own loopback model.');assert.match(data.reason,/browser model/i);
 const response=await fetch(preview.url+'/api/assistant',{method:'POST',headers:{'content-type':'application/json',origin:preview.url},body:'{}',signal:AbortSignal.timeout(10000)});assert.equal(response.status,503);assert.match((await response.json()).error,/browser model/i);
 console.log('Hosted API checks passed: Vercel runtime cannot expose server loopback AI; the browser-model path is explicit.');
 }finally{preview.process.kill();}})().catch(error=>{console.error(error);process.exitCode=1;});
