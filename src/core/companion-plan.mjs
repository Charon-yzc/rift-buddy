import {getBuild} from './builds.mjs';
import {CLIENT_POSITION_ROLES} from './draft.mjs';
import {ROLES,profile} from './rules.mjs';

export function companionPickIntent(client,champions,slots=[],{scope='solo',soloRole=''}={}){
 const session=client?.session,mode=client?.mode?.id;
 if(!client?.connected||client.phase!=='ChampSelect'||!['rift','hex'].includes(mode)||!Number.isInteger(session?.localPlayerCellId))return null;
 const player=session.myTeam?.find(p=>p.cellId===session.localPlayerCellId);
 if(!player||player.championId||!Number.isInteger(player.championPickIntent))return null;
 const champion=champions.find(c=>c.key===player.championPickIntent);if(!champion)return null;
 const assigned=CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()];
 const manual=slots.find(s=>s.champion===champion.id&&(s.manualPosition||!Number.isInteger(s.clientCellId)));
 const preferred=ROLES.some(r=>r.id===soloRole)?soloRole:null;
 return {selection:{id:champion.id,role:assigned||manual?.role||preferred||profile(champion).roles[0],mode},positionKnown:!!(assigned||manual||preferred)};
}

// Inline controls edit the same preparation as the drawer and in-game guide.
export function changeCompanionPlan(data,selection,field,value){
 const champion=data.champions.find(c=>c.id===selection.id);
 if(!champion)throw Error('英雄资料已变化，请重新选择');
 const current=getBuild(champion,selection.role,data,selection),next={...selection};
 if(field==='loadout'){
  if(value!=='default'&&!current.loadoutOptions.some(o=>o.id===value))throw Error('玩法已变化，请重新选择');
  next.loadoutId=value;next.coreIndex=0;delete next.coreId;delete next.runeId;delete next.skillId;delete next.laterIds;
 }else if(field==='core'){
  const index=Number(value);
  if(!Number.isInteger(index)||index<0||!current.reference?.core[index])throw Error('装备路线已变化，请重新选择');
  next.coreIndex=index;delete next.coreId;delete next.laterIds;
 }else if(field==='later'){
  const id=Number(value),selected=current.selectedLaterIds||[];
  if(!Number.isInteger(id)||!current.laterOptions.some(o=>o.items.some(i=>Number(i.id)===id)))throw Error('后期备选已变化，请重新选择');
  if(!selected.includes(id)&&selected.length>=(current.support?1:2))throw Error('后期装备位已满，请先取消一件备选');
  next.laterIds=selected.includes(id)?selected.filter(i=>i!==id):[...selected,id];
 }else if(field==='rune'){
  if(!current.runeOptions.some(o=>o.id===value))throw Error('符文方案已变化，请重新选择');
  next.runeId=value;
 }else if(field==='skill'){
  if(value&&!current.skillChoices.some(o=>o.id===value))throw Error('加点方案已变化，请重新选择');
  next.skillId=value||undefined;
 }else if(field==='condition'){
  if(!['ad','ap','control','heal','burst'].includes(value))throw Error('不支持的对线条件');
  const conditions=selection.conditions||[];
  next.conditions=conditions.includes(value)?conditions.filter(c=>c!==value):[...conditions,value];
 }else throw Error('不支持的方案调整');
 const build=getBuild(champion,next.role,data,next);
 return {...next,laterIds:build.selectedLaterIds,coreIndex:build.selectedCoreIndex,coreId:build.selectedCoreId||undefined,loadoutId:build.loadoutId,runeId:build.selectedRuneId||undefined,skillId:build.selectedSkillId||undefined};
}
