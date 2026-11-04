import {createRecommendationSearch,createRecommendationResources,replaceMember} from './core/recommend.mjs';
import {configureCatalog,BUNDLED_CATALOG} from './core/catalog.mjs';
import {orderRecommendationPage} from './core/recommendation-policy.mjs';
import {recommendationConditionsKey} from './core/recommendation-input.mjs';
let session=null,factory=null,factoryToken=null,resources=null;
function invalidateDraft(){if(session?.timer)clearTimeout(session.timer);session=null;resources?.clearDraftCaches();}
function schedulePrefetch(current){
 if(current.timer||current.pending||current.prepared||current.lastResult?.exhausted||current.lastResult?.capacity)return;
 current.prepareNext=true;
 const deadline=Date.now()+350;let slices=0,emptyPages=0;
 const step=()=>{
  current.timer=null;if(session!==current||current.pending||Date.now()>=deadline||slices++>=24)return;
  let result;
  try{result=current.engine.advance({limit:current.limit,budget:current.limit,newPage:current.prepareNext});current.prepareNext=false;current.prepared=result;}
  catch{if(session===current)invalidateDraft();return;}
  if(result.complete&&!result.rows.length)emptyPages++;
  // One retained page, never a visible refresh. It is delivered by the next
  // validated request and cannot be skipped by another speculative page.
  if(!result.capacity&&!result.exhausted&&emptyPages<3&&!(result.rows.length&&(!result.communityPending||result.complete)))current.timer=setTimeout(step,8);
 };
 current.timer=setTimeout(step,20);
}
function advance(requestId,restarted=false){
 const prepared=!!session.prepared,result=session.prepared||session.engine.advance({limit:session.limit,budget:session.limit,newPage:session.newPage||session.prepareNext});session.prepared=null;session.prepareNext=false;session.newPage=false;session.lastResult=result;
 session.step++;session.pending=true;
 self.postMessage({requestId,results:orderRecommendationPage(result.rows),search:{handle:session.handle,step:session.step,complete:result.complete,exhausted:result.exhausted,restarted,prepared,steps:result.steps,preparationSteps:result.preparationSteps||0,capacity:result.capacity===true,fallback:result.fallback===true,preferenceConflict:result.preferenceConflict===true,communityPending:result.communityPending===true,communityAfter:result.communityAfter||session.engine.communityAfter,retain:session.engine.retain}});
}
self.onmessage=({data})=>{
 if(data?.invalidate){invalidateDraft();return;}
 if(data?.prepareNext){
  if(session&&!session.pending&&data.prepareNext.handle===session.handle&&data.prepareNext.step===session.step)schedulePrefetch(session);
  return;
 }
 if(data?.commit){
  if(session?.pending&&data.commit.handle===session.handle&&data.commit.step===session.step){session.pending=false;return;}
  invalidateDraft();return;
 }
 const {requestId,initialize,resume}=data;
 try{
  if(session?.timer){clearTimeout(session.timer);session.timer=null;}
  if(resume){
   if(!session||session.pending||resume.handle!==session.handle||resume.step!==session.step)throw Error('搜索会话已过期，请重新推荐');
   session.newPage=resume.newPage===true;
   advance(requestId);return;
  }
  if(initialize){
   session=null;factory=data.factory;factoryToken=data.factoryToken;resources=null;
   if(!factory||!Number.isSafeInteger(factoryToken))throw Error('推荐资料快照不正确');
   configureCatalog(factory.catalog||BUNDLED_CATALOG);
  }
  if(!factory||data.factoryToken!==factoryToken)throw Error('推荐资料已变化，请重新推荐');
  const input={...factory,...data.input};
  const options={...input,minimumFitScore:60,stylePolicy:true};
  if(input.replace){invalidateDraft();self.postMessage({requestId,results:orderRecommendationPage(replaceMember(input.replace.result,input.replace.role,options))});return;}
  const identity=recommendationConditionsKey(input),continuing=input.continueSearch===true;
  const matches=continuing&&session&&session.identity===identity&&input.searchHandle===session.handle&&input.searchStep===session.step;
  if(matches&&session.pending)throw Error('推荐页尚未确认，请重新推荐');
  const restarted=continuing&&!matches;
  if(!matches){
   if(typeof globalThis.crypto?.randomUUID!=='function')throw Error('当前环境无法创建推荐会话，请重新打开软件');
   if(!resources?.matches(options))resources=createRecommendationResources(options);
   session={identity,handle:globalThis.crypto.randomUUID(),step:0,pending:false,prepared:null,prepareNext:false,engine:createRecommendationSearch(options,resources)};
  }
  session.limit=input.limit||6;session.newPage=input.newRecommendationPage===true;
  // One request advances at most one page-size slice, across every lane and
  // catalog seed. Callers may continue the same pending page explicitly.
  advance(requestId,restarted);
 }catch(error){invalidateDraft();self.postMessage({requestId,error:error.message});}
};
