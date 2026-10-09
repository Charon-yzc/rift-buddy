import {changeSummonerSlot} from './summoner-selection.mjs';
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
 const manual=slots.find(s=>s.manualPosition&&s.clientCellId===session.localPlayerCellId)||slots.find(s=>s.champion===champion.id&&!Number.isInteger(s.clientCellId));
 const preferred=ROLES.some(r=>r.id===soloRole)?soloRole:null;
 return {selection:{id:champion.id,role:manual?.role||assigned||preferred||profile(champion).roles[0],mode},positionKnown:!!(assigned||manual||preferred)};
}

// Inline controls edit the same preparation as the drawer and in-game guide.
export function changeCompanionPlan(data,selection,field,value){
 const champion=data.champions.find(c=>c.id===selection.id);
 if(!champion)throw Error('英雄资料已变化，请重新选择');
 const current=getBuild(champion,selection.role,data,selection),next={...selection};
 if(field.startsWith('summoner-')){
  if(field==='summoner-reset')delete next.summonerIds;
  else if(field==='summoner-swap'){
   if(current.summoners.length!==2)throw Error('当前召唤师技能资料不完整');
   next.summonerIds=[...current.summoners].reverse();
  }else next.summonerIds=changeSummonerSlot(data,selection.mode,current.summoners,field.slice(9),value);
 }else if(field==='quest-plan'){
  if(selection.mode!=='rift'||selection.role!=='bottom')throw Error('任务后额外装备计划只适用于峡谷下路');
  next.bottomQuestPlan=!selection.bottomQuestPlan;if(!next.bottomQuestPlan)next.laterIds=(next.laterIds||[]).slice(0,2);
 }else if(field==='loadout'){
  if(value!=='default'&&!current.loadoutOptions.some(o=>o.id===value))throw Error('玩法已变化，请重新选择');
  next.loadoutId=value;next.coreIndex=0;delete next.coreId;delete next.runeId;delete next.skillId;next.laterIds=[];
 }else if(field==='core'){
  const index=Number(value);
  if(!Number.isInteger(index)||index<0||!current.reference?.core[index])throw Error('装备路线已变化，请重新选择');
  next.coreIndex=index;next.coreId='core-'+current.reference.core[index].items.join('-');next.laterIds=[];
 }else if(field==='start'||field==='boots'){
  const key=field==='start'?'startId':'bootsId',options=field==='start'?current.startOptions:current.bootsOptions;
  if(value&&!options.some(o=>o.id===value))throw Error('出门装或鞋子选项已变化，请重新选择');
  if(value)next[key]=value;else delete next[key];
 }else if(field==='later'){
  const id=Number(value),selected=Array.isArray(selection.laterIds)?selection.laterIds:current.selectedLaterIds||[];
  if(!Number.isInteger(id)||!selected.includes(id)&&!current.laterOptions.some(o=>o.items.some(i=>Number(i.id)===id)))throw Error('后期备选已变化，请重新选择');
  if(!selected.includes(id)&&selected.length>=current.maxLaterItems)throw Error('后期装备位已满，请先取消一件备选');
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
 // Display fallbacks are temporary. Only the edited field (and its explicit
 // dependants above) belongs to this change; unavailable saved choices remain.
 return next;
}
