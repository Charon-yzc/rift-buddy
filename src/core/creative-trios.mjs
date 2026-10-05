import {profile,conventionalRole,TRIOS,DUOS} from './rules.mjs';

// Creative trio archetypes. Each one is defined only by role-function traits
// (engage/peel/poke/sustain/aoe/damage) that already exist in the data model.
// They describe HOW three picks can cooperate, never win rates.
const BURST_BUILDS=new Set(['adAssassin','apAssassin','meleeCrit']);
const ARCHETYPES=[
 {id:'chain',name:'控制接力链',tempo:'teamfight',
  need:t=>t.engage>=2&&t.aoe>=1,
  fit:t=>t.engage*4+t.aoe*3+t.sustain*2+(t.frontline>=1?2:0),
  order:['engage','aoe','sustain','frontline','poke','peel'],
  hook:'先手控住接范围伤害，三段衔接打一波团战',
  play:'先控住再接范围，不要提前交完；开团前先喊集合',
  window:'三人关键控制技能都转好、对手站位集中时',
  floor:{ad:.8,ap:.8}},
 {id:'poke',name:'消耗拉扯',tempo:'poke',
  need:t=>t.poke>=2&&(t.sustain>=1||t.peel>=1),
  fit:t=>t.poke*4+t.sustain*2+t.peel*2+(t.engage>=1?2:0),
  order:['poke','sustain','peel','engage','aoe','frontline'],
  hook:'远程技能先压低血量，有保护兜底再逼资源',
  play:'先占视野把血线压下去，半血后再逼资源，别先手硬开',
  window:'占据视野、用远程技能把对手压到半血之后',
  floor:{ad:.5,ap:.5}},
 {id:'dive',name:'突进爆发',tempo:'early',
  need:t=>t.engage>=1&&t.burst>=1&&(t.sustain>=1||t.frontline>=1),
  fit:t=>t.burst*5+t.engage*3+t.sustain*2+t.frontline*2,
  order:['engage','burst','sustain','frontline','aoe','poke'],
  hook:'先手留人接爆发切入，收割位跟上持续输出',
  play:'盯落单目标，等对方保命技能交掉再进，不要正面硬冲',
  window:'抓到落单，或对方关键保命技能交掉之后',
  floor:{ad:.8,ap:.8}},
 {id:'protect',name:'保排体系',tempo:'protect',
  need:t=>t.peel>=1&&t.sustain>=1&&t.frontline>=1,
  fit:t=>t.peel*3+t.sustain*3+t.frontline*3+t.poke,
  order:['frontline','peel','sustain','poke','engage','aoe'],
  hook:'前排占位置、保护留给核心，输出位安心打持续伤害',
  play:'前排先占位置，保护留给核心，输出别走出保护圈',
  window:'核心输出关键装备成型、阵型不被冲散时',
  floor:{ad:.8,ap:.8}},
 {id:'mixed',name:'混伤压制',tempo:'teamfight',
  need:t=>t.ad>=1&&t.ap>=1&&(t.aoe>=1||t.engage>=1),
  fit:t=>Math.min(t.ad,t.ap)*4+t.aoe*2+t.engage*2+t.sustain,
  order:['engage','aoe','sustain','poke','frontline','peel'],
  hook:'物理法术双修，对方一件抗性装顾不过来',
  play:'双修压制期主动逼团，趁对方抗性没补齐结束战斗',
  window:'双修输出成型、对方抗性还没补齐的时间段',
  floor:{ad:1,ap:1}},
];
const JOB_LABEL={engage:'先手开团',aoe:'范围衔接',sustain:'持续收割',poke:'远程消耗',peel:'保护反打',frontline:'前排承伤',burst:'爆发切入'};

function trioTraits(profiles){
 const t={frontline:0,engage:0,peel:0,sustain:0,poke:0,aoe:0,ad:0,ap:0,burst:0,difficulty:0};
 for(const p of profiles){
  for(const k of ['frontline','engage','peel','sustain','poke','aoe'])if(p[k])t[k]++;
  if(BURST_BUILDS.has(p.build))t.burst++;
  t.ad+=p.damageWeights.ad;t.ap+=p.damageWeights.ap;t.difficulty+=Number.isFinite(p.difficulty)?p.difficulty:5;
 }
 t.difficulty/=profiles.length||1;
 return t;
}

function orderMembers(members,profiles,order){
 const scored=members.map((m,i)=>{
  const p=profiles[i];
  const rank=order.findIndex(k=>k==='burst'?BURST_BUILDS.has(p.build):p[k]);
  return {m,p,rank:rank<0?order.length:rank};
 }).sort((a,b)=>a.rank-b.rank);
 // Hand out distinct jobs: a member takes the first archetype trait that both
 // fits them and is still unused, so the play order reads as a real relay.
 const used=new Set();
 return scored.map(x=>{
  const fallback=JOB_LABEL[order[x.rank]]||'补足伤害';
  const pick=order.find(k=>!used.has(JOB_LABEL[k])&&(k==='burst'?BURST_BUILDS.has(x.p.build):x.p[k]));
  const job=pick?JOB_LABEL[pick]:fallback;
  used.add(job);
  return {...x.m,job};
 });
}

export function generateCreativeTrios({targets,candidateSets,champions,style='fun'}){
 // Creative trios fill exactly the three open party roles. Anything else
 // (duo lane, single补位) is covered by the curated/duos path.
 if(!Array.isArray(targets)||targets.length!==3)return [];
 const byId=new Map(champions.map(c=>[c.id,c]));
 // Per-call role-profile cache: generation evaluates up to a thousand triples,
 // each needing three profiles, so sharing them matters.
 const profCache=new Map();
 const prof=(champId,role)=>{const k=`${champId}:${role}`;let p=profCache.get(k);if(!p){p=profile(byId.get(champId),role);profCache.set(k,p);}return p;};
 const pools=targets.map(role=>candidateSets[role]?.filter(c=>byId.has(c.id)&&conventionalRole(byId.get(c.id),role,profCache)).slice(0,10)??[]);
 if(pools.some(p=>!p.length))return [];
 const curatedTrioSets=new Set(TRIOS.map(t=>t.members.map(m=>`${m.role}:${m.champion}`).sort().join('|')));
 const curatedDuoSets=new Set(DUOS.map(d=>`bottom:${d.carry}|support:${d.support}`));
 const curatedChampions=new Set([...TRIOS.flatMap(t=>t.members.map(m=>m.champion)),...DUOS.flatMap(d=>[d.carry,d.support])]);
 const diffCap=style==='wild'?8:7;
 const best=new Map();
 const keyOf=ids=>ids.slice().sort().join('|');
 for(const [a,b,c] of cartesian(pools)){
  if(new Set([a.id,b.id,c.id]).size!==3)continue;
  const roles=targets;
  const profiles=[a,b,c].map((champ,i)=>prof(champ.id,roles[i]));
  const t=trioTraits(profiles);
  if(t.difficulty>diffCap)continue;
  const sig=roles.map((role,i)=>`${role}:${[a,b,c][i].id}`).sort().join('|');
  if(curatedTrioSets.has(sig))continue;
  const bottomIdx=roles.indexOf('bottom'),supportIdx=roles.indexOf('support');
  if(bottomIdx>=0&&supportIdx>=0&&curatedDuoSets.has(`bottom:${[a,b,c][bottomIdx].id}|support:${[a,b,c][supportIdx].id}`))continue;
  for(const arch of ARCHETYPES){
   if(!arch.need(t))continue;
   if(t.ad<arch.floor.ad||t.ap<arch.floor.ap)continue;
   const novelty=[a,b,c].filter(champ=>!curatedChampions.has(champ.id)).length;
   const score=arch.fit(t)+novelty;
   const cur=best.get(arch.id);
   const tiebreak=keyOf([a.id,b.id,c.id]);
   if(!cur||score>cur.score||(score===cur.score&&tiebreak<cur.tiebreak)){
    best.set(arch.id,{arch,t,profiles,roles,champs:[a,b,c],score,tiebreak,novelty});
   }
  }
 }
 return [...best.values()]
  .sort((x,y)=>y.score-x.score||x.arch.id.localeCompare(y.arch.id))
  .slice(0,3)
  .map(entry=>buildDescriptor(entry,byId));
}

function cartesian([a,b,c]){
 const out=[];
 for(const x of a)for(const y of b)for(const z of c)out.push([x,y,z]);
 return out;
}

function buildDescriptor({arch,t,profiles,roles,champs,score},byId){
 const members=roles.map((role,i)=>({role,champion:champs[i].id}));
 const ordered=orderMembers(members,profiles,arch.order);
 const names=ordered.map(o=>byId.get(o.champion)?.name||o.champion);
 const opener=ordered[0],follow=ordered[1],carry=ordered[2];
 const why=`${names[0]}${opener.job}，${names[1]}${follow.job}，${names[2]}${carry.job}——${arch.hook}。`;
 const plan=`对线期各自稳住补刀；${names[0]}关键技能转好后先喊集合，${names[1]}留技能跟进。${arch.play}。`;
 const checks=[t.engage>=1?`先手${t.engage}人`:null,t.aoe>=1?'范围衔接':'',t.ad>=.8&&t.ap>=.8?'伤害互补':'',t.difficulty<=6?'难度适中':''].filter(Boolean);
 return {
  id:`creative-${arch.id}`,
  archetype:arch.id,archetypeName:arch.name,tempo:arch.tempo,
  name:`创意 · ${arch.name}`,
  members,ordered:ordered.map(o=>({role:o.role,champion:o.champion,job:o.job})),
  why,plan,
  steps:[`${names[0]}：${opener.job}`,`${names[1]}：${follow.job}`,`${names[2]}：${carry.job}`],
  window:arch.window,
  caution:`${t.peel?'': '缺少保护，被反开时各自先保命；'}${t.difficulty>6?'平均难度偏高，先约好进场顺序再锁；':''}这套由机制规则推导，第一次玩先打一局试试配合。`,
  feasibility:`可行性：${checks.length?checks.join('、'):'基础分工齐备'}`,
  difficulty:'值得尝试',
  bonus:10+Math.min(6,Math.floor(score/4)),
 };
}
