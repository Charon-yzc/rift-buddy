const indexes=new WeakMap();
// LCU/SGP keep numeric spell keys; bundled files use Data Dragon's named IDs.
export function historicalSpell(data,id){
 const spells=data?.spells;if(!spells||typeof spells!=='object')return {id,name:'召唤师技能'};
 let index=indexes.get(spells);if(!index){index=new Map();for(const [name,spell] of Object.entries(spells)){const assetId=typeof spell?.id==='string'?spell.id:name;if(spell&&typeof spell==='object'){index.set(String(spell.key??name),{id:assetId,name:spell.name||'召唤师技能'});index.set(name,{id:assetId,name:spell.name||'召唤师技能'});}}indexes.set(spells,index);}
 return index.get(String(id))||{id,name:'历史召唤师技能 '+id};
}
