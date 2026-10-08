export const GUIDE_STAGES=[['auto','自动阶段'],['opening','开局 / 对线'],['key','关键配合'],['later','后期团战']];
export const GAME_PHASES={lane:'对线期',mid:'中期节奏',late:'后期团战'};
// Game-clock rhythm tips, independent from the combo stage above. Times are
// soft windows ("around"), not promises about objective spawns.
export function gamePhase(live,action=null,next=null){
 const t=typeof live?.gameTime==='number'?live.gameTime:NaN;
 if(!live?.matched||!Number.isFinite(t)||t<0)return null;
 const id=t<840?'lane':t<1500?'mid':'late';
 const tips=[];
 if(id==='lane')tips.push(live.role==='jungle'?'刷野与抓人先看队友兵线，回城前确认附近资源。':live.role==='support'?'与搭档一起处理兵线，再找插眼和回城时机。':'补刀与换血先看兵线，回城前尽量把线处理到安全位置。');
 else if(id==='mid')tips.push('先确认兵线与队友位置，再决定回城或靠近资源。');
 else tips.push('后期：大龙视野先行，抱团前先排视野，别单独过河。');
 // The feed has no objective timers or safe recall window. Do not invent one
 // from the match clock, or confuse an affordable component with its final item.
 const shortfall=action?.shortfall==null?NaN:Number(action.shortfall);
 const gold=live?.gold==null?NaN:Number(live.gold);
 if(Number.isFinite(gold)&&gold>=0){
  const name=action?.name||next?.name||'目标装备';
  if(action?.kind==='space')tips.push('背包已满，先确认能否合成或腾出装备格。');
  else if(action?.kind==='upgrade')tips.push('已持有基础装备，升级条件请看游戏任务与商店。');
  else if(shortfall===0)tips.push(`当前金币可买${name}${action?.kind==='component'?'组件':''}，回城时可考虑。`);
  else if(shortfall>0&&shortfall<=300)tips.push(`距${name}还差约${shortfall}金，回城前确认兵线和安全。`);
 }
 return {id,label:GAME_PHASES[id],tips,at:live.at??null};
}
export function comboStage(combo,live,choice='auto'){
 if(!combo)return null;
 const automatic=choice==='auto';
 const known=!!live?.matched&&Number.isFinite(live.gameTime);
 const id=automatic?(known?(live.gameTime>=900?'later':live.level>=6?'key':'opening'):'key'):choice;
 const label=GUIDE_STAGES.find(([key])=>key===id)?.[1]||'关键配合';
 const text=id==='opening'?(combo.early||combo.plan):id==='later'?[combo.ownJob||combo.plan,combo.economy,combo.risk].filter(Boolean).join('；'):[combo.ownJob||combo.plan,combo.window].filter(Boolean).join('；');
 return {id,label,text,automatic,known,note:automatic?(known?'按自己的等级与时间切换；不判断队友技能是否就绪':'阶段未读取，展示配合参考；可以手动切换'):'你手动选择的阶段'};
}
export function guideMismatch(selection,current){
 if(!current)return null;
 if(selection.id!==current.id)return 'champion';
 if(selection.mode!==current.mode)return 'mode';
 if(current.positionKnown&&selection.role!==(current.formalRole||current.role))return 'role';
 if(selection.comboId&&current.comboKnown&&selection.comboId!==current.comboId)return 'combo';
 return null;
}
