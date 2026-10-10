import {duoPlay} from './duo-plays.mjs';
import {rolePlay,genericRolePlay} from './role-plays.mjs';

const phases={opening:'开局 / 对线',key:'关键配合',later:'后期团战'};
const memberKey=m=>m.role+':'+m.champion;
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);

// Freeze stage decisions with an accepted plan, including the original duo
// stages. Resolving a saved catalog ID must never rewrite this content.
export function capturePlanStages(plan,data,combo=null){
 const duo=combo&&plan.members.length===2?duoPlay(combo,data):null;
 const names=new Map(data.champions.map(c=>[c.id,c.name])),result={};
 for(const [id,label] of Object.entries(phases)){
  const memberJobs=plan.members.map(m=>{
   const original=duo?duoPlay(combo,data,m):null,task=rolePlay(m.champion,m.role,id)||genericRolePlay(m.role,id);
   const job=original?.stages[id]?.ownAction||(id==='key'?plan.ordered.find(p=>memberKey(p)===memberKey(m)).job:task?.action);
   if(!job)return null;
   return {...m,job,patch:original?.patch||(id==='key'?plan.patch:task.patch),reviewedAt:original?.reviewedAt||(id==='key'?(plan.curated?.reviewedAt||plan.shared?.reviewedAt||plan.cooperation?.reviewedAt||plan.createdAt):task.reviewedAt),...(task?.generic&&id!=='key'?{generic:true}:{})};
  });
  if(memberJobs.some(m=>!m))return null;
  const original=duo?.stages[id],patch=duo?.patch||(id==='key'?plan.patch:memberJobs[0].patch),reviewedAt=duo?.reviewedAt||memberJobs[0].reviewedAt;
  const steps=original?.steps||(id==='key'?[...plan.steps]:memberJobs.map(m=>names.get(m.champion)+'：'+m.job));
  const window=original?.window||(id==='key'?plan.window:id==='opening'?'先确认各自兵线或安全营地、已学技能与到位时间；有各自资源任务时先完成，不要求多人空等。':'资源前先处理安全兵线，与核心约同侧进入；关键配合仍须满足原来的技能、距离与落点条件。');
  const exit=original?.exit||(id==='key'?plan.caution:id==='opening'?'生命资源不足、兵线无人接或安全出口断开时取消会合，保各自经验。':'核心被迫退出、保护或关键进场交空、成员分到不同战区就退回接应范围，不为第二个目标丢站位。');
  result[id]={label,patch,reviewedAt,memberJobs,steps:[...steps],window,exit};
 }
 return validatePlanStages(result,plan.members);
}

export function validatePlanStages(value,members){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3)throw Error('保存的阶段分工不完整');
 const result={};
 for(const id of Object.keys(phases)){
  const source=value[id],stage={};
  for(const [field,max] of [['label',40],['patch',30],['reviewedAt',40],['window',1400],['exit',1000]]){if(!text(source?.[field],max))throw Error('保存的阶段条件不完整');stage[field]=source[field];}
  if(!Array.isArray(source.memberJobs)||source.memberJobs.length!==members.length)throw Error('保存的阶段成员不完整');
  stage.memberJobs=source.memberJobs.map((m,i)=>{
   if(!m||memberKey(m)!==memberKey(members[i])||!text(m.job,1000)||!text(m.patch,30)||!text(m.reviewedAt,40)||m.generic!==undefined&&m.generic!==true)throw Error('保存的阶段分工与成员不一致');
   return {...members[i],job:m.job,patch:m.patch,reviewedAt:m.reviewedAt,...(m.generic?{generic:true}:{})};
  });
  if(!Array.isArray(source.steps)||!source.steps.length||source.steps.length>6||!source.steps.every(s=>text(s,1400)))throw Error('保存的阶段步骤不完整');stage.steps=[...source.steps];
  result[id]=stage;
 }
 return result;
}

// A route switch changes the accepted key action, while opening and later
// decisions keep the same frozen member roles and source versions.
export function updatePlanKeyStage(plan){
 if(!plan.stagePlan)return plan;
 const current=plan.stagePlan.key;
 return {...plan,stagePlan:{...plan.stagePlan,key:{...current,patch:plan.patch,steps:[...plan.steps],window:plan.window,exit:plan.caution,memberJobs:plan.members.map(m=>({...current.memberJobs.find(p=>memberKey(p)===memberKey(m)),job:plan.ordered.find(p=>memberKey(p)===memberKey(m)).job,patch:plan.patch}))}}};
}

export function savedMemberPlay(plan,champion,role){
 if(!plan.stagePlan)return null;
 const stages=Object.fromEntries(Object.entries(plan.stagePlan).map(([id,stage])=>{
  const member=stage.memberJobs.find(m=>m.champion===champion&&m.role===role);
  return [id,{label:stage.label,patch:member.patch,reviewedAt:member.reviewedAt,ownAction:member.job,steps:[...stage.steps],window:stage.window,exit:stage.exit,...(member.generic?{generic:true}:{})}];
 }));
 return {kind:plan.members.length===2?'duo':'party',id:plan.id,members:plan.members.map(m=>({...m})),patch:stages.key.patch,reviewedAt:stages.key.reviewedAt,stages,economy:plan.curated?.economy||plan.shared?.economy||plan.cooperation?.economy||plan.plan,source:'Riot 英雄机制 · 采用时保存的阶段分工，未经组合对局验证'};
}

export function fallbackMemberPlay(plan,data,champion,role){
 const original={...plan,members:plan.members.map(({role,champion})=>({role,champion}))};
 const stagePlan=capturePlanStages(original,data);if(!stagePlan)return null;
 return {...savedMemberPlay({...original,stagePlan},champion,role),fallback:true,source:'旧存档未保存阶段原文；开局和后期使用当前个人位置参考，关键配合沿用原保存分工。未经组合对局验证'};
}
