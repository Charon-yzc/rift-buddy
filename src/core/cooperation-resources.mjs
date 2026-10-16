import {COOPERATION_SKILLS} from './cooperation-skills.mjs';
import {cooperationCoordination} from './cooperation-pairs.mjs';
import {independentCooperationAction} from './shared-cooperation.mjs';

// Explicit resource consumers, not a heuristic that every repeated owner or
// R means a conflict. Stacking passives and shared areas remain cooperative.
const airbornePairs=new Set(['Gragas:Yasuo','Rakan:Yasuo','Malphite:Yasuo','Yasuo:Zac','LeeSin:Yasuo','Diana:Yasuo']);
function resource(edge){
 if(edge.family==='ball')return 'Orianna';
 if(edge.family==='landing'||edge.family==='pair:Camille:Galio')return 'Galio';
 if(edge.family.startsWith('pair:')&&airbornePairs.has([edge.a,edge.b].sort().join(':')))return 'Yasuo';
 return null;
}
export function sharedUltimateConflict(edges){
 const groups=new Map();
 for(const edge of edges){const owner=resource(edge);if(!owner)continue;if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(edge);}
 for(const [owner,uses] of groups)if(uses.length>1)return {owner,uses:[...uses].sort((a,b)=>a.id.localeCompare(b.id))};
 return null;
}

// Coordinate newly generated trios only. Already authored whole-party relays
// and frozen plans are not rewritten; all original edge evidence is retained.
export function resourceCoordination(members,graph,edges,coordination){
 if(members.length!==3||coordination.relaySteps||members.some(m=>!COOPERATION_SKILLS[m.champion]))return null;
 const conflict=sharedUltimateConflict(edges);if(!conflict)return null;
 const {owner,uses}=conflict,primary=uses[0],partner=[primary.a,primary.b].find(id=>id!==owner);
 const other=members.find(m=>m.champion!==owner&&m.champion!==partner),name=id=>graph.byId.get(id).name;
 if(!other||!COOPERATION_SKILLS[owner]||!COOPERATION_SKILLS[other.champion])return null;
 const ownerName=name(owner),partnerName=name(partner),otherName=name(other.champion);
 const charm=members.some(m=>m.champion==='Rakan')?'，仅有洛 R 魅惑不算击飞':'';
 const backup=owner==='Orianna'
  ?`只有本轮发条 R 尚未使用、E/R 已可用且球重新到位时，才另选${otherName}带球作为替代；R 已交就取消这条备用入口。`
  :owner==='Galio'
   ?`只有本轮加里奥 R 尚未使用且当前可用，${otherName}实际在施法范围内、能撑到延迟落地且落点仍安全时，才重新选择其当时位置作为替代；施法后不跟随位移或中途改落点，R 已交就取消备用。`
   :`只有本轮亚索 R 尚未使用且当前可用，${otherName}另行实际击飞、目标仍可接大且在范围、落点安全时，才改走备用；R 已交就取消备用${charm}。`;
 const ownerJob=owner==='Orianna'
  ?`本轮 E 只给${partnerName}，确认球已到且仍跟随；${partnerName}实际安全接近目标、球仍覆盖目标且 R 可用才接一次，W 接同一落点。球返回或落点脱离就取消，不为另一位进场者再安排一次 R。`
  :owner==='Galio'
   ?`本轮 R 只支援${partnerName}的施法时位置，先确认 R 可用、友军在实际范围且能撑到延迟落地，落点仍安全才交一次。护盾只挡魔法伤害，落点不跟随队友位移；落地后按实际距离 W/E/Q 接应，不再为另一位队友安排 R。`
   :`本轮只接${partnerName}的实际击飞，目标仍可接大、自己 R 可用且在范围、落点安全才接一次。未击飞或 R 未学会、未可用时只用当前基础技能接应退出。落地 Q/普攻，风墙与 E 退出对象留反击；不为另一位入口再安排一次 R，只有魅惑不接大。`;
 const memberJobs=members.map(m=>{
  const row=COOPERATION_SKILLS[m.champion];
  let job=m.champion===owner?ownerJob:m.champion===partner
   ?cooperationCoordination([m],graph,[primary]).memberJobs[0].job+` 本轮只走自己与${ownerName}的主入口；先确认队友实际覆盖，条件不齐就取消，不为补连招独自深入。`
   :`本轮由${partnerName}走主入口，自己留作第二波或接应；主线实际生效且安全覆盖才行动：${independentCooperationAction(m.champion)} 失败先接应退出，不要求${ownerName}第二次 R。`;
  if(m.champion===owner||m.champion===other.champion)job+=' '+backup;
  return {role:m.role,champion:m.champion,job:job+' 成立前先确认：'+row[1]+' 停止条件：'+row[2]};
 });
 const relaySteps=[primary.step,`${otherName}：${independentCooperationAction(other.champion)} 主线实际生效且落点安全才接第二波；主线失败先接应退出，不要求${ownerName}第二次 R。`,backup];
 return {memberJobs,relaySteps};
}
