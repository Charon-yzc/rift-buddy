import {validateCreativePlan} from './creative-plan.mjs';
import {sidePressureActors} from './side-pressure.mjs';

// The adopted jobs, not an inferred enemy state, govern a resource approach.
// This is a conditional plan for the selected party, never an automatic call.
export function objectiveCoordination({plan,champion,role,resource,confirmed=false,protectId,data}={}){
 if(!plan||!resource)return null;
 let saved;try{saved=validateCreativePlan(plan);}catch{return null;}
 const own=saved.members.find(m=>m.champion===champion&&m.role===role);if(!own)return null;
 const name=m=>data?.champions?.find(c=>c.id===m.champion)?.name||m.champion;
 const active=(saved.shared||saved.cooperation)?.routes?.[0];
 const side=active?.id==='side-pressure'?sidePressureActors(saved.members):null;
 const focus=saved.members.find(m=>m.champion===protectId)||saved.members.find(m=>m.role==='bottom');
 const kind=side?'side-pressure':saved.tempo;
 const resourceName=resource.name;
 const intro=confirmed?'按已采用的成员分工准备；实际到位、技能与入口仍由玩家确认。':'按已准备的组合演练；本局队友阵容尚未确认，不代表这些成员已到场。';
 const preflight=`先看游戏内${resourceName}是否存在、实际计时与争夺价值，再报各自兵线／安全营地、状态、可离线时间和安全退路。倒计时到达不代表必须争夺。`;
 let approach,stop;
 if(side){
  approach=`先约定“继续分线”或“取消分线会合”，不能同时要求${name(side.side)}深入边线又到${resourceName}。继续分线时其余成员只在可撤位置守入口；有可确认的安全收益才换兵线或塔，不自动假设能以少打多。`;
  stop=`${name(side.side)}遭包夹、${name(side.mover)}赶不到或留守者守不住时，取消危险转场并一起收缩。决定会合时先收安全边线，再按实际路程走已确认入口；传送／大招只有玩家确认可用且落点安全才列入到场计划。`;
 }else if(kind==='protect'){
  approach=focus?`先与${name(focus)}约同侧补给和进入方向；保护者保持能实际覆盖它的距离，入口成员不把核心甩在后面。只打安全可触及的目标，不因资源计时到达就把保护技能全用来开团。`:'先约定本轮输出与保护对象，再同侧补给进入；未约定对象时只保安全资源，不自动指派核心。';
  stop='核心无法到位、保护交空或侧翼退路不明就取消争夺；接应核心退到安全线／营地，先补给，下一次会合重新约定。';
 }else if(kind==='poke'){
  approach=`先约同一个安全消耗区域，处理兵线后结伴接近${resourceName}；远程成员分安全角度短轮次消耗，保护与回撤技能留给被近身，不要求消耗命中后全员深入。`;
  stop='弹道被挡、法力不足、敌人近身或退路不明就停止前压；退回能互相接应的位置，换安全兵线／营地和补给，不用继续前移追回技能损失。';
 }else if(kind==='growth'){
  approach=`先保各自安全兵线／营地，报实际等级、装备与到位时间，再决定是否为${resourceName}会合。不要为了等待一轮配合丢掉多个成员的经验，也不假设已达到成长层数。`;
  stop='有人尚未获得关键技能或无法安全离线，就取消强争；留守者收缩，其他人分别保能安全取得的兵线／营地，下一窗口重新报到位时间。';
 }else{
  approach=`清线／补给后约同侧入口，按已保存的实际先手和接力顺序接近${resourceName}；先手只确认目标与退出方向，不独自越过视野，队友能覆盖才进入。开资源与找人接战分开约定。`;
  stop='先手落空、接力者赶不到或退路被封就停止深入；一起接应退出，再分别接安全兵线／营地，不让第二位成员为了补齐连招继续送入。';
 }
 const jobs=saved.members.map(m=>{
  let resourceJob;
  if(side&&m.champion===side.side.champion)resourceJob='本轮先保安全边线并报退出方向；继续牵制时不同时承担资源入口，会合时先取消前压，按实际路程报到。';
  else if(side&&m.champion===side.mover.champion)resourceJob=`先与${name(side.side)}约定接边或取消接边；未约定前保本局安全资源，不让边线空等，也不独自转到危险落点。`;
  else if(kind==='protect'&&focus&&m.champion===focus.champion)resourceJob='作为本轮约定输出候选，先补给并报能到的入口；等保护者同侧再进入，只打能安全触及的目标。';
  else if(m.role==='jungle')resourceJob='先报安全营地、实际到场时间及惩戒状态；和队友核对入口后才决定是否开资源，不能只按倒计时独自开。';
  else if(m.role==='support')resourceJob='先确认搭档能安全补刀，结伴核对入口和退出方向；保留保护与排险手段，不独自探草或越过队友。';
  else resourceJob=side?'处理安全中线并守留守成员的退出口，接应者离开后减少前压，不在分线期间硬开人数不足的团。':'先接安全兵线、报可离线时间和能到的入口；结伴进入并保持原先手／保护／输出分工，不为抢第一下脱离接应距离。';
  return {...m,name:name(m),resourceJob,tactic:saved.ordered.find(p=>p.champion===m.champion&&p.role===m.role).job};
 });
 return {planId:saved.id,planName:saved.name,kind,resourceId:resource.id,resourceName,intro,preflight,approach,stop,jobs,ownJob:jobs.find(m=>m.champion===champion&&m.role===role),window:saved.window,patch:saved.patch,reviewedAt:saved.rulesVersion,
  unknown:'未读取队友技能冷却、即时位置、视野或敌方未公开信息；替代收益也须先确认安全且仍可取得。这里只安排已选成员，未选路人的职责须另行沟通。'};
}
