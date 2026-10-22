import {getBuild} from './builds.mjs';
import {configurationKey} from './preparation.mjs';
import {createItemSet} from './item-sets.mjs';
import {isCurrentHexData} from './hex-data-current.mjs';

const caches=new WeakMap();
const nameOf=(build,data)=>{
 if(build.sharedEquipment)return '队友共享';
 const named=build.loadoutOptions.find(option=>option.id===build.loadoutId)?.name;if(named)return named;
 if(build.selectedRune?.source==='个人自选')return '自选配置';
 if(!build.reference)return '机制默认';
 if(build.sourceOpponent)return 'OP.GG · 对'+(data.champions.find(hero=>hero.id===build.sourceOpponent)?.name||build.sourceOpponent);
 if(build.selectedCoreIndex>0)return 'OP.GG · '+(data.items[build.reference.core[build.selectedCoreIndex]?.items[0]]?.name||'备选')+'路线';
 if(build.selectedRuneId&&build.selectedRuneId!==build.runeOptions[0]?.id)return (build.selectedRune?.source==='OP.GG'?'OP.GG · ':'常用出装 · ')+build.selectedRune.name;
 return 'OP.GG 常用';
};
// Each row is a complete, materialized preparation. Switching never merges a
// previous row's manual rune, item, spell or skill overrides into the next row.
export function configurationChoices(data,selection,currentBuild){
 if(currentBuild?.unavailable||selection.mode==='hex'&&!isCurrentHexData(data))return [];
 const dependencies=[data.items,data.runes,data.builds,data.buildSources,data.catalog,data.catalogInfo,data.hexBuilds,data.patch,data.flashSlot,data.clientFlashSlot],key=JSON.stringify([configurationKey(selection),selection.readOnly===true,selection.localReference===true]);
 let cache=caches.get(data);
 if(!cache||dependencies.some((value,index)=>value!==cache.dependencies[index])){cache={dependencies,values:new Map()};caches.set(data,cache);}
 const token=JSON.stringify([currentBuild?.items?.map(item=>item.id),currentBuild?.runePage,currentBuild?.summoners,currentBuild?.skillOrder,currentBuild?.source,currentBuild?.rulesPatch,currentBuild?.stale,currentBuild?.referenceStale,currentBuild?.selectionWarnings]);
 const previous=cache.values.get(key);if(previous&&previous.token===token)return previous.rows;
 const hero=data.champions.find(value=>value.id===selection.id);if(!hero)return [];
 const base={id:selection.id,role:selection.role,mode:selection.mode,...(selection.comboId?{comboId:selection.comboId,creativePlan:selection.creativePlan}:{})};
 const standard={...base,loadoutId:'default'},ordinary=getBuild(hero,base.role,data,standard),rows=[],seen=new Set();
 const append=(id,s,build,name)=>{
  const fingerprint=JSON.stringify([build.runePage,build.summoners,createItemSet(hero,build,data),build.skillOrder,build.first,build.priority]);
  if(seen.has(fingerprint))return;seen.add(fingerprint);rows.push({id,selection:s,build,name,fingerprint});
 };
 append('current',selection,currentBuild||getBuild(hero,base.role,data,selection),nameOf(currentBuild||ordinary,data));
 append('default',standard,ordinary,nameOf(ordinary,data));
 for(const option of ordinary.loadoutOptions){const s={...base,loadoutId:option.id};append('loadout:'+option.id,s,getBuild(hero,base.role,data,s),option.name);}
 for(const [index,core] of (ordinary.reference?.core||[]).slice(1,4).entries()){
  const s={...standard,coreIndex:index+1,coreId:'core-'+core.items.join('-')};
  append(s.coreId,s,getBuild(hero,base.role,data,s),'OP.GG · '+(data.items[core.items[0]]?.name||'路线')+'路线');
 }
 for(const rune of ordinary.runeOptions.filter(value=>value.source==='OP.GG').slice(0,5)){
  const s={...standard,runeId:rune.id};append('rune:'+rune.id,s,getBuild(hero,base.role,data,s),'OP.GG · '+rune.name);
 }
 cache.values.set(key,{token,rows});if(cache.values.size>12)cache.values.delete(cache.values.keys().next().value);
 return rows;
}

// An avatar in a lineup asks for that member's dedicated route. Old source
// versions remain labeled; a generic source page must not silently replace it.
export function heroClickSelection(data,context){
 const hero=data.champions.find(value=>value.id===context.id);if(!hero)return context;
 const build=getBuild(hero,context.role,data,context),preferred=build.combo?.preferred;
 return context.loadoutId===undefined&&preferred&&preferred!=='default'&&build.loadoutOptions.some(option=>option.id===preferred)?{...context,loadoutId:preferred}:context;
}
