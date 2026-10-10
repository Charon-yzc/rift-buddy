import {TRIOS} from './rules.mjs';
import {COOPERATION_SKILLS,SKILL_COOPERATION_PATCH,SKILL_COOPERATION_REVIEWED_AT} from './cooperation-skills.mjs';
import {cooperationCoordination} from './cooperation-pairs.mjs';
import {preferredTempo,TEMPOS} from './strategy.mjs';

const roles=['top','jungle','mid','bottom','support'];
const same=(a,b)=>a.role===b.role&&a.champion===b.champion;
// Four/five players need a whole-party resource and action plan, even when
// only a subgroup has a reviewed interaction. This adds no synergy bonus and
// does not claim that the whole group has a unique or measured advantage.
export function partyCooperationPlan(members,graph,{catalogStatus={}}={}){
 if(![4,5].includes(members.length)||members.some(m=>!roles.includes(m.role)||!graph.byId.has(m.champion)||!COOPERATION_SKILLS[m.champion])||new Set(members.map(m=>m.role)).size!==members.length||new Set(members.map(m=>m.champion)).size!==members.length)return null;
 const name=id=>graph.byId.get(id).name,edges=[];
 for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){const edge=graph.edge(members[i],members[j]);if(edge?.current)edges.push(edge);}
 const curated=TRIOS.filter(t=>!catalogStatus[t.id]?.invalid&&t.members.every(m=>members.some(p=>same(m,p))));
 const coordination=cooperationCoordination(members,graph,[]);
 const memberJobs=members.map(m=>{
  const row=COOPERATION_SKILLS[m.champion],original=curated.find(t=>t.members.some(p=>same(m,p))),authored=original?.members.find(p=>same(m,p));
  const edge=edges.find(e=>[e.a,e.b].includes(m.champion));
  const local=edge?cooperationCoordination([m],graph,[edge]).memberJobs[0].job:null;
  return {role:m.role,champion:m.champion,job:`${authored?.job||local||row[0]}${original?`（沿用组合说明 ${original.patch}${original.patch!==SKILL_COOPERATION_PATCH?' · 旧版本说明保留':''}）`:''} 成立前先确认：${row[1]} 停止条件：${row[2]}`};
 });
 const profiles=members.map(m=>graph.profile(m)),traits=Object.fromEntries(['engage','aoe','peel','sustain','poke'].map(k=>[k,profiles.filter(p=>p[k]).length]));
 const tempo=preferredTempo({traits,members});
 const steps=[
  members.map(m=>name(m.champion)+(m.role==='jungle'?'报安全营地与到场时间':m.role==='support'?'先确认搭档能安全补刀再报去向':'先处理自己的兵线再报可离线时间')).join('；')+'。未到齐就保各自资源。',
  '先报同一个可安全接触的目标与退出方向。各人按下面自己的技能条件行动；只有控制实际命中才接后续，不把队友到场当成技能已就绪，也不要求全员同时深入。',
  '任一关键成员无法到位、技能落空、目标离开覆盖或退路被封，就一起停止追击、接应退出，再回各自兵线或安全营地；下一轮重新确认条件。'
 ];
 return {kind:'shared',name:`${members.length}人分工 · ${TEMPOS[tempo]}`,members:members.map(m=>({role:m.role,champion:m.champion})),memberJobs,edges:[],bonus:0,tempo,steps,relaySteps:steps,opening:coordination.opening,economy:coordination.economy,
  why:members.map(m=>name(m.champion)).join('、')+'各有明确职责；先保各自兵线与营地，再按实际到位、技能与退出条件会合。已整理的局部配合不当作全队必定成立的连招。',
  conditions:['每位成员自行确认当前等级、技能、层数、形态与资源；没有读取实时技能状态，不按游戏时间推算就绪。','共同目标在成员实际可触及范围内，兵线允许行动且退路可用；只有实际发生的控制才能作为后续触发。'],
  failures:['有人赶不到、关键技能落空或退路被封时取消这轮行动，接应退出，不为补齐连招继续深入。','局部配合成立不代表全队都应进入；自保、自疗与猜测的击杀刷新不能当作队友已经获得的保护。'],
  sourceNote:'全员分工：保留已整理的局部配合，补齐各自技能、资源与进退条件；未确认四人或五人独特协同，未经组合对局验证，不代表统计优势。',
  patch:SKILL_COOPERATION_PATCH,reviewedAt:SKILL_COOPERATION_REVIEWED_AT,sourceUrls:members.map(m=>`https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/${m.champion}.json`)};
}
