import {discoverClient,lcuRequest,writeRunePage,sanitizeSession} from './lcu.mjs';
import {importItemSet} from './item-sets.mjs';
import {validateRunePage} from '../src/core/builds.mjs';
import {validateItemSet} from '../src/core/item-sets.mjs';
import {validateSummonerIds,summonerOptions} from '../src/core/summoner-selection.mjs';
import {runeWriteContext,validateRuneWriteContext,sameRuneWriteContext,champSelectGameId} from '../src/core/rune-context.mjs';
import {normalizeChampionIds} from '../src/core/pick-eligibility.mjs';
import {sanitizeGame,identifyMode} from '../src/core/game-mode.mjs';

// One explicit click, only this player's public selection. Never lock or ban.
// Interface reference: LeagueAkari 5109b2f7, league-client/champ-select.ts.
export function validateClientPreparation(value,data){
 const champion=data.champions.find(c=>c.id===value?.champion),context=validateRuneWriteContext(value?.context);
 if(!champion||!['top','jungle','mid','bottom','support'].includes(value.role)||value.mode!=='rift'||context.phase!=='ChampSelect')throw Error('请在峡谷选人阶段核对英雄、位置和方案');
 const sessionGameId=String(value.sessionGameId||'');
 if(!/^[1-9]\d{0,19}$/.test(sessionGameId)||context.gameId&&context.gameId!==sessionGameId)throw Error('尚未确认本局编号，请同步客户端后重试');
 if(!validateRunePage(value.page,data.runes))throw Error('当前符文页不可用，请重新选择方案');
 const summoners=validateSummonerIds(value.summoners,'rift');
 if(!summoners||!summoners.every(id=>summonerOptions(data,'rift').includes(id)))throw Error('当前召唤师技能不可用');
 const itemSet=validateItemSet(value.itemSet,data);
 if(itemSet.associatedChampions[0]!==champion.key||itemSet.associatedMaps[0]!==11||itemSet.uid!==`rift-buddy-${champion.key}-${value.role}-rift`)throw Error('装备集与当前英雄、位置不一致');
 return {champion:champion.id,championId:champion.key,role:value.role,mode:'rift',context,sessionGameId,
  page:{name:champion.name,primaryStyleId:value.page.primaryStyleId,subStyleId:value.page.subStyleId,selectedPerkIds:[...value.page.selectedPerkIds]},
  summoners:[...summoners],preserveFlashSlot:value.preserveFlashSlot!==false,preselectOnly:value.preselectOnly===true,itemSet};
}
export async function prepareClientSelection({value,data,installPath='',ownedPageId},{discover=discoverClient,request=lcuRequest,writeRunes=writeRunePage,writeItems=importItemSet}={}){
 const selected=validateClientPreparation(value,data),auth=await discover(installPath);
 if(!auth?.port)throw Error('请先连接客户端并完成连接授权');
 const read=async()=>{
  if(await request(auth,'/lol-gameflow/v1/gameflow-phase')!=='ChampSelect')throw Error('已离开选人阶段，请在客户端核对');
  const game=sanitizeGame(await request(auth,'/lol-gameflow/v1/session'));
  if(identifyMode(game).id!=='rift')throw Error('当前模式尚不支持客户端预选并配置');
  const raw=await request(auth,'/lol-champ-select/v1/session'),session=sanitizeSession(raw),gameId=champSelectGameId(session,game);
  if(gameId!==selected.sessionGameId)throw Error('选人会话已变化，请同步客户端后重试');
  const context=runeWriteContext({connected:true,phase:'ChampSelect',session,game}),own=raw.myTeam?.find(p=>p.cellId===session.localPlayerCellId);
  const actions=(Array.isArray(raw.actions)?raw.actions:[]).flat().filter(a=>a?.type==='pick'&&a.actorCellId===session.localPlayerCellId);
  if(!own||actions.length!==1||!Number.isSafeInteger(actions[0].id)||actions[0].id<0)throw Error('未能确认本人的选人操作，请同步后重试');
  return {context,session,own,action:actions[0],timer:raw.timer?.phase};
 };
 const initial=await read();
 if(!sameRuneWriteContext(initial.context,selected.context))throw Error('选人对象已变化，尚未操作；请核对后重新点击');
 const locked=initial.action.completed===true;
 if(locked&&initial.own.championId!==selected.championId)throw Error('客户端已锁定其他英雄，不能预选这位英雄');
 if(!locked&&initial.timer!=='PLANNING'&&initial.action.isInProgress!==true)throw Error('请在预选阶段或轮到本人选人时点击，不会自动等待或锁定');
 const readEligibility=async()=>{
  const pickable=normalizeChampionIds(await request(auth,'/lol-champ-select/v1/pickable-champion-ids'));
  const disabled=normalizeChampionIds(await request(auth,'/lol-champ-select/v1/disabled-champion-ids'));
  if(pickable===null||disabled===null)throw Error('未能确认本局可选范围，尚未预选');
  return {pickable,disabled};
 };
 const assertSelectable=(session,{pickable,disabled})=>{
  const banned=session.bans.includes(selected.championId),taken=session.myTeam.some(p=>p.cellId!==session.localPlayerCellId&&p.championId===selected.championId)||session.allowDuplicatePicks===false&&session.theirTeam.some(p=>p.championId===selected.championId);
  if(!pickable.includes(selected.championId)||disabled.includes(selected.championId)||banned||taken)throw Error('这个英雄本局不可选，请更换推荐');
 };
 if(!locked)assertSelectable(initial.session,await readEligibility());
 const result={champion:selected.champion,gameId:selected.sessionGameId,steps:Object.fromEntries(['hover','runes','spells','items'].map(k=>[k,{status:'pending'}]))};
 let expected=initial.context,confirmedTarget=false;
 const targetMatches=now=>now.action.championId===selected.championId&&typeof now.action.completed==='boolean'&&
  (now.own.championId===selected.championId||now.own.championId===0&&now.action.completed===false&&now.own.championPickIntent===selected.championId);
 const ensure=async()=>{
  const now=await read();
  if(!sameRuneWriteContext(now.context,expected)||now.action.id!==initial.action.id||confirmedTarget&&!targetMatches(now))throw Error('选人对象或阶段已变化，已停止后续配置；请在客户端核对');
  return now;
 };
 const runeRequest=async(auth,route,...args)=>{
  const result=await request(auth,route,...args);
  if(route==='/lol-gameflow/v1/session'&&identifyMode(sanitizeGame(result)).id!=='rift')throw Error('当前模式已变化，已停止符文配置；请在客户端核对');
  if(route==='/lol-champ-select/v1/session'){
   const own=result?.myTeam?.find(p=>p.cellId===initial.context.cellId),actions=(Array.isArray(result?.actions)?result.actions:[]).flat().filter(a=>a?.type==='pick'&&a.actorCellId===initial.context.cellId);
   if(result.localPlayerCellId!==initial.context.cellId||!own||actions.length!==1||actions[0].id!==initial.action.id||!targetMatches({own,action:actions[0]}))throw Error('目标英雄或选人操作已变化，已停止符文配置；请在客户端核对');
  }
  return result;
 };
 let step='hover';
 try{
  // Refresh target availability, then recheck this player's game and action.
  // Unrelated teammates can select or ban without invalidating this click.
  const eligibility=!locked?await readEligibility():null;
  const before=await ensure();
  if(!locked){
   assertSelectable(before.session,eligibility);
   if(before.action.completed===true||before.timer!=='PLANNING'&&before.action.isInProgress!==true)throw Error('选人轮次已变化，尚未预选');
   await request(auth,`/lol-champ-select/v1/session/actions/${before.action.id}`,'PATCH',{championId:selected.championId,completed:false});
  }
  const after=await read();
  if(after.context.cellId!==initial.context.cellId||after.context.assignedPosition!==initial.context.assignedPosition||after.action.id!==initial.action.id||!targetMatches(after))throw Error('客户端未确认目标英雄，已停止配置；请在客户端核对预选');
  expected=after.context;confirmedTarget=true;result.steps.hover={status:'done',locked:after.action.completed===true};
  if(selected.preselectOnly){for(const key of ['runes','spells','items'])result.steps[key]={status:'skipped'};return {...result,preselectOnly:true,complete:true};}
  step='runes';await ensure();
  const rune=await writeRunes({page:selected.page,context:expected,ownedPageId,installPath,trees:data.runes},{discover:async()=>auth,request:runeRequest});
  result.steps.runes={status:'done',pageId:rune.pageId,name:rune.name};
  step='spells';
  const beforeSpells=await ensure(),summoners=[...selected.summoners];
  if(selected.preserveFlashSlot){
   const flashId=Number(data.spells.SummonerFlash.key),current=[beforeSpells.own.spell1Id,beforeSpells.own.spell2Id],currentSlot=current.indexOf(flashId),targetSlot=summoners.indexOf('SummonerFlash');
   if(currentSlot>=0&&targetSlot>=0&&currentSlot!==targetSlot)summoners.reverse();
  }
  const [spell1Id,spell2Id]=summoners.map(id=>Number(data.spells[id].key));
  await request(auth,'/lol-champ-select/v1/session/my-selection','PATCH',{spell1Id,spell2Id});
  await ensure();const spells=await request(auth,'/lol-champ-select/v1/session/my-selection');
  if(spells?.spell1Id!==spell1Id||spells?.spell2Id!==spell2Id)throw Error('客户端未确认召唤师技能，请手动核对');
  result.steps.spells={status:'done',summoners};
  step='items';await ensure();
  const items=await writeItems({itemSet:selected.itemSet,data,installPath},{discover:async()=>auth,request,beforeCommit:ensure});
  result.steps.items={status:'done',title:items.title};
 }catch(error){
  result.steps[step]={status:'failed',message:String(error.message||'操作未完成')};
  for(const value of Object.values(result.steps))if(value.status==='pending')value.status='skipped';
 }
 result.complete=Object.values(result.steps).every(s=>s.status==='done');return result;
}
