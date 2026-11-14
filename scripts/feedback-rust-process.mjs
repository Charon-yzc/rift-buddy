// Test-only process ownership: port 0 is allocated by this child, never inherited.
import {spawn} from 'node:child_process';

export async function startRustFeedback({executable,directory,args=[],env=process.env,timeout=10000}){
 const child=spawn(executable,[...args,directory],{env:{...env,RIFT_FEEDBACK_PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let done=false,output='',stderr='';
 const exited=new Promise(resolve=>{child.once('error',error=>{done=true;resolve({error});});child.once('exit',(code,signal)=>{done=true;resolve({code,signal});});});
 child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2048);});
 const stop=async()=>{if(!done)child.kill();return exited;};
 let timer;
 try{
  const base=await Promise.race([
   new Promise((resolve,reject)=>{
    child.stdout.on('data',chunk=>{
     output+=chunk;
     if(output.length>4096)return reject(Error('Unexpected readiness output'));
     const match=output.match(/^rift-buddy-feedback listening on 127\.0\.0\.1:(\d+)\r?\n/m);
     if(match){const port=Number(match[1]);if(port<1||port>65535)return reject(Error('Invalid child port'));resolve('http://127.0.0.1:'+port);}
    });
   }),
   exited.then(result=>{throw Error('Feedback child failed before readiness: '+(result.error?.message||result.code)+' '+stderr);}),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Feedback child readiness timed out')),timeout);}),
  ]);
  if(done)throw Error('Feedback child exited at readiness');
  const health=await fetch(base+'/healthz',{signal:AbortSignal.timeout(timeout)});
  if(done||health.status!==200||(await health.json()).service!=='rift-buddy-feedback')throw Error('Feedback child health failed');
  return {base,stop,child};
 }catch(error){await stop();throw error;}finally{clearTimeout(timer);}
}
