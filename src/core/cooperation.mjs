import {CROSS_SYNERGIES,RULES_PATCH,RULES_VERSION,profile} from './rules.mjs';
import {COOPERATION_PAIRS,cooperationCoordination} from './cooperation-pairs.mjs';

export const COOPERATION_PATCH='16.20';
export const COOPERATION_REVIEWED_AT='2026-10-09';
const pairKey=(a,b)=>[a,b].sort().join(':');
const key=m=>m.role+':'+m.champion;
const slowSetup={Ashe:'普攻或 W 的减速',Trundle:'E 柱子附近的减速',Karma:'Q 的减速',Lux:'Q 的禁锢',Morgana:'Q 的禁锢',Zyra:'E 的禁锢'};
// These are conditional interactions, not inferred match results. A family
// expands only to reviewed allies with the required role function or range.
// Skill conditions were checked against Riot 16.20.1 champion tooltips.
const FAMILIES=[
 {id:'frost',owner:'Sejuani',name:'近战叠霜',tempo:'early',accept:(c,p)=>c.stats?.attackrange<=250&&(p.sustain||['fighter','meleeCrit'].includes(p.build)),
  step:n=>`瑟庄妮与${n}靠近同一目标，近战普攻配合 W 叠霜，再由瑟庄妮 E 眩晕；后续控制错开。`,
  condition:'瑟庄妮 E、W 已学会且可用，双方能在附近安全普攻同一目标，并实际达到四层。',
  failure:'远程普攻不替瑟庄妮叠霜；距离断开或目标无法继续攻击时，停止为凑层数追击。'},
 {id:'concussive',owner:'Braum',name:'震荡普攻接力',tempo:'protect',accept:(_c,p)=>p.sustain&&['crit','onhit','meleeCrit','fighter','jhin','ezreal','senna'].includes(p.build),
  step:n=>`布隆先用普攻或 Q 给目标挂第一层，${n}再用安全普攻接力，达到四层才眩晕。`,
  condition:'布隆先实际命中，搭档随后能安全普攻同一目标；目标的被动免叠层期已经结束。',
  failure:'未挂第一层或目标仍处于免叠层期时没有这段控制；不要把普通技能伤害当普攻层数。'},
 {id:'range',owner:'Milio',name:'射程与保护',tempo:'protect',accept:(c,p)=>c.stats?.attackrange>250&&p.sustain&&['crit','onhit','jhin','ezreal','senna'].includes(p.build),
  step:n=>`米利欧 W 跟随${n}，搭档在范围内利用额外射程持续普攻，E 留给反击时的护盾和移动。`,
  condition:'米利欧 W 已学会且可用，搭档留在篝火有效范围内，并有安全普攻路线。',
  failure:'离开篝火或被迫失去攻击距离就无法兑现；多出的射程不等于能够无视突进。'},
 {id:'pix',owner:'Lulu',name:'普攻增益与保排',tempo:'protect',accept:(_c,p)=>p.sustain&&['crit','onhit','meleeCrit','jhin','ezreal'].includes(p.build),
  step:n=>`璐璐用 E 把皮克斯交给${n}，安全输出时再给友军 W 攻速；R 留在实际被进场的位置反打。`,
  condition:'璐璐 E、W 已学会且可用，搭档能持续安全普攻；R 的反打要等技能已学会。',
  failure:'给友军 W 就失去同次对敌变形；皮克斯弹体可被其他单位挡住，保护用完先退出。'},
 {id:'ball',owner:'Orianna',name:'带球进场',tempo:'teamfight',accept:(_c,p)=>p.frontline&&p.engage,
  step:n=>`奥莉安娜 E 把球交给${n}，队友实际接近敌人后，确认球仍在有效位置再接奥莉安娜 R。`,
  condition:'奥莉安娜 E、R 已学会且可用，球实际在进场队友附近，双方沟通接近与释放时机。',
  failure:'队友进场而球已离开、返回或无法跟上时，不按原计划空放 R；先手落空就停止强接。'},
 {id:'landing',owner:'Galio',name:'落点支援',tempo:'teamfight',accept:(_c,p)=>p.frontline&&p.engage,
  step:n=>`${n}先在可支援距离内留住目标，加里奥 R 选择该友军的当时位置；队友围绕落点拖住，再接落地击飞。`,
  condition:'加里奥 R 已学会且可用，友军在施法范围内；选择的是当时落点，不假定敌人会留在原地。',
  failure:'对手退出落点、支援无法到达或队友撑不住时，停止按原计划接团；R 不是全地图支援。'},
 {id:'echo',owner:'Seraphine',name:'减速与定身升级',tempo:'poke',accept:c=>Object.hasOwn(slowSetup,c.id),
  step:(n,c)=>`${n}先实际命中${slowSetup[c.id]}，萨勒芬妮 E 趁状态仍在时命中；已有减速变禁锢，已有定身变眩晕。`,
  condition:'双方相关技能已学会且可用；萨勒芬妮 E 命中时，目标仍处于队友施加的对应状态。',
  failure:'队友技能落空或控制已经结束时没有升级；不要把两段控制同时预交，也不把任何减速当硬控。'},
 {id:'shield-zone',owner:'Ivern',name:'贴身护盾区域',tempo:'protect',accept:(_c,p)=>p.frontline&&p.engage,
  step:n=>`艾翁 E 交给${n}承接反击，护盾随后在友军周围爆开；队友保持安全接触，让减速帮助后续衔接。`,
  condition:'艾翁 E 已学会且可用，受盾队友在爆开时靠近目标，且有安全退出路线。',
  failure:'目标离开爆开范围就没有这段减速；不要为了引爆追进危险位置，Q 命中也不要求全员强行冲入。'},
];

export function createCooperationGraph(champions,{links=CROSS_SYNERGIES,patch=RULES_PATCH,reviewedAt=RULES_VERSION}={}){
 const byId=new Map(champions.map(c=>[c.id,c])),legacy=new Map(),cache=new Map(),profiles=new Map(),pairs=new Map(COOPERATION_PAIRS.map(row=>[pairKey(row[0],row[1]),row]));
 for(const [a,b,text] of links)if(byId.has(a)&&byId.has(b))legacy.set(pairKey(a,b),{id:'catalog:'+pairKey(a,b),family:'catalog',name:'已整理两两联动',a,b,step:text,condition:'双方实际具备对应技能与接近条件后再衔接。',failure:'原说明没有确认当前技能可用或对手站位；关键技能落空就停止强接。',patch,reviewedAt,current:false,tempo:'teamfight',sourceUrls:[]});
 const prof=m=>{const k=key(m);if(!profiles.has(k))profiles.set(k,profile(byId.get(m.champion),m.role));return profiles.get(k);};
 const edge=(a,b)=>{
  if(a.champion===b.champion||!byId.has(a.champion)||!byId.has(b.champion))return null;
  const k=[key(a),key(b)].sort().join('|');if(cache.has(k))return cache.get(k);
  let found=null;
  const reviewedPair=pairs.get(pairKey(a.champion,b.champion));
  if(reviewedPair&&prof(a).reviewed&&prof(b).reviewed){
   const [first,second,name,step,condition,failure,tempo,control]=reviewedPair;
   found={id:'pair:'+pairKey(first,second),family:'pair:'+pairKey(first,second),name,a:first,b:second,step,condition,failure,tempo,control,current:true,patch:COOPERATION_PATCH,reviewedAt:COOPERATION_REVIEWED_AT,alreadyLinked:legacy.has(pairKey(first,second)),sourceUrls:[first,second].map(id=>`https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/${id}.json`)};
  }
  for(const family of FAMILIES){
   if(found)break;
   const owner=[a,b].find(m=>m.champion===family.owner),ally=owner===a?b:a;
   if(!owner||!prof(owner).reviewed||!prof(ally).reviewed||!family.accept(byId.get(ally.champion),prof(ally)))continue;
   const c=byId.get(ally.champion);found={id:family.id+':'+pairKey(a.champion,b.champion),family:family.id,name:family.name,a:a.champion,b:b.champion,step:family.step(c.name,c),condition:family.condition,failure:family.failure,patch:COOPERATION_PATCH,reviewedAt:COOPERATION_REVIEWED_AT,current:true,tempo:family.tempo,alreadyLinked:legacy.has(pairKey(a.champion,b.champion)),sourceUrls:[family.owner,ally.champion].map(id=>`https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/${id}.json`)};break;
  }
  found||=legacy.get(pairKey(a.champion,b.champion))||null;cache.set(k,found);return found;
 };
 return {edge,profile:prof,byId};
}

function connectedEdges(members,graph){
 const edges=[];for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){const edge=graph.edge(members[i],members[j]);if(edge)edges.push(edge);}
 if(!edges.some(e=>e.current)||edges.length<members.length-1||members.some(m=>!edges.some(e=>[e.a,e.b].includes(m.champion))))return null;
 return edges;
}
export function cooperationPlan(members,graph){
 members=members.filter(m=>m.champion);
 if(![2,3].includes(members.length)||new Set(members.map(m=>m.role)).size!==members.length||new Set(members.map(m=>m.champion)).size!==members.length)return null;
 const edges=connectedEdges(members,graph);if(!edges)return null;
 const current=edges.filter(e=>e.current),main=current[0],coordination=cooperationCoordination(members,graph,edges),steps=coordination.relaySteps||edges.map(e=>e.step);
 return {name:`配合 · ${main.name}${members.length===3?'三人联动':''}`,members:members.map(m=>({role:m.role,champion:m.champion})),edges,...coordination,
  why:steps.join(' '),steps,conditions:edges.map(e=>e.condition),failures:edges.map(e=>e.failure),tempo:main.tempo,
  bonus:Math.min(15,current.filter(e=>!e.alreadyLinked).length*4+(members.length===3?3:0)),
  sourceNote:'按技能条件与已有联动推导，未经组合对局验证；两两能配合不代表整体一定强。',
  patch:COOPERATION_PATCH,reviewedAt:COOPERATION_REVIEWED_AT,sourceUrls:[...new Set(current.flatMap(e=>e.sourceUrls))]};
}

// Complete two or three party roles around locked members. Candidate pools
// have already applied bans, public picks, roles and player restrictions.
// Keep a bounded set of distinct mechanisms before the existing team score.
export function cooperationSeeds({members,targets,candidateSets,graph,limit=24}){
 if(![2,3].includes(members.length)||!targets.length||targets.some(r=>!members.some(m=>m.role===r)))return [];
 const pools=members.map(m=>targets.includes(m.role)?(candidateSets[m.role]||[]).map((c,rank)=>({role:m.role,champion:c.id,rank})):graph.byId.has(m.champion)?[{role:m.role,champion:m.champion,rank:0}]:[]);
 if(pools.some(p=>!p.length))return [];
 const best=new Map();
 const visit=picks=>{
  if(new Set(picks.map(m=>m.champion)).size!==picks.length)return;
  const edges=connectedEdges(picks,graph);if(!edges)return;
  const traits=picks.map(m=>graph.profile(m)),ad=traits.reduce((n,p)=>n+p.damageWeights.ad,0),ap=traits.reduce((n,p)=>n+p.damageWeights.ap,0);
  const score=edges.length*8+edges.filter(e=>e.current).length*3+(ad>=.75&&ap>=.75?6:0)+['frontline','sustain','peel','engage'].filter(k=>traits.some(p=>p[k])).length*2-picks.reduce((n,m)=>n+m.rank,0)/8-traits.reduce((n,p)=>n+p.difficulty,0)/4;
  const family=edges.map(e=>e.family).sort().join('|'),signature=picks.map(key).join('|'),previous=best.get(family);
  if(!previous||score>previous.score||score===previous.score&&signature<previous.signature)best.set(family,{score,signature,members:picks});
 };
 for(const a of pools[0])for(const b of pools[1]){if(pools.length===2)visit([a,b]);else for(const c of pools[2])visit([a,b,c]);}
 return [...best.values()].sort((a,b)=>b.score-a.score||a.signature.localeCompare(b.signature)).slice(0,limit).map(r=>r.members.map(({rank,...m})=>m));
}
