// One current public selection, never persisted match history. Event revisions
// also order invalidations, so a delayed result cannot revive an older write.
const STEPS=['hover','runes','spells','items'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=value=>structuredClone(value);
function contextOf(value){
 const gameId=String(value?.gameId||''),cellId=value?.cellId;
 return value?.phase==='ChampSelect'&&/^[1-9]\d{0,19}$/.test(gameId)&&Number.isInteger(cellId)&&cellId>=0&&cellId<30?{phase:'ChampSelect',gameId,cellId}:null;
}
function clientContext(client){
 const session=client?.session,cellId=session?.localPlayerCellId;
 if(!client?.connected||client.mode?.id!=='rift'||!session?.myTeam?.some(p=>p.cellId===cellId))return null;
 const gameId=[session.gameId,client.game?.gameId].map(id=>String(id||'')).find(id=>/^[1-9]\d{0,19}$/.test(id));
 return contextOf({phase:client.phase,gameId,cellId});
}
module.exports.createPreparationLedger=function createPreparationLedger({limit=64}={}){
 limit=Number.isInteger(limit)?Math.max(1,Math.min(limit,256)):64;
 let context=null,revision=0,epoch=0,events=[],latest={};
 const record=(value,current)=>{
  const event=copy({...value,revision:++revision,current});
  if(current){events.push(event);events=events.slice(-limit);}
  return copy(event);
 };
 return {
  observe(client){
   const next=clientContext(client);if(same(next,context))return null;
   context=next;epoch++;events=[];latest={};
   return record({kind:'invalidate',context:copy(context),ledgerContext:copy(context),affects:[...STEPS],reset:true,reason:'client-context-changed'},!!context);
  },
  snapshot(){return copy({context,revision,events});},
  begin(kind,payload={}){
   if(!['selection','runes','items'].includes(kind))throw Error('Unknown preparation operation');
   const affects=kind==='selection'?[...STEPS]:[kind],operationId=revision+1;
   // An item import can target an arbitrary set, without a selection context.
   // Invalidate every known items confirmation even when its target is unknown.
   const bound=kind==='items'?context:same(contextOf(payload.context||payload.value?.context),context)?context:null;
   for(const step of affects)latest[step]=operationId;
   const token={kind,operationId,epoch,context:copy(bound),payload:copy(payload)};
   const event=record({kind:'invalidate',operation:kind,operationId,context:copy(context),ledgerContext:copy(context),affects,reset:false,reason:kind+'-started'},!!context);
   return {token,event};
  },
  finish(token,payload={}){
   const affects=token.kind==='selection'?[...STEPS]:[token.kind];
   const current=!!token.context&&token.epoch===epoch&&same(token.context,context)&&affects.every(step=>latest[step]===token.operationId);
   return record({context:copy(token.context),...token.payload,...payload,kind:token.kind,operationId:token.operationId,ledgerContext:copy(token.context),affects},current);
  },
 };
};

// Client writes have already happened. Bookkeeping failures must not erase
// their checked steps, and one failed follow-up must not skip the other ones.
module.exports.preservePreparationResult=async function preservePreparationResult(result,followUps=[]){
 const accepted=copy(result),errors=accepted.followUpError?[accepted.followUpError]:[];
 for(const [label,run] of followUps)try{await run();}catch(error){errors.push(label+'：'+String(error?.message||'未完成'));}
 if(errors.length)accepted.followUpError=errors.join('；');
 return accepted;
};
