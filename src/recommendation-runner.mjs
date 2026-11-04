// One idle worker per renderer. Active cancellation must terminate the worker:
// a queued cancel message cannot interrupt synchronous recommendation search.
import {RECOMMENDATION_FACTORY_FIELDS,splitRecommendationInput,recommendationConditionsKey} from './core/recommendation-input.mjs';
export function createRecommendationRunner(createWorker,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let worker=null,pending=null,unaccepted=null,search=null,requestId=0,factoryIdentity=null,factoryReferences=null,factoryRevision=null,factoryToken=0,conditionIdentity=null,idleTimer=null;
 const cancelled=()=>Object.assign(Error('条件已变化'),{cancelled:true});
 function clearIdle(){if(idleTimer!==null)clearTimer(idleTimer);idleTimer=null;}
 function release(){clearIdle();const previous=worker;worker=null;factoryIdentity=null;factoryReferences=null;factoryRevision=null;conditionIdentity=null;search=null;unaccepted=null;if(previous){previous.onmessage=previous.onerror=previous.onmessageerror=null;previous.terminate();}}
 function dispose(){const task=pending;pending=null;release();task?.reject(cancelled());}
 function invalidate(){
  if(pending||unaccepted){dispose();return;}
  search=null;conditionIdentity=null;
  // The worker clears draft caches before the next request. The local data
  // snapshot may include personal catalog entries; it stays only on this
  // computer within the existing idle TTL, never a shared/public cache.
  try{worker?.postMessage({invalidate:true});}catch{release();}
 }
 function prepareNext(){
  if(!worker||pending||unaccepted||!search)return;
  try{worker.postMessage({prepareNext:search});}catch{release();}
 }
 function run(input,{manualAcceptance=false,sliceOnly=false,snapshotRevision=null}={}){
  if(pending||unaccepted)dispose();clearIdle();
  let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});
  const task={requestId:++requestId,promise,resolve,reject,search:null,accept:()=>{
   if(unaccepted!==task)return false;
   if(task.search){try{worker.postMessage({commit:{handle:task.search.handle,step:task.search.step}});search={handle:task.search.handle,step:task.search.step};}catch{release();return false;}}
   else release();
   unaccepted=null;return true;
  },cancel:()=>{if(pending===task||unaccepted===task)dispose();}};pending=task;
  try{
   const managed=Number.isSafeInteger(snapshotRevision)&&snapshotRevision>=0;
   const {factory,conditions}=splitRecommendationInput(input);
   // Every new action compares full content, including same-version/in-place
   // member edits. Only guarded slices of the same captured app input avoid
   // repeating that large serialization; a counter alone never grants reuse.
   const sameCapturedFactory=managed&&snapshotRevision===factoryRevision&&factoryReferences&&RECOMMENDATION_FACTORY_FIELDS.every(field=>factory[field]===factoryReferences[field]);
   const identity=sliceOnly&&search&&sameCapturedFactory?factoryIdentity:JSON.stringify(factory);
   const nextCondition=sliceOnly&&search?conditionIdentity:recommendationConditionsKey(input);
   const resume=!!(worker&&search&&identity===factoryIdentity&&nextCondition===conditionIdentity&&(sliceOnly||input.continueSearch));
   const initialize=identity!==factoryIdentity;if(initialize)factoryToken++;
   if(!worker)worker=createWorker();const current=worker;
   const fail=error=>{if(worker!==current||pending!==task)return;pending=null;release();reject(error);};
   current.onmessage=({data})=>{
    if(worker!==current||pending!==task||data?.requestId!==task.requestId)return;
    if(data.error){fail(Error(data.error));return;}
    if(!Array.isArray(data.results)){fail(Error('搭配计算未完成，请重试'));return;}
    if(data.search&&(!data.search.handle||!Number.isSafeInteger(data.search.step)||data.search.step<1||typeof data.search.complete!=='boolean'||typeof data.search.exhausted!=='boolean')){fail(Error('推荐搜索状态不正确，请重试'));return;}
    pending=null;factoryIdentity=identity;factoryReferences=factory;factoryRevision=managed?snapshotRevision:null;conditionIdentity=nextCondition;task.search=data.search||null;unaccepted=task;
    // Every draft has a bounded idle lifetime, even with unfinished sources.
    // The renderer keeps only an ordering hint; an expired worker honestly
    // restarts traversal instead of retaining a full draft indefinitely.
    idleTimer=setTimer(()=>{if(worker===current&&!pending)release();},60_000);
    if(!manualAcceptance&&!task.accept()){reject(cancelled());return;}
    resolve(data.results);
   };
   current.onerror=current.onmessageerror=()=>{if(worker!==current)return;if(pending===task)fail(Error('搭配计算未完成，请重试'));else if(!pending)release();};
   if(resume)current.postMessage({requestId:task.requestId,resume:{...search,newPage:!sliceOnly&&input.newRecommendationPage===true}});
   else current.postMessage({requestId:task.requestId,initialize,factoryToken,...(initialize?{factory}:{}),input:{...conditions,...(input.continueSearch&&search?{searchHandle:search.handle,searchStep:search.step}:{})}});
  }catch(error){if(pending===task){pending=null;release();reject(error);}}
  return task;
 }
 return {run,dispose,invalidate,prepareNext};
}
