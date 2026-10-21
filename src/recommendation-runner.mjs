// One idle worker per renderer. Active cancellation must terminate the worker:
// a queued cancel message cannot interrupt synchronous recommendation search.
export function createRecommendationRunner(createWorker,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let worker=null,pending=null,requestId=0,catalogIdentity=null,idleTimer=null;
 const cancelled=()=>Object.assign(Error('条件已变化'),{cancelled:true});
 function clearIdle(){if(idleTimer!==null)clearTimer(idleTimer);idleTimer=null;}
 function release(){clearIdle();const previous=worker;worker=null;catalogIdentity=null;if(previous){previous.onmessage=previous.onerror=previous.onmessageerror=null;previous.terminate();}}
 function dispose(){const task=pending;pending=null;release();task?.reject(cancelled());}
 function run(input){
  if(pending)dispose();clearIdle();
  let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});
  const task={requestId:++requestId,promise,resolve,reject,cancel:()=>{if(pending===task)dispose();}};pending=task;
  try{
   // Compare content, not catalog.version: personal edits may keep that version.
   // Keep only the current identity; builds and all draft conditions travel on
   // every request, so same-patch source/statistics changes cannot be hidden.
   const identity=JSON.stringify(input.catalog??null);
   if(!worker)worker=createWorker();const current=worker;
   const fail=error=>{if(worker!==current||pending!==task)return;pending=null;release();reject(error);};
   current.onmessage=({data})=>{
    if(worker!==current||pending!==task||data?.requestId!==task.requestId)return;
    if(data.error){fail(Error(data.error));return;}
    if(!Array.isArray(data.results)){fail(Error('搭配计算未完成，请重试'));return;}
    pending=null;catalogIdentity=identity;
    idleTimer=setTimer(()=>{if(worker===current&&!pending)release();},60_000);
    resolve(data.results);
   };
   current.onerror=current.onmessageerror=()=>{if(worker!==current)return;if(pending===task)fail(Error('搭配计算未完成，请重试'));else if(!pending)release();};
   const {catalog,...conditions}=input,initialize=identity!==catalogIdentity;
   current.postMessage({requestId:task.requestId,initialize,input:{...conditions,...(initialize?{catalog}:{})}});
  }catch(error){if(pending===task){pending=null;release();reject(error);}}
  return task;
 }
 return {run,dispose};
}
