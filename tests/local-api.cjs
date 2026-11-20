// Production HTTP regression. Add --real-model to use an already installed model.
// All inputs are synthetic; this script never writes task or browser storage.
const assert=require('node:assert/strict');
(async()=>{
 const preview=await require('./browser-server.cjs').startBrowserServer();
 const post=(origin,body='{}',type='application/json')=>fetch(preview.url+'/api/assistant',{method:'POST',headers:{origin,'content-type':type},body,signal:AbortSignal.timeout(90000)});
 try{
  assert.equal((await post(preview.url)).status,400,'The launcher origin must pass security checks and reach request validation.');
  assert.equal((await post('https://example.com')).status,403,'Foreign origins must be rejected.');
  assert.equal((await post(preview.url.replace('127.0.0.1','localhost'))).status,403,'Different loopback origins are still different origins.');
  assert.equal((await post('null')).status,403,'Opaque browser origins must be rejected.');
  assert.equal((await post(preview.url,'not JSON','text/plain')).status,415);
  assert.equal((await post(preview.url,'not JSON')).status,400);
  if(process.argv.includes('--real-model')){
   const ts=require('typescript'),fs=require('node:fs');
   require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
   const {brainContext,validateModelReply}=require('../src/lib/assistant-brain.ts'),{defaults}=require('../src/lib/scheduling.ts');
   const health=await fetch(preview.url+'/api/assistant').then(r=>r.json());assert.equal(health.available,true,'Start your existing Ollama service first.');assert.ok(health.models.includes(health.model));
   const request={persona:{name:'Sol',tone:'calm'},localModel:health.model,context:brainContext([],defaults(),[],[],new Date(),[],'I feel overwhelmed by homework.'),messages:[{role:'user',content:'I feel overwhelmed by homework. Can we talk through where to start?'}]};
   const response=await post(preview.url,JSON.stringify(request));assert.equal(response.status,200);const data=await response.json(),reply=validateModelReply(data.result,[]);assert.equal(reply.kind,'none');assert.equal(reply.tasks.length,0);assert.ok(reply.reply.length>0);
   console.log('Real localhost model HTTP reply passed: '+data.model+'. No user data was modified.');
  }
  console.log('Production localhost API origin and request-validation checks passed.');
 }finally{preview.process.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
