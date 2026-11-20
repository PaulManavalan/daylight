const net=require('node:net');
const path=require('node:path');
const {spawn}=require('node:child_process');
async function startBrowserServer(){
 const port=await new Promise((resolve,reject)=>{const probe=net.createServer();probe.on('error',reject);probe.listen(0,'127.0.0.1',()=>{const port=probe.address().port;probe.close(()=>resolve(port));});});
 const root=path.resolve(__dirname,'..');
 const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
 await new Promise((resolve,reject)=>{
  let stdout='',stderr='',ready=false;
  const fail=error=>{clearTimeout(timer);if(!ready){child.kill();reject(error);}};
  const timer=setTimeout(()=>fail(new Error('Isolated browser-test server timed out. '+stderr)),20000);
  child.stdout.on('data',data=>{stdout=(stdout+data).slice(-2000);if(!ready && stdout.includes('Ready')){ready=true;clearTimeout(timer);resolve();}});
  child.stderr.on('data',data=>{stderr=(stderr+data).slice(-5000);});
  child.on('error',fail);child.once('exit',code=>fail(new Error('Isolated browser-test server exited ('+code+'). '+stderr)));
 });
 return {process:child,url:'http://127.0.0.1:'+port};
}
module.exports={startBrowserServer};
