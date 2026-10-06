export const GUIDE_STAGES=[['auto','自动阶段'],['opening','开局 / 对线'],['key','关键配合'],['later','后期团战']];
export const GAME_PHASES={lane:'对线期',mid:'中期节奏',late:'后期团战'};
// Game-clock rhythm tips, independent from the combo stage above. Times are
// soft windows ("around"), not promises about objective spawns.
export function gamePhase(live,action=null,next=null){
 const t=typeof live?.gameTime==='number'?live.gameTime:NaN;
 if(!live?.matched||!Number.isFinite(t)||t<0)return null;
 const id=t<300?'lane':t<1200?'mid':'late';
 const tips=[];
 if(id==='lane')tips.push('对线期：补刀优先，换血注意小兵仇恨，别在对方兵堆里硬拼。');
 else if(id==='mid')tips.push('中期：推完线再游走，先处理兵线再碰中立资源。');
 else tips.push('后期：大龙视野先行，抱团前先排视野，别单独过河。');
 // Objective windows live outside the phase branches so the pre-fight half
 // ([1140,1200) for Baron) is never swallowed by a branch boundary.
 if(t>=180&&t<360)tips.push('第一条小龙刷新前后，顺手补河道视野并沟通落位。');
 if(t>=780&&t<960)tips.push('峡谷先锋团前后，别独自在边路深带。');
 if(t>=1140&&t<1260)tips.push('大龙出生前后，正面先落位再开视野。');
 const shortfall=action?.shortfall==null?NaN:Number(action.shortfall);
 const gold=live?.gold==null?NaN:Number(live.gold);
 if(Number.isFinite(gold)&&gold>=0){
  if(shortfall===0)tips.push(`钱够${next?.name||'下一件'}了，找机会回城。`);
  else if(shortfall>0&&shortfall<=300)tips.push(`还差约${shortfall}金，推完这波线就回。`);
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
