import {junglePlan} from './jungle-plans.mjs';

// Static own-side camp areas, in percentages on Riot's map11 image. These are
// diagram anchors, never observed unit coordinates or navigable waypoints.
const camps={
 red:{name:'红BUFF',half:'red',point:[53,74]},krugs:{name:'石甲虫',half:'red',point:[60,83]},raptors:{name:'锋喙鸟',half:'red',point:[49,65]},
 wolves:{name:'三狼',half:'blue',point:[26,57]},blue:{name:'蓝BUFF',half:'blue',point:[21,48]},gromp:{name:'魔沼蛙',half:'blue',point:[13,43]}
};
const ids=Object.fromEntries(Object.entries(camps).map(([id,c])=>[c.name,id]));
export function validateRouteProgress(value){
 return value&&typeof value.key==='string'&&/^[A-Za-z][A-Za-z0-9-]{1,79}$/.test(value.key)&&Number.isInteger(value.index)&&value.index>=0&&value.index<=12?{key:value.key,index:value.index}:undefined;
}
export function jungleRoute({champion,start,half,side,stage,recovery,progress,writable=false}){
 const special=champion==='Ivern',rotation=stage==='rotation'||!!recovery;
 const targetHalf=recovery==='invaded'?(half==='red'?'blue':'red'):half;
 let sequence=rotation?(targetHalf==='red'?['raptors','krugs','red']:['wolves','gromp','blue']):junglePlan(champion,start,side).opening.map(name=>ids[name]);
 if(special){
  sequence=rotation?(targetHalf==='red'?['red','raptors','krugs']:['blue','gromp','wolves']):start==='red'?['red','raptors','blue','gromp','wolves']:['blue','gromp','wolves','red','raptors'];
 }
 const steps=(special?[...sequence.map(id=>[id,'mark']),...sequence.map(id=>[id,'release'])]:sequence.map(id=>[id,'clear'])).map(([id,action],index)=>{
  const camp=camps[id],point=side==='blue'?camp.point:side==='red'?camp.point.map(n=>100-n):null;
  return {id,action,name:camp.name,label:camp.name+(action==='mark'?' · 画圈':action==='release'?' · 成熟后回收':''),half:camp.half,point,index};
 });
 const routeStage=rotation?'rotation':'opening',key=`${champion}-${routeStage}-${rotation?targetHalf:start}`;
 const checked=validateRouteProgress(progress),manual=!recovery&&checked?.key===key&&checked.index<=steps.length;
 const index=manual?checked.index:0,complete=manual&&index===steps.length;
 const plannedHalf=rotation?targetHalf:manual?steps[Math.min(index,steps.length-1)].half:half;
 return {key,stage:routeStage,start,half:plannedHalf,side,steps,index,manual:!!manual,complete,current:steps[index]||null,
  writable:!!writable&&!recovery,canAdopt:!!writable&&!!recovery,recovery:recovery||null,
  hint:special?'画圈不等于已成熟；回收前按游戏内状态确认，惩戒可提前释放。':'营地顺序可跳过；只去实际存活且安全的营地。',
  caption:'静态顺序示意；连线不是可穿墙路径，进度由你手动标记。'};
}
