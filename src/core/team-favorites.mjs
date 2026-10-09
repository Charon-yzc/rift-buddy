import {getBuild} from './builds.mjs';
import {selectedBuildFields} from './build-favorites.mjs';
import {validatePreparation} from './preparation.mjs';
import {scopeSlots} from './draft.mjs';
import {currentCombo} from './recommend.mjs';
import {captureCreativePlan,creativeComboContext,validateCreativePlan} from './creative-plan.mjs';

export const resultSoloRole=result=>result.soloRole||result.targets?.[0]||'';
export function teamFavoriteId(result,style){return `${result.id}${result.creativePlan?'|'+result.creativePlan.id:''}|${style}|${result.scope}${result.scope==='solo'?'|'+resultSoloRole(result):''}`;}
export function findSavedTeam(favorites,result,style){
 const id=teamFavoriteId(result,style);
 return favorites.find(f=>f.type==='team'&&(!f.creativePlan||!result.creativePlan||f.creativePlan.id===result.creativePlan.id)&&(!f.soloRole||result.scope!=='solo'||f.soloRole===resultSoloRole(result))&&(f.id===id||[result.id,`${result.id}|${style}|${result.scope}`].includes(f.id)&&f.style===style&&f.scope===result.scope));
}
export function validateTeamConfigurations(values,slots){
 if(values===undefined)return [];
 if(!Array.isArray(values)||values.length>5)throw Error('组合成员配置格式不正确');
 const seen=new Set();
 return values.map(value=>{
  const selection=validatePreparation(value),identity=selection.id+':'+selection.role;
  if(selection.mode!=='rift'||!slots.some(slot=>slot.role===selection.role&&slot.champion===selection.id)||seen.has(identity))throw Error('组合配置与保存阵容不一致');
  if(selection.creativePlan)validateCreativePlan(selection.creativePlan,slots);
  seen.add(identity);return selection;
 });
}
export function captureTeamConfigurations(result,data,store){
 const lineup=scopeSlots(result.slots,result.scope),ownRole=resultSoloRole(result);
 const creativePlan=captureCreativePlan(result,data);
 if(result.scope==='solo'&&!ownRole)throw Error('单人方案未确认你的位置，请先确认位置再收藏');
 const members=(result.scope==='solo'?result.slots.filter(s=>s.role===ownRole):lineup).filter(s=>s.champion);
 return members.map(slot=>{
  const champion=data.champions.find(c=>c.id===slot.champion);
  if(!champion)throw Error('当前资料没有这位组合成员');
  const combo=currentCombo(lineup,champion.id,slot.role,data.catalogInfo?.status,null,creativePlan),context={id:champion.id,role:slot.role,mode:'rift',...creativeComboContext(combo)};
  const selection={coreIndex:0,conditions:[],...store.recall(context),...context},build=getBuild(champion,slot.role,data,selection);
  return validatePreparation({...selection,coreIndex:selection.coreId?selection.coreIndex:build.selectedCoreIndex,...selectedBuildFields({...selection,build},{preserveUnavailable:true})});
 });
}
