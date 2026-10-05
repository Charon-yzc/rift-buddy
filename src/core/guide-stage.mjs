export const GUIDE_STAGES=[['auto','自动阶段'],['opening','开局 / 对线'],['key','关键配合'],['later','后期团战']];
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
