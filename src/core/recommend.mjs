import { ROLES, DUOS, TRIOS, CROSS_SYNERGIES, profile,conventionalRole } from './rules.mjs';
import {draftTargets,scopeSlots,CLIENT_POSITION_ROLES} from './draft.mjs';
export {clearClientPicks} from './draft.mjs';
import {comboLoadout,loadoutOptions} from './loadouts.mjs';
import {generateCreativeTrios} from './creative-trios.mjs';
import {creativePlanMatches,creativeMemberCombo,validateCreativePlan} from './creative-plan.mjs';
import {createCooperationGraph,cooperationPlan,cooperationSeeds} from './cooperation.mjs';
import {createPairStatisticsIndex} from './pair-statistics.mjs';
import {comboMembers,comboKey} from './combo-members.mjs';
import {strategyTraits,strategySummary,summarizeEnemyTraits,opponentFit,threatNotes,describeCurve,describeForgiveness,controlChainLabel} from './strategy.mjs';

export function createSlots() {
 return ROLES.map(r=>({role:r.id, champion:null, locked:false, party:['mid','bottom','support'].includes(r.id)}));
}
export function validateSlots(slots, champions) {
 if(!Array.isArray(slots)||slots.length!==5||slots.some(s=>!s||typeof s!=='object')) throw new Error('阵容位置格式不正确');
 if(new Set(slots.map(s=>s.role)).size!==5||slots.some(s=>!ROLES.some(r=>r.id===s.role))) throw new Error('请为五个位置各保留一个槽位');
 const ids=slots.map(s=>s.champion).filter(Boolean);
 if(new Set(ids).size!==ids.length)throw new Error('同一英雄不能出现在我方两个位置');
 const available=new Set(champions.map(c=>c.id));
 if(ids.some(id=>!available.has(id)))throw new Error('所选英雄已不在当前资料中，请重新选择');
}
export function analyzeTeam(slots, champions, context) {
 const byId=context?.byId||new Map(champions.map(c=>[c.id,c]));
 const getProfile=s=>{
  const key=`${s.champion}:${s.role}`;
  if(context?.profiles?.has(key))return context.profiles.get(key);
  const value=profile(byId.get(s.champion),s.role);context?.profiles?.set(key,value);return value;
 };
 const members=slots.filter(s=>byId.has(s.champion)).map(s=>{const c=byId.get(s.champion),base=getProfile(s),combo=currentCombo(slots,c.id,s.role,context?.catalogStatus,context?.comboCache),loadout=loadoutOptions(c,s.role,'rift').find(l=>l.id===comboLoadout(combo,c,s.role));
  const p=loadout?.damage?{...base,damage:loadout.damage,damageWeights:loadout.damage==='ap'?{ad:0.1,ap:0.9}:loadout.damage==='ad'?{ad:0.9,ap:0.1}:{ad:0.5,ap:0.5}}:base;
  return {...s,c,p};});
 const traits={frontline:0,engage:0,peel:0,sustain:0,poke:0,aoe:0,ad:0,ap:0};
 for(const m of members) {
  for(const k of ['frontline','engage','peel','sustain','poke','aoe'])if(m.p[k])traits[k]++;
  const weight=m.role==='support'?.25:m.p.build==='tank'?.45:1;
  traits.ad+=m.p.damageWeights.ad*weight;traits.ap+=m.p.damageWeights.ap*weight;
 }
 const graph=context?.cooperationGraph||createCooperationGraph(champions),controlEdges=[];
 for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){const edge=graph.edge(members[i],members[j]);if(edge)controlEdges.push(edge);}
 const control=controlChainLabel(traits,controlEdges),warnings=[];
 if(members.length>=3){
  if(!traits.frontline)warnings.push('前排偏少，避免直接接正面团战');
  if(!traits.engage)warnings.push(control==='有条件控制接力'?'先手依赖具体技能条件，成立后再接力，不当作稳定随时可开':'先手偏少，需要消耗、视野或抓失误来开局');
  if(!traits.peel)warnings.push('保护偏少，后排要保留自保手段');
  if(traits.ap<.4)warnings.push('法术伤害偏少，留意对方的护甲装备');
  if(traits.ad<.4)warnings.push('物理伤害偏少，留意对方的魔抗装备');
  if(!traits.sustain)warnings.push('持续输出偏少，注意技能打完后的撤退');
 }
 const labels={frontline:'前排',engage:'开团',peel:'保护',sustain:'持续输出',poke:'消耗',aoe:'范围伤害'};
 const balancedDamage=traits.ad>=.75&&traits.ap>=.75;
 const avgDifficulty=members.length?members.reduce((sum,m)=>sum+(Number.isFinite(m.p.difficulty)?m.p.difficulty:5),0)/members.length:null;
 return {members,traits,warnings,known:members.length,
  strengths:Object.entries(labels).filter(([k])=>traits[k]>0).map(([,v])=>v),
  missing:Object.entries(labels).filter(([k])=>!traits[k]).map(([,v])=>v),
  threats:threatNotes({traits},context?.enemyTraits),
  curve:describeCurve(traits,members),forgiveness:describeForgiveness(traits,balancedDamage),
  control,avgDifficulty,
  damageMix:!traits.ad&&!traits.ap?'none':balancedDamage?'mixed':traits.ad>=traits.ap?'ad':'ap'};
}
function findDuos(slots){
 const filled=slots.filter(s=>s.champion).map(s=>`${s.role}:${s.champion}`),{duoByMembers,duoOrder}=comboIndex(),found=[];
 for(let i=0;i<filled.length;i++)for(let j=i+1;j<filled.length;j++){
  const duo=duoByMembers.get([filled[i],filled[j]].sort().join('|'));if(duo)found.push(duo);
 }
 return found.sort((a,b)=>duoOrder.get(a)-duoOrder.get(b));
}
const findDuo=slots=>findDuos(slots)[0];
export function findTrio(slots){
 // Catalog trios have unique member sets, so subset lookup is equivalent to
 // the old linear scan and returns the same single match.
 const filled=slots.filter(s=>s.champion).map(s=>`${s.role}:${s.champion}`);
 if(filled.length<3)return undefined;
 const {trioByMembers,trioOrder}=comboIndex();
 let best=null;
 for(let i=0;i<filled.length;i++)for(let j=i+1;j<filled.length;j++)for(let k=j+1;k<filled.length;k++){
  const t=trioByMembers.get([filled[i],filled[j],filled[k]].sort().join('|'));
  if(t&&(best===null||trioOrder.get(t)<trioOrder.get(best)))best=t;
 }
 return best??undefined;
}
export function currentCombo(slots,champion,role,status={},comboCache=null,creativePlan=null){
 if(creativePlanMatches(creativePlan,slots)){const own=champion||creativePlan.members[0].champion,position=role||creativePlan.members[0].role,creative=creativeMemberCombo(creativePlan,own,position);if(creative)return creative;}
 const sig=signature(slots);
 let matches=comboCache?.get(sig);
 if(!matches){
  // Indexed equivalent of the old full-catalog scan: every trio whose member
  // set is contained in the slots, in catalog order, then the bot-lane duo.
  // `status` is constant within one recommend call, so caching by slots
  // signature is safe; external callers without a cache take the slow path.
  const filled=slots.filter(s=>s.champion).map(s=>`${s.role}:${s.champion}`);
  const {trioByMembers,trioOrder}=comboIndex();
  const found=new Map();
  for(let i=0;i<filled.length;i++)for(let j=i+1;j<filled.length;j++)for(let k=j+1;k<filled.length;k++){
   const t=trioByMembers.get([filled[i],filled[j],filled[k]].sort().join('|'));
   if(t)found.set(t,(trioOrder.get(t)??0));
  }
  const trios=[...found.keys()].sort((a,b)=>found.get(a)-found.get(b));
  matches=[...trios,...findDuos(slots)].filter(c=>c&&!status?.[c.id]?.invalid);
  comboCache?.set(sig,matches);
 }
 if(!champion)return matches[0]||null;
 const relevant=matches.filter(c=>comboLoadout(c,{id:champion},role)!==null);
 return relevant.find(c=>comboLoadout(c,{id:champion},role)!=='default')||relevant[0]||null;
}
export function comboContextKnown(slots,champion,role,previousComboId,previousCreativePlan=null){
 // Missing teammates are unknown, not evidence that an existing combo broke.
 if(!slots.some(s=>s.role===role&&s.champion===champion))return false;
 const previous=previousCreativePlan&&previousComboId&&previousCreativePlan.id===previousComboId?validateCreativePlan(previousCreativePlan):[...TRIOS,...DUOS].find(c=>c.id===previousComboId);
 if(previous){
  const members=previous.members||[{role:'bottom',champion:previous.carry},{role:'support',champion:previous.support}];
  if(members.some(m=>slots.some(s=>s.role===m.role&&s.champion&&s.champion!==m.champion)))return true;
  return members.every(m=>slots.some(s=>s.role===m.role&&s.champion===m.champion));
 }
 return ['bottom','support'].includes(role)?['bottom','support'].every(r=>slots.some(s=>s.role===r&&s.champion)):slots.every(s=>s.champion);
}
const SINGLE_ROLE_WEIGHTS={top:{frontline:4,sustain:4,engage:2,peel:1,poke:2,aoe:1},jungle:{frontline:2,sustain:2,engage:4,peel:2,poke:1,aoe:2},
  mid:{frontline:1,sustain:3,engage:2,peel:1,poke:3,aoe:2},bottom:{frontline:0,sustain:5,engage:1,peel:1,poke:2,aoe:2},support:{frontline:3,sustain:0,engage:4,peel:5,poke:2,aoe:1}};
function grade(slots, champions, style, requestedIds=[],roleWeights={},context) {
 slots=scopeSlots(slots,context?.scope);
 const cacheKey=context?.gradeCache?signature(slots)+'|'+[...requestedIds].sort().join(','):null;
 const cached=cacheKey?context.gradeCache.get(cacheKey):null;
 if(cached)return cached;
 const a=analyzeTeam(slots,champions,context),t=a.traits;
 // One known player cannot cover an entire team. Use lane responsibilities
 // rather than rewarding a lone champion for being tank, initiator and peel
 // simultaneously. Source position frequency and player preferences remain
 // separate signals below; these weights are curated, not win probabilities.
 const ownWeights=a.members.length===1?SINGLE_ROLE_WEIGHTS[a.members[0].role]:null;
 let score=ownWeights?20+Object.entries(ownWeights).reduce((sum,[key,weight])=>sum+Math.min(t[key],1)*weight,0):
  Math.min(t.frontline,1)*10+Math.min(t.engage,1)*10+Math.min(t.peel,1)*6+Math.min(t.sustain,1)*10+Math.min(t.ap,1)*8+Math.min(t.ad,1)*8+Math.min(t.aoe,1)*3;
 score-=Math.max(0,t.frontline-2)*4;
 // Overstacking the same function wastes picks; the curve stays shallow so
 // curated combinations keep their lead.
 score-=Math.max(0,t.engage-3)*2;
 if(a.members.length>=3){
  if(t.ad>=.75&&t.ap>=.75)score+=6;
  else if(t.ad<.4||t.ap<.4)score-=6;
 }
 const fit=opponentFit(a,context?.enemyTraits);
 score+=fit.adjustment;
 const foundDuo=findDuo(slots),foundTrio=findTrio(slots);
 const duo=context?.catalogStatus?.[foundDuo?.id]?.invalid?null:foundDuo;
 const trio=context?.catalogStatus?.[foundTrio?.id]?.invalid?null:foundTrio;
 // Curated difficulty is authored per combination, not a win-rate claim:
 // hard combos cost practice time, easy ones fit a steady style.
 const comboDifficulty=(trio||duo)?.difficulty;
 if(comboDifficulty==='较高'&&style!=='wild')score-=trio?3:2;
 else if(comboDifficulty==='容易'&&style==='balanced')score+=2;
 if(a.members.length>=3&&style==='balanced'&&Number.isFinite(a.avgDifficulty))score-=Math.max(0,a.avgDifficulty-6)*2;
 // Control into AoE is the most reliable teamfight pattern in the data model.
 if(a.members.length>=3&&t.engage>=1&&t.aoe>=1)score+=3;
 const scope=context?.scope;
 if(scope==='party'&&trio)score+=4;
 if(scope==='bot'){
  // Duo mode is about the lane: poke/sustain/engage decide the laning phase,
  // and a mixed damage pair is harder to itemize against with one stat.
  score+=Math.min(t.poke+t.sustain,2)*2+Math.min(t.engage,1)*2;
  // Support damage counts less over a full game but matters a lot in lane,
  // so the lane bonus uses lower mixed-damage bars than the team bonus.
  if(t.ad>=.5&&t.ap>=.2)score+=3;
  if(Number.isFinite(a.avgDifficulty))score-=a.avgDifficulty*(style==='balanced'?.4:0);
 }
 if(trio)score+=33+(style===trio.style?5:0);
 if(duo)score+=style==='wild'?(duo.style==='wild'?36:duo.style==='fun'?23:9):style==='fun'?(duo.style==='fun'?29:duo.style==='wild'?16:20):(duo.style==='balanced'?28:duo.style==='fun'?17:3);
 const ids=new Set(slots.map(s=>s.champion));
 const linkHit=new Set(),{linkByChamp}=comboIndex();
 for(const id of ids)for(const link of linkByChamp.get(id)||[])if(ids.has(link[0])&&ids.has(link[1]))linkHit.add(link);
 const connections=CROSS_SYNERGIES.filter(l=>linkHit.has(l));
 score+=connections.length*7;
 if(duo)score+=(duo.partners||[]).filter(id=>ids.has(id)).length*7;
 const adaptive=context?.cooperationGraph&&scope!=='solo'?cooperationPlan(slots.filter(s=>scope==='bot'?['bottom','support'].includes(s.role):s.party),context.cooperationGraph):null;
 if(adaptive)score+=adaptive.bonus;
 const pairEvidence=scope==='solo'?null:context?.pairStatistics?.forMembers(slots.filter(s=>scope==='bot'?['bottom','support'].includes(s.role):s.party));
 score+=pairEvidence?.bonus||0;
 const tempo=context?.play?.tempo;if(tempo&&tempo!=='any')score+=Math.min(strategyTraits(a,trio||duo||adaptive)[tempo]||0,12)*3;
 for(const m of a.members){
  if(!requestedIds.includes(m.champion))continue;
  if(context?.poolMode==='prefer'&&context.pool.has(m.champion))score+=12;
  if(!m.p.roles.includes(m.role))score-=9;
  score-=m.p.difficulty*(style==='balanced'?.65:style==='fun'?.2:0);
  if(context?.play?.difficulty==='easy')score-=m.p.difficulty*2;
  const rolePool=context?.rolePools?.[m.role];if(rolePool?.mode==='prefer'&&rolePool.heroes.includes(m.champion))score+=15;
  score+=(roleWeights[`${m.champion}:${m.role}`]||0)*(style==='balanced'?8:style==='fun'?3:0);
  if(m.role==='support'&&['crit','onhit','meleeCrit','fighter'].includes(m.p.build)&&!duo)score-=9;
 }
 // Score the known team, but name the plan around controllable party members.
 // Keep useful mixed-party catalog plans when no full-party mechanism exists.
 const party=slots.filter(s=>s.party),valid=combo=>combo&&!context?.catalogStatus?.[combo.id]?.invalid?combo:undefined;
 const relevant=combo=>{
  if(!combo||party.length<2)return !!combo;
  const members=combo.members||[{role:'bottom',champion:combo.carry},{role:'support',champion:combo.support}];
  const belongs=m=>party.some(s=>s.role===m.role&&s.champion===m.champion);
  return adaptive?members.length===party.length&&members.every(belongs):members.some(belongs);
 };
 const partyDuo=valid(findDuo(party)),partyTrio=valid(findTrio(party));
 const planDuo=(relevant(partyDuo)?partyDuo:undefined)||(relevant(duo)?duo:undefined),planTrio=(relevant(partyTrio)?partyTrio:undefined)||(relevant(trio)?trio:undefined);
 const out={score,analysis:a,duo:planDuo,trio:planTrio,connections,opponentFit:fit,adaptive,pairEvidence};
 if(cacheKey)context.gradeCache.set(cacheKey,out);
 return out;
}
const signature=slots=>slots.map(s=>`${s.role}:${s.champion||'-'}`).join('|');
function summaryCombo(entry){
 // A party plan describes that group. In whole-team mode, a partial party
 // cannot replace the strategy of the other already picked team members.
 const adaptive=entry.adaptive,coversAnalysis=adaptive&&(adaptive.kind==='shared'||adaptive.members.length===entry.analysis.members.length);
 return entry.trio||entry.duo||(entry.creative&&{tempo:entry.creative.tempo,why:entry.creative.why,risk:entry.creative.caution})||(coversAnalysis&&{tempo:adaptive.tempo,why:adaptive.why,risk:adaptive.failures.join(' ')});
}
// Catalog lookup indexes. Rebuilt only when the catalog arrays are replaced
// (configureRuleCatalog reassigns them); reads are O(1)/O(subsets) instead of
// full scans inside every grade call. Order-sensitive consumers re-sort by
// catalog order, so scoring semantics never change.
let comboIndexCache={duos:null,trios:null,links:null};
function comboIndex(){
 if(comboIndexCache.duos!==DUOS||comboIndexCache.trios!==TRIOS||comboIndexCache.links!==CROSS_SYNERGIES){
  const duoByMembers=new Map(DUOS.map(d=>[comboKey(d),d])),duoOrder=new Map(DUOS.map((d,i)=>[d,i]));
  const trioByMembers=new Map(),trioOrder=new Map();
  TRIOS.forEach((t,i)=>{trioOrder.set(t,i);if(t&&Array.isArray(t.members))trioByMembers.set(t.members.map(m=>`${m.role}:${m.champion}`).sort().join('|'),t);});
  const linkByChamp=new Map();
  for(const link of CROSS_SYNERGIES){for(const id of [link[0],link[1]]){if(!linkByChamp.has(id))linkByChamp.set(id,[]);linkByChamp.get(id).push(link);}}
  comboIndexCache={duos:DUOS,trios:TRIOS,links:CROSS_SYNERGIES,duoByMembers,duoOrder,trioByMembers,trioOrder,linkByChamp};
 }
 return comboIndexCache;
}
export function recommend({slots,champions,style='fun',excluded=[],enemy=[],visibleEnemies=enemy,publicPicks=[],sourceRoles=[],limit=5,offset=0,builds={},pairStatistics=null,buildSource,patch,pool:heroPool=[],poolMode='off',scope='context',soloRole='',soloChampion=null,play={},rolePools={},catalogStatus={},creativePlan=null}) {
 validateSlots(slots,champions);
 limit=Number.isInteger(limit)?Math.max(0,limit):5;
 offset=Number.isInteger(offset)?Math.max(0,offset):0;
 if(scope==='solo'){
  const options={champions,style,excluded,enemy,visibleEnemies,publicPicks,sourceRoles,builds,pairStatistics,buildSource,patch,pool:heroPool,poolMode,play,rolePools,catalogStatus,creativePlan};
  const targets=soloChampion?[]:draftTargets(slots,'solo',soloRole);
  if(!targets.length)return recommend({...options,slots:slots.map(s=>({...s,party:false})),limit:1}).map(r=>({...r,slots:structuredClone(slots),scope:'solo',soloRole:soloRole||slots.find(s=>s.champion===soloChampion)?.role||'',title:'我的本局配置',reason:'已选英雄保留，可查看自己的出装与符文；本局位置由你确认。'}));
  const candidates=[],errors=[];
  for(const role of targets){
   try{candidates.push(...recommend({...options,slots:slots.map(s=>({...s,party:s.role===role})),limit:offset+limit,offset:0}).map(r=>({...r,scope:'solo',soloRole:role,title:`${ROLES.find(r=>r.id===role).name} · ${champions.find(c=>c.id===r.slots.find(s=>s.role===role).champion)?.name}`,slots:r.slots.map(s=>({...s,party:slots.find(prior=>prior.role===s.role).party}))})));}
   catch(error){errors.push(error);}
  }
  if(!candidates.length&&errors.length)throw errors[0];
  // Interleave lanes so one lane cannot consume the first page.
  const ordered=[];
  for(let i=0;i<offset+limit;i++)for(const role of targets){const result=candidates.filter(r=>r.targets.includes(role))[i];if(result)ordered.push(result);}
  return ordered.slice(offset,offset+limit);
 }
 // Profiles are constant for one calculation; reuse them across the search beam.
 // Visibility affects fit in every draft; `enemy` separately controls which
 // heroes cannot be selected. Keep the legacy argument as the default.
 const context={byId:new Map(champions.map(c=>[c.id,c])),profiles:new Map(),pool:new Set(heroPool),poolMode,scope,play,rolePools,catalogStatus,enemyTraits:summarizeEnemyTraits(visibleEnemies,champions),comboCache:new Map(),gradeCache:new Map()};
 context.cooperationGraph=createCooperationGraph(champions);
 context.pairStatistics=createPairStatisticsIndex(pairStatistics,champions,{source:buildSource,patch});
 // Rune-page samples are used only as a coarse position-frequency signal.
 // They do not measure how strong a champion or a composition is.
 const maxSamples={},roleWeights={};
 for(const ref of Object.values(builds))if(Number.isFinite(ref.runeSamples))maxSamples[ref.champion]=Math.max(maxSamples[ref.champion]||1,ref.runeSamples);
 for(const ref of Object.values(builds))if(maxSamples[ref.champion])roleWeights[`${ref.champion}:${ref.role}`]=Math.max(0,Math.min(1,ref.runeSamples/maxSamples[ref.champion]));
 const targets=draftTargets(slots,scope);
 if(!targets.length){
  const g=grade(slots,champions,style,[],{},context);
  if(creativePlanMatches(creativePlan,slots)&&creativePlan.members.every(m=>scopeSlots(slots,scope).some(s=>s.role===m.role))){
   const plan=validateCreativePlan(creativePlan,slots),cooperation=['cooperation','shared'].includes(plan.archetype);
   // Accepted picks are locked for the next search. That must not grant new
   // replacement permissions to friends who were fixed before the search.
   // Legacy plans have no record of that permission: require an explicit unlock.
   const editableTargets=(plan.editableTargets||[]).filter(role=>scopeSlots(slots,scope).some(s=>s.role===role&&(s.party||['bot','solo'].includes(scope))));
   return [{id:signature(slots),slots:structuredClone(slots),...g,trio:null,duo:null,creative:cooperation?null:plan,adaptive:cooperation?(plan.shared||plan.cooperation):g.adaptive,creativePlan:plan,origin:cooperation?'adaptive':'creative',scope,title:plan.name,reason:plan.why,reasonPoints:[plan.why],targets:[],editableTargets,contributions:[],strategy:strategySummary(g.analysis,{tempo:plan.tempo,why:plan.why,risk:plan.caution},play.tempo,context.enemyTraits),catalogState:null}];
  }
  return [{id:signature(slots),slots:structuredClone(slots),...g,scope,origin:g.trio||g.duo?'curated':g.adaptive?'adaptive':'generated',title:g.trio?.name||g.duo?.name||g.adaptive?.name||'当前阵容',reason:'当前范围没有未锁定位置，下面展示已选英雄的配合与配置。',reasonPoints:['当前范围没有未锁定位置，下面展示已选英雄的配合与配置。'],targets:[],contributions:[],strategy:strategySummary(g.analysis,summaryCombo(g),play.tempo,context.enemyTraits),catalogState:catalogStatus[(g.trio||g.duo)?.id]||null}];
 }
 const fixed=slots.map(s=>{if(!targets.includes(s.role))return {...s};const {clientCellId,manualPosition,...draft}=s;return {...draft,champion:null};});
 if(poolMode==='only'&&!heroPool.some(id=>context.byId.has(id)))throw Error('先添加英雄池，或切换为“全部英雄”');
 const blocked=new Set([...excluded,...enemy.filter(Boolean),...publicPicks.filter(id=>context.byId.has(id)),...fixed.map(s=>s.champion).filter(Boolean)]);
 const {byId}=context;
 const supportedBySource=new Set((Array.isArray(sourceRoles)?sourceRoles:[]).filter(r=>byId.has(r?.champion)&&ROLES.some(role=>role.id===r.role)).map(r=>r.champion+':'+r.role));
 const candidateSets={};
 // Role-profile cache for candidate filtering (analyzeTeam keeps its own
 // loadout-aware cache in context.profiles; this one is role-only).
 const profCache=new Map();
 const profOf=(c,role)=>{const k=`${c.id}:${role}`;let p=profCache.get(k);if(!p){p=profile(c,role);profCache.set(k,p);}return p;};
 for(const role of targets) {
  const allowed=c=>!blocked.has(c.id)&&(poolMode!=='only'||context.pool.has(c.id))&&(rolePools[role]?.mode!=='only'||rolePools[role].heroes?.includes(c.id))&&(role!=='bottom'||play.meleeBottom!==false||!Number.isFinite(c.stats?.attackrange)||c.stats.attackrange>250);
  let candidates=champions.filter(c=>allowed(c)&&(play.unusual===false?conventionalRole(c,role,profCache):profOf(c,role).roles.includes(role)||supportedBySource.has(c.id+':'+role)));
  // Curated pairs can deliberately use unconventional roles.
  const extras=play.unusual===false?[]:[...DUOS.filter(d=>!catalogStatus[d.id]?.invalid).flatMap(d=>comboMembers(d).filter(m=>m.role===role).map(m=>m.champion)),...TRIOS.filter(t=>!catalogStatus[t.id]?.invalid).flatMap(t=>t.members.filter(m=>m.role===role).map(m=>m.champion))];
  for(const id of extras)if(byId.has(id)&&allowed(byId.get(id))&&!candidates.some(c=>c.id===id))candidates.push(byId.get(id));
  candidates=candidates.map(c=>({c,score:grade(fixed.map(s=>s.role===role?{...s,champion:c.id}:s),champions,style,[c.id],roleWeights,context).score})).sort((a,b)=>b.score-a.score||a.c.id.localeCompare(b.c.id));
  candidateSets[role]=candidates.map(x=>x.c);
  if(!candidates.length)throw new Error(`${ROLES.find(r=>r.id===role).name}没有可选英雄，请调整英雄池或排除条件`);
 }
 // Include viable catalog pairs as anchors so personal and unusual pairs survive pruning.
 const seeds=[fixed];
 for(const duo of DUOS) {
  if(catalogStatus[duo.id]?.invalid)continue;
  const members=comboMembers(duo);
  if(members.some(m=>{const slot=fixed.find(s=>s.role===m.role);return slot.champion?slot.champion!==m.champion:!targets.includes(m.role)||!candidateSets[m.role]?.some(c=>c.id===m.champion);}))continue;
  if(fixed.some(s=>s.champion&&members.some(m=>m.champion===s.champion&&m.role!==s.role)))continue;
  seeds.push(fixed.map(s=>{const m=members.find(m=>m.role===s.role);return m?{...s,champion:m.champion}:s;}));
 }
 for(const trio of TRIOS){
  if(catalogStatus[trio.id]?.invalid||!trio.members.some(m=>targets.includes(m.role)))continue;
  if(trio.members.some(m=>{const slot=fixed.find(s=>s.role===m.role);return slot.champion?slot.champion!==m.champion:!targets.includes(m.role)||!candidateSets[m.role]?.some(c=>c.id===m.champion);}))continue;
  if(fixed.some(s=>s.champion&&trio.members.some(m=>m.champion===s.champion&&m.role!==s.role)))continue;
  seeds.push(fixed.map(s=>{const m=trio.members.find(m=>m.role===s.role);return m?{...s,champion:m.champion}:s;}));
 }
 const partyMembers=fixed.filter(s=>scope==='bot'?['bottom','support'].includes(s.role):s.party);
 for(const members of cooperationSeeds({members:partyMembers,targets,candidateSets,graph:context.cooperationGraph})){
  const seed=fixed.map(s=>{const member=members.find(m=>m.role===s.role);return member?{...s,champion:member.champion}:s;});
  const ids=seed.map(s=>s.champion).filter(Boolean);if(new Set(ids).size===ids.length)seeds.push(seed);
 }
 // Creative trios: trait-derived three-person ideas outside the catalog.
 // They fill all three open roles at once, so they only apply when exactly
 // three positions are being drafted. Curated trios keep their scoring lead;
 // creative entries earn a smaller flat bonus (see below) and are labeled.
 const creativeBySig=new Map();
 for(const def of generateCreativeTrios({targets,candidateSets,champions,style})){
  const trioSlots=fixed.map(s=>{const m=def.members.find(m=>m.role===s.role);return m?{...s,champion:m.champion}:s;});
  const picked=trioSlots.map(s=>s.champion).filter(Boolean);
  if(new Set(picked).size!==picked.length||trioSlots.some(s=>targets.includes(s.role)&&!s.champion))continue;
  seeds.push(trioSlots);
  creativeBySig.set(signature(trioSlots),def);
 }
 let finished=[];
 for(const seed of seeds) {
  let beam=[{slots:seed,score:0}];
  for(const role of ['bottom','support','jungle','mid','top'].filter(r=>targets.includes(r)&&!seed.find(s=>s.role===r).champion)) {
   const next=[];
   for(const partial of beam)for(const c of candidateSets[role]) {
    if(partial.slots.some(s=>s.champion===c.id))continue;
    const result=partial.slots.map(s=>s.role===role?{...s,champion:c.id}:s);
    const g=grade(result,champions,style,result.filter(s=>targets.includes(s.role)).map(s=>s.champion),roleWeights,context);
    next.push({slots:result,score:g.score});
   }
   beam=next.sort((a,b)=>b.score-a.score).slice(0,28);
  }
  finished.push(...beam);
 }
 const unique=new Map();
 for(const entry of finished){
  if(entry.slots.some(s=>targets.includes(s.role)&&!s.champion))continue;
  const g=grade(entry.slots,champions,style,entry.slots.filter(s=>targets.includes(s.role)).map(s=>s.champion),roleWeights,context);
  const creative=creativeBySig.get(signature(entry.slots));
  unique.set(signature(entry.slots),creative?{...entry,...g,score:g.score+creative.bonus,creative}:{...entry,...g});
 }
 // An executable plan for the whole party is
 // more useful than a higher count of generic team functions. All hard pick
 // restrictions have been applied before this preference. A partial duo or
 // an old link to the third friend does not qualify as a complete plan.
 const prioritizeCooperation=[2,3].includes(partyMembers.length);
 const actionable=entry=>{
  if(!prioritizeCooperation)return false;
  const combo=entry.trio||entry.duo,members=combo?(combo.members||[{role:'bottom',champion:combo.carry},{role:'support',champion:combo.support}]):entry.adaptive?.members;
  if(!members||members.length!==partyMembers.length||!members.every(m=>partyMembers.some(p=>p.role===m.role)&&entry.slots.some(s=>s.role===m.role&&s.champion===m.champion)))return false;
  if(combo)return 3;
  if(entry.adaptive.kind==='shared')return .5;
  if(!members.every(m=>entry.adaptive.edges.some(e=>e.current&&[e.a,e.b].includes(m.champion))))return 0;
  // A general control/follow-up plan must not displace reviewed interactions
  // such as Ahri/Vi merely because it can be generated for many more allies.
  return entry.adaptive.edges.some(e=>e.current&&e.family.startsWith('skills:'))?1:2;
 };
 const matching=new Map([...unique.values()].map(entry=>[entry,play.tempo&&play.tempo!=='any'&&strategySummary(entry.analysis,summaryCombo(entry),play.tempo).matched]));
 // An explicit play preference must remain reachable on the first page.
 // Within matching choices, keep full-party and authored plans ahead of
 // general mechanisms. Without a matching candidate, retain normal fallback.
 const priority=entry=>Number(actionable(entry))+(matching.get(entry)?4:0);
 const order=(a,b)=>priority(b)-priority(a)||b.score-a.score||signature(a.slots).localeCompare(signature(b.slots));
 const sorted=[...unique.values()].sort(order);
 const chosen=[];
 // Keep the best result for every curated duo reachable on reroll. Filling
 // the entire pool with minor variants of a few high scores hides the library.
 const anchors=new Map();for(const entry of sorted){const key=(entry.trio||entry.duo)?.id;if(key&&!anchors.has(key))anchors.set(key,entry);}
 // Creative ideas get the same anchor treatment (one best entry per
 // archetype) so they survive the pool cap and stay discoverable.
 const creativeAnchors=new Map();for(const entry of sorted){if(entry.creative&&!creativeAnchors.has(entry.creative.archetype))creativeAnchors.set(entry.creative.archetype,entry);}
 // Preserve one best current cooperation per mechanism through the cap, as
 // for catalog and creative anchors. Otherwise an existing locked-friend
 // plan can disappear before the diversity pass has a chance to select it.
 const adaptiveAnchors=new Map();for(const entry of sorted){if(!entry.adaptive||entry.trio||entry.duo)continue;const key=entry.adaptive.edges.filter(e=>e.current).map(e=>e.family).sort().join('|');if(key&&!adaptiveAnchors.has(key)&&adaptiveAnchors.size<24)adaptiveAnchors.set(key,entry);}
 const preserved=new Map([...anchors.values(),...creativeAnchors.values(),...adaptiveAnchors.values()].map(entry=>[signature(entry.slots),entry]));
 const pool=[...preserved.values(),...sorted.filter(entry=>!preserved.has(signature(entry.slots))).slice(0,Math.max(0,240-preserved.size))].sort(order);
 const count=Math.min(Math.max(0,limit+offset),pool.length);
 for(let i=0;i<count;i++) {
  let winner=0,best=-Infinity,bestPriority=-1;
  for(let j=0;j<pool.length;j++) {
   const entry=pool[j];
   const entryStyle=(entry.trio||entry.duo)?.style||'balanced';
   const similarity=chosen.reduce((sum,c)=>sum+targets.filter(r=>c.slots.find(s=>s.role===r).champion===entry.slots.find(s=>s.role===r).champion).length*9+(entry.duo&&c.duo?.id===entry.duo.id?18:0)+(entry.trio&&c.trio?.id===entry.trio.id?22:0)+(entry.trio&&c.trio?.tempo===entry.trio.tempo?6:0)+(((c.trio||c.duo)?.style||'balanced')===entryStyle?10:0)+(entry.creative&&c.creative?.archetype===entry.creative.archetype?14:0),0);
   const v=entry.score-similarity;
   const p=priority(entry);
   if(p>bestPriority||p===bestPriority&&v>best){best=v;winner=j;bestPriority=p;}
  }
  chosen.push(pool.splice(winner,1)[0]);
 }
 // Let players discover something new: if creative ideas survived scoring but
 // lost every diversity round, give the best one the last slot. Top picks
 // (including curated trios) are never displaced by this.
 if(creativeBySig.size&&chosen.length>1&&!chosen.some(e=>e.creative)){
  const fallback=pool.filter(e=>e.creative).sort((a,b)=>b.score-a.score||signature(a.slots).localeCompare(signature(b.slots)))[0];
  if(fallback&&chosen.length){pool.push(chosen.pop());chosen.push(pool.splice(pool.indexOf(fallback),1)[0]);}
 }
 const sharedBefore=analyzeTeam(scopeSlots(fixed,scope),champions,context);
 return chosen.slice(offset,offset+limit).map(entry=>{
  const origin=entry.trio||entry.duo?'curated':entry.creative?'creative':entry.adaptive?'adaptive':'generated';
  const points=buildReasonPoints(entry,scope);
  return {
  ...entry,id:signature(entry.slots),targets,scope,origin,
  title:entry.creative?.name||entry.trio?.name||entry.duo?.name||entry.adaptive?.name||'职能搭配参考',
  reason:entry.creative?.why||entry.trio?.why||entry.duo?.why||entry.adaptive?.why||entry.connections[0]?.[2]||`${describeComposition(entry.analysis)}。${entry.analysis.missing.length?`短板是${entry.analysis.missing.join('、')}，具体补充作用见方案详情。`:'具体补充作用见方案详情。'}`,
  reasonPoints:points,
  catalogState:catalogStatus[(entry.trio||entry.duo)?.id]||null,
  strategy:strategySummary(entry.analysis,summaryCombo(entry),play.tempo,context.enemyTraits),
  contributions:explainContributions(scopeSlots(fixed,scope),scopeSlots(entry.slots,scope),targets,champions,context,{before:sharedBefore,after:entry.analysis}),
  };});
}

export function replaceMember(result,role,input){
  const editableTargets=result.editableTargets||result.targets;
  const target=scopeSlots(result.slots,result.scope).find(s=>s.role===role);if(!target||(!target.party&&!['bot','solo'].includes(result.scope))||!editableTargets.includes(role))throw Error('只能替换本次推荐范围中的位置');
 // Freeze the kept members so the new search only fills the replaced role.
 const slots=result.slots.map(s=>({...s,locked:s.role!==role,champion:s.role===role?null:s.champion}));
 const next=recommend({...input,slots,...(result.scope==='solo'?{scope:'solo',soloRole:role,soloChampion:null}:{}),excluded:[...(input.excluded||[]),target.champion],offset:0,limit:3});
 const previous=result.trio||result.duo||result.creativePlan||result.creative;
 return next.map(r=>({...r,editableTargets:[...editableTargets],replacementNote:previous&&(r.trio||r.duo||r.creativePlan||r.creative)?.id!==previous.id?`替换后不再构成「${previous.name}」，原分工不再适用，按新的配合与分工推荐。`:'只替换这一位，其他英雄保留；仍可继续调整其他推荐位置。'}));
}

export function explainContributions(fixed,next,targets,champions,context,reuse=null){
 // `reuse.after` must be analyzeTeam(next) with the same context; recommend
 // passes entry.analysis, which grade already computed for those exact slots.
 const before=reuse?.before||analyzeTeam(fixed,champions,context),labels={frontline:'前排承伤',engage:'先手控制',peel:'后排保护',sustain:'持续输出',poke:'远程消耗',aoe:'范围伤害'};
 const damageName={ad:'物理',ap:'法术',mixed:'混合'};
 const after=reuse?.after||analyzeTeam(next,champions,context);
 return after.members.filter(m=>targets.includes(m.role)).map(m=>({
  hero:m.champion,role:m.role,name:m.c.name,unusual:!conventionalRole(m.c,m.role),
  damage:m.p.damage==='ap'?'法术':m.p.damage==='ad'?'物理':'混合',
  helps:Object.entries(labels).filter(([key])=>m.p[key]).map(([key,label])=>`${before.traits[key]?'增加':'补上'}${label}`),
  pairings:CROSS_SYNERGIES.filter(([a,b])=>[a,b].includes(m.champion)&&fixed.some(s=>s.champion===([a,b].find(id=>id!==m.champion)))).map(([, ,text])=>text),
 }));
}
// Structured, human-readable reasons. Curated texts (why/plan/risk) are reused
// verbatim; everything else is composed from the same traits the score uses.
export function describeComposition(analysis){
 return `覆盖${analysis.strengths.slice(0,3).join('、')||'当前位置的输出分工'}；${analysis.control}，${analysis.curve.label}，${analysis.forgiveness.label}`;
}
export function buildReasonPoints(entry,scope){
 const combo=entry.trio||entry.duo,a=entry.analysis,points=[];
 if(entry.creative){
  const d=entry.creative;
  points.push(d.why);
  points.push(`打法：${d.steps.join(' → ')}；${d.window}`);
  points.push(`注意：${d.caution}`);
 }else if(combo){
  points.push(combo.why);
  if(scope==='bot'&&entry.duo&&combo.plan)points.push(`对线要点：${combo.plan}`);
  else if(combo.plan)points.push(`配合要点：${combo.plan}`);
  if(combo.risk)points.push(`注意：${combo.risk}`);
 }else if(entry.adaptive){
  points.push(entry.adaptive.why);
  points.push('成立条件：'+entry.adaptive.conditions.join(' '));
  points.push('失败就退出：'+entry.adaptive.failures.join(' '));
  points.push(entry.adaptive.sourceNote);
 }else if(entry.connections[0])points.push(entry.connections[0][2]);
 if(entry.opponentFit?.factors?.length)points.push(`公开对手与排序：${entry.opponentFit.factors[0].note}`);
 points.push(`阵容面：${describeComposition(a)}`);
 if(a.members.length===1)points.push('目前只确认一名我方英雄，按本位置分工、英雄池与公开敌方取舍排序；其余队友尚未选好，暂不判断全队短板。');
 else if(a.missing.length)points.push(`短板：${a.missing.join('、')}偏少；${a.curve.unknown.length?'成员阶段条件尚未整理完整，先核对各人的准备条件':'先确认各人的技能、成长与装备条件，再决定一起行动'}`);
 if(a.avgDifficulty!=null&&a.avgDifficulty>=7)points.push(`操作门槛：阵容平均难度偏高（${a.avgDifficulty.toFixed(1)}），先约好分工再锁`);
 else if(combo?.difficulty==='较高')points.push('操作门槛：这套配合难度较高，先约好进场时机再锁');
 if(a.threats?.length)points.push(`对方阵容：${a.threats.join('；')}`);
 return points.filter(Boolean).slice(0,5);
}

export function mergeClientSession(slots, session, champions) {
 const byKey=new Map(champions.map(c=>[c.key,c.id]));
 const next=structuredClone(slots),unassigned=[];
 const allEntries=session?.myTeam||[],entries=allEntries.filter(p=>byKey.has(Number(p.championId)));
 // Clear tracked picks together before rebuilding. This makes champion swaps
 // atomic and keeps manual position bindings attached to the same client cell.
 for(const slot of next){
  if(!Number.isInteger(slot.clientCellId))continue;
  slot.champion=null;slot.locked=false;delete slot.clientCellId;delete slot.manualPosition;
 }
 for(const prior of slots.filter(s=>s.manualPosition&&Number.isInteger(s.clientCellId))){
  const current=allEntries.find(p=>p.cellId===prior.clientCellId);if(!current)continue;
  const slot=next.find(s=>s.role===prior.role),id=byKey.get(Number(current.championId));
  slot.clientCellId=prior.clientCellId;slot.manualPosition=true;
  if(id&&!next.some(s=>s.champion===id)){slot.champion=id;slot.locked=prior.champion===id?prior.locked:true;}
 }
 // Only exact declared positions are imported. Empty assignedPosition in blind pick needs a user choice.
 for(const p of entries) {
  const id=byKey.get(Number(p.championId));
  if(next.some(s=>s.clientCellId===p.cellId&&s.manualPosition))continue;
  const same=next.find(s=>s.champion===id);
  if(same){if(!Number.isInteger(same.clientCellId)&&Number.isInteger(p.cellId)){same.clientCellId=p.cellId;same.manualPosition=true;}continue;} // Bind the first sync without changing the user's position.
  const role=CLIENT_POSITION_ROLES[String(p.assignedPosition||'').toUpperCase()];
  const target=next.find(s=>s.role===role);
  if(target&&!target.champion&&!target.manualPosition){const prior=slots.find(s=>s.clientCellId===p.cellId);target.champion=id;target.locked=prior?.champion===id?prior.locked:true;target.clientCellId=p.cellId;}
  else unassigned.push({champion:id,cellId:p.cellId,local:p.cellId===session.localPlayerCellId});
 }
 // Mark the local player's declared lane as ours so solo queue gets a
 // sensible recommendation target after sync. Additive only: never clears
 // existing party flags, and blind-pick entries without a declared position
 // leave everything untouched.
 const declaredRole=CLIENT_POSITION_ROLES[String(allEntries.find(p=>p.cellId===session?.localPlayerCellId)?.assignedPosition||'').toUpperCase()];
 const bound=Number.isInteger(session?.localPlayerCellId)&&next.find(s=>s.clientCellId===session.localPlayerCellId);
 const localRole=bound?.role||declaredRole;
 const mine=localRole&&next.find(s=>s.role===localRole);
 // Once bound, party membership belongs to the user's checkboxes. Polling
 // must not undo an explicit uncheck or mark the pre-drag lane as ours.
 const previouslyBound=Number.isInteger(session?.localPlayerCellId)&&slots.some(s=>s.clientCellId===session.localPlayerCellId);
 const changed=!!(mine&&!mine.party&&!mine.manualPosition&&!previouslyBound);
 if(changed)mine.party=true;
 return {slots:next,unassigned,markedLocalRole:localRole||null,markedLocalChanged:changed};
}
