// Cancel only explicitly read-only work. A late result cannot resume its caller.
export function selectionRead(read,signal){
 if(!signal)return read();
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(()=>{if(signal.aborted)throw signal.reason;return read();}).then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
 });
}
// One actual writer owns this lane. An issued PATCH/POST and its confirmation
// keep their place; newer clicks cancel only old preflight reads.
export function createHexSelectionQueue(run){
 let revision=0,running=false,waiting=null,active=null;const idle=[];
 const superseded=()=>({complete:false,superseded:true});
 const cancelRead=()=>{if(active&&!active.writing)active.controller.abort(Object.assign(Error('英雄选择已更新'),{name:'AbortError',code:'ABORT_ERR'}));};
 async function drain(){
  if(running)return;running=true;
  try{while(waiting){const job=waiting;waiting=null;active=job;job.controller=new AbortController();job.writing=false;
   const isCurrent=()=>job.revision===revision;
   try{const result=await run(job.value,{isCurrent,signal:job.controller.signal,read:read=>selectionRead(read,job.controller.signal),beforeWrite:()=>{job.controller.signal.throwIfAborted();if(!isCurrent())throw Error('英雄选择已更新');job.writing=true;}});job.resolve(isCurrent()?result:superseded());}
   catch(error){if(job.revision===revision)job.reject(error);else job.resolve(superseded());}
   finally{active=null;}
  }}finally{running=false;for(const resolve of idle.splice(0))resolve();}
 }
 const submit=value=>new Promise((resolve,reject)=>{
  if(waiting)waiting.resolve(superseded());
  waiting={value,resolve,reject,revision:++revision};cancelRead();void drain();
 });
 submit.cancel=()=>{revision++;if(waiting){waiting.resolve(superseded());waiting=null;}cancelRead();return running?new Promise(resolve=>idle.push(resolve)):Promise.resolve();};
 return submit;
}
