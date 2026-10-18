import {conventionalRole} from './rules.mjs';
import {sidePressureActors} from './side-pressure.mjs';

// Curated mechanism fit, not match statistics or a win probability. Small
// groups spend more of the budget on their actual partnership; larger groups
// must also turn those partnerships into a usable team plan and damage mix.
const BUDGETS={
 2:{connections:28,lanes:20,tactics:32,damage:10,readiness:10},
 3:{connections:25,lanes:18,tactics:32,damage:15,readiness:10},
 4:{connections:23,lanes:16,tactics:32,damage:16,readiness:13},
 5:{connections:22,lanes:15,tactics:32,damage:18,readiness:13},
};
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const round=value=>Math.round(value*10)/10;
const memberKey=m=>`${m.role}:${m.champion}`;
const roleSort={bottom:0,jungle:1,mid:2,support:3,top:4};
const memberOrder=(a,b)=>a.role!==b.role&&a.role in roleSort&&b.role in roleSort?roleSort[a.role]-roleSort[b.role]:memberKey(a).localeCompare(memberKey(b));
const isTank=p=>['tank','supportTank'].includes(p.build);
const offensive=m=>!isTank(m.p)&&m.p.build!=='enchanter';
const ranged=m=>(m.c?.stats?.attackrange??0)>250;
const carry=m=>!!m.p.sustain&&offensive(m);
const name=m=>m.c?.name||m.champion;
const relationshipKey=m=>memberKey(m)+':'+((m.p.peel?1:0)|(m.p.engage?2:0)|(m.p.frontline?4:0)|(m.p.poke?8:0)|(m.p.aoe?16:0)|(carry(m)?32:0)|(offensive(m)?64:0)|(ranged(m)?128:0));

// Return the strongest supported relationship, never the sum of synonymous
// tags. Protection and setup must come from a different member than output.
function relationship(a,b,graph,details,key=null){
 const cache=details?null:graph?.fitCache;
 if(cache?.has(key))return cache.get(key);
 let quality=0,kind='',edge=null,control=0;
 const offer=(value,label)=>{if(value>quality){quality=value;kind=label;}};
 for(const [lead,follow] of [[a,b],[b,a]]){
  if(lead.p.peel&&carry(follow))offer(ranged(follow)?.73:.65,'保护接持续输出');
  if(lead.p.engage&&offensive(follow))offer(follow.p.aoe?.68:follow.p.sustain?.64:.59,'先手接伤害');
  if(lead.p.frontline&&carry(follow))offer(ranged(follow)?.57:.48,'承伤接持续输出');
  if(lead.p.peel&&follow.p.poke&&offensive(follow))offer(.56,'消耗与接应');
 }
 if(a.p.poke&&b.p.poke)offer(.73,'共同远程消耗');
 if(offensive(a)&&offensive(b)&&a.p.sustain!==b.p.sustain)offer(.56,'短轮次与持续输出互补');
 if(sidePressureActors([a,b]))offer(.76,'边线压力与接应');
 if(a.p.engage&&b.p.engage)offer(offensive(a)||offensive(b)?.48:.28,'控制错开接力');
 if(graph){
  const authored=graph.edge(a,b);
  if(authored?.current){offer(authored.family.startsWith('pair:')?.95:.9,authored.name);edge=authored;if(authored.control)control=.85;}
  // Skill-only control relays carry less evidence than a reviewed specific
  // interaction. A conditional stun is not promoted to reliable initiation.
  if(!authored?.current&&quality<.64){
   const skill=graph.skills?.edges([a,b])?.[0];
   if(skill){const lead=skill.a===a.champion?a:b,follow=lead===a?b:a;
    if(offensive(follow)){offer(lead.p.engage?.6:.38,'有条件控制接输出');control=lead.p.engage?.75:.62;}
    if(details&&!edge)edge=skill;
   }
  }
 }
 const result={quality,kind,control,...(details?{edge}:{}),a:a.champion,b:b.champion};
 // Search repeatedly grades the same pairs in many different whole teams.
 // The cache belongs to this graph/input only and retains scalar relations,
 // with all profile/range bits used above in the key; displayed details are
 // always recomputed. Bound it instead of retaining every searched lineup.
 if(cache&&cache.size<16384)cache.set(key,result);
 return result;
}

function connectionQuality(members,graph,details){
 const best=members.map(()=>0),pairs=[],matrix=members.map(()=>members.map(()=>0));let control=0;
 const keys=!details&&graph?.fitCache?members.map(relationshipKey):null;
 for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){
  const link=relationship(members[i],members[j],graph,details,keys?keys[i]+'|'+keys[j]:null);
  matrix[i][j]=matrix[j][i]=link.quality;best[i]=Math.max(best[i],link.quality);best[j]=Math.max(best[j],link.quality);
  control=Math.max(control,link.control);
  if(details&&link.quality)pairs.push(link);
 }
 // A maximum spanning tree asks whether everyone can join the partnership.
 // Counting every pair would give a five-person group ten opportunities to
 // earn points and a duo only one, and reward repeated copies of one function.
 const joined=new Set([0]);let tree=0;
 while(joined.size<members.length){let value=-1,next=-1;
  for(const i of joined)for(let j=0;j<members.length;j++)if(!joined.has(j)&&matrix[i][j]>value){value=matrix[i][j];next=j;}
  joined.add(next);tree+=value;
 }
 return {quality:.65*best.reduce((sum,v)=>sum+v,0)/members.length+.35*tree/(members.length-1),pairs,control};
}

function tacticalQuality(members,connections){
 let best={quality:0,id:'none',name:'尚无共同执行的战术'};
 const offer=(quality,id,label)=>{if(quality>best.quality)best={quality,id,name:label};};
 for(const lead of members){
  const rest=members.filter(m=>m!==lead);
  if(lead.p.engage&&rest.some(offensive)){
   const contribution=rest.reduce((sum,m)=>sum+(offensive(m)?(m.p.aoe||m.p.sustain?1:.85):m.p.frontline||m.p.peel?.75:.3),0)/rest.length;
   offer(.55+.4*contribution,'engage','先手留人，队友接同一目标');
  }
  if(lead.p.peel&&rest.some(carry)){
   const contribution=rest.reduce((sum,m)=>sum+(carry(m)?1:m.p.frontline||m.p.peel?.85:m.p.poke?.7:.45),0)/rest.length;
   offer(.55+.4*contribution,'protect','保护持续输出，接反打');
  }
  if(lead.p.frontline&&rest.some(carry)){
   const contribution=rest.reduce((sum,m)=>sum+(carry(m)?1:m.p.peel||m.p.engage?.85:offensive(m)?.65:.3),0)/rest.length;
   offer(.4+.4*contribution,'front-to-back','前排接触，后排持续输出');
  }
 }
 if(connections.control&&members.some(offensive)){
  const participation=members.reduce((sum,m)=>sum+(offensive(m)||m.p.engage||m.p.peel||m.p.frontline?1:.4),0)/members.length;
  offer(connections.control*participation,'catch','实际控制命中后，集中同一目标');
 }
 const pokers=members.filter(m=>m.p.poke&&offensive(m));
 if(pokers.length>=2){
  const cover=members.some(m=>m.p.peel||m.p.frontline),participation=members.reduce((sum,m)=>sum+(m.p.poke||m.p.peel||m.p.frontline?1:.35),0)/members.length;
  offer((members.length===2?.86:cover?.94:.72)*participation,'poke','共同消耗，保留接应距离');
 }
 if(sidePressureActors(members)){
  const holding=members.filter(m=>m.p.poke||m.p.peel||m.p.frontline).length;
  offer(members.length===2?.9:.78+.16*Math.min(1,holding/2),'side-pressure','边线施压，队友接应或守线');
 }
 const sustained=members.filter(carry),protect=members.filter(m=>m.p.peel||m.p.frontline);
 if(sustained.length&&protect.length)offer(.8+.14*Math.min(1,protect.length/Math.max(1,sustained.length)),'sustained','承接压力，持续输出安全目标');
 return best;
}

function readinessQuality(members){
 const known=members.filter(m=>m.p.window),base=known.filter(m=>m.p.window.kind==='base').length;
 const growing=known.filter(m=>m.p.window.kind==='growth'||m.p.window.kind==='items').length;
 const cover=members.some(m=>m.p.peel||m.p.frontline||m.p.poke);
 // A preparation checkpoint is a condition, not an assertion of power at a minute.
 // Reward a bridge for growing partners; no kit is excluded for lacking hard CC.
 return known.length/members.length*(growing&&base?.95:growing&&cover?.9:growing===members.length?.55:.85);
}

/**
 * Pure, bounded fit using analyzeTeam's already-profiled members and the
 * recommend call's cached graph. No graph construction or catalogue scans.
 * details:false keeps exactly the same score while skipping presentation data.
 * expectedSize is this scoring group's planned size, never five by default.
 */
export function compositionFit(analysis,graph,{expectedSize,details=true}={}){
 const all=(analysis?.members||[]).filter(m=>m?.champion);
 const requested=Math.max(all.length,Number.isFinite(expectedSize)?Math.floor(expectedSize):all.length);
 const members=all.filter(m=>m.p?.reviewed&&m.c).sort(memberOrder);
 const known=members.length,size=Math.min(5,Math.max(2,requested)),confidence=requested?Math.round(100*known/requested)/100:0;
 const insufficient=known<2;
 if(insufficient)return {score:null,rawScore:0,known,size:requested,confidence,breakdown:[],strengths:[],gaps:['至少需要两位资料已核对的英雄，才能判断成员配合。'],reason:'配合资料不足：至少需要两位已知英雄。规则分，不是胜率。'};
 const weights=BUDGETS[size],connections=connectionQuality(members,graph,details),tactics=tacticalQuality(members,connections);
 let laneCount=0,ad=0,ap=0,sustained=0,frontline=0,peel=0,damageDealers=0;
 for(const m of members){
  // Reuse the caller's profile; conventionalRole still applies its reviewed
  // unusual-position exclusions without constructing another profile.
  if(conventionalRole(m.c,m.role,{get:()=>m.p}))laneCount++;
  // Supports/tanks do not impersonate a full second damage carry. In
  // particular, moving an enchanter to mid does not create an AP damage core.
  const weight=m.p.build==='enchanter'?.2:m.role==='support'?.25:isTank(m.p)?.45:1;
  ad+=(m.p.damageWeights?.ad||0)*weight;ap+=(m.p.damageWeights?.ap||0)*weight;
  if(carry(m))sustained++;if(m.p.frontline)frontline++;if(m.p.peel)peel++;if(offensive(m))damageDealers++;
 }
 const minority=ad+ap?Math.min(ad,ap)/(ad+ap):0;
 const damage=clamp(minority/({2:.14,3:.2,4:.23,5:.25}[size]));
 const lanes=laneCount/known;
 const components={connections:connections.quality,lanes,tactics:tactics.quality,damage,readiness:readinessQuality(members)};
 const gaps=[];let deduction=0;
 const penalize=(points,text)=>{deduction+=points;if(details)gaps.push(text);};
 if(!damageDealers)penalize(20,'缺少能接控制兑现伤害的成员，控制或保护不能替代输出。');
 if(size>=3){
  if(!sustained)penalize(size===3?5:9,'持续输出缺口：一轮技能后不宜久战，资源争夺也需要额外处理。');
  if(!frontline&&sustained&&tactics.id!=='poke')penalize(size===3?4:8,'缺少能承接正面压力的成员，输出位置依赖走位与反打。');
  if(!peel&&members.filter(m=>carry(m)&&ranged(m)).length>=2)penalize(size===3?5:9,'多位远程持续输出缺少队友保护，受到突进时职责重叠。');
  if(damageDealers>=known-1&&!frontline&&!peel)penalize(size===3?4:7,'输出职责集中，缺少接应者，不能只靠每人各自打伤害。');
  if(size>=4&&sustained>=known-1&&!frontline)penalize(7,'持续输出成员过多，单一保护者难以同时照顾所有进场和输出位置。');
  if(minority<.08)penalize(size===3?3:6,'伤害类型明显集中，对手可集中购买一种防御。');
 }
 const positioned=members.filter(m=>m.role),duplicates=positioned.length-new Set(positioned.map(m=>m.role)).size;
 if(duplicates)penalize(duplicates*12,'成员位置冲突，需要先确定各自分路。');
 const duplicateHeroes=known-new Set(members.map(m=>m.champion)).size;
 if(duplicateHeroes)penalize(duplicateHeroes*20,'同一英雄重复，阵容无法按这些成员同时执行。');
 const subtotal=Object.entries(weights).reduce((sum,[key,max])=>sum+max*components[key],0);
 // Missing or unreviewed participants reduce both the observed score and its
 // ceiling, rather than allowing one good pair to stand in for unknown allies.
 const completeness=known/requested,rawScore=clamp((subtotal-deduction)*(.6+.4*completeness),0,100*completeness);
 const score=Math.round(rawScore);
 if(!details)return {score,rawScore,known,size:requested,confidence};
 const strengths=[];
 const strongest=[...connections.pairs].sort((a,b)=>b.quality-a.quality||`${a.a}:${a.b}`.localeCompare(`${b.a}:${b.b}`)).slice(0,2);
 for(const link of strongest)if(link.quality>=.56){const pair=members.filter(m=>[link.a,link.b].includes(m.champion)).map(name).join('与');strengths.push(`${pair}：${link.kind}${link.edge?.current?'（已核对技能条件）':''}`);}
 if(tactics.quality>=.65)strengths.push(tactics.name);
 if(damage>=.8&&size>=3)strengths.push('物理与法术伤害均有实际来源');
 if(!connections.pairs.some(p=>p.quality>=.56))gaps.push('暂无已核对的专属联动，主要按共同职责或有条件接控估算，需约定共同目标。');
 if(laneCount<positioned.length)gaps.push('存在非常规分路，需另外确认对线与经济分配。');
 if(positioned.length<known)gaps.push(`${known-positioned.length} 位公开队友分路未知：只参考英雄特征，不计其分路可执行分。`);
 if(known<requested)gaps.push(`仅 ${known}/${requested} 位成员有已核对资料，其余不按已有配合计分。`);
 const labels={connections:'成员衔接',lanes:'分路可执行',tactics:'共同战术',damage:'伤害来源',readiness:'行动条件'};
 const breakdown=Object.entries(weights).map(([key,max])=>({key,label:labels[key],points:round(max*components[key]),max}));
 if(deduction)breakdown.push({key:'gaps',label:'明显缺口',points:-deduction,max:0});
 const correction=round(score-breakdown.reduce((sum,row)=>sum+row.points,0));
 if(correction)breakdown.push({key:'confidence',label:'完整度与取整',points:correction,max:0});
 return {score,rawScore,known,size:requested,confidence,breakdown,strengths,gaps,tactic:tactics,
  relationships:strongest.map(({edge,...link})=>({...link,...(edge?.current?{condition:edge.condition,sourceUrls:edge.sourceUrls}:{} )})),
  reason:`${known} 人配合：${breakdown.map(row=>`${row.label} ${row.points}${row.max?'/'+row.max:''}`).join(' · ')}。${known<requested?'资料不全已降低分数。':''}规则分，不是胜率。`};
}
