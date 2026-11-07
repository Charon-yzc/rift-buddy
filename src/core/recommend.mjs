import { ROLES, DUOS, TRIOS, CROSS_SYNERGIES, RULES_PATCH,RULE_CATALOG,profile,conventionalRole } from './rules.mjs';
import {reviewedCatalogLinks,reviewedLinkOwners} from './catalog-link-review.mjs';
import {draftTargets,scopeSlots,effectiveDraftScope,CLIENT_POSITION_ROLES} from './draft.mjs';
import {recommendationDraft,clientRecommendationDraft,lockedOwnSlot,confirmedPlayerPick} from './draft-intents.mjs';
import {validPartyCount,reconcilePartyRange} from './party-range.mjs';
import {clientContextDraft,publicAllyIds} from './client-context-draft.mjs';
export {clearClientPicks} from './draft.mjs';
import {comboLoadout,loadoutOptions,LOADOUTS,RUNE_PLANS,SKILL_PLANS} from './loadouts.mjs';
import {generateCreativeTrios,createCreativeTrioLookup} from './creative-trios.mjs';
import {creativePlanMatches,creativeMemberCombo,validateCreativePlan,creativePlanId,resultCooperation} from './creative-plan.mjs';
import {createRankedMatchupIndex} from './ranked-statistics.mjs';
import {createPartyCounterplay,PARTY_COUNTERPLAY_PATCH} from './party-counterplay.mjs';
import {createCooperationGraph,cooperationPlan,cooperationSeeds,COOPERATION_PATCH} from './cooperation.mjs';
import {reviewedCatalogEntry} from './mechanic-review.mjs';
import {createPairStatisticsIndex} from './pair-statistics.mjs';
import {compositionFit} from './composition-fit.mjs';
import {comboMembers,comboKey} from './combo-members.mjs';
import {catalogChoiceMatches,catalogPlanCurrent,catalogEntryRevision} from './catalog-choice.mjs';
import {discoveryLineups,seededFraction} from './recommendation-diversity.mjs';
import {roleFamiliarityWeights,familiarityLineups,familiarityWinner} from './recommendation-familiarity.mjs';
import {roomChampionUsageWeights} from './champion-usage.mjs';
import {canonicalRoomFamiliarity} from './room-familiarity.mjs';
import {recommendationFit,meetsRecommendationFit,recommendationStyleTier} from './recommendation-policy.mjs';
import {createRecommendationLane,createFixedRecommendationLane,createRecommendationSearchSession} from './recommendation-search.mjs';
import {strategyTraits,strategySummary,summarizeEnemyTraits,opponentFit,threatNotes,describeCurve,describeForgiveness,controlChainLabel} from './strategy.mjs';

export function createSlots() {
 return ROLES.map(r=>({role:r.id, champion:null, locked:false, party:['mid','bottom','support'].includes(r.id)}));
}
// A lobby identifies the group before champion-select supplies player cells.
// Only its provisional recommendation range changes; no player or lane is bound.
export function applyLobbyPartyRange(slots,party){
 const next=structuredClone(slots);
 if(!['lobby','known'].includes(party?.status))return next;
 const members=Array.isArray(party.members)?party.members:[],count=Math.min(next.length,Math.max(members.length,Number.isInteger(party.lobbyCount)?party.lobbyCount:0));
 if(!count)return next;
 const used=new Set(next.filter(s=>s.partyManual&&s.party).map(s=>s.role)),claimed=new Set(),limit=Math.max(count,used.size);
 const available=slot=>slot&&!claimed.has(slot.role)&&!(slot.partyManual&&!slot.party);
 for(const member of [...members].sort((a,b)=>Number(b.local===true)-Number(a.local===true))){
  const preferred=[member.firstPosition,member.secondPosition].map(value=>CLIENT_POSITION_ROLES[String(value||'').toUpperCase()]).filter(Boolean);
  const target=preferred.map(role=>next.find(s=>s.role===role)).find(s=>available(s)&&(used.has(s.role)||used.size<limit));
  if(target){used.add(target.role);claimed.add(target.role);}
 }
 // Prefer empty positions for the remaining provisional range. Existing local
 // heroes and manual positions stay intact even when the board is already full.
 const fallback=[...next].sort((a,b)=>Number(!!a.champion||a.manualPosition||Number.isInteger(a.clientCellId))-Number(!!b.champion||b.manualPosition||Number.isInteger(b.clientCellId)));
 for(const slot of fallback)if(used.size<limit&&available(slot)){used.add(slot.role);claimed.add(slot.role);}
 return next.map(slot=>slot.partyManual?slot:{...slot,party:used.has(slot.role)});
}
export function validateSlots(slots, champions) {
 if(!Array.isArray(slots)||slots.length!==5||slots.some(s=>!s||typeof s!=='object')) throw new Error('阵容位置格式不正确');
 if(new Set(slots.map(s=>s.role)).size!==5||slots.some(s=>!ROLES.some(r=>r.id===s.role))) throw new Error('请为五个位置各保留一个槽位');
 const ids=slots.map(s=>s.champion).filter(Boolean);
 if(new Set(ids).size!==ids.length)throw new Error('同一英雄不能出现在我方两个位置');
 const available=new Set(champions.map(c=>c.id));
 if(ids.some(id=>!available.has(id)))throw new Error('所选英雄已不在当前资料中，请重新选择');
}
export function analyzeTeam(slots, champions, context,scoreOnly=false,catalogMatches=null) {
 if(context?.mandatoryOwn&&!slots.some(slot=>slot.champion===context.mandatoryOwn.champion))slots=[...slots,context.mandatoryOwn];
 const byId=context?.byId||new Map(champions.map(c=>[c.id,c]));
 const represented=new Set(slots.map(s=>s.champion));
 const knownAllies=[...new Set(context?.publicAllies||[])].filter(id=>byId.has(id)&&!represented.has(id));
 const analyzed=[...slots,...knownAllies.map(champion=>({champion,role:'',party:false,positionUnknown:true}))];
 const getProfile=s=>{
  const key=`${s.champion}:${s.role}`;
  if(context?.profiles?.has(key))return context.profiles.get(key);
  const value=profile(byId.get(s.champion),s.role);context?.profiles?.set(key,value);return value;
 };
 const reviewPatch=context&&Object.hasOwn(context,'catalogReviewPatch')?context.catalogReviewPatch:context?.patch;
 const combos=(catalogMatches||matchingCombos(slots,context?.comboCache)).filter(c=>reviewedCatalogEntry(c,context?.catalogStatus,reviewPatch));
 const selected=context?.catalogSelectionId?combos.find(combo=>combo.id===context.catalogSelectionId):null;
 if(context?.catalogSelectionId&&!selected)throw Error('组合来源与当前阵容不一致，请重新推荐');
 const members=analyzed.filter(s=>byId.has(s.champion)).map(s=>{const c=byId.get(s.champion),base=getProfile(s),combo=s.positionUnknown?null:selected&&comboLoadout(selected,c,s.role)!==null?selected:memberCombo(combos,c.id,s.role);
  const loadoutId=comboLoadout(combo,c,s.role),cacheKey=loadoutId?c.id+':'+s.role+':'+loadoutId:null;
  let loadout;
  if(cacheKey){
   if(context?.comboLoadouts?.has(cacheKey))loadout=context.comboLoadouts.get(cacheKey);
   else {loadout=loadoutOptions(c,s.role,'rift').find(l=>l.id===loadoutId);context?.comboLoadouts?.set(cacheKey,loadout);}
  }
  const p=loadout?.damage?{...base,damage:loadout.damage,damageWeights:loadout.damage==='ap'?{ad:0.1,ap:0.9}:loadout.damage==='ad'?{ad:0.9,ap:0.1}:{ad:0.5,ap:0.5}}:base;
  return {...s,c,p,catalogLoadoutId:loadoutId};});
 const traits={frontline:0,engage:0,peel:0,sustain:0,poke:0,aoe:0,ad:0,ap:0};
 for(const m of members) {
  for(const k of ['frontline','engage','peel','sustain','poke','aoe'])if(m.p[k])traits[k]++;
  const weight=m.role==='support'?.25:m.p.build==='tank'?.45:1;
  traits.ad+=m.p.damageWeights.ad*weight;traits.ap+=m.p.damageWeights.ap*weight;
 }
 const avgDifficulty=members.length?members.reduce((sum,m)=>sum+(Number.isFinite(m.p.difficulty)?m.p.difficulty:5),0)/members.length:null;
 // Scalar search scoring reads these same profiled members in compositionFit;
 // building a second control-edge list here only repeats every pair lookup.
 if(scoreOnly)return {members,traits,avgDifficulty};
 const graph=context?.cooperationGraph||createCooperationGraph(champions),controlEdges=[];
 for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){const edge=graph.edge(members[i],members[j]);if(edge)controlEdges.push(edge);}
 // Only displayed analyses need warnings and descriptive control labels.
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
 return {members,traits,warnings,known:members.length,
  strengths:Object.entries(labels).filter(([k])=>traits[k]>0).map(([,v])=>v),
  missing:Object.entries(labels).filter(([k])=>!traits[k]).map(([,v])=>v),
  threats:threatNotes({traits},context?.enemyTraits),
  curve:describeCurve(traits,members),forgiveness:describeForgiveness(traits,balancedDamage),
  control,avgDifficulty,
  damageMix:!traits.ad&&!traits.ap?'none':balancedDamage?'mixed':traits.ad>=traits.ap?'ad':'ap'};
}
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
// Accepted catalog snapshots remain readable, but cannot become an automatic
// current recommendation after their source or review status changes.
export function automaticCreativePlan(plan,status,patch){
 if(!plan)return plan;
 const catalog={duos:DUOS,trios:TRIOS,loadouts:LOADOUTS,runes:RUNE_PLANS,skillPlans:SKILL_PLANS};
 return catalogPlanCurrent(plan,catalog,status,patch)?plan:null;
}
export function currentCombo(slots,champion,role,status={},comboCache=null,creativePlan=null,{allowPending=false,patch:requestedPatch,catalogChoice=null}={}){
 if(catalogChoice&&!requestedPatch)return null;
 const selected=catalogChoice&&[...TRIOS,...DUOS].find(c=>c.id===catalogChoice.id);
 if(selected&&requestedPatch&&status?.[selected.id]&&reviewedCatalogEntry(selected,status,requestedPatch)&&catalogChoiceMatches(catalogChoice,selected,slots)&&(!champion||comboLoadout(selected,{id:champion},role)!==null))return selected;
 const usablePlan=allowPending?creativePlan:automaticCreativePlan(creativePlan,status,requestedPatch);
 if(creativePlanMatches(usablePlan,slots)){const own=champion||usablePlan.members[0].champion,position=role||usablePlan.members[0].role,creative=creativeMemberCombo(usablePlan,own,position);if(creative)return creative;}
 const matches=matchingCombos(slots,comboCache).filter(c=>allowPending?!status?.[c.id]?.invalid||status?.[c.id]?.optionalCompatible===true:reviewedCatalogEntry(c,status,requestedPatch));
 return memberCombo(matches,champion,role);
}
function memberCombo(matches,champion,role){
 if(!champion)return matches[0]||null;
 const relevant=matches.filter(c=>comboLoadout(c,{id:champion},role)!==null);
 return relevant.find(c=>comboLoadout(c,{id:champion},role)!=='default')||relevant[0]||null;
}
function matchingCombos(slots,comboCache=null){
 const sig=comboCache?signature(slots):'';
 let matches=comboCache?.get(sig);
 if(!matches){
  // Resolve all member loadout bindings and scoring anchors once per team,
  // rather than enumerating identical pairs/triples separately for each hero.
  const filled=slots.filter(s=>s.champion).map(s=>`${s.role}:${s.champion}`).sort();
  const {trioByMembers,trioOrder,duoByMembers,duoOrder}=comboIndex(),trios=[],duos=[];
  for(let i=0;i<filled.length;i++)for(let j=i+1;j<filled.length;j++){
   const pair=filled[i]+'|'+filled[j],duo=duoByMembers.get(pair);if(duo)duos.push(duo);
   for(let k=j+1;k<filled.length;k++){const trio=trioByMembers.get(pair+'|'+filled[k]);if(trio)trios.push(trio);}
  }
  matches=[...trios.sort((a,b)=>trioOrder.get(a)-trioOrder.get(b)),...duos.sort((a,b)=>duoOrder.get(a)-duoOrder.get(b))];
  if(comboCache)rememberSearchValue(comboCache,sig,matches,2048);
 }
 return matches;
}
export function selectedCatalogCombo(slots,id,status,patch){
 return id?matchingCombos(slots).find(combo=>combo.id===id&&reviewedCatalogEntry(combo,status,patch))||null:null;
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
// Explicitly installed user libraries retain their legacy same-patch path.
// Public libraries require per-link evidence; unknown sources fail closed.
const currentCatalogLinks=(patch,review)=>review?.baseKind==='installed'&&typeof patch==='string'&&patch===RULES_PATCH?CROSS_SYNERGIES:reviewedCatalogLinks(RULE_CATALOG,{patch,...review});
// Search explores far more teams than it displays. Memoize scalar scores only;
// retaining every team's analysis and play instructions grows the worker heap
// by hundreds of MB in a wide draft. Eviction changes work, never scoring.
function rememberSearchValue(cache,key,value,limit){
 if(!cache.has(key)&&cache.size>=limit)cache.delete(cache.keys().next().value);
 cache.set(key,value);
}

function mechanicSearchSeeds(fixed,scope,targets,candidateSets,weights,mechanics){
 if(!mechanics)return [];
 const domains=scopeSlots(fixed,scope).flatMap(({role,champion})=>{
  const ids=champion?[champion]:(candidateSets[role]||[]).filter(hero=>!weights[role]||weights[role][hero.id]>0).map(hero=>hero.id);
  const members=ids.filter(mechanics.has).map(id=>({role,champion:id}));
  return members.length?[{role,members}]:[];
 });
 const groups=[];
 for(let i=0;i<domains.length;i++)for(let j=i+1;j<domains.length;j++){
  const a=domains[i],b=domains[j];
  if(!targets.includes(a.role)&&!targets.includes(b.role))continue;
  const pairs=[];
  for(const lead of a.members)for(const follow of b.members){
   const match=mechanics.match(lead,follow,false);
   if(match)pairs.push({lead,follow,quality:match.relation.quality,mechanism:match.tactic.label,key:[lead.champion,follow.champion].sort().join('|'),editable:[lead,follow].filter(member=>targets.includes(member.role)).map(member=>member.champion)});
  }
  pairs.sort((left,right)=>right.quality-left.quality);
  if(pairs.length)groups.push({pairs,seen:new Set()});
 }
 // Share exposure across positions: moving the same champions to other
 // lanes does not create a new tactic. Diversify only among comparable
 // anchors; the full legal search and final fit scores are unchanged.
 const seeds=[],byMechanism=new Map(),byPair=new Map(),visits=(counts,key)=>counts.get(key)||0;
 for(let round=0;round<4;round++)for(const {pairs,seen} of groups){
  if(!pairs.length)continue;
  const distinct=pairs.filter(pair=>pair.editable.every(id=>!seen.has(id)));
  const pool=distinct.length?distinct:pairs;
  const floor=pool[0].quality-.1-Number.EPSILON;
  let chosen=pool[0];
  for(const pair of pool){
   if(pair.quality<floor)break;
   const spread=visits(byMechanism,pair.mechanism)-visits(byMechanism,chosen.mechanism)||visits(byPair,pair.key)-visits(byPair,chosen.key);
   if(spread<0)chosen=pair;
  }
  pairs.splice(pairs.indexOf(chosen),1);
  byMechanism.set(chosen.mechanism,visits(byMechanism,chosen.mechanism)+1);
  byPair.set(chosen.key,visits(byPair,chosen.key)+1);
  for(const id of chosen.editable)seen.add(id);
  const {lead,follow}=chosen;
  seeds.push(fixed.map(slot=>slot.role===lead.role?{...slot,champion:lead.champion}:slot.role===follow.role?{...slot,champion:follow.champion}:slot));
 }
 return seeds;
}
function sourceRoleWeights(builds){
 const maxSamples={},weights={};
 for(const ref of Object.values(builds||{}))if(Number.isFinite(ref.runeSamples))maxSamples[ref.champion]=Math.max(maxSamples[ref.champion]||1,ref.runeSamples);
 for(const ref of Object.values(builds||{}))if(maxSamples[ref.champion])weights[`${ref.champion}:${ref.role}`]=Math.max(0,Math.min(1,ref.runeSamples/maxSamples[ref.champion]));
 return weights;
}
// Factory snapshots contain game data and the user's catalog customizations.
// Only data-derived indexes survive draft invalidation. Clear visited-lineup,
// hero/profile and graph lookup caches instead of retaining draft traces.
export function createRecommendationResources({champions,builds,pairStatistics,buildSource,patch}){
 const catalog=RULE_CATALOG,source=JSON.stringify(buildSource??null);
 const profiles=new Map(),reviews=new Map(),revisions=new Map(),comboCache=new Map(),comboLoadouts=new Map();
 const graph=createCooperationGraph(champions,{currentPatch:patch||champions[0]?.combatStatsSource?.patch,cacheLimit:8192});
 return {matches:next=>next.champions===champions&&next.builds===builds&&next.pairStatistics===pairStatistics&&RULE_CATALOG===catalog&&next.patch===patch&&JSON.stringify(next.buildSource??null)===source,
  byId:new Map(champions.map(champion=>[champion.id,champion])),profiles,reviews,revisions,comboCache,comboLoadouts,roleWeights:sourceRoleWeights(builds),graph,pairIndex:createPairStatisticsIndex(pairStatistics,champions,{source:buildSource,patch}),
  clearDraftCaches(){profiles.clear();reviews.clear();revisions.clear();comboCache.clear();comboLoadouts.clear();graph.clearCaches();}};
}
function grade(slots, champions, style, requestedIds=[],roleWeights={},context,scoreOnly=false) {
 slots=scopeSlots(slots,context?.scope);
 const cacheKey=scoreOnly&&context?.scoreCache?signature(slots)+'|'+[...requestedIds].sort().join(',')+'|'+(context.catalogSelectionId||''):null;
 if(cacheKey&&context.scoreCache.has(cacheKey))return context.scoreCache.get(cacheKey);
 const catalog=matchingCombos(slots),a=analyzeTeam(slots,champions,context,scoreOnly,catalog),t=a.traits;
 // One known player cannot cover an entire team. Use lane responsibilities
 // rather than rewarding a lone champion for being tank, initiator and peel
 // simultaneously. Source position frequency and player preferences remain
 // separate signals below; these weights are curated, not win probabilities.
 const ownWeights=a.members.length===1?SINGLE_ROLE_WEIGHTS[a.members[0].role]:null;
 const composition=compositionFit(a,context?.cooperationGraph,{details:!scoreOnly});
 let score=ownWeights?20+Object.entries(ownWeights).reduce((sum,[key,weight])=>sum+Math.min(t[key],1)*weight,0):composition.rawScore;
 const fit=opponentFit(a,context?.enemyTraits);
 const ranked=a.members.map(member=>context?.rankedMatchup?.(member.champion,member.role)).filter(Boolean);
 const rankedAdjustment=ranked.length?ranked.reduce((sum,row)=>sum+row.adjustment,0)/ranked.length:0;
 fit.ranked={adjustment:rankedAdjustment,evidence:scoreOnly?[]:ranked.flatMap(row=>row.evidence)};
 score+=fit.adjustment+rankedAdjustment;
 const scope=context?.scope,party=slots.filter(s=>s.party);
 const onlyMember=scope==='context'&&party.length===1?party[0]:null;
 const ownCandidate=onlyMember&&(requestedIds.includes(onlyMember.champion)||context.mandatoryOwn?.role===onlyMember.role)?onlyMember:null;
 const valid=combo=>reviewedCatalogEntry(combo,context?.catalogStatus,context?.catalogReviewPatch);
 const selected=context?.catalogSelectionId?catalog.find(c=>c.id===context.catalogSelectionId&&valid(c)):null;
 // A fixed teammate pair still contributes to full-team fit, but cannot
 // supply the plan for a new recommendation for the sole editable member.
 const isOwnPlan=combo=>!ownCandidate||comboMembers(combo).some(member=>member.role===ownCandidate.role&&member.champion===ownCandidate.champion);
 const duo=selected?(comboMembers(selected).length===2?selected:null):catalog.find(c=>comboMembers(c).length===2&&valid(c)&&isOwnPlan(c))||null;
 const trio=selected?(comboMembers(selected).length===3?selected:null):catalog.find(c=>comboMembers(c).length===3&&valid(c)&&isOwnPlan(c))||null;
 // Curated difficulty is authored per combination, not a win-rate claim:
 // hard combos cost practice time, easy ones fit a steady style.
 const comboDifficulty=(trio||duo)?.difficulty;
 if(comboDifficulty==='较高'&&style!=='wild')score-=trio?3:2;
 else if(comboDifficulty==='容易'&&style==='balanced')score+=2;
 if(a.members.length>=3&&style==='balanced'&&Number.isFinite(a.avgDifficulty))score-=Math.max(0,a.avgDifficulty-6)*2;
 // Fit is shared with the displayed score. A catalogue entry is evidence for
 // an executable plan, never a flat 28/33 point reward for being in a library.
 if((trio||duo)?.style===style)score+=5;
 let connections;
 if(!scoreOnly){
  const links=context?.catalogLinks||[],ids=new Set(slots.map(s=>s.champion)),linkHit=new Set(),linkByChamp=context?.linkByChamp||new Map();
  for(const id of ids)for(const link of linkByChamp.get(id)||[])if(ids.has(link[0])&&ids.has(link[1]))linkHit.add(link);
  connections=links.filter(l=>linkHit.has(l)&&(!ownCandidate||l[0]===ownCandidate.champion||l[1]===ownCandidate.champion));
 }
 const partyMembers=slots.filter(s=>scope==='bot'?['bottom','support'].includes(s.role):s.party).filter(s=>s.champion);
 const tempo=context?.play?.tempo;
 const adaptive=!selected&&(!scoreOnly||tempo&&tempo!=='any')&&context?.cooperationGraph&&scope!=='solo'&&partyMembers.length<=3?cooperationPlan(partyMembers,context.cooperationGraph,{...context.play,catalogStatus:context.catalogStatus,catalogReviewPatch:context.catalogReviewPatch}):null;
 // Four/five-person pair tables are display evidence and have no score bonus.
 const pairMembers=slots.filter(s=>scope==='bot'?['bottom','support'].includes(s.role):s.party);
 const pairEvidence=scope==='solo'||scoreOnly?null:context?.pairStatistics?.forMembers(pairMembers);
 score+=(scope==='solo'?0:scoreOnly?context?.pairStatistics?.scoreForMembers(pairMembers):pairEvidence?.bonus)||0;
 if(tempo&&tempo!=='any')score+=Math.min(strategyTraits(a,trio||duo||adaptive)[tempo]||0,8);
 for(const m of a.members){
  if(!requestedIds.includes(m.champion))continue;
  if(context?.poolMode==='prefer'&&context.pool.has(m.champion))score+=12;
  if(!m.p.roles.includes(m.role))score-=9;
  score-=m.p.difficulty*(style==='balanced'?.65:style==='fun'?.2:0);
  if(context?.play?.difficulty==='easy')score-=m.p.difficulty*2;
  const rolePool=context?.rolePools?.[m.role];if(rolePool?.mode==='prefer'&&rolePool.heroes.includes(m.champion))score+=15;
  score+=(roleWeights[`${m.champion}:${m.role}`]||0)*(style==='balanced'?8:style==='fun'?3:0);
  if(m.role==='support'&&['crit','onhit','meleeCrit','fighter'].includes(m.p.build)&&!catalog.some(c=>comboMembers(c).length===2&&valid(c)&&comboMembers(c).some(member=>member.role===m.role&&member.champion===m.champion)))score-=9;
 }
 if(scoreOnly){if(cacheKey)rememberSearchValue(context.scoreCache,cacheKey,score,8192);return score;}
 // Score the known team, but name the plan around controllable party members.
 // Keep useful mixed-party catalog plans when no full-party mechanism exists.
 const relevant=combo=>{
  if(!combo||party.length<2)return !!combo;
  const members=combo.members||[{role:'bottom',champion:combo.carry},{role:'support',champion:combo.support}];
  const belongs=m=>party.some(s=>s.role===m.role&&s.champion===m.champion);
  return adaptive?members.length===party.length&&members.every(belongs):members.some(belongs);
 };
 const partyCombos=matchingCombos(party),partyDuo=partyCombos.find(c=>comboMembers(c).length===2&&valid(c)),partyTrio=partyCombos.find(c=>comboMembers(c).length===3&&valid(c));
 const planDuo=selected?duo:(relevant(partyDuo)?partyDuo:undefined)||(relevant(duo)?duo:undefined),planTrio=selected?trio:(relevant(partyTrio)?partyTrio:undefined)||(relevant(trio)?trio:undefined);
 // Keep reviewed pairs as separate subgroup evidence, not as the full-party
 // execution plan. A three-person lineup can contain more than one such pair.
 const reviewedSubgroups=party.length===3?partyCombos.filter(c=>comboMembers(c).length===2&&valid(c)):[];
 const out={score,compositionFit:composition,analysis:a,duo:planDuo,trio:planTrio,reviewedSubgroups,connections,connectionsReviewed:context?.connectionsReviewed===true,opponentFit:fit,adaptive,pairEvidence};
 return out;
}
const signature=slots=>slots.map(s=>`${s.role}:${s.champion||'-'}`).join('|');
// Full-party planning has no scoring bonus. Build it only for displayed results,
// not every search-beam candidate, and keep all ranking constraints unchanged.
function completePartyPlan(entry,slots,context){
 if(context.scope==='solo'||context.scope==='bot')return entry;
 const members=slots.filter(s=>s.party&&s.champion);if(members.length<4)return entry;
 const plan=cooperationPlan(members,context.cooperationGraph,{...context.play,catalogStatus:context.catalogStatus,catalogReviewPatch:context.catalogReviewPatch});
 return plan?{...entry,adaptive:plan,trio:null,duo:null}:entry;
}
function attachPartyCounterplay(entry,scope,champions,enemies,patch){
 if(scope==='solo'||entry.creativePlan)return entry;
 const execution=resultCooperation(entry),authored=comboMembers(entry.trio||entry.duo);
 if(execution?.historicalNeutral||patch!==PARTY_COUNTERPLAY_PATCH)return entry;
 const members=execution?.members||(authored.length?authored:entry.creative?.members||scopeSlots(entry.slots,scope==='bot'?'bot':'party').filter(m=>m.champion));
 const counterplay=createPartyCounterplay(members,enemies,champions);
 return counterplay?{...entry,counterplay}:entry;
}
function summaryCombo(entry){
 // A party plan describes that group. In whole-team mode, a partial party
 // cannot replace the strategy of the other already picked team members.
 const adaptive=resultCooperation(entry),coversAnalysis=adaptive&&adaptive.members.length===entry.analysis.members.length;
 return entry.trio||entry.duo||(coversAnalysis&&{tempo:adaptive.tempo,why:adaptive.why,risk:adaptive.failures.join(' ')})||(entry.creative&&{tempo:entry.creative.tempo,why:entry.creative.why,risk:entry.creative.caution});
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
  comboIndexCache={duos:DUOS,trios:TRIOS,links:CROSS_SYNERGIES,duoByMembers,duoOrder,trioByMembers,trioOrder};
 }
 return comboIndexCache;
}
export function recommend({slots,champions,style='fun',excluded=[],publicBans=[],eligibleByRole={},confirmedPick=null,enemy=[],visibleEnemies=enemy,publicPicks=[],publicAllies=[],rankedDraft=null,sourceRoles=[],limit=5,offset=0,builds={},pairStatistics=null,buildSource,patch,pool:heroPool=[],poolMode='off',scope='context',soloRole='',ownRole='',soloChampion=null,play={},rolePools={},catalogStatus={},linkReviewContext=null,creativePlan=null,clientSession=null,party=null,includePreselected=false,randomSeed='',familiarityByRole={},roomFamiliarity=[],minimumFitScore=null,fitSlots=null,fitSession=null,fitScope='',fitSoloRole='',stylePolicy=false,communityAfter=''},searchFactory=null,resources=null) {
 if(!catalogStatus||typeof catalogStatus!=='object'||Array.isArray(catalogStatus))catalogStatus={};
 creativePlan=automaticCreativePlan(creativePlan,catalogStatus,patch);
 if(Array.isArray(clientSession?.myTeam)){
  ({slots,session:clientSession}=clientRecommendationDraft(slots,clientSession,champions,{includePreselected,ownRole:soloRole}));
  const picked=new Set(clientSession.myTeam.map(player=>champions.find(champion=>Number(champion.key)===Number(player.championId))?.id).filter(Boolean));
  const own=clientSession.myTeam.find(player=>player.cellId===clientSession.localPlayerCellId),ownId=champions.find(champion=>Number(champion.key)===Number(own?.championId))?.id;
  if(ownId&&confirmedPlayerPick(own,clientSession)&&!lockedOwnSlot(slots,clientSession))throw Error('请先确认已锁定英雄的分路，再继续推荐');
  publicPicks=publicPicks.filter(id=>picked.has(id));publicAllies=publicAllies.filter(id=>picked.has(id));
  if(!ownId)confirmedPick=null;
  if(scope==='solo')soloChampion=ownId||null;
 }
 // A saved board may serialize the five lanes in any order. New searches
 // must choose the same graph anchors and plan identity for that same board.
 // Frozen adopted plans retain their own content and execution order.
 if(Array.isArray(slots)&&slots.every(s=>s&&typeof s==='object')){
  slots=[...slots].sort((a,b)=>ROLES.findIndex(r=>r.id===a.role)-ROLES.findIndex(r=>r.id===b.role));
  slots=clientContextDraft(slots,champions,clientSession,{scope:effectiveDraftScope(slots,scope),soloRole,bans:publicBans,eligibleByRole,party,includePreselected});
 }
 validateSlots(slots,champions);
 scope=effectiveDraftScope(slots,scope);
 publicAllies=['context','solo'].includes(scope)?publicAllyIds(clientSession,champions,{includePreselected}).concat(publicAllies):[];
 limit=Number.isInteger(limit)?Math.max(0,limit):5;
 offset=Number.isInteger(offset)?Math.max(0,offset):0;
 if(scope==='solo'){
  const options={champions,style,excluded,publicBans,eligibleByRole,confirmedPick,enemy,visibleEnemies,publicPicks,publicAllies,rankedDraft,sourceRoles,builds,pairStatistics,buildSource,patch,pool:heroPool,poolMode,play,rolePools,catalogStatus,linkReviewContext,creativePlan,clientSession,party,includePreselected,randomSeed,familiarityByRole,roomFamiliarity,minimumFitScore,fitSlots,fitSession,fitScope:'solo',stylePolicy};
  const targets=soloChampion?[]:draftTargets(slots,'solo',soloRole);
  if(!targets.length){
   return recommend({...options,clientSession:null,slots:slots.map(s=>({...s,party:false})),limit:1}).map(r=>({...r,slots:structuredClone(slots),scope:'solo',soloRole:soloRole||slots.find(s=>s.champion===soloChampion)?.role||'',title:'我的本局配置',reason:'已选英雄保留，可查看自己的出装与符文；本局位置由你确认。'}));
  }
  if(searchFactory){
   const lanes=[],errors=[];
   for(const role of targets){
    try{
     const lane=recommend({...options,fitSoloRole:role,slots:slots.map(s=>({...s,party:s.role===role})),limit,offset:0},searchFactory,resources);
     const wrap=row=>({...row,scope:'solo',soloRole:role,title:`${ROLES.find(r=>r.id===role).name} · ${champions.find(c=>c.id===row.slots.find(s=>s.role===role).champion)?.name}`,slots:row.slots.map(s=>({...s,party:slots.find(prior=>prior.role===s.role).party}))});
     if(Array.isArray(lane))lanes.push(createFixedRecommendationLane(lane.map(wrap)));
     else {const format=lane.format;lane.format=row=>wrap(format(row));lanes.push(lane);}
    }catch(error){errors.push(error);}
   }
   if(!lanes.length&&errors.length)throw errors[0];
   return {lanes};
  }
  const candidates=[],errors=[];
  for(const role of targets){
   try{candidates.push(...recommend({...options,fitSoloRole:role,slots:slots.map(s=>({...s,party:s.role===role})),limit:offset+limit,offset:0}).map(r=>({...r,scope:'solo',soloRole:role,title:`${ROLES.find(r=>r.id===role).name} · ${champions.find(c=>c.id===r.slots.find(s=>s.role===role).champion)?.name}`,slots:r.slots.map(s=>({...s,party:slots.find(prior=>prior.role===s.role).party}))})));}
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
 const catalogLinks=currentCatalogLinks(patch,linkReviewContext),linkByChamp=new Map();
 for(const link of catalogLinks)for(const id of link.slice(0,2)){if(!linkByChamp.has(id))linkByChamp.set(id,[]);linkByChamp.get(id).push(link);}
 const context={byId:resources?.byId||new Map(champions.map(c=>[c.id,c])),mandatoryOwn:lockedOwnSlot(slots,clientSession),publicAllies,profiles:resources?.profiles||new Map(),pool:new Set(heroPool),poolMode,scope,play,rolePools,catalogStatus,catalogReviewPatch:patch,catalogLinks,linkByChamp,connectionsReviewed:['bundled','community'].includes(linkReviewContext?.baseKind),enemyTraits:summarizeEnemyTraits(visibleEnemies,champions),comboCache:resources?.comboCache||new Map(),scoreCache:new Map(),comboLoadouts:resources?.comboLoadouts||new Map()};
 context.rankedMatchup=rankedDraft?.ranked?createRankedMatchupIndex(rankedDraft.enemies,builds,{patch,source:buildSource}):null;
 context.patch=patch||champions[0]?.combatStatsSource?.patch;context.cooperationGraph=resources?.graph||createCooperationGraph(champions,{currentPatch:context.patch});
 context.pairStatistics=resources?.pairIndex||createPairStatisticsIndex(pairStatistics,champions,{source:buildSource,patch});
 // Rune-page samples are used only as a coarse position-frequency signal.
 // They do not measure how strong a champion or a composition is.
 const roleWeights=resources?.roleWeights||sourceRoleWeights(builds);
 const targets=draftTargets(slots,scope);
 // Profiling a wide draft found <1% scalar-cache hits. Building and evicting
 // those full-lineup keys cost more than the rare reused score; pair-level
 // fit caching still shares the repeated work without keeping every lineup.
 if(targets.length>=4)context.scoreCache=null;
 const unavailable=slots.find(s=>s.champion&&!targets.includes(s.role)&&(publicBans.includes(s.champion)||enemy.includes(s.champion)));
 if(unavailable)throw Error(`${ROLES.find(r=>r.id===unavailable.role).name}的${context.byId.get(unavailable.champion).name}${publicBans.includes(unavailable.champion)?'已被本局禁用':'已被敌方选走，本局不能重复选择'}；已保留阵容，请同步选人或解锁调整后重新推荐`);
 const ownUnavailable=slots.find(s=>s.champion&&!targets.includes(s.role)&&Array.isArray(eligibleByRole[s.role])&&!eligibleByRole[s.role].includes(s.champion)&&!(confirmedPick?.role===s.role&&confirmedPick.champion===s.champion));
 if(ownUnavailable)throw Error(ROLES.find(r=>r.id===ownUnavailable.role).name+'的'+context.byId.get(ownUnavailable.champion).name+'不在本机当前可选范围；已保留阵容，请核对我的位置、同步选人或解锁调整后重新推荐');
 if(!targets.length){
  const g=completePartyPlan(grade(slots,champions,style,[],{},context),slots,context);
  // A newly joined party member needs their own job. Keep the saved subgroup
  // readable, but let the complete current-party candidate cover everyone.
  const partySlots=scopeSlots(slots,scope==='context'?'party':scope),lockedOwn=context.mandatoryOwn;
  const confirmedMixedPlan=scope==='context'&&creativePlan?.archetype==='curated'&&partySlots.length===1&&lockedOwn?.role===partySlots[0].role&&Array.isArray(creativePlan.editableTargets)&&creativePlan.editableTargets.includes(lockedOwn.role);
  // A confirmed ally may support a solo player's adopted plan without
  // becoming editable or joining the party scope.
  const planSlots=confirmedMixedPlan?slots.filter(slot=>slot.party||slot.locked&&Number.isInteger(slot.clientCellId)):partySlots;
  if(creativePlanMatches(creativePlan,slots)&&creativePlan.members.every(m=>planSlots.some(s=>s.role===m.role))&&(!g.adaptive||g.adaptive.members.length<=creativePlan.members.length)){
   let plan=validateCreativePlan(creativePlan,slots);
   const counterplay=plan.shared?.historicalNeutral||context.patch!==PARTY_COUNTERPLAY_PATCH?null:createPartyCounterplay(plan.members,visibleEnemies,champions);
   // Offer the current public conditions as a new candidate. The accepted
   // input object and its original skill/stage text remain untouched.
   if(counterplay&&JSON.stringify(counterplay)!==JSON.stringify(plan.counterplay)){plan={...plan,counterplay};plan.id=creativePlanId(plan);plan=validateCreativePlan(plan,slots);}
   const cooperation=['cooperation','shared'].includes(plan.archetype),curated=plan.archetype==='curated',original=curated?creativeMemberCombo(plan,plan.members[0].champion,plan.members[0].role):null;
   // Accepted picks are locked for the next search. That must not grant new
   // replacement permissions to friends who were fixed before the search.
   // Legacy plans have no record of that permission: require an explicit unlock.
   const editableTargets=(plan.editableTargets||[]).filter(role=>scopeSlots(slots,scope).some(s=>s.role===role&&(s.party||['bot','solo'].includes(scope))&&!(clientSession&&s.locked&&Number.isInteger(s.clientCellId))));
   const strategyCombo=plan.members.length===g.analysis.members.length?{tempo:plan.tempo,why:plan.why,risk:plan.caution}:summaryCombo({...g,adaptive:null,creative:null});
   return [{id:signature(slots),slots:structuredClone(slots),...g,trio:curated&&plan.members.length===3?original:null,duo:curated&&plan.members.length===2?original:null,creative:cooperation||curated?null:plan,adaptive:cooperation?(plan.shared||plan.cooperation):curated?null:g.adaptive,creativePlan:plan,origin:curated?'curated':cooperation?'adaptive':'creative',scope,title:plan.name,reason:plan.why,reasonPoints:[plan.why],targets:[],editableTargets,contributions:[],strategy:strategySummary(g.analysis,strategyCombo,play.tempo,context.enemyTraits),catalogState:null}];
  }
  return [attachPartyCounterplay({id:signature(slots),slots:structuredClone(slots),...g,scope,origin:g.trio||g.duo?'curated':g.adaptive?'adaptive':'generated',title:g.trio?.name||g.duo?.name||g.adaptive?.name||'当前阵容',reason:'当前范围没有未锁定位置，下面展示已选英雄的配合与配置。',reasonPoints:['当前范围没有未锁定位置，下面展示已选英雄的配合与配置。'],targets:[],contributions:[],strategy:strategySummary(g.analysis,summaryCombo(g),play.tempo,context.enemyTraits),catalogState:catalogStatus[(g.trio||g.duo)?.id]||null},scope,champions,visibleEnemies,context.patch)];
 }
 const fixed=slots.map(s=>{if(!targets.includes(s.role))return {...s};const {clientCellId,manualPosition,...draft}=s;return {...draft,champion:null};});
 if(poolMode==='only'&&!heroPool.some(id=>context.byId.has(id)))throw Error('先添加英雄池，或切换为“全部英雄”');
 const blocked=new Set([...excluded,...publicBans,...enemy.filter(Boolean),...publicPicks.filter(id=>context.byId.has(id)),...publicAllies.filter(id=>context.byId.has(id)),...fixed.map(s=>s.champion).filter(Boolean)]);
 const {byId}=context;
 const partyMembers=fixed.filter(s=>scope==='bot'?['bottom','support'].includes(s.role):s.party);
 const allowed=(c,role)=>!blocked.has(c.id)&&(!Array.isArray(eligibleByRole[role])||eligibleByRole[role].includes(c.id))&&(poolMode!=='only'||context.pool.has(c.id))&&(rolePools[role]?.mode!=='only'||rolePools[role].heroes?.includes(c.id))&&(role!=='bottom'||play.meleeBottom!==false||!Number.isFinite(c.stats?.attackrange)||c.stats.attackrange>250);
 const profCache=context.profiles;
 // Keep a reviewed pair together. Its unusual role is eligible only in this
 // seed, never as an extra member of the ordinary candidate pools.
 const linkOwners=[2,3].includes(partyMembers.length)?reviewedLinkOwners(RULE_CATALOG,{...linkReviewContext,patch}).filter(members=>{
  if(!members.some(m=>targets.includes(m.role))||members.some(m=>!partyMembers.some(s=>s.role===m.role)))return false;
  if(fixed.some(s=>s.champion&&members.some(m=>m.champion===s.champion&&m.role!==s.role)))return false;
  return members.every(m=>{const slot=fixed.find(s=>s.role===m.role);if(slot.champion)return slot.champion===m.champion;const c=byId.get(m.champion);return targets.includes(m.role)&&c&&allowed(c,m.role)&&(play.unusual!==false||conventionalRole(c,m.role,profCache));});
 }):[];
 const supportedBySource=new Set((Array.isArray(sourceRoles)?sourceRoles:[]).filter(r=>byId.has(r?.champion)&&ROLES.some(role=>role.id===r.role)).map(r=>r.champion+':'+r.role));
 const candidateSets={},reviewedDuos=DUOS.filter(combo=>reviewedCatalogEntry(combo,catalogStatus,patch)),reviewedTrios=TRIOS.filter(combo=>reviewedCatalogEntry(combo,catalogStatus,patch));
 const reviewedEntries=[...reviewedDuos,...reviewedTrios].map(combo=>({combo,members:comboMembers(combo)}));
 const extrasByRole=new Map(targets.map(role=>[role,new Set()]));
 if(play.unusual!==false)for(const {members} of reviewedEntries)for(const {role,champion} of members)extrasByRole.get(role)?.add(champion);
 // Both filtering and analysis reuse the immutable role-only base profile;
 // analysis applies a recipe's damage override to a new object, never here.
 const profOf=(c,role)=>{const k=`${c.id}:${role}`;let p=profCache.get(k);if(!p){p=profile(c,role);profCache.set(k,p);}return p;};
 for(const role of targets) {
  const candidates=champions.filter(c=>allowed(c,role)&&(play.unusual===false?conventionalRole(c,role,profCache):profOf(c,role).roles.includes(role)||supportedBySource.has(c.id+':'+role)));
  // Curated pairs can deliberately use unconventional roles.
  const present=new Set(candidates.map(c=>c.id));
  for(const id of extrasByRole.get(role))if(!present.has(id)&&byId.has(id)&&allowed(byId.get(id),role))candidates.push(byId.get(id));
  // Incremental product search needs a legal domain, not hundreds of partial
  // team grades before its first cancellable slice. Frequency/pool preferences
  // only choose traversal order; final visible fit is still graded exactly.
  const traversalScore=c=>(roleWeights[`${c.id}:${role}`]||0)+(poolMode==='prefer'&&context.pool.has(c.id)?2:0)+(rolePools[role]?.mode==='prefer'&&rolePools[role].heroes?.includes(c.id)?2:0);
  candidateSets[role]=candidates.map(c=>({c,score:searchFactory?traversalScore(c):grade(fixed.map(s=>s.role===role?{...s,champion:c.id}:s),champions,style,[c.id],roleWeights,context,true)}))
   .sort((a,b)=>b.score-a.score||a.c.id.localeCompare(b.c.id)).map(x=>x.c);
 }
 // At most one target remains outside the pair. Check that it has a distinct
 // ordinary candidate; separate reviewed pairs cannot be combined here.
 const viableLinkOwners=linkOwners.filter(members=>targets.filter(role=>!members.some(m=>m.role===role)).every(role=>candidateSets[role].some(c=>!members.some(m=>m.champion===c.id))));
 const emptyRole=targets.find(role=>!candidateSets[role].length);
 if(emptyRole&&!viableLinkOwners.some(members=>targets.every(role=>candidateSets[role].length||members.some(m=>m.role===role))))throw Error(`${ROLES.find(r=>r.id===emptyRole).name}没有可选英雄，请调整英雄池或排除条件${Array.isArray(eligibleByRole[emptyRole])?'，并核对本局可选范围与我的位置':''}`);
 // Include viable catalog pairs as anchors so personal and unusual pairs survive pruning.
 const seeds=[fixed],communityRecords=[];
 // Only the authoritative store can identify an unmodified bundled/signed
 // recipe. Local entries remain eligible ordinary seeds, never community.
 const publicRecipe=combo=>{
  const revision=linkReviewContext?.combinationOrigins?.[combo.id];
  if(!['bundled','community'].includes(linkReviewContext?.baseKind)||typeof revision!=='string')return false;
  const revisions=resources?.revisions;if(revisions&&!revisions.has(combo.id))revisions.set(combo.id,catalogEntryRevision(combo,RULE_CATALOG));
  return revision===(revisions?revisions.get(combo.id):catalogEntryRevision(combo,RULE_CATALOG));
 };
 const fixedByRole=new Map(fixed.map(slot=>[slot.role,slot.champion]));
 const occupied=fixed.filter(slot=>slot.champion);
 const candidateIds=new Map(targets.map(role=>[role,new Set(candidateSets[role].map(c=>c.id))]));
 const scopedRoles=new Set(scopeSlots(fixed,scope).map(slot=>slot.role));
 for(const {combo,members} of reviewedEntries){
  const editable=members.some(m=>candidateIds.has(m.role));
  if(members.length===3&&!editable)continue;
  if(members.some(({role,champion})=>{
   const locked=fixedByRole.get(role);
   return (locked?locked!==champion:!candidateIds.get(role)?.has(champion))||occupied.some(slot=>slot.champion===champion&&slot.role!==role);
  }))continue;
  const seed=fixed.map(slot=>{
   const member=members.find(m=>m.role===slot.role);
   return member?{...slot,champion:member.champion}:slot;
  });
  seeds.push(seed);
  if(editable&&members.every(m=>scopedRoles.has(m.role))&&publicRecipe(combo)){
   communityRecords.push({id:combo.id,name:combo.name,why:combo.why,seed,roles:members.map(m=>m.role)});
  }
 }
 if(searchFactory){
  // The entire legal role domain determines member weights before any search.
  // A special reviewed pair may expand a role only inside its own seed.
  const pairSeeds=viableLinkOwners.map(members=>fixed.map(slot=>{const member=members.find(m=>m.role===slot.role);return member?{...slot,champion:member.champion}:slot;}));
  const weightedSets=Object.fromEntries(targets.map(role=>[role,[...new Map([...candidateSets[role],...viableLinkOwners.flatMap(members=>members.filter(m=>m.role===role).map(m=>byId.get(m.champion)))].map(hero=>[hero.id,hero])).values()]]));
  const familiarity=roleFamiliarityWeights(targets,weightedSets,familiarityByRole),shared=canonicalRoomFamiliarity(roomFamiliarity);
  const weights={...(shared.length?Object.fromEntries(targets.map(role=>[role,roomChampionUsageWeights(weightedSets[role],shared)])):{}),...familiarity};
  const mechanicSeeds=mechanicSearchSeeds(fixed,scope,targets,candidateSets,weights,context.cooperationGraph.mechanics);
  const searchSeeds=[...mechanicSeeds,...seeds.slice(1),...pairSeeds];
  const creativeFor=createCreativeTrioLookup({targets,candidateSets,champions,patch:context.patch,style,profiles:context.profiles,reviews:resources?.reviews});
  const evaluated=new Map();
  const communityIds=new Set(communityRecords.map(record=>record.id));
  const fitFor=(next,selectionId,selectedContext,details)=>recommendationFit({slots:next,communityCombinationId:selectionId,targets,scope},{
   slots:fitSlots||slots,champions,scope:fitScope||scope,soloRole:fitSoloRole||soloRole,clientSession:fitSession||clientSession,party,includePreselected,patch,catalogStatus,context:selectedContext,details,
  });
  const evaluate=(next,selectionId='')=>{
   const key=signature(next)+'|'+selectionId;if(evaluated.has(key))return evaluated.get(key);
   if(selectionId&&(!communityIds.has(selectionId)||!selectedCatalogCombo(scopeSlots(next,scope),selectionId,catalogStatus,patch)))throw Error('社区组合已变化，请重新推荐');
   const selectedContext=selectionId?{...context,catalogSelectionId:selectionId}:context;
   const fit=fitFor(next,selectionId,selectedContext,false);
   if(!meetsRecommendationFit(fit,Number.isFinite(minimumFitScore)?minimumFitScore:60)){rememberSearchValue(evaluated,key,null,128);return null;}
   const creative=!selectionId&&creativeFor(next);
   const row={slots:next,...grade(next,champions,style,next.filter(slot=>targets.includes(slot.role)).map(slot=>slot.champion),roleWeights,selectedContext),recommendationFit:fit,...(creative?{creative}:{}),...(selectionId?{communityCombinationId:selectionId}:{} )};
   row.reviewedCombinationIds=matchingCombos(next,context.comboCache).filter(combo=>reviewedCatalogEntry(combo,catalogStatus,patch)).map(combo=>combo.id);
   rememberSearchValue(evaluated,key,row,128);
   return row;
  };
  const sharedBefore=analyzeTeam(scopeSlots(fixed,scope),champions,context);
  const session=fitSession||clientSession,localCell=session?.localPlayerCellId;
  const assigned=session?.myTeam?.find(player=>player.cellId===localCell)?.assignedPosition;
  const fallbackRole=ROLES.some(role=>role.id===soloRole)?soloRole:'';
  const roleFromSession=Number.isInteger(localCell)?(fitSlots||slots).find(slot=>slot.clientCellId===localCell)?.role||CLIENT_POSITION_ROLES[String(assigned||'').toUpperCase()]:'';
  const confirmedOwnRole=ROLES.some(role=>role.id===ownRole)?ownRole:'';
  const focusRole=fitSoloRole||confirmedOwnRole||roleFromSession||fallbackRole;
  const format=raw=>{
   const chosen=raw.communityCombinationId&&selectedCatalogCombo(scopeSlots(raw.slots,scope),raw.communityCombinationId,catalogStatus,patch);
   if(raw.communityCombinationId&&(!communityIds.has(raw.communityCombinationId)||!chosen||(raw.trio||raw.duo)?.id!==chosen.id))throw Error('社区组合已变化，请重新推荐');
   // A selected source retains its own loadouts and instructions. It remains
   // a two/three-member plan; extra automatic picks are not authored members.
   const entry=chosen?raw:completePartyPlan(raw,raw.slots,context),execution=resultCooperation(entry),origin=execution?'adaptive':entry.trio||entry.duo?'curated':entry.creative?'creative':'generated';
   const presented=entry.trio||entry.duo;
   // A primary ID alone says nothing about the builds analyzed for it. Only
   // the final authored plan with the exact member bindings can acknowledge
   // an ordinary presentation; its unbound score is never reused as evidence.
   const presentedCatalogId=!execution&&!entry.creative&&scope!=='solo'&&communityIds.has(presented?.id)&&comboMembers(presented).every(member=>entry.analysis.members.some(value=>value.champion===member.champion&&value.role===member.role&&value.catalogLoadoutId===(member.loadoutId||'default')))?presented.id:'';
   const selectedContext=chosen?{...context,catalogSelectionId:chosen.id}:context;
   const recommendationFit=fitFor(raw.slots,raw.communityCombinationId,selectedContext,true);
   const own=focusRole&&raw.slots.find(slot=>slot.role===focusRole)?.champion;
   const ownInteraction=evidence=>evidence?.from===own||evidence?.to===own;
   const ownPlan=own&&(chosen||presentedCatalogId)&&comboMembers(presented).some(member=>member.role===focusRole&&member.champion===own);
   const recommendationFocus=!own?0:ownPlan||ownInteraction(recommendationFit.tacticEvidence)?2:recommendationFit.relationships?.some(link=>link.mechanicLabel&&ownInteraction(link))?1:0;
   return attachPartyCounterplay({...entry,recommendationFit,...(recommendationFocus?{recommendationFocus}:{}),...(presentedCatalogId?{presentedCatalogId}:{}),id:signature(entry.slots),targets,scope,origin,title:entry.communityTitle||execution?.name||entry.creative?.name||entry.trio?.name||entry.duo?.name||entry.adaptive?.name||'职能搭配参考',reason:entry.communityWhy||execution?.why||entry.creative?.why||entry.trio?.why||entry.duo?.why||entry.adaptive?.why||entry.connections[0]?.[2]||describeComposition(entry.analysis),reasonPoints:buildReasonPoints(entry,scope),catalogState:catalogStatus[(entry.trio||entry.duo)?.id]||null,strategy:strategySummary(entry.analysis,summaryCombo(entry),play.tempo,context.enemyTraits),contributions:explainContributions(scopeSlots(fixed,scope),scopeSlots(entry.slots,scope),targets,champions,selectedContext,{before:sharedBefore,after:entry.analysis})},scope,champions,visibleEnemies,context.patch);
  };
  const preferred=play.tempo&&play.tempo!=='any'?entry=>strategySummary(entry.analysis,summaryCombo(entry),play.tempo).matched===true:null;
  return searchFactory({fixed,targets,candidates:candidateSets,seeds:searchSeeds,weights,evaluate,format,preferred,communityRecords:fitScope==='solo'?[]:communityRecords,communityAfter,focusRole,randomSeed,priority:entry=>stylePolicy?recommendationStyleTier({...entry,targets},style):0});
 }
 // A reviewed link is only a candidate anchor, not a complete cooperation
 // plan or a scoring bonus. Limit additional beams using the existing grade.
 const pairSeeds=[];
 if([2,3].includes(partyMembers.length)){
  const existing=new Set(seeds.map(signature)),linkSeeds=new Map();
  for(const members of viableLinkOwners){
   const seed=fixed.map(s=>{const member=members.find(m=>m.role===s.role);return member?{...s,champion:member.champion}:s;}),id=signature(seed);
   if(existing.has(id)||linkSeeds.has(id))continue;
   const score=grade(seed,champions,style,seed.filter(s=>targets.includes(s.role)&&s.champion).map(s=>s.champion),roleWeights,context,true);
   linkSeeds.set(id,{seed,id,score});
  }
  pairSeeds.push(...[...linkSeeds.values()].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,24).map(row=>row.seed));
 }
 for(const members of cooperationSeeds({members:partyMembers,targets,candidateSets,graph:context.cooperationGraph,preferences:play})){
  const seed=fixed.map(s=>{const member=members.find(m=>m.role===s.role);return member?{...s,champion:member.champion}:s;});
  const ids=seed.map(s=>s.champion).filter(Boolean);if(new Set(ids).size===ids.length)seeds.push(seed);
 }
 // Trait-derived ideas fill all three open positions; the same fit model
 // grades them and catalogue seeds without a bonus for their source label.
 const creativeBySig=new Map(),familiarity=roleFamiliarityWeights(targets,candidateSets,familiarityByRole),shared=canonicalRoomFamiliarity(roomFamiliarity);
 const exploration={...(shared.length?Object.fromEntries(targets.map(role=>[role,roomChampionUsageWeights(candidateSets[role],shared)])):{}),...familiarity};
 for(const def of generateCreativeTrios({targets,candidateSets,champions,patch:context.patch,style,randomSeed,familiarity:exploration})){
  const trioSlots=fixed.map(s=>{const m=def.members.find(m=>m.role===s.role);return m?{...s,champion:m.champion}:s;});
  const picked=trioSlots.map(s=>s.champion).filter(Boolean);
  if(new Set(picked).size!==picked.length||trioSlots.some(s=>targets.includes(s.role)&&!s.champion))continue;
  seeds.push(trioSlots);
  creativeBySig.set(signature(trioSlots),def);
 }
 const familiarSeeds=familiarityLineups(fixed,targets,candidateSets,exploration,randomSeed);
 let finished=[...discoveryLineups(fixed,targets,candidateSets,randomSeed),...familiarSeeds].map(slots=>({slots,score:0}));
 const hasCurrentCatalogLinks=context.catalogLinks.length>0;
 const expandSeeds=seedList=>{const resultRows=[];
 for(const seed of new Map(seedList.map(seed=>[signature(seed),seed])).values()) {
  let beam=[{slots:seed,score:0}];
  for(const role of ['bottom','support','jungle','mid','top'].filter(r=>targets.includes(r)&&!seed.find(s=>s.role===r).champion)) {
   const next=[];
   // Wide drafts keep every valid authored seed. Bound generic expansions,
   // while retaining low-ranked catalog links and authored skill partners.
   for(const partial of beam)for(const c of candidateSets[role].filter((c,rank)=>targets.length<4||rank<24||(hasCurrentCatalogLinks&&(context.linkByChamp.get(c.id)||[]).some(link=>partial.slots.some(s=>s.champion===(link[0]===c.id?link[1]:link[0]))))||partial.slots.some(s=>s.champion&&context.cooperationGraph.edge({champion:c.id,role},s)?.family.startsWith('pair:')))) {
    if(partial.slots.some(s=>s.champion===c.id))continue;
    const result=partial.slots.map(s=>s.role===role?{...s,champion:c.id}:s);
    const score=grade(result,champions,style,result.filter(s=>targets.includes(s.role)).map(s=>s.champion),roleWeights,context,true);
    next.push({slots:result,score});
   }
   beam=next.sort((a,b)=>b.score-a.score).slice(0,targets.length>=4?12:28);
  }
   resultRows.push(...beam);
 }
 return resultRows;};
 finished.push(...expandSeeds(seeds));
 const ordinarySignatures=pairSeeds.length?new Set(finished.map(entry=>signature(entry.slots))):null;
 finished.push(...expandSeeds(pairSeeds));
 const unique=new Map();
 const ordinaryUnique=new Map();
 for(const entry of finished){
  if(entry.slots.some(s=>targets.includes(s.role)&&!s.champion))continue;
  if(unique.has(signature(entry.slots)))continue;
  const g=grade(entry.slots,champions,style,entry.slots.filter(s=>targets.includes(s.role)).map(s=>s.champion),roleWeights,context);
  const creative=creativeBySig.get(signature(entry.slots));
  const row={...entry,...g,...(creative?{creative}:{})};
  if(Number.isFinite(minimumFitScore)){
   const fit=recommendationFit({...row,targets,scope},{slots:fitSlots||slots,champions,scope:fitScope||scope,soloRole:fitSoloRole||soloRole,clientSession:fitSession||clientSession,party,includePreselected,patch,catalogStatus});
   if(!meetsRecommendationFit(fit,minimumFitScore))continue;
   row.recommendationFit=fit;
  }
  const rowKey=signature(entry.slots);unique.set(rowKey,row);if(ordinarySignatures?.has(rowKey))ordinaryUnique.set(rowKey,row);
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
  if(entry.adaptive.kind==='shared')return entry.adaptive.tempo==='growth'?.5:1;
  if(!members.every(m=>entry.adaptive.edges.some(e=>e.current&&[e.a,e.b].includes(m.champion))))return 0;
  // A general control/follow-up plan must not displace reviewed interactions
  // such as Ahri/Vi merely because it can be generated for many more allies.
  return entry.adaptive.edges.some(e=>e.current&&e.family.startsWith('skills:'))?1:2;
 };
 const matching=new Map([...unique.values()].map(entry=>[entry,play.tempo&&play.tempo!=='any'&&strategySummary(entry.analysis,summaryCombo(entry),play.tempo).matched]));
 // An explicit play preference remains first. Within it, actual fit and
 // player preferences dominate; an executable full-party plan is a small
 // tie-breaker, not an unconditional category above better compositions.
 const styleRanks=stylePolicy?new Map([...unique.values()].map(entry=>[entry,recommendationStyleTier({...entry,targets},style)])):null;
 const priority=entry=>Number(!!matching.get(entry))*4+(styleRanks?.get(entry)||0);
 const rankScore=entry=>entry.score+Number(actionable(entry))+(randomSeed?seededFraction(randomSeed,signature(entry.slots))*(style==='balanced'?5:style==='fun'?8:11):0);
 const order=(a,b)=>priority(b)-priority(a)||rankScore(b)-rankScore(a)||signature(a.slots).localeCompare(signature(b.slots));
 const sorted=[...unique.values()].sort(order);
 const chosen=[];
 const makePool=(sorted,rows)=>{
 // Keep the best result for every curated duo reachable on reroll. Filling
 // the entire pool with minor variants of a few high scores hides the library.
 const anchors=new Map();for(const entry of sorted){for(const key of [(entry.trio||entry.duo)?.id,...(entry.reviewedSubgroups||[]).map(combo=>combo.id)])if(key&&!anchors.has(key))anchors.set(key,entry);}
 // Creative ideas get the same anchor treatment (one best entry per
 // archetype) so they survive the pool cap and stay discoverable.
 const creativeAnchors=new Map();for(const entry of sorted){if(entry.creative&&!creativeAnchors.has(entry.creative.archetype))creativeAnchors.set(entry.creative.archetype,entry);}
 // Preserve one best current cooperation per mechanism through the cap, as
 // for catalog and creative anchors. Otherwise an existing locked-friend
 // plan can disappear before the diversity pass has a chance to select it.
 const adaptiveAnchors=new Map();for(const entry of sorted){if(!entry.adaptive||entry.trio||entry.duo)continue;const key=entry.adaptive.kind==='shared'?'shared:'+entry.adaptive.tempo:entry.adaptive.edges.filter(e=>e.current).map(e=>e.family).sort().join('|');if(key&&!adaptiveAnchors.has(key)&&adaptiveAnchors.size<24)adaptiveAnchors.set(key,entry);}
 const heroAnchors=new Map(),tacticAnchors=new Map();
 for(const entry of sorted){
  for(const role of targets){const key=role+':'+entry.slots.find(s=>s.role===role).champion;if(!heroAnchors.has(key))heroAnchors.set(key,entry);}
  const tactic=entry.compositionFit?.tactic?.id;if(tactic&&!tacticAnchors.has(tactic))tacticAnchors.set(tactic,entry);
 }
 const familiarAnchors=familiarSeeds.map(slots=>rows.get(signature(slots))).filter(Boolean);
 const preserved=new Map([...anchors.values(),...creativeAnchors.values(),...adaptiveAnchors.values(),...heroAnchors.values(),...tacticAnchors.values(),...familiarAnchors].map(entry=>[signature(entry.slots),entry]));
 return {pool:[...preserved.values(),...sorted.filter(entry=>!preserved.has(signature(entry.slots))).slice(0,Math.max(0,240-preserved.size))].sort(order),anchors};
 };
 let {pool,anchors}=makePool(sorted,unique);
 let count=Math.min(Math.max(0,limit+offset),pool.length);
 let preferencePriority=Math.max(...pool.map(entry=>Number(!!matching.get(entry)))),preferencePool=pool.filter(entry=>Number(!!matching.get(entry))===preferencePriority);
 const preferencePage=[];let selectionWeights=exploration,preferenceNotice='';
 const hasNewResult=ordinarySignatures&&pool.some(entry=>!ordinaryUnique.has(signature(entry.slots)));
 const newResults=ordinarySignatures?preferencePool.filter(entry=>!ordinaryUnique.has(signature(entry.slots))):[];
 if(count&&hasNewResult&&targets.some(role=>exploration[role])){
  const pairOnly=newResults.filter(entry=>targets.some(role=>!candidateSets[role].some(c=>c.id===entry.slots.find(s=>s.role===role).champion)));
  if(pairOnly.length){
   const expandedSets=Object.fromEntries(targets.map(role=>[role,[...new Map([...candidateSets[role],...pairOnly.map(entry=>byId.get(entry.slots.find(s=>s.role===role).champion))].map(c=>[c.id,c])).values()]]));
   const extendedFamiliarity=roleFamiliarityWeights(targets,expandedSets,familiarityByRole);
   selectionWeights={...(shared.length?Object.fromEntries(targets.map(role=>[role,roomChampionUsageWeights(expandedSets[role],shared)])):{}),...extendedFamiliarity};
  }
  const positive=(entries,weights)=>entries.some(entry=>targets.every(role=>!weights[role]||(weights[role][entry.slots.find(s=>s.role===role).champion]||0)>0));
  if(!positive(preferencePool,selectionWeights)){
   const ordinary=makePool([...ordinaryUnique.values()].sort(order),ordinaryUnique);
   const oldPriority=Math.max(...ordinary.pool.map(entry=>Number(!!matching.get(entry))));
   const oldPreferencePool=ordinary.pool.filter(entry=>Number(!!matching.get(entry))===oldPriority);
   if(!positive(oldPreferencePool,exploration))throw Error('当前选人和成员英雄偏好无法组成可选阵容，请调整偏好或选人条件。');
   pool=ordinary.pool;anchors=ordinary.anchors;preferencePriority=oldPriority;preferencePool=oldPreferencePool;selectionWeights=exploration;
   count=Math.min(Math.max(0,limit+offset),pool.length);
   preferenceNotice='新增配对与当前组合偏好未同时满足，暂按原有可选阵容展示。';
  }
 }
 const hasPreference=targets.some(role=>selectionWeights[role]);
 for(let i=0;i<count;i++) {
  let winner=0,best=-Infinity,bestPriority=-1;
  const usedCombos=new Set(chosen.map(entry=>(entry.trio||entry.duo)?.id));
  const bestByPriority=new Map();for(const entry of pool){const p=priority(entry);bestByPriority.set(p,Math.max(bestByPriority.get(p)??-Infinity,entry.score));}
  const priorityCeiling=Math.max(...bestByPriority.keys()),bestFit=bestByPriority.get(priorityCeiling);
  const botDiscovery=scope==='bot'&&i>0&&i%8!==7?new Set([...anchors.values()].filter(entry=>pool.includes(entry)&&!usedCombos.has(entry.duo?.id)&&(!stylePolicy||priority(entry)===priorityCeiling))):null;
  // One preference sampler covers curated, creative and generated lineups.
  // Source/discovery reservations cannot silently bypass a member's heroes.
  // Draw from the original legal population every time. Removing a familiar
  // hero must not redistribute its probability to unfamiliar heroes. Once all
  // variants in a group are shown, another draw of that group leaves a gap.
  // Fit stays visible, separate from player preference.
  const preferred=hasPreference?familiarityWinner(preferencePool,targets,selectionWeights,randomSeed,i,{variantPriority:stylePolicy?priority:null,available:new Set(pool)}):null;
  if(hasPreference){if(preferred&&pool.includes(preferred)){chosen.push(pool.splice(pool.indexOf(preferred),1)[0]);if(i>=offset)preferencePage.push(preferred);}continue;}
  const authoredDiscovery=partyMembers.length===3&&i%6===3?pool.filter(entry=>entry.trio&&actionable(entry)===3&&!usedCombos.has(entry.trio.id)&&priority(entry)===priorityCeiling&&entry.score>=bestFit-16).sort((a,b)=>{
   const novelty=entry=>rankScore(entry)-chosen.reduce((sum,c)=>sum+targets.filter(role=>c.slots.find(s=>s.role===role).champion===entry.slots.find(s=>s.role===role).champion).length*12+(c.compositionFit?.tactic?.id===entry.compositionFit?.tactic?.id?8:0),0);
   return novelty(b)-novelty(a)||signature(a.slots).localeCompare(signature(b.slots));
  })[0]:null;
  if(authoredDiscovery){chosen.push(pool.splice(pool.indexOf(authoredDiscovery),1)[0]);continue;}
  for(let j=0;j<pool.length;j++) {
   const entry=pool[j];
   if(botDiscovery?.size&&!botDiscovery.has(entry))continue;
   const entryStyle=(entry.trio||entry.duo)?.style||'balanced';
   const similarity=chosen.reduce((sum,c)=>sum+targets.filter(r=>c.slots.find(s=>s.role===r).champion===entry.slots.find(s=>s.role===r).champion).length*9+(entry.duo&&c.duo?.id===entry.duo.id?18:0)+(entry.trio&&c.trio?.id===entry.trio.id?22:0)+(entry.trio&&c.trio?.tempo===entry.trio.tempo?6:0)+(((c.trio||c.duo)?.style||'balanced')===entryStyle?10:0)+(entry.creative&&c.creative?.archetype===entry.creative.archetype?14:0),0);
   const bestFit=bestByPriority.get(priority(entry));
   // Sample only within a useful fit band. Discovery must not buy novelty by
   // recommending a clearly worse or non-executable team.
   const lowFit=entry.score<bestFit-18;
   const repeated=targets.filter(role=>chosen.filter(c=>c.slots.find(s=>s.role===role).champion===entry.slots.find(s=>s.role===role).champion).length>=2).length;
   const v=rankScore(entry)-similarity-repeated*18-(lowFit?80:0);
   const p=priority(entry);
   if(p>bestPriority||p===bestPriority&&v>best){best=v;winner=j;bestPriority=p;}
  }
  chosen.push(pool.splice(winner,1)[0]);
 }
 const sharedBefore=analyzeTeam(scopeSlots(fixed,scope),champions,context);
 return (hasPreference?preferencePage:chosen.slice(offset,offset+limit)).map(entry=>{
  entry=completePartyPlan(entry,entry.slots,context);
  const execution=resultCooperation(entry),origin=execution?'adaptive':entry.trio||entry.duo?'curated':entry.creative?'creative':'generated';
  const points=buildReasonPoints(entry,scope);
  return attachPartyCounterplay({
  ...entry,id:signature(entry.slots),targets,scope,origin,...(preferenceNotice?{preferenceNotice}:{}),
  title:execution?.name||entry.creative?.name||entry.trio?.name||entry.duo?.name||entry.adaptive?.name||'职能搭配参考',
  reason:execution?.why||entry.creative?.why||entry.trio?.why||entry.duo?.why||entry.adaptive?.why||entry.connections[0]?.[2]||`${describeComposition(entry.analysis)}。${entry.analysis.missing.length?`短板是${entry.analysis.missing.join('、')}，具体补充作用见方案详情。`:'具体补充作用见方案详情。'}`,
  reasonPoints:points,
  catalogState:catalogStatus[(entry.trio||entry.duo)?.id]||null,
  strategy:strategySummary(entry.analysis,summaryCombo(entry),play.tempo,context.enemyTraits),
  contributions:explainContributions(scopeSlots(fixed,scope),scopeSlots(entry.slots,scope),targets,champions,context,{before:sharedBefore,after:entry.analysis}),
  },scope,champions,visibleEnemies,context.patch);});
}

// Product search has worker-owned continuation. The synchronous API remains
// available for narrow callers such as explicit single-member replacement.
export function createRecommendationSearch(input,resources=null){
 if(!resources?.matches(input))resources=createRecommendationResources(input);
 else resources.clearDraftCaches();
 const prepared=recommend(input,createRecommendationLane,resources);
 const lanes=Array.isArray(prepared)?[createFixedRecommendationLane(prepared)]:prepared.lanes||[prepared];
 return createRecommendationSearchSession(lanes);
}

export function replaceMember(result,role,input){
  const editableTargets=result.editableTargets||result.targets;
  const target=scopeSlots(result.slots,result.scope).find(s=>s.role===role);if(!target||(!target.party&&!['bot','solo'].includes(result.scope))||!editableTargets.includes(role))throw Error('只能替换本次推荐范围中的位置');
 const session=input.fitSession||input.clientSession;
 if(Array.isArray(session?.myTeam)){
  const {slots:confirmed}=clientRecommendationDraft(input.fitSlots||input.slots||result.slots,session,input.champions);
  if(confirmed.some(slot=>slot.role===role&&slot.locked))throw Error('这个位置已在客户端锁定');
 }
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
 const graph=context?.cooperationGraph||createCooperationGraph(champions);
 const kept=new Set(fixed.filter(s=>s.champion&&!targets.includes(s.role)).map(s=>s.champion));
 return after.members.filter(m=>targets.includes(m.role)).map(m=>({
  hero:m.champion,role:m.role,name:m.c.name,unusual:!conventionalRole(m.c,m.role),
  damage:m.p.damage==='ap'?'法术':m.p.damage==='ad'?'物理':'混合',
  helps:Object.entries(labels).filter(([key])=>m.p[key]).map(([key,label])=>`${before.traits[key]?'增加':'补上'}${label}`),
  pairings:(context?.catalogLinks||[]).filter(([a,b])=>[a,b].includes(m.champion)&&fixed.some(s=>s.champion===([a,b].find(id=>id!==m.champion)))).map(([, ,text])=>text),
  interactions:after.members.filter(other=>other.champion!==m.champion).map(other=>{const edge=graph.edge(m,other);return edge?.current?{with:other.champion,kept:kept.has(other.champion),name:edge.name,step:edge.step,condition:edge.condition,failure:edge.failure}:null;}).filter(Boolean).sort((a,b)=>Number(b.kept)-Number(a.kept)),
 }));
}
// Structured, human-readable reasons. Curated texts (why/plan/risk) are reused
// verbatim; everything else is composed from the same traits the score uses.
export function describeComposition(analysis){
 return `覆盖${analysis.strengths.slice(0,3).join('、')||'当前位置的输出分工'}；${analysis.control}，${analysis.curve.label}，${analysis.forgiveness.label}`;
}
export function buildReasonPoints(entry,scope){
 const combo=entry.trio||entry.duo,a=entry.analysis,points=[],execution=resultCooperation(entry);
 if(execution){
  points.push(execution.why);
  points.push('打法：'+execution.steps.join(' → '));
  points.push('成立条件：'+execution.conditions.join(' '));
  points.push('失败就退出：'+execution.failures.join(' '));
  points.push(execution.sourceNote);
 }else if(entry.creative){
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

export function mergeClientSession(slots, session, champions, {autoArrange=true,autoParty=false,party=null,roleOrder={},ownRole='',creativePlan=null,partyCount}={}) {
 const byKey=new Map(champions.map(c=>[c.key,c])),next=structuredClone(slots),unassigned=[],displaced=[];
 const allEntries=(session?.myTeam||[]).filter((p,i,a)=>Number.isInteger(p.cellId)&&p.cellId>=0&&p.cellId<30&&a.findIndex(q=>q.cellId===p.cellId)===i).slice(0,5);
 const entries=allEntries.filter(p=>byKey.has(Number(p.championId))),placed=new Set();
 for(const slot of next)if(Number.isInteger(slot.clientCellId)){slot.champion=null;slot.locked=false;delete slot.clientCellId;delete slot.manualPosition;delete slot.automaticPosition;}
 const put=(p,target,manual=false,automatic=false)=>{
  const id=byKey.get(Number(p.championId))?.id;
  for(const slot of next)if(slot!==target&&slot.champion===id&&!Number.isInteger(slot.clientCellId)&&slot.automaticPosition){slot.champion=null;slot.locked=false;delete slot.automaticPosition;}
  if(target.champion&&target.champion!==id)displaced.push(target.champion);
  delete target.manualPosition;delete target.automaticPosition;
  Object.assign(target,{champion:id||null,locked:!!id,clientCellId:p.cellId});
  if(manual)target.manualPosition=true;
  if(automatic)target.automaticPosition=true;
  placed.add(p.cellId);
 };
 // A player's explicit lane remains attached to the client cell through swaps.
 for(const prior of slots.filter(s=>s.manualPosition&&Number.isInteger(s.clientCellId))){
  const current=allEntries.find(p=>p.cellId===prior.clientCellId),target=next.find(s=>s.role===prior.role);
  if(current&&target&&!placed.has(current.cellId))put(current,target,true);
 }
 for(const p of entries){
  if(placed.has(p.cellId))continue;
  const declared=CLIENT_POSITION_ROLES[String(p.assignedPosition||'').toUpperCase()];
  const same=next.find(s=>s.champion===byKey.get(Number(p.championId)).id&&!Number.isInteger(s.clientCellId)&&(!s.automaticPosition||!declared||s.role===declared));
  if(same)put(p,same,!same.automaticPosition,same.automaticPosition&&same.role!==declared);
 }
 // Declared lanes have priority over inferred lanes, independent of cell order.
 const ordered=[...entries].sort((a,b)=>Number(!!CLIENT_POSITION_ROLES[String(b.assignedPosition||'').toUpperCase()])-Number(!!CLIENT_POSITION_ROLES[String(a.assignedPosition||'').toUpperCase()])||a.cellId-b.cellId);
 for(const p of ordered){
  if(placed.has(p.cellId))continue;
  const champion=byKey.get(Number(p.championId)),declared=CLIENT_POSITION_ROLES[String(p.assignedPosition||'').toUpperCase()],prior=slots.find(s=>s.clientCellId===p.cellId);
  const member=party?.status==='known'&&party.members?.find(value=>value.cellId===p.cellId),intentRole=ROLES.some(value=>value.id===member?.intentRole)?member.intentRole:'';
  const preferred=[declared,...(!declared&&intentRole?[intentRole]:[]),...(!declared&&prior?.champion===champion.id?[prior.role]:[]),...(roleOrder[champion.id]||[]),...profile(champion).roles,...ROLES.map(r=>r.id)].filter((r,i,a)=>r&&a.indexOf(r)===i);
  let target=next.find(s=>s.role===declared&&!Number.isInteger(s.clientCellId)&&(!s.champion||autoArrange&&(s.automaticPosition||!s.locked)));
  if(!target&&autoArrange)target=preferred.map(r=>next.find(s=>s.role===r)).find(s=>s&&!s.champion&&!Number.isInteger(s.clientCellId));
  // Public picks supersede only prospective local suggestions, never a bound pick.
  if(!target&&autoArrange)target=preferred.map(r=>next.find(s=>s.role===r)).find(s=>s&&!Number.isInteger(s.clientCellId));
  if(target)put(p,target,false,target.role!==declared);
  else unassigned.push({champion:champion.id,cellId:p.cellId,local:p.cellId===session.localPlayerCellId});
 }
 const local=allEntries.find(p=>p.cellId===session?.localPlayerCellId),bound=next.find(s=>s.clientCellId===session?.localPlayerCellId);
 const localRole=bound?.role||CLIENT_POSITION_ROLES[String(local?.assignedPosition||'').toUpperCase()],mine=next.find(s=>s.role===localRole);
 const previous=slots.some(s=>s.clientCellId===session?.localPlayerCellId),changed=!!(mine&&!mine.party&&!mine.partyManual&&!mine.manualPosition&&!previous);
 if(changed&&!validPartyCount(partyCount))mine.party=true;
 if(autoParty&&party&&!validPartyCount(partyCount)){
  const known=party.status==='known';
  const members=(party.members||[]).filter((m,i,all)=>allEntries.some(p=>p.cellId===m.cellId)&&all.findIndex(p=>p.cellId===m.cellId)===i&&(known||m.cellId===session?.localPlayerCellId||m.source==='manual-id'));
  const hoverContext=recommendationDraft(next,session,champions,{ownRole});
  const publicRole=player=>{
   const at=next.find(s=>s.clientCellId===player.cellId),declared=CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()];
   const manual=at?.manualPosition?at.role:player.cellId===session?.localPlayerCellId&&next.some(s=>s.role===ownRole)?ownRole:'';
   const hover=byKey.get(Number(player.championPickIntent)),preview=hoverContext.find(s=>s.publicIntent&&s.champion===hover?.id);
   return {at,manual,declared,preview};
  };
  const reserved=new Map();
  // Real bindings stay fixed; an explicit local lane outranks an unpicked
  // teammate's declared lane. Apply that priority before reserving, too.
  const reservations=allEntries.map(player=>({player,...publicRole(player)})).sort((a,b)=>(a.at?0:a.manual?1:a.declared?2:3)-(b.at?0:b.manual?1:b.declared?2:3)||a.player.cellId-b.player.cellId);
  for(const {player,at,manual,declared,preview} of reservations){const role=at?.role||manual||declared||preview?.role;if(role&&!reserved.has(role))reserved.set(role,player.cellId);}
  const infos=members.map(member=>{
   const player=allEntries.find(p=>p.cellId===member.cellId),position=publicRole(player),champion=byKey.get(Number(player.championId))||byKey.get(Number(player.championPickIntent)),p=champion&&profile(champion);
   const usual=champion?[...(roleOrder[champion.id]||[]),...(p.reviewed?p.roles:[])]:[];
   const lobbyRoles=known?[CLIENT_POSITION_ROLES[String(member.firstPosition||'').toUpperCase()],CLIENT_POSITION_ROLES[String(member.secondPosition||'').toUpperCase()]].filter(Boolean):[];
   const fixed=position.manual||position.declared||position.at?.role;
   const excluded=!!fixed&&next.some(s=>s.role===fixed&&s.partyManual&&!s.party);
   return {member,...position,usual,lobbyRoles,excluded,priority:position.manual?0:position.declared?1:position.preview?2:position.at?3:usual.length?4:lobbyRoles.length?5:6};
  }).sort((a,b)=>a.priority-b.priority||Number(b.member.cellId===session?.localPlayerCellId)-Number(a.member.cellId===session?.localPlayerCellId)||a.member.cellId-b.member.cellId);
  const manualOn=next.filter(s=>s.partyManual&&s.party),used=new Set(manualOn.map(s=>s.role)),claimed=new Set();
  const count=Math.min(next.length,Math.max(members.length,Number.isInteger(party.lobbyCount)?party.lobbyCount:0));
  const limit=Math.max(manualOn.length,count-infos.filter(info=>info.excluded).length);
  const available=(slot,cellId)=>slot&&!claimed.has(slot.role)&&!(slot.partyManual&&!slot.party)&&(!Number.isInteger(slot.clientCellId)||slot.clientCellId===cellId)&&(!reserved.has(slot.role)||reserved.get(slot.role)===cellId);
  const provisional=slot=>slot&&!slot.manualPosition&&!Number.isInteger(slot.clientCellId)&&(!slot.champion||slot.automaticPosition);
  // A user can claim a different role in an adopted plan before anyone picks.
  // Reuse that plan's remaining unbound lane before inventing a new range.
  const fallback=known?next.filter(provisional).sort((a,b)=>Number(!!b.party&&!!b.automaticPosition)-Number(!!a.party&&!!a.automaticPosition)):[];
  for(const info of infos){
   if(info.excluded)continue;
   const {member,manual,declared,preview,at,usual,lobbyRoles}=info,role=manual||declared;
   const direct=[role&&next.find(s=>s.role===role),preview&&next.find(s=>s.role===preview.role),at].filter(Boolean);
   const preferred=[...usual,...lobbyRoles].filter((r,i,a)=>r&&a.indexOf(r)===i);
   // A saved, unbound hero constrains recommendations, not who occupies a lane.
   // Public member hints may move the range flag without changing that plan.
   const candidates=[...direct,...preferred.map(r=>next.find(s=>s.role===r)).filter(s=>s&&!s.manualPosition&&!Number.isInteger(s.clientCellId)),...fallback];
   const target=candidates.find(s=>available(s,member.cellId)&&(!known||used.has(s.role)||used.size<limit));
   if(target){used.add(target.role);claimed.add(target.role);}
  }
  if(known){
   // Unlocated members still contribute to the range. These temporary slots
   // carry no player binding; later public picks, hovers and lanes replace them.
   for(const slot of fallback)if(used.size<limit&&available(slot,null)){used.add(slot.role);claimed.add(slot.role);}
   // Saved local plans may occupy every slot. A range flag does not bind a
   // player or replace a hero, so unbound planned slots can still count here.
   for(const slot of next)if(used.size<limit&&!Number.isInteger(slot.clientCellId)&&available(slot,null)){used.add(slot.role);claimed.add(slot.role);}
   for(const slot of next)if(!slot.partyManual)slot.party=used.has(slot.role);
  }else{
   // Missing the lobby is not evidence that the old default mid/bot/support
   // range belongs to this party. A matching explicitly adopted plan is a
   // saved recommendation range, not evidence about hidden player identities.
   let planned=[];
   if(creativePlan)try{
    const plan=validateCreativePlan(creativePlan,next);
    const conflict=allEntries.some(player=>{
     if(player.cellId===session.localPlayerCellId)return false;
     const {manual,declared,at}=publicRole(player),role=manual||declared||at?.role,member=plan.members.find(m=>m.role===role),hero=byKey.get(Number(player.championId||player.championPickIntent));
     return member&&hero&&member.champion!==hero.id;
    });
    if(!conflict)planned=plan.members.filter(m=>slots.some(s=>s.role===m.role&&s.party&&s.champion===m.champion)).map(m=>m.role);
   }catch{}
   for(const slot of next)if(!slot.partyManual)slot.party=used.has(slot.role)||planned.includes(slot.role);
  }
 }
 const ranged=validPartyCount(partyCount)?reconcilePartyRange(next,session,champions,{count:partyCount,party,ownRole,roleOrder}):next;
 return {slots:ranged,unassigned,displaced,markedLocalRole:localRole||null,markedLocalChanged:changed&&!!ranged.find(slot=>slot.role===localRole)?.party};
}
