import {publicEquipment} from './scoreboard.mjs';
import {getBuild,SHARDS} from './builds.mjs';
import {ROLES,profile} from './rules.mjs';
import {purchasePlan,liveGuideStatus,purchaseAction} from './purchase.mjs';
import {compareAugments} from './hex-compare.mjs';
import {comboStage,playStage,guideMismatch,GUIDE_STAGES,gamePhase} from './guide-stage.mjs';
import {CLIENT_POSITION_ROLES} from './draft.mjs';
import {dataStatus} from './data-status.mjs';
import {assessSituation,chooseSituationTarget,pinnedSituationItem,situationItemIssue,inventoryFulfillsItem} from './live-situation.mjs';
import {recommendSkill} from './skill-advice.mjs';
export {nextSkill} from './skill-advice.mjs';
import {aggregateCombatStats,applyLivePanel,duel} from './live-estimate.mjs';
import {ultimateReference} from './combat-models.mjs';
import {objectiveRhythm,powerWindows} from './live-rhythm.mjs';
import {heroCoach} from './hero-coach.mjs';

const conditions=['ad','ap','control','heal','burst'];
const knownLevel=n=>Number.isInteger(n)&&n>=1&&n<=30;
const combatRangeIssue=(mode,ownLevel,foeLevel)=>mode!=='rift'?'海克斯模式的平衡与强化效果尚未完整核对，暂不显示伤害数字。':ownLevel>18||foeLevel>18?'当前伤害模型仅核对1～18级，19级及以上暂不显示伤害数字；装备与加点参考继续保留。':'';
const hero=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(id);
// Custom duel picks: each side is either a valid champion id or absent
// (half-picked state while the user is still choosing). Champion ids may
// match across teams; each side is resolved against its own public roster.
export function validateDuelPick(value){
 if(!value||typeof value!=='object')return undefined;
 const pick={};
 if(hero(value.own))pick.own=value.own;
 if(hero(value.foe))pick.foe=value.foe;
 return Object.keys(pick).length?pick:undefined;
}
export function validateLoadoutSelection(value){
 const selected={};
 if(value.laterIds!==undefined){if(!Array.isArray(value.laterIds)||value.laterIds.length>2||!value.laterIds.every(Number.isInteger))throw Error('后期备选格式不正确');if(value.mode==='rift')selected.laterIds=[...new Set(value.laterIds)];}
 for(const key of ['loadoutId','runeId','skillId','coreId','comboId'])if(value[key]!==undefined&&value[key]!==null){
  if(typeof value[key]!=='string'||!/^[a-z0-9-]{1,150}$/.test(value[key]))throw Error('玩法或符文选择格式不正确');
  if(value.mode==='rift'||key==='coreId')selected[key]=value[key];
 }
 return selected;
}
export function validateGuideSelection(value){
 if(!value||!hero(value.id)||!ROLES.some(r=>r.id===value.role)||!['rift','hex'].includes(value.mode))throw Error('请先选择英雄、位置和模式');
 if(value.coreIndex!==undefined&&(!Number.isInteger(value.coreIndex)||value.coreIndex<0||value.coreIndex>14))throw Error('核心方案格式不正确');
 if(value.conditions!==undefined&&(!Array.isArray(value.conditions)||value.conditions.length>5||!value.conditions.every(c=>conditions.includes(c))))throw Error('局势选项格式不正确');
 if(value.augmentIds!==undefined&&(!Array.isArray(value.augmentIds)||value.augmentIds.length>5||!value.augmentIds.every(Number.isInteger)))throw Error('强化备选格式不正确');
 for(const [key,max] of [['compareIds',3],['ownedAugmentIds',6]])if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>max||!value[key].every(Number.isInteger)))throw Error('强化比较格式不正确');
 const focus={};for(const key of ['threatId','protectId'])if(value[key]){if(!hero(value[key]))throw Error('局势关注英雄格式不正确');if(value.mode==='rift')focus[key]=value[key];}
 if(value.combatFocus!==undefined&&!['lane','teamfight'].includes(value.combatFocus))throw Error('局势关注格式不正确');if(value.mode==='rift'&&value.combatFocus)focus.combatFocus=value.combatFocus;
 return {id:value.id,role:value.role,mode:value.mode,coreIndex:value.coreIndex||0,conditions:[...new Set(value.conditions||[])],...focus,...validateLoadoutSelection(value),augmentIds:value.mode==='hex'?[...new Set(value.augmentIds||[])]:[],...(value.mode==='hex'&&value.compareIds?.length?{compareIds:[...new Set(value.compareIds)]}:{}),...(value.mode==='hex'&&value.ownedAugmentIds?.length?{ownedAugmentIds:[...new Set(value.ownedAugmentIds)]}:{})};
}
export function validateGuideState(value){
 if(!value)return null;
 const selection=validateGuideSelection(value.selection);
 const completedItems=Array.isArray(value.completedItems)?[...new Set(value.completedItems.filter(id=>typeof id==='string'&&/^\d{1,8}$/.test(id)))].slice(0,6):[];
 const b=value.bounds,bounds=b&&Number.isInteger(b.x)&&Math.abs(b.x)<30000&&Number.isInteger(b.y)&&Math.abs(b.y)<30000&&Number.isInteger(b.width)&&b.width>=360&&b.width<=640&&Number.isInteger(b.height)&&b.height>=480&&b.height<=1000?{x:b.x,y:b.y,width:b.width,height:b.height}:null;
 const m=value.match,match=m&&typeof m==='object'?{...(typeof m.phase==='string'&&m.phase.length<40?{phase:m.phase}:{}),...(m.entered===true?{entered:true}:{}),...(/^\d{1,20}$/.test(String(m.gameId||''))?{gameId:String(m.gameId)}:{}),...(Number.isFinite(m.gameTime)&&m.gameTime>=0&&m.gameTime<1e6?{gameTime:m.gameTime}:{}),...(Number.isFinite(m.liveAt)&&m.liveAt>0?{liveAt:m.liveAt}:{})}:null;
 const duelPick=validateDuelPick(value.duelPick);
 const targetKind=value.purchaseTargetKind==='situation'&&/^\d{1,8}$/.test(value.purchaseTarget||'')?{purchaseTargetKind:'situation'}:{};
 return {selection,completedItems,collapsed:value.collapsed===true,ball:value.ball===true,clickThrough:value.clickThrough!==false,liveAdvice:value.liveAdvice!==false,opacity:[0.65,0.85,1].includes(value.opacity)?value.opacity:1,...(bounds?{bounds}:{}),...(match?{match}:{}),...(/^\d{1,8}$/.test(value.purchaseTarget||'')?{purchaseTarget:value.purchaseTarget,...targetKind}:{}),...(GUIDE_STAGES.some(([id])=>id===value.stage)&&value.stage!=='auto'?{stage:value.stage}:{}),...(duelPick?{duelPick}:{})};
}
export function guideIdentity(selection){
 const s=validateGuideSelection(selection);
 return [s.id,s.role,s.mode].join(':');
}
export function selectGuide(previous,selection){
 const next=validateGuideSelection(selection);
 const same=previous&&guideIdentity(previous.selection)===guideIdentity(next);
 return {selection:next,completedItems:same?[...previous.completedItems]:[],collapsed:previous?.collapsed??false,ball:previous?.ball===true,clickThrough:previous?.clickThrough??true,liveAdvice:previous?.liveAdvice!==false,opacity:previous?.opacity||1,...(previous?.bounds?{bounds:previous.bounds}:{}),...(previous?.match?{match:{...previous.match}}:{}),...(same&&previous.purchaseTarget?{purchaseTarget:previous.purchaseTarget,...(previous.purchaseTargetKind==='situation'?{purchaseTargetKind:'situation'}:{})}:{}),...(same&&previous.stage?{stage:previous.stage}:{}),...(validateDuelPick(previous?.duelPick)?{duelPick:validateDuelPick(previous.duelPick)}:{})};
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
 const guide={...current,match:next,...(reset?{completedItems:[]} :{}),...(newSession?{clickThrough:true,purchaseTarget:undefined,purchaseTargetKind:undefined,stage:undefined,duelPick:undefined,selection:{...current.selection,compareIds:[],ownedAugmentIds:[],threatId:undefined,protectId:undefined,combatFocus:undefined}}:{})};
 return {guide,reset,changed:reset||next.phase!==before.phase||next.gameId!==before.gameId||next.entered!==before.entered};
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
 const mismatch=guideMismatch(s,current),liveStatus=mismatch?{matched:false,kind:mismatch,reason:mismatch==='role'?'当前位置已变化，请换入当前英雄与位置':'当前选择与这份方案不同，请重新确认'}:liveGuideStatus(live,s),matched=liveStatus.matched;
 const inventoryKnown=matched&&live.inventoryKnown!==false,inventory=inventoryKnown&&Array.isArray(live?.inventory)?live.inventory:[],purchase=purchasePlan(route,data.items,inventory,inventoryKnown?live.gold:null);
 const autoCompletedItems=inventoryKnown?purchase.filter(i=>i.owned||inventoryFulfillsItem({data,id:i.id,inventory})).map(i=>i.id):[];
 const runeNames=new Map(data.runes.flatMap(t=>t.slots.flatMap(slot=>slot.runes.map(r=>[r.id,r.name]))));
 const referenceIds=build.reference?.augmentIds||[];
 const augmentIds=s.augmentIds.length?s.augmentIds:referenceIds.slice(0,5);
 const augments=augmentIds.map(id=>data.augments.find(a=>a.id===id)).filter(Boolean).map(a=>({id:a.id,name:a.name,rarity:a.rarity,description:a.description,status:a.descriptionStatus||'complete'}));
 const itemIssue=i=>inventoryKnown?situationItemIssue({data,id:i.id,inventory}):null;
 const routeBlocked=route.filter(i=>!autoCompletedItems.includes(i.id)&&itemIssue(i)).map(i=>({id:i.id,name:i.name,reason:itemIssue(i)}));
 const targetBlockedReason=guide.purchaseTarget?itemIssue({id:guide.purchaseTarget}):null;
 const mainNext=route.find(i=>!(matched?autoCompletedItems:completedItems).includes(i.id)&&!itemIssue(i))||null;
 const situation=assessSituation({data,champion:champion.id,build,selection:s,live:matched?{...live,inventory}:null,enabled:guide.liveAdvice});
 const pinned=guide.purchaseTargetKind==='situation'?pinnedSituationItem({data,id:guide.purchaseTarget,mode:s.mode,champion:champion.id,inventory:matched?inventory:[]}):null;
 const choices=[...new Map([...route,...build.early.map(item),...situation.candidates.map(c=>item(data.items[c.id])),...(pinned?[item(pinned)]:[])].map(i=>[i.id,i])).values()];
 const shoppingTargets=choices.map(i=>({...i,kind:i.id===String(build.boots)?'鞋子':validIds.has(i.id)?'路线成装':build.early.some(early=>String(early.id)===i.id)?'提前应对':'局势备选',owned:inventoryKnown&&(inventoryFulfillsItem({data,id:i.id,inventory})||purchasePlan([i],data.items,inventory,live.gold)[0].owned),blockedReason:itemIssue(i)}));
 const chosen=shoppingTargets.find(i=>i.id===guide.purchaseTarget&&!i.owned&&!i.blockedReason&&(matched||!completedItems.includes(i.id)));
 // Route-wide allocation is retained for display, but earlier blocked goals
 // must not reserve the components needed for the actual next purchase.
 const mainPurchase=inventoryKnown&&mainNext?purchasePlan([mainNext],data.items,inventory,live.gold):[];
 const suggested=inventoryKnown&&!targetBlockedReason?chooseSituationTarget({situation,mainNext,purchase:mainPurchase,gold:live.gold}):null;
 const next=chosen||(suggested?choices.find(i=>i.id===suggested.id):null)||mainNext,targetPlan=next?purchasePlan([next],data.items,inventory,inventoryKnown?live.gold:null)[0]:null;
 const liveModel=matched?{matched:true,inventoryKnown,gold:live.gold,level:live.level,skills:live.skills,inventory:live.inventory,gameTime:live.gameTime,mapId:live.mapId,queueId:live.queueId,objectives:live.objectives,at:live.at}:liveStatus;
 const skillAdvice=recommendSkill({champion:champion.id,role:s.role,priority:build.priority,first:build.first,order:build.skillOrder,live:liveModel,signals:situation.signals,custom:!!build.combo||build.loadoutId!=='default'||!!s.skillId&&s.skillId!==build.skillChoices[0]?.id,reviewed:!situation.stale});
 const nextCandidate=situation.candidates.find(c=>c.id===next?.id);
 const nextReason=nextCandidate?.reason||`${chosen?'保留你选择的回城目标。'+(pinned?'当前公开数据不再触发这项自动建议，你仍可手动保留或更换。':''):'继续你选择的成装方案。'}${targetPlan?.credit?`已持有组件抵扣约 ${targetPlan.credit} 金，优先利用已有投入。`:''}`;
 const ownChampion=data.champions.find(c=>c.id===s.id);
 const enemySnapshots=matched&&Array.isArray(live.enemies)?live.enemies:[];
 const allySnapshots=matched&&Array.isArray(live.allies)?live.allies:[];
 const duelOptions=matched?{
  own:[{id:s.id,name:champion.name,self:true},...allySnapshots.map(a=>({id:a.id,name:a.name}))],
  foe:enemySnapshots.map(t=>({id:t.id,name:t.name}))}:null;
 const targetId=s.threatId||guide.duelPick?.foe,selectedOpponent=enemySnapshots.find(t=>t.id===targetId);
 const combatUnavailable=matched?combatRangeIssue(s.mode,live.level,selectedOpponent?.level):'';
 const ultimate=inventoryKnown&&!combatUnavailable?ultimateReference({champion:ownChampion,level:live.level,skills:live.skills,panel:live.stats,patch:data.patch,mode:s.mode}):null;
 const estimate=inventoryKnown&&!combatUnavailable&&ownChampion&&Number.isInteger(live.level)&&live.level>=1&&live.level<=18&&enemySnapshots.length?(()=>{
  // A reported panel field already contains items/runes/buffs. Only missing
  // fields use the public-inventory fallback, without adding stats twice.
  const computed=aggregateCombatStats(ownChampion,live.level,live.inventory||[],data,{attackType:live.attackType,mode:s.mode});
  const panel=applyLivePanel(ownChampion,live.level,live.stats,computed),ownAgg=panel.agg;
  const duels=enemySnapshots.map(target=>{
   const enemyChampion=data.champions.find(c=>c.id===target.id);
   if(!enemyChampion||target.itemsKnown===false||!Number.isInteger(target.level)||target.level<1||target.level>18)return null;
   const book=data.spellbook&&Object.keys(data.spellbook).length?data.spellbook:null;
   return duel(ownChampion,live.level,ownAgg,live.skills,enemyChampion,target.level,data,target.items||[],book);
  }).filter(Boolean).sort((a,b)=>b.killTheirs-a.killTheirs||a.enemy.id.localeCompare(b.enemy.id));
  if(!duels.length)return null;
  const selected=duels.find(d=>d.enemy.id===targetId),primary=selected||duels[0];
  const curHp=Number.isFinite(live.stats?.hp)?Math.floor(live.stats.hp):null;
  // Public enemy skill ranks and cooldowns are unavailable. A generic damage
  // formula crossing our health is not evidence for a lethal warning.
  const warningEnemies=[];
  return {enemy:primary.enemy,edge:primary.edge,killThreshold:primary.killMine,theirKill:primary.killTheirs,duels,
   approx:true,targetSelected:!!selected,targetMissing:!!targetId&&!selected,liveReal:panel.live,mineSkillBasis:primary.mineSkillBasis,mineWindow:primary.mineWindow,mineShort:primary.mineShort,curHp,danger:false,warningEnemies,windowSeconds:6,at:live.at};
 })():null;
 const action=inventoryKnown?purchaseAction(targetPlan,next,live.gold,inventory):null;
 // Custom duel simulator: the user picks one ally side and one enemy side
 // from the live scoreboard feed. Self reuses the live panel; a picked ally
 // falls back to visible items and a disclosed total-skill-point heuristic.
 const customDuel=matched&&ownChampion&&guide.duelPick?.own&&guide.duelPick?.foe?(()=>{
  const book=data.spellbook&&Object.keys(data.spellbook).length?data.spellbook:null;
  const foeSnap=enemySnapshots.find(t=>t.id===guide.duelPick.foe);
  const foeChamp=foeSnap&&data.champions.find(c=>c.id===foeSnap.id);
  if(!foeChamp||foeSnap.itemsKnown===false||!knownLevel(foeSnap.level))return {pick:{...guide.duelPick},unresolved:true};
  const foeLevel=foeSnap.level;
  const foeIssue=combatRangeIssue(s.mode,null,foeLevel);
  if(foeIssue)return {pick:{...guide.duelPick},unresolved:true,reason:foeIssue};
  let ownChamp,ownLevel,ownAgg,ownSkills,ownSelf;
  if(guide.duelPick.own===s.id){
   if(!knownLevel(live.level)||!inventoryKnown)return {pick:{...guide.duelPick},unresolved:true};
   ownChamp=ownChampion;ownLevel=live.level;
   const ownIssue=combatRangeIssue(s.mode,ownLevel,foeLevel);
   if(ownIssue)return {pick:{...guide.duelPick},unresolved:true,reason:ownIssue};
   const computed=aggregateCombatStats(ownChampion,ownLevel,live.inventory||[],data,{attackType:live.attackType,mode:s.mode});
   ownAgg=applyLivePanel(ownChampion,ownLevel,live.stats,computed).agg;
   ownSkills=live.skills;ownSelf=true;
  }else{
   const allySnap=allySnapshots.find(a=>a.id===guide.duelPick.own);
   ownChamp=allySnap&&data.champions.find(c=>c.id===allySnap.id);
   if(!ownChamp||allySnap.itemsKnown===false||!knownLevel(allySnap.level))return {pick:{...guide.duelPick},unresolved:true};
   ownLevel=allySnap.level;
   const ownIssue=combatRangeIssue(s.mode,ownLevel,foeLevel);
   if(ownIssue)return {pick:{...guide.duelPick},unresolved:true,reason:ownIssue};
   ownAgg=aggregateCombatStats(ownChamp,ownLevel,allySnap.items||[],data,{mode:s.mode});
   ownSkills=null;ownSelf=false;
  }
  const d=duel(ownChamp,ownLevel,ownAgg,ownSkills,foeChamp,foeLevel,data,foeSnap.items||[],book);
  return {pick:{own:ownChamp.id,foe:foeChamp.id},
   own:{id:ownChamp.id,name:ownChamp.name,level:Number.isInteger(ownLevel)?ownLevel:null,self:ownSelf},
   foe:{id:foeChamp.id,name:foeChamp.name,level:foeSnap.level},
   edge:d.edge,killMine:d.killMine,killTheirs:d.killTheirs,
   approx:!!d.approx||!ownSelf,
   skillsNote:ownSelf?'对方技能按等级总点数近似':'双方技能按等级总点数近似',
   at:live.at};
 })():null;
 return {selection:s,champion:{id:champion.id,name:champion.name,title:champion.title},version:data.version,role:ROLES.find(r=>r.id===s.role).name,mode:s.mode,matchId:guide.match?.gameId||null,
  start:build.start.map(item),granted:(build.granted||[]).map(item),early:build.early.map(item),route,completedItems,autoCompletedItems,purchase,next,targetPlan,shoppingTargets,purchaseTarget:chosen?.id||'',targetFallback:!!guide.purchaseTarget&&!chosen,action,
  phase:s.mode==='rift'?gamePhase({...liveModel,role:s.role},action,next||null):null,
  objectives:s.mode==='rift'?objectiveRhythm({live:liveModel,role:s.role,patch:data.patch}):null,
  powers:s.mode==='rift'?powerWindows({champion:s.id,role:s.role,live:liveModel,data,route}):null,
  coach:s.mode==='rift'?heroCoach({data,champion,role:s.role,priority:build.priority,enemyId:selectedOpponent?.id,combo:build.combo,focus:s.combatFocus,stage:playStage(liveModel,guide.stage||'auto')}):null,
  equipment:publicEquipment(data,matched?live:null),estimate,combatUnavailable,ultimateReference:ultimate,customDuel,duelPick:guide.duelPick||null,duelOptions,routeBlocked,targetBlockedReason,
  live:liveModel,nextSkill:skillAdvice.next,skillAdvice,situation,nextReason,nextCaution:nextCandidate?.caution||'静态价格与合成条件以游戏商店为准。',liveAdvice:guide.liveAdvice,automaticTarget:!!(!chosen&&suggested&&suggested.id===next?.id),
  priority:build.priority,first:build.first,skillOrder:build.skillOrder,skillNote:build.selectedSkill?.when,skillMechanism:build.skillMechanism,skillTitle:build.selectedSkill?.name,skillSource:build.selectedSkill?.source||'机制整理',summoners:build.summoners.map(id=>({id,name:data.spells[id].name})),
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
