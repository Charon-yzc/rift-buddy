import {TRIOS} from './rules.mjs';
import {COOPERATION_SKILLS,SKILL_COOPERATION_PATCH,SKILL_COOPERATION_REVIEWED_AT} from './cooperation-skills.mjs';
import {cooperationCoordination} from './cooperation-pairs.mjs';
import {preferredTempo,TEMPOS} from './strategy.mjs';
import {tacticalCooperationPlan} from './tactical-cooperation.mjs';
import {independentCooperationAction} from './shared-cooperation.mjs';
import {sidePressureRoute} from './side-pressure.mjs';

const roles=['top','jungle','mid','bottom','support'];
const same=(a,b)=>a.role===b.role&&a.champion===b.champion;
function partyRoutes(members,graph,edges,tempo,curated,requestedTempo,basePlan){
 const name=id=>graph.byId.get(id).name;
 const priority=['pair:Malphite:Yasuo','pair:Diana:Yasuo','pair:Yasuo:Zac'];
 const ordered=[...edges].sort((a,b)=>{
  const rank=e=>priority.includes(e.id)?priority.indexOf(e.id):priority.length+(e.tempo===tempo?0:1);
  return rank(a)-rank(b)||a.id.localeCompare(b.id);
 });
 const leads=ordered.map(e=>({id:e.id,edge:e,actors:[e.a,e.b],step:e.step,condition:e.condition,failure:e.failure}));
 if(curated.length){const t=curated[0];leads.unshift({id:'curated:'+t.id,curated:t,actors:t.members.map(m=>m.champion),step:t.steps.join(' → '),condition:t.window,failure:t.risk});}
 // Reviewed basic control is an alternative entry, never an inferred ready
 // spell or a claim of unique whole-team synergy.
 for(const m of members){const row=COOPERATION_SKILLS[m.champion];if(row[3]&&!leads.some(l=>l.actors.includes(m.champion)))leads.push({id:'skills:'+m.champion,actors:[m.champion],step:name(m.champion)+'：'+row[3],condition:row[4]||row[1],failure:row[2]});}
 const controlRoutes=leads.map(lead=>{
  const relay=!['protect','growth'].includes(lead.curated?.tempo||lead.edge?.tempo);
  const protectedMember=[...members].filter(m=>graph.profile(m).sustain).sort((a,b)=>Number(b.role==='bottom')-Number(a.role==='bottom')||Number(lead.actors.includes(b.champion))-Number(lead.actors.includes(a.champion))||roles.indexOf(a.role)-roles.indexOf(b.role))[0];
  const jobs=members.map(m=>{
   const row=COOPERATION_SKILLS[m.champion],p=graph.profile(m),action=independentCooperationAction(m.champion);let job;
   if(lead.edge?.family==='ball'){
    const carrier=lead.actors.find(id=>id!=='Orianna'),carrierName=name(carrier);
    if(m.champion==='Orianna')job=`本轮 E 只给${carrierName}，确认球已到且仍跟随；${carrierName}实际安全接近目标、球仍覆盖目标且 R 可用才接一次，W 接同一落点。球返回或落点脱离就取消，不为另一位进场者再安排一次 R。`;
    else if(m.champion===carrier)job=`本轮由自己带球，先确认发条 E 的球已到且仍跟随、队友能覆盖落点才安全进场。${action} ${carrier==='Nautilus'?'Q 实际命中并接近或安全步行到位才算带球到场；R 的追踪冲击波不会移动自己。':carrier==='Vi'?'Q 被前方英雄截住就停在实际碰撞处；R 只有实际到达目标才算进场。':''} 球返回或队友赶不到就取消接大并接应退出，不为留球独自深入。`;
    else job=`本轮由${carrierName}带球，自己的进场留作第二波或接应，等主线实际生效且安全覆盖才跟进；主线失败就一起退出，不要求第二次发条 R。${action}`;
   }
   else if(lead.actors.includes(m.champion))job=lead.curated?lead.curated.members.find(p=>same(m,p)).job+`（沿用组合说明 ${lead.curated.patch}${lead.curated.patch!==SKILL_COOPERATION_PATCH?' · 旧版本说明保留':''}）`:lead.edge?cooperationCoordination([m],graph,[lead.edge]).memberJobs[0].job:row[3]+' '+row[0];
   else if(p.peel&&(!p.engage||m.role==='support')&&protectedMember&&protectedMember.champion!==m.champion)job=`本轮优先接应${name(protectedMember.champion)}，不与主线同时深入。${action}`;
   else if(relay&&p.engage&&row[3])job=`${action} 进场留作第二波或反打，先等主线实际生效与队友到位；主线失败就接应退出，不为补一次控制独自深入。`;
   else job=action+' '+(relay?'先确认主线实际生效、同一目标在自己安全覆盖内再跟进。':'与主线保持可接应距离，按自己的安全接触条件行动，不等队友先控制。')+' 跟不上就回到队友，不转追第二个目标。';
   return {role:m.role,champion:m.champion,job:job+' 成立前先确认：'+row[1]+' 停止条件：'+row[2]};
  });
  return {id:lead.id,label:lead.actors.map(name).join(' / '),tempo:lead.curated?.tempo||lead.edge?.tempo||'teamfight',step:lead.step,condition:lead.condition,failure:lead.failure,memberJobs:jobs};
 });
 const tactical=tacticalCooperationPlan(members,graph,{tempo:requestedTempo});
 const tacticalRoutes=['poke','protect','growth'].map(mode=>({mode,plan:tacticalCooperationPlan(members,graph,{tempo:mode})})).filter(({mode,plan})=>plan?.tempo===mode).map(({plan})=>plan);
 const uniqueTactics=tacticalRoutes.map(p=>({id:'tactical:'+p.tempo,label:p.name.replace('共同分工 · ',''),tempo:p.tempo,step:p.steps.join(' '),condition:p.conditions.join(' '),failure:p.failures.join(' '),memberJobs:p.memberJobs}));
 // A larger party retains independently usable poke/protection/growth jobs.
 // Reviewed subgroup text remains the default unless the player selects a
 // supported tactical preference; control is an alternative, never a gate
 // that every ranged member must wait for before using a poke skill.
 const original=basePlan?{id:'original-group',label:'原三人配合',tempo:basePlan.tempo,step:basePlan.steps.join(' '),condition:basePlan.conditions.join(' '),failure:basePlan.failures.join(' '),memberJobs:basePlan.memberJobs}:null;
 const available=[original,...controlRoutes,...uniqueTactics,sidePressureRoute(members,graph)].filter(Boolean);
 const requested=available.find(r=>r.tempo===requestedTempo&&!r.id.startsWith('curated:'))||available.find(r=>r.tempo===requestedTempo);
 const primary=requested||original||controlRoutes.find(r=>r.id.startsWith('curated:'))||uniqueTactics.find(r=>r.tempo===tactical?.tempo)||controlRoutes[0];
 const mainActors=leads.find(l=>l.id===primary?.id)?.actors;
 const alternative=uniqueTactics.find(r=>r.id!==primary?.id)||controlRoutes.find(r=>r.id!==primary?.id&&(!mainActors||leads.find(l=>l.id===r.id).actors.some(id=>!mainActors.includes(id))));
 const routes=[primary,alternative,...available.filter(r=>r.id!==primary?.id&&r.id!==alternative?.id)].filter(Boolean);
 if(!routes.length)return [];
 if(routes.length===1)routes.push({id:'reset',label:'取消进场，保护与发育',tempo:'growth',step:'先手条件不齐就取消接战，控制留靠近己方的目标；先保成员和安全兵线、营地，不要求补齐一套连招。',condition:'成员能互相接应且有安全资源可处理；玩家确认退路与公开资源方向。',failure:'退出路线被截断时先共同限制追击者，不分散去补不同的资源。',memberJobs:members.map(m=>({role:m.role,champion:m.champion,job:'本轮取消深入，先接应回撤。'+independentCooperationAction(m.champion)+' '+COOPERATION_SKILLS[m.champion][2]}))});
 return routes;
}
// Four/five players need a whole-party resource and action plan, even when
// only a subgroup has a reviewed interaction. This adds no synergy bonus and
// does not claim that the whole group has a unique or measured advantage.
export function partyCooperationPlan(members,graph,{catalogStatus={},tempo:requestedTempo='any',basePlan=null}={}){
 if(![3,4,5].includes(members.length)||members.some(m=>!roles.includes(m.role)||!graph.byId.has(m.champion)||!COOPERATION_SKILLS[m.champion])||new Set(members.map(m=>m.role)).size!==members.length||new Set(members.map(m=>m.champion)).size!==members.length)return null;
 if(members.length===3&&(!basePlan?.memberJobs||[basePlan.steps,basePlan.conditions,basePlan.failures].some(rows=>rows.join(' ').length>400)))return null;
 const name=id=>graph.byId.get(id).name,edges=[];
 for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){const edge=graph.edge(members[i],members[j]);if(edge?.current)edges.push(edge);}
 if(members.length===3&&!sidePressureRoute(members,graph)&&edges.filter(e=>e.family==='ball').length<2)return null;
 const curated=TRIOS.filter(t=>!catalogStatus[t.id]?.invalid&&t.members.every(m=>members.some(p=>same(m,p))));
 const coordination=basePlan||cooperationCoordination(members,graph,[]);
 let memberJobs=members.map(m=>{
  const row=COOPERATION_SKILLS[m.champion],original=curated.find(t=>t.members.some(p=>same(m,p))),authored=original?.members.find(p=>same(m,p));
  const edge=edges.find(e=>[e.a,e.b].includes(m.champion));
  const local=edge?cooperationCoordination([m],graph,[edge]).memberJobs[0].job:null;
  return {role:m.role,champion:m.champion,job:`${authored?.job||local||independentCooperationAction(m.champion)}${original?`（沿用组合说明 ${original.patch}${original.patch!==SKILL_COOPERATION_PATCH?' · 旧版本说明保留':''}）`:''} 成立前先确认：${row[1]} 停止条件：${row[2]}`};
 });
 const profiles=members.map(m=>graph.profile(m)),traits=Object.fromEntries(['engage','aoe','peel','sustain','poke'].map(k=>[k,profiles.filter(p=>p[k]).length]));
 const inferredTempo=preferredTempo({traits,members});
 const routes=partyRoutes(members,graph,edges,inferredTempo,curated,requestedTempo,basePlan),tempo=routes[0]?.tempo||inferredTempo;
 if(routes.length)memberJobs=routes[0].memberJobs;
 const steps=[
  members.map(m=>name(m.champion)+(m.role==='jungle'?'报安全营地与到场时间':m.role==='support'?'先确认搭档能安全补刀再报去向':'先处理自己的兵线再报可离线时间')).join('；')+'。未到齐就保各自资源。',
  routes.length?'主线：'+routes[0].step:'先报同一个可安全接触的目标与退出方向。各人按下面自己的技能条件做独立短轮次；没有稳定控制就不安排控制后的接力，不把队友到场当成技能已就绪，也不要求全员同时深入。',
  routes.length?'备选：'+routes[1].step:'任一关键成员无法到位、技能落空、目标离开覆盖或退路被封，就一起停止追击、接应退出，再回各自兵线或安全营地；下一轮重新确认条件。'
 ];
 return {kind:'shared',name:`${members.length}人分工 · ${TEMPOS[tempo]}`,members:members.map(m=>({role:m.role,champion:m.champion})),memberJobs,...(routes.length?{routes}:{}),edges:[],bonus:0,tempo,steps,relaySteps:steps,opening:coordination.opening,economy:coordination.economy,
  why:members.map(m=>name(m.champion)).join('、')+'各有明确职责；先保各自兵线与营地，再按实际到位、技能与退出条件会合。已整理的局部配合不当作全队必定成立的连招。',
  conditions:['每位成员自行确认等级、技能、层数、形态与资源；共同目标在成员实际覆盖内且有退路。没有读取实时技能，不按时间推算就绪。',routes.length?routes[0].condition:'兵线允许行动且退路可用；只有实际发生的控制才能作为后续触发。'],
  failures:['有人赶不到、关键技能落空或退路被封时取消这轮行动，接应退出，不为补齐连招继续深入。',routes.length?routes[0].failure:'局部配合成立不代表全队都应进入；自保、自疗与猜测的击杀刷新不能当作队友已经获得的保护。'],
  sourceNote:'全员分工：保留已整理的局部配合，补齐各自技能、资源与进退条件；未确认四人或五人独特协同，未经组合对局验证，不代表统计优势。',
  patch:SKILL_COOPERATION_PATCH,reviewedAt:SKILL_COOPERATION_REVIEWED_AT,sourceUrls:members.map(m=>`https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/${m.champion}.json`)};
}
