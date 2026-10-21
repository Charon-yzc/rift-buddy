// Main-process owner of bounded, ephemeral notes. Wishlists and reusable builds
// are intentionally independent. Tokens distinguish same-hero successive games.
export function createHexRoundStore({newToken=()=>crypto.randomUUID()}={}){
 let revision=0,live=null,manual=null;
 const snapshot=()=>structuredClone({revision,live,manual});
 const make=(hero,gameId=null)=>({context:newToken(),revision:0,hero,gameId,options:[],owned:[]});
 const validHero=(hero,data)=>data.champions.some(c=>c.id===hero);
 return {
  snapshot,
  observe({connected,phase,mode,gameId,hero},data){
   if(!connected)return false; // A transient disconnect is not a new game.
   const active=['ChampSelect','GameStart','InProgress','Reconnect'].includes(phase);
   if(!active||mode&&mode!=='hex'){
    if(!live)return false;live=null;revision++;return true;
   }
   const id=/^[1-9]\d{0,19}$/.test(String(gameId||''))?String(gameId):null;
   if(id&&live?.gameId&&id!==live.gameId){live=null;revision++;}
   if(mode!=='hex'||!id||!validHero(hero,data))return false;
   if(live?.gameId===id&&live.hero===hero)return false;
   live=make(hero,id);revision++;return true;
  },
  select(hero,data){
   if(!validHero(hero,data))throw Error('当前资料没有这位英雄');
   if(live?.hero===hero)return structuredClone(live);
   if(manual?.hero!==hero){manual=make(hero);revision++;}
   return structuredClone(manual);
  },
  reset(value){
   const record=[live,manual].find(row=>row&&row.context===value?.context);
   if(!record||record.revision!==value?.revision)throw Error('本局强化记录已变化，请按当前页面重试');
   record.context=newToken();record.revision++;record.options=[];record.owned=[];revision++;
   return structuredClone(record);
  },
  change(value,data){
   const record=[live,manual].find(row=>row&&row.context===value?.context);
   if(!record||record.revision!==value?.revision)throw Error('本局强化记录已变化，请按当前页面重试');
   const id=value?.id,op=value?.operation;
   if(!['compare','clear','own','remove'].includes(op))throw Error('强化操作不正确');
   if(op!=='clear'&&(!Number.isSafeInteger(id)||id<1||!(op==='remove'&&record.owned.includes(id))&&!data.augments.some(a=>a.id===id)))throw Error('当前资料没有这项强化');
   if(op==='compare'){
    if(record.options.includes(id))record.options=record.options.filter(x=>x!==id);
    else{if(record.options.length>=3)throw Error('最多比较 3 个实际选项，请先移出一个');record.options.push(id);}
   }else if(op==='clear')record.options=[];
   else if(op==='own'){
    if(!record.owned.includes(id)){if(record.owned.length>=6)throw Error('最多标记 6 个已选强化');record.owned.push(id);}
    record.options=[];
   }else record.owned=record.owned.filter(x=>x!==id);
   record.revision++;revision++;return snapshot();
  },
 };
}

export function hexRoundForHero(snapshot,hero){
 return [snapshot?.live,snapshot?.manual].find(row=>row?.hero===hero)||null;
}
export function hexRoundSelection(selection,record){
 if(selection?.mode!=='hex')return selection;
 const matching=record?.hero===selection.id;
 return {...selection,compareIds:matching?[...record.options]:[],ownedAugmentIds:matching?[...record.owned]:[]};
}
