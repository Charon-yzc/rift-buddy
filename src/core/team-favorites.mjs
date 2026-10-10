import {getBuild} from './builds.mjs';
import {selectedBuildFields} from './build-favorites.mjs';
import {validatePreparation,recallPreparation} from './preparation.mjs';
import {scopeSlots} from './draft.mjs';
import {currentCombo,validateSlots,mergeClientSession} from './recommend.mjs';
import {captureCreativePlan,creativeComboContext,validateCreativePlan} from './creative-plan.mjs';
import {publicUnavailableChampions} from './pick-eligibility.mjs';

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
  const selection={coreIndex:0,conditions:[],...recallPreparation(store,null,context),...context},build=getBuild(champion,slot.role,data,selection);
  return validatePreparation({...selection,coreIndex:selection.coreId?selection.coreIndex:build.selectedCoreIndex,...selectedBuildFields({...selection,build},{preserveUnavailable:true})});
 });
}

// Restore reusable members; previous non-party picks are never a current draft.
export function restoreTeamFavorite(favorite,current,champions,session=null,{eligibleByRole={},confirmedPick=null}={}){
 validateSlots(favorite.slots,champions);validateSlots(current,champions);
 if(favorite.scope==='solo'&&!favorite.soloRole)throw Error('旧单人收藏未保存位置，请重新推荐并收藏');
 const desired=favorite.slots.filter(s=>s.champion&&(favorite.scope==='solo'?s.role===favorite.soloRole:favorite.scope==='bot'?['bottom','support'].includes(s.role):s.party));
 if(!desired.length)throw Error('这项收藏没有可载入的开黑成员，请重新推荐并收藏');
 const conflicts=[],publicIds=new Set((session?.myTeam||[]).map(p=>champions.find(c=>c.key===Number(p.championId))?.id).filter(Boolean));
 const publicCells=new Set((session?.myTeam||[]).map(p=>p.cellId).filter(Number.isInteger));
 const unavailable=publicUnavailableChampions(session,champions);
 const next=session?mergeClientSession(current,session,champions).slots:structuredClone(current);
 // Loading a party also restores its empty role checkboxes. Otherwise the
 // default three roles remain selected around a saved duo and the next search
 // fills extra positions instead of reopening that duo's accepted plan.
 // Current heroes and explicit client-position bindings retain ownership.
 if(['party','context'].includes(favorite.scope))for(const slot of next)if(!slot.champion&&!slot.manualPosition&&!Number.isInteger(slot.clientCellId))slot.party=favorite.slots.find(s=>s.role===slot.role).party;
 for(const member of desired){
  const slot=next.find(s=>s.role===member.role),existing=next.find(s=>s.champion===member.champion);
  const manualTeammate=slot.champion&&slot.locked&&!slot.party;
  if(unavailable.bans.includes(member.champion)||unavailable.enemy.includes(member.champion)||Array.isArray(eligibleByRole[member.role])&&!eligibleByRole[member.role].includes(member.champion)&&!(confirmedPick?.role===member.role&&confirmedPick.champion===member.champion)){
   conflicts.push({role:member.role,champion:member.champion,current:slot.champion,reason:'unavailable'});continue;
  }
  if(slot.champion&&slot.locked&&slot.champion!==member.champion){conflicts.push({role:member.role,champion:member.champion,current:slot.champion,reason:manualTeammate?'teammate':'locked'});continue;}
  if(manualTeammate||publicCells.has(slot.clientCellId)&&slot.champion!==member.champion||existing&&existing.role!==member.role||publicIds.has(member.champion)&&!existing){
   conflicts.push({role:member.role,champion:member.champion,current:slot.champion,reason:manualTeammate?'teammate':existing&&existing.role!==member.role?'position':publicIds.has(member.champion)&&!existing?'unassigned':'current'});continue;
  }
  if(slot.champion===member.champion&&publicIds.has(member.champion)){slot.party=member.party;continue;}
  const {clientCellId,manualPosition,...saved}=member;Object.assign(slot,saved,{locked:!!saved.champion});delete slot.clientCellId;delete slot.manualPosition;
 }
 validateSlots(next,champions);
 let creativePlan=null;if(favorite.creativePlan){try{if(conflicts.some(c=>c.role))throw Error('Member conflict');creativePlan=validateCreativePlan(favorite.creativePlan,next);}catch{conflicts.push({kind:'plan'});}}
 const configurations=(favorite.configurations||[]).filter(selection=>{
  if(conflicts.some(c=>c.role===selection.role)||!desired.some(s=>s.role===selection.role&&s.champion===selection.id)||!next.some(s=>s.role===selection.role&&s.champion===selection.id))return false;
  if(selection.creativePlan)return creativePlan?.id===selection.creativePlan.id;
  return (currentCombo(scopeSlots(next,favorite.scope),selection.id,selection.role,null,null,creativePlan)?.id||null)===(selection.comboId||null);
 }).map(s=>structuredClone(s));
 const merged=session?mergeClientSession(next,session,champions):{slots:next,unassigned:[]};
 return {...merged,creativePlan,configurations,conflicts,
  loadedMembers:desired.filter(member=>!conflicts.some(c=>c.role===member.role)&&next.some(slot=>slot.role===member.role&&slot.champion===member.champion)).length,
  skippedConfigurations:(favorite.configurations||[]).filter(selection=>desired.some(member=>member.role===selection.role&&member.champion===selection.id)).length-configurations.length};
}
