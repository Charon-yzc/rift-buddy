import {getBuild} from './builds.mjs';
import {selectedBuildFields} from './build-favorites.mjs';
import {validatePreparation} from './preparation.mjs';
import {scopeSlots} from './draft.mjs';
import {currentCombo} from './recommend.mjs';

export function teamFavoriteId(result,style){return `${result.id}|${style}|${result.scope}`;}
export function findSavedTeam(favorites,result,style){
 const id=teamFavoriteId(result,style);
 return favorites.find(f=>f.type==='team'&&(f.id===id||f.id===result.id&&f.style===style&&f.scope===result.scope));
}
export function validateTeamConfigurations(values,slots){
 if(values===undefined)return [];
 if(!Array.isArray(values)||values.length>5)throw Error('组合成员配置格式不正确');
 const seen=new Set();
 return values.map(value=>{
  const selection=validatePreparation(value),identity=selection.id+':'+selection.role;
  if(selection.mode!=='rift'||!slots.some(slot=>slot.role===selection.role&&slot.champion===selection.id)||seen.has(identity))throw Error('组合配置与保存阵容不一致');
  seen.add(identity);return selection;
 });
}
export function captureTeamConfigurations(result,data,store){
 const lineup=scopeSlots(result.slots,result.scope),members=(result.scope==='solo'?result.slots.filter(s=>(result.targets||[]).includes(s.role)):lineup).filter(s=>s.champion);
 return members.map(slot=>{
  const champion=data.champions.find(c=>c.id===slot.champion);
  if(!champion)throw Error('当前资料没有这位组合成员');
  const combo=currentCombo(lineup,champion.id,slot.role,data.catalogInfo?.status),context={id:champion.id,role:slot.role,mode:'rift',...(combo?{comboId:combo.id}:{})};
  const selection={coreIndex:0,conditions:[],...store.recall(context),...context},build=getBuild(champion,slot.role,data,selection);
  return validatePreparation({...selection,coreIndex:selection.coreId?selection.coreIndex:build.selectedCoreIndex,...selectedBuildFields({...selection,build},{preserveUnavailable:true})});
 });
}
