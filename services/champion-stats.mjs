// Data Dragon 16.20 reports zero AD growth for every champion and does not
// expose the attack-speed ratio or melee/ranged identity. Read these fields
// from the same-patch character records; never reuse older patch numbers.
export function championStatsURL(patch,id){
 if(!/^\d+\.\d+$/.test(patch)||!/^[A-Za-z][A-Za-z0-9]+$/.test(id))throw Error('英雄属性版本或编号无效');
 const name=id.toLowerCase();
 return `https://raw.communitydragon.org/${patch}/game/data/characters/${name}/${name}.bin.json`;
}
const number=value=>Number.isFinite(value?.baseValue)?value.baseValue:Number.isFinite(value)?value:null;
export function parseChampionCombatStats(raw,id){
 const key=`characters/${id.toLowerCase()}/characterrecords/root`;
 const record=Object.entries(raw||{}).find(([name])=>name.toLowerCase()===key)?.[1];
 if(!record||record.mCharacterName?.toLowerCase()!==id.toLowerCase())throw Error('英雄属性记录不匹配');
 // Senna deliberately has no level-based AD growth. Other missing fields
 // are incomplete data, rather than evidence that growth equals zero.
 const growth=record.damagePerLevelModifiable===undefined&&id==='Senna'?0:number(record.damagePerLevelModifiable);
 const ratio=number(record.attackSpeedRatioModifiable);
 if(growth===null||growth<0||growth>20||ratio===null||ratio<0||ratio>2)throw Error('英雄成长属性不完整');
 const identities=record.purchaseIdentities;
 if(!Array.isArray(identities)||!identities.length||identities.some(v=>!['Melee','Ranged'].includes(v)))throw Error('英雄攻击类型不完整');
 const types=new Set(identities);
 const attacktype=types.size===2?'adaptive':types.has('Melee')?'melee':'ranged';
 const round=value=>Math.round(value*1000000)/1000000;
 return {attackdamageperlevel:round(growth),attackspeedratio:round(ratio),attacktype};
}
export function hasCurrentCombatStats(champion,patch){
 return /^\d+\.\d+$/.test(patch)&&/^[A-Za-z][A-Za-z0-9]+$/.test(champion?.id||'')&&champion?.combatStatsSource?.patch===patch&&champion.combatStatsSource.url===championStatsURL(patch,champion.id)&&
  Number.isFinite(champion.stats?.attackdamageperlevel)&&champion.stats.attackdamageperlevel>=0&&champion.stats.attackdamageperlevel<=20&&
  Number.isFinite(champion.stats?.attackspeedratio)&&champion.stats.attackspeedratio>=0&&champion.stats.attackspeedratio<=2&&
  ['melee','ranged','adaptive'].includes(champion.stats?.attacktype);
}
export async function enrichChampionStats(champions,patch,getJSON,progress=()=>{},{delayMs=1200}={}){
 const result=Array(champions.length);let cursor=0,completed=0,failure=null;
 await Promise.all(Array.from({length:Math.min(2,champions.length)},async()=>{
  while(cursor<champions.length&&!failure){
   const index=cursor++,champion=champions[index],url=championStatsURL(patch,champion.id);
   try{
    const stats=parseChampionCombatStats(await getJSON(url,15000),champion.id);
    result[index]={...champion,stats:{...champion.stats,...stats},combatStatsSource:{patch,url}};
    completed++;if(completed%25===0||completed===champions.length)progress(`正在核对英雄成长属性 ${completed}/${champions.length}`);
   }catch(error){failure=Error(`${champion.name||champion.id}的成长属性暂不可用：${error.message}；已保留原资料`);}
   if(!failure&&cursor<champions.length&&delayMs>0)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
 }));
 if(failure)throw failure;
 return result;
}
