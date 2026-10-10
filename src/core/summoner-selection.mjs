const common=['SummonerBarrier','SummonerBoost','SummonerDot','SummonerFlash','SummonerHaste','SummonerHeal'];
const byMode={rift:[...common,'SummonerExhaust','SummonerSmite','SummonerTeleport'],hex:[...common,'SummonerMana','SummonerSnowball']};
export function validateSummonerIds(value,mode){
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||value.length!==2||value[0]===value[1]||!value.every(id=>byMode[mode]?.includes(id)))throw Error('召唤师技能需为当前模式的两个不同技能');
 return [...value];
}
export function summonerOptions(data,mode){
 const tag=mode==='hex'?'KIWI':'CLASSIC';
 return (byMode[mode]||[]).filter(id=>data.spells[id]?.modes?.includes(tag));
}
export function validSourceSummonerOptions(value,data,{older=false}={}){
 if(value===undefined)return true;
 const legal=older?byMode.rift:summonerOptions(data,'rift'),seen=new Set();
 return Array.isArray(value)&&value.length<=20&&value.every(o=>{
  if(!o||!Array.isArray(o.ids)||o.ids.length!==2||o.ids[0]===o.ids[1]||!o.ids.every(id=>legal.includes(id)))return false;
  const identity=[...o.ids].sort().join('-');if(o.id!=='source-spells-'+identity||seen.has(identity))return false;seen.add(identity);
  return Number.isSafeInteger(o.samples)&&o.samples>0&&Number.isSafeInteger(o.wins)&&o.wins>=0&&o.wins<=o.samples&&Number.isFinite(o.winRate)&&Math.abs(o.winRate-100*o.wins/o.samples)<.000001&&(o.pickRate===null||Number.isFinite(o.pickRate)&&o.pickRate>=0&&o.pickRate<=100);
 });
}
export function summonerPlan(data,mode,role,recommended,manual){
 const options=summonerOptions(data,mode),available=ids=>Array.isArray(ids)&&ids.length===2&&ids[0]!==ids[1]&&ids.every(id=>options.includes(id));
 const warnings=[],fallback=mode==='hex'?['SummonerFlash','SummonerSnowball']:['SummonerFlash',role==='jungle'?'SummonerSmite':role==='support'?'SummonerExhaust':role==='bottom'?'SummonerBarrier':'SummonerTeleport'];
 const source=available(recommended)?[...recommended]:fallback.filter(id=>options.includes(id));
 if(!available(recommended))warnings.push('原参考的召唤师技能不适用于当前模式或资料，暂按机制配置准备。');
 if(manual!==undefined)validateSummonerIds(manual,mode);
 const selected=manual!==undefined&&available(manual);
 if(manual!==undefined&&!selected)warnings.push('已保存的召唤师技能在当前资料中不可用，保留原选择，暂显示来源配置。');
 const ids=selected?[...manual]:source;
 if(mode==='rift'&&role==='jungle'&&!ids.includes('SummonerSmite'))warnings.push('打野配置没有惩戒，请先确认野区与召唤师技能分工。');
 if(mode==='rift'&&role!=='jungle'&&ids.includes('SummonerSmite'))warnings.push('非打野位携带惩戒，先与队友确认兵线与野区分工。');
 return {ids,options,selectedSummonerIds:selected?[...manual]:null,manual:!!selected,warnings};
}
export function changeSummonerSlot(data,mode,ids,slot,value){
 if(!['d','f'].includes(slot)||!summonerOptions(data,mode).includes(value))throw Error('召唤师技能选项已变化，请重新选择');
 const next=validateSummonerIds(ids,mode),index=slot==='d'?0:1,other=1-index;
 if(next[other]===value)[next[index],next[other]]=[next[other],next[index]];else next[index]=value;
 return next;
}
