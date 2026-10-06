import {getBuild,SHARDS} from './builds.mjs';
import {ROLES,profile} from './rules.mjs';
import {purchasePlan,liveGuideStatus,purchaseAction} from './purchase.mjs';
import {compareAugments} from './hex-compare.mjs';
import {comboStage,guideMismatch,GUIDE_STAGES,gamePhase} from './guide-stage.mjs';
import {CLIENT_POSITION_ROLES} from './draft.mjs';
import {dataStatus} from './data-status.mjs';
import {aggregateCombatStats,applyLivePanel,duel} from './live-estimate.mjs';

const conditions=['ad','ap','control','heal','burst'];
const hero=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(id);
export function validateLoadoutSelection(value){
 const selected={};
 for(const key of ['loadoutId','runeId','comboId'])if(value[key]!==undefined&&value[key]!==null){
  if(typeof value[key]!=='string'||!/^[a-z0-9-]{1,150}$/.test(value[key]))throw Error('玩法或符文选择格式不正确');
  if(value.mode==='rift')selected[key]=value[key];
 }
 return selected;
}
export function validateGuideSelection(value){
 if(!value||!hero(value.id)||!ROLES.some(r=>r.id===value.role)||!['rift','hex'].includes(value.mode))throw Error('请先选择英雄、位置和模式');
 if(value.coreIndex!==undefined&&(!Number.isInteger(value.coreIndex)||value.coreIndex<0||value.coreIndex>2))throw Error('核心方案格式不正确');
 if(value.conditions!==undefined&&(!Array.isArray(value.conditions)||value.conditions.length>5||!value.conditions.every(c=>conditions.includes(c))))throw Error('局势选项格式不正确');
 if(value.augmentIds!==undefined&&(!Array.isArray(value.augmentIds)||value.augmentIds.length>5||!value.augmentIds.every(Number.isInteger)))throw Error('强化备选格式不正确');
 for(const [key,max] of [['compareIds',3],['ownedAugmentIds',6]])if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>max||!value[key].every(Number.isInteger)))throw Error('强化比较格式不正确');
 return {id:value.id,role:value.role,mode:value.mode,coreIndex:value.coreIndex||0,conditions:[...new Set(value.conditions||[])],...validateLoadoutSelection(value),augmentIds:value.mode==='hex'?[...new Set(value.augmentIds||[])]:[],...(value.mode==='hex'&&value.compareIds?.length?{compareIds:[...new Set(value.compareIds)]}:{}),...(value.mode==='hex'&&value.ownedAugmentIds?.length?{ownedAugmentIds:[...new Set(value.ownedAugmentIds)]}:{})};
}
export function validateGuideState(value){
 if(!value)return null;
 const selection=validateGuideSelection(value.selection);
 const completedItems=Array.isArray(value.completedItems)?[...new Set(value.completedItems.filter(id=>typeof id==='string'&&/^\d{1,8}$/.test(id)))].slice(0,6):[];
 const b=value.bounds,bounds=b&&Number.isInteger(b.x)&&Math.abs(b.x)<30000&&Number.isInteger(b.y)&&Math.abs(b.y)<30000&&Number.isInteger(b.width)&&b.width>=360&&b.width<=640&&Number.isInteger(b.height)&&b.height>=480&&b.height<=1000?{x:b.x,y:b.y,width:b.width,height:b.height}:null;
 const m=value.match,match=m&&typeof m==='object'?{...(typeof m.phase==='string'&&m.phase.length<40?{phase:m.phase}:{}),...(m.entered===true?{entered:true}:{}),...(/^\d{1,20}$/.test(String(m.gameId||''))?{gameId:String(m.gameId)}:{}),...(Number.isFinite(m.gameTime)&&m.gameTime>=0&&m.gameTime<1e6?{gameTime:m.gameTime}:{}),...(Number.isFinite(m.liveAt)&&m.liveAt>0?{liveAt:m.liveAt}:{})}:null;
 return {selection,completedItems,collapsed:value.collapsed===true,ball:value.ball===true,clickThrough:value.clickThrough!==false,opacity:[0.65,0.85,1].includes(value.opacity)?value.opacity:1,...(bounds?{bounds}:{}),...(match?{match}:{}),...(/^\d{1,8}$/.test(value.purchaseTarget||'')?{purchaseTarget:value.purchaseTarget}:{}),...(GUIDE_STAGES.some(([id])=>id===value.stage)&&value.stage!=='auto'?{stage:value.stage}:{})};
}
export function guideIdentity(selection){
 const s=validateGuideSelection(selection);
 return [s.id,s.role,s.mode].join(':');
}
export function selectGuide(previous,selection){
 const next=validateGuideSelection(selection);
 const same=previous&&guideIdentity(previous.selection)===guideIdentity(next);
 return {selection:next,completedItems:same?[...previous.completedItems]:[],collapsed:previous?.collapsed??true,ball:previous?.ball===true,clickThrough:previous?.clickThrough??true,opacity:previous?.opacity||1,...(previous?.bounds?{bounds:previous.bounds}:{}),...(previous?.match?{match:{...previous.match}}:{}),...(same&&previous.purchaseTarget?{purchaseTarget:previous.purchaseTarget}:{}),...(same&&previous.stage?{stage:previous.stage}:{})};
}
export function reconcileGuide(value,{phase,gameId,live,now=Date.now()}={}){
 const current=validateGuideState(value);if(!current)return {guide:null,reset:false,changed:false};
 const before=current.match||{},next={...before};
 const knownPhase=phase&&phase!=='Offline';
 const fresh=live?.available&&Number.isFinite(live.at)&&now-live.at<=12000&&now>=live.at;
 const matchingLive=fresh&&live.champion===current.selection.id&&live.mode===current.selection.mode;
 const id=/^\d{1,20}$/.test(String(gameId||''))?String(gameId):null;
 const inGame=['InProgress','Reconnect'].includes(phase);
 // Loading can also be part of a reconnect. Remember whether this game was
 // entered, and distinguish a first known id from a changed known id.
 const entered=before.entered===true||['InProgress','Reconnect'].includes(before.phase),changedGame=!!(id&&before.gameId&&id!==before.gameId);
 const externalNewSession=!!(knownPhase&&phase==='ChampSelect'&&before.phase!==phase||inGame&&before.phase&&!entered||changedGame&&(inGame||phase==='GameStart'));
 const newSession=externalNewSession||!!(matchingLive&&Number.isFinite(live.gameTime)&&Number.isFinite(before.gameTime)&&live.gameTime+30<before.gameTime);
 const reset=newSession;
 if(newSession){delete next.liveAt;delete next.gameTime;}
 if(inGame||phase==='GameStart'&&!newSession&&entered)next.entered=true;else if(knownPhase||newSession)delete next.entered;
 if(knownPhase)next.phase=phase;if(id)next.gameId=id;
 if(matchingLive){next.liveAt=live.at;if(Number.isFinite(live.gameTime))next.gameTime=live.gameTime;}
 const guide={...current,match:next,...(reset?{completedItems:[]} :{}),...(newSession?{clickThrough:true,purchaseTarget:undefined,stage:undefined,selection:{...current.selection,compareIds:[],ownedAugmentIds:[]}}:{})};
 return {guide,reset,changed:reset||next.phase!==before.phase||next.gameId!==before.gameId||next.entered!==before.entered};
}
const specialSkills=new Set(['Aphelios','Udyr','Elise','Jayce','Nidalee','Karma']);
export function nextSkill(champion,priority,first,live){
 if(!live?.matched||specialSkills.has(champion)||!Number.isInteger(live.level)||!['Q','W','E','R'].every(k=>Number.isInteger(live.skills?.[k])))return null;
 const ranks=live.skills,unspent=live.level-Object.values(ranks).reduce((a,b)=>a+b,0);
 if(unspent<1)return null;
 const can=k=>k==='R'?ranks.R<[6,11,16].filter(n=>live.level>=n).length:ranks[k]<Math.min(5,Math.ceil(live.level/2));
 const initial=live.level<=3&&typeof first==='string'?first[live.level-1]:null;
 return (can('R')?'R':initial&&can(initial)?initial:[...(priority||'')].find(k=>'QWE'.includes(k)&&can(k)))||null;
}
const clean=v=>String(v??'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/@[^@]+@/g,'〔动态数值〕');
const item=i=>({id:String(i.id),name:i.name,cost:i.gold.total,description:clean(i.description),...(i.purchaseBase?{purchaseBase:{id:String(i.purchaseBase.id),name:i.purchaseBase.name,cost:i.purchaseBase.gold.total}}:{})});
export function createGuideModel(data,value,live=null,current=null){
 const guide=validateGuideState(value);if(!guide)return null;
 const s=guide.selection,champion=data.champions.find(c=>c.id===s.id);
 if(!champion)throw Error('当前资料没有这位英雄，请重新选择');
 const build=getBuild(champion,s.role,data,s);
 const route=build.items.map(item),validIds=new Set(route.map(i=>i.id));
 const completedItems=guide.completedItems.filter(id=>validIds.has(id));
 const mismatch=guideMismatch(s,current),liveStatus=mismatch?{matched:false,kind:mismatch,reason:mismatch==='role'?'当前位置已变化，请换入当前英雄与位置':'当前选择与这份方案不同，请重新确认'}:liveGuideStatus(live,s),matched=liveStatus.matched,inventory=Array.isArray(live?.inventory)?live.inventory:[],purchase=purchasePlan(route,data.items,matched?inventory:[],matched?live.gold:null);
 const autoCompletedItems=matched?purchase.filter(i=>i.owned).map(i=>i.id):[];
 const runeNames=new Map(data.runes.flatMap(t=>t.slots.flatMap(slot=>slot.runes.map(r=>[r.id,r.name]))));
 const referenceIds=build.reference?.augmentIds||[];
 const augmentIds=s.augmentIds.length?s.augmentIds:referenceIds.slice(0,5);
 const augments=augmentIds.map(id=>data.augments.find(a=>a.id===id)).filter(Boolean).map(a=>({id:a.id,name:a.name,rarity:a.rarity,description:a.description,status:a.descriptionStatus||'complete'}));
 const mainNext=route.find(i=>!(matched?autoCompletedItems:completedItems).includes(i.id))||null;
 const choices=[...new Map([...route,...build.early.map(item)].map(i=>[i.id,i])).values()];
 const shoppingTargets=choices.map(i=>({...i,kind:i.id===String(build.boots)?'鞋子':validIds.has(i.id)?'路线成装':'提前应对',owned:matched&&purchasePlan([i],data.items,inventory,live.gold)[0].owned}));
 const chosen=shoppingTargets.find(i=>i.id===guide.purchaseTarget&&!i.owned&&(matched||!completedItems.includes(i.id)));
 const next=chosen||mainNext,targetPlan=next?purchasePlan([next],data.items,matched?inventory:[],matched?live.gold:null)[0]:null;
 const liveModel=matched?{matched:true,gold:live.gold,level:live.level,skills:live.skills,inventory:live.inventory,gameTime:live.gameTime,at:live.at}:liveStatus;
 const ownChampion=data.champions.find(c=>c.id===s.id);
 const enemySnapshots=matched&&Array.isArray(live.enemies)?live.enemies:[];
 const estimate=matched&&ownChampion&&enemySnapshots.length?(()=>{
  const panel=applyLivePanel(ownChampion,live.level||1,live.stats);
  // A live panel already contains items/runes/buffs: adding item stats again
  // would double count. The computed path is only the no-panel fallback.
  const ownAgg=panel.live?panel.agg:aggregateCombatStats(ownChampion,live.level||1,live.inventory||[],data);
  const duels=enemySnapshots.map(target=>{
   const enemyChampion=data.champions.find(c=>c.id===target.id);
   if(!enemyChampion)return null;
   const book=data.spellbook&&Object.keys(data.spellbook).length?data.spellbook:null;
   return duel(ownChampion,live.level||1,ownAgg,live.skills,enemyChampion,target.level||live.level||1,data,target.items||[],book);
  }).filter(Boolean);
  if(!duels.length)return null;
  const primary=duels[0];
  const curHp=Number.isFinite(live.stats?.hp)?Math.floor(live.stats.hp):null;
  return {enemy:primary.enemy,edge:primary.edge,killThreshold:primary.killMine,theirKill:primary.killTheirs,duels,
   approx:duels.some(d=>d.approx),
   liveReal:panel.live,curHp,danger:curHp!==null&&curHp>0&&primary.killTheirs>=curHp,at:live.at};
 })():null;
 const action=matched?purchaseAction(targetPlan,next,live.gold):null;
 return {selection:s,champion:{id:champion.id,name:champion.name,title:champion.title},version:data.version,role:ROLES.find(r=>r.id===s.role).name,mode:s.mode,
  start:build.start.map(item),granted:(build.granted||[]).map(item),early:build.early.map(item),route,completedItems,autoCompletedItems,purchase,next,targetPlan,shoppingTargets,purchaseTarget:chosen?.id||'',targetFallback:!!guide.purchaseTarget&&!chosen,action,
  phase:gamePhase(liveModel,action,next||null),
  live:liveModel,estimate,nextSkill:nextSkill(champion.id,build.priority,build.first,liveModel),
  priority:build.priority,first:build.first,summoners:build.summoners.map(id=>({id,name:data.spells[id].name})),
  runes:build.runePage?.selectedPerkIds.map(id=>({id,name:runeNames.get(id)||SHARDS[id]}))||[],
  title:build.title,runeTitle:build.selectedRune?.name||null,combo:build.combo,comboConfirmed:current?.comboKnown===true&&!mismatch,selectionWarnings:build.selectionWarnings,tips:build.tips,adjustments:build.adjustments,source:build.source,sourceNote:build.sourceNote,sourceUrl:build.reference?.sourceUrl||null,fetchedAt:build.reference?.fetchedAt||null,
  rulesDate:build.rulesDate,stale:build.stale,status:dataStatus(data,build),stage:guide.stage||'auto',stageHint:comboStage(build.combo,liveModel,guide.stage||'auto'),support:build.support,augments,augmentKind:s.augmentIds.length?'我的强化备选':'英雄强化参考',comparison:compareAugments({champion,options:s.compareIds,owned:s.ownedAugmentIds,augments:data.augments,buildKey:build.key}),
  collapsed:guide.collapsed,clickThrough:guide.clickThrough,opacity:guide.opacity,imageOverrides:data.imageOverrides||{}};
}
export function currentPlayerSelection(session,champions,slots=[]){
 if(!session||!Number.isInteger(session.localPlayerCellId))return null;
 const player=session.myTeam?.find(p=>p.cellId===session.localPlayerCellId);
 const champion=champions.find(c=>c.key===player?.championId);if(!champion)return null;
 const assigned=CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()];
 const manual=slots.find(s=>s.champion===champion.id&&(s.manualPosition||!Number.isInteger(s.clientCellId)));
 return {id:champion.id,role:manual?.role||assigned||profile(champion).roles[0],positionKnown:!!(manual||assigned),...(assigned&&manual&&manual.role!==assigned?{formalRole:assigned}:{})};
}
export function phaseLabel(phase){return ({None:'客户端大厅',Lobby:'组队大厅',Matchmaking:'正在匹配',ReadyCheck:'等待确认',ChampSelect:'正在选人',GameStart:'正在加载游戏',InProgress:'游戏进行中',Reconnect:'等待重连',WaitingForStats:'结算中',PreEndOfGame:'即将结算',EndOfGame:'已结束',Offline:'未连接'})[phase]||'客户端已连接';}
