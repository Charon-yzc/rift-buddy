export const TEXT_SCALES=[1,1.1,1.25];
export const GUIDE_MODULES=[
 ['purchase','回城购买','组件、所需金币和完整路线'],
 ['skills','技能加点','当前技能点、下一步和加点依据'],
 ['situation','局势应对','公开装备信号与可选应对'],
 ['scoreboard','双方装备','公开装备价值、回血与重伤覆盖'],
 ['rhythm','节奏提醒','当前阶段的行动参考'],
 ['team','组合配合','已准备组合的职责和行动窗口'],
];
const moduleIds=GUIDE_MODULES.map(([id])=>id);
export function normalizePresentation(value){
 return {textScale:TEXT_SCALES.includes(value?.textScale)?value.textScale:1,
  guideModules:Array.isArray(value?.guideModules)?[...new Set(value.guideModules.filter(id=>moduleIds.includes(id)))]:[...moduleIds]};
}
export function changePresentation(current,change){
 const next=normalizePresentation(current);
 if(!change||typeof change!=='object')throw Error('界面设置格式不正确');
 const {field,value}=change;
 if(field==='reset')return normalizePresentation(null);
 if(field==='textScale'){
  if(!TEXT_SCALES.includes(value))throw Error('字号选项不正确');
  return {...next,textScale:value};
 }
 if(!moduleIds.includes(value))throw Error('指引模块不正确');
 if(field==='toggleModule')return {...next,guideModules:next.guideModules.includes(value)?next.guideModules.filter(id=>id!==value):[...next.guideModules,value]};
 if(field==='moveUp'||field==='moveDown'){
  const index=next.guideModules.indexOf(value),other=index+(field==='moveUp'?-1:1);
  if(index>=0&&other>=0&&other<next.guideModules.length)[next.guideModules[index],next.guideModules[other]]=[next.guideModules[other],next.guideModules[index]];
  return next;
 }
 throw Error('界面设置操作不正确');
}
