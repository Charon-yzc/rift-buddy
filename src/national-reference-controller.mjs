import {nationalKey,nationalRequest,validNationalReference} from './core/national-reference.mjs';

// Read-only source exploration has its own bounded state. It never changes the
// selected configuration, recommendation inputs or the signed OP.GG datasets.
export function createNationalReferenceController({request,getData,getGeneration,onChange=()=>{}}){
 const entries=new Map(),pending=new Map();
 const keyFor=input=>getGeneration()+':'+nationalKey(input,getData());
 const snapshot=input=>entries.get(keyFor(input))||{reference:null,pending:false,error:''};
 async function refresh(input,{force=false}={}){
  const data=getData(),generation=getGeneration(),selected=nationalRequest(input,data),key=keyFor(selected);
  if(pending.has(key))return pending.get(key);if(pending.size>=4)throw Error('国服资料正在读取，请稍后再试');
  if(entries.size>=32&&!entries.has(key))for(const old of entries.keys())if(!pending.has(old)){entries.delete(old);break;}
  entries.set(key,{...snapshot(selected),pending:true,error:''});onChange();
  const task=(async()=>{
   try{
    const result=await request({...selected,force});if(generation!==getGeneration()||data.patch!==getData().patch)return;
    if(result.reference&&(!validNationalReference(result.reference,getData())||result.reference.key!==nationalKey(selected,getData())))throw Error('国服响应与当前筛选不一致');
    entries.set(key,{reference:result.reference||null,pending:false,error:result.refreshError||''});
   }catch(error){if(generation===getGeneration())entries.set(key,{...snapshot(selected),pending:false,error:String(error.message||'国服资料暂不可用')});}
   finally{pending.delete(key);if(generation===getGeneration())onChange();}
  })();pending.set(key,task);return task;
 }
 return {snapshot,refresh};
}
