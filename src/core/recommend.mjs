import { ROLES, DUOS, TRIOS, CROSS_SYNERGIES, profile,conventionalRole } from './rules.mjs';
import {draftTargets,scopeSlots,CLIENT_POSITION_ROLES} from './draft.mjs';
import {comboLoadout,loadoutOptions} from './loadouts.mjs';
import {generateCreativeTrios} from './creative-trios.mjs';
import {strategyTraits,strategySummary,summarizeEnemyTraits,threatNotes,describeCurve,describeForgiveness,controlChainLabel} from './strategy.mjs';

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
 const warnings=[];
 if(members.length>=3){
  if(!traits.frontline)warnings.push('前排偏少，避免直接接正面团战');
  if(!traits.engage)warnings.push('先手偏少，需要消耗、视野或抓失误来开局');
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
  curve:describeCurve(traits),forgiveness:describeForgiveness(traits,balancedDamage),
  control:controlChainLabel(traits),avgDifficulty,
  damageMix:!traits.ad&&!traits.ap?'none':balancedDamage?'mixed':traits.ad>=traits.ap?'ad':'ap'};
}
function findDuo(slots) {
 const carry=slots.find(s=>s.role==='bottom')?.champion;
 const support=slots.find(s=>s.role==='support')?.champion;
 if(!carry||!support)return undefined;
 return comboIndex().duoByPair.get(`${carry}:${support}`);
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
export function currentCombo(slots,champion,role,status={},comboCache=null){
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
  matches=[...trios,findDuo(slots)].filter(c=>c&&!status?.[c.id]?.invalid);
  comboCache?.set(sig,matches);
 }
 if(!champion)return matches[0]||null;
 const relevant=matches.filter(c=>comboLoadout(c,{id:champion},role)!==null);
 return relevant.find(c=>comboLoadout(c,{id:champion},role)!=='default')||relevant[0]||null;
}
export function comboContextKnown(slots,champion,role,previousComboId){
 // Missing teammates are unknown, not evidence that an existing combo broke.
 if(!slots.some(s=>s.role===role&&s.champion===champion))return false;
 const previous=[...TRIOS,...DUOS].find(c=>c.id===previousComboId);
 if(previous){
  const members=previous.members||[{role:'bottom',champion:previous.carry},{role:'support',champion:previous.support}];
  if(members.some(m=>slots.some(s=>s.role===m.role&&s.champion&&s.champion!==m.champion)))return true;
  return members.every(m=>slots.some(s=>s.role===m.role&&s.champion===m.champion));
 }
 return ['bottom','support'].includes(role)?['bottom','support'].every(r=>slots.some(s=>s.role===r&&s.champion)):slots.every(s=>s.champion);
}
function grade(slots, champions, style, requestedIds=[],roleWeights={},context) {
 slots=scopeSlots(slots,context?.scope);
 const cacheKey=context?.gradeCache?signature(slots)+'|'+[...requestedIds].sort().join(','):null;
 const cached=cacheKey?context.gradeCache.get(cacheKey):null;
 if(cached)return cached;
 const a=analyzeTeam(slots,champions,context),t=a.traits;
 let score=Math.min(t.frontline,1)*10+Math.min(t.engage,1)*10+Math.min(t.peel,1)*6+Math.min(t.sustain,1)*10+Math.min(t.ap,1)*8+Math.min(t.ad,1)*8+Math.min(t.aoe,1)*3;
 score-=Math.max(0,t.frontline-2)*4;
 // Overstacking the same function wastes picks; the curve stays shallow so
 // curated combinations keep their lead.
 score-=Math.max(0,t.engage-3)*2;
 if(a.members.length>=3){
  if(t.ad>=.75&&t.ap>=.75)score+=6;
  else if(t.ad<.4||t.ap<.4)score-=6;
 }
 // Robustness against visibly picked enemies only. Trait-derived and small by
 // design; curated synergy bonuses above dominate the ordering.
 const enemy=context?.enemyTraits;
 if(enemy&&enemy.count&&a.members.length>=2){
  let guard=0;
  if(enemy.engage>=2){if(t.peel>=1)guard+=4;else if(a.members.length>=3)guard-=4;}
  if(enemy.poke>=2&&t.sustain>=1)guard+=2;
  if(enemy.aoe>=2&&t.peel>=1)guard+=2;
  if(enemy.sustain>=2&&t.engage>=1)guard+=2;
  score+=Math.max(-8,Math.min(8,guard));
 }
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
 if(duo)score+=duo.partners.filter(id=>ids.has(id)).length*7;
 const tempo=context?.play?.tempo;if(tempo&&tempo!=='any')score+=Math.min(strategyTraits(a,trio||duo)[tempo]||0,12)*3;
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
 const out={score,analysis:a,duo,trio,connections};
 if(cacheKey)context.gradeCache.set(cacheKey,out);
 return out;
}
const signature=slots=>slots.map(s=>`${s.role}:${s.champion||'-'}`).join('|');
// Catalog lookup indexes. Rebuilt only when the catalog arrays are replaced
// (configureRuleCatalog reassigns them); reads are O(1)/O(subsets) instead of
// full scans inside every grade call. Order-sensitive consumers re-sort by
// catalog order, so scoring semantics never change.
let comboIndexCache={duos:null,trios:null,links:null};
function comboIndex(){
 if(comboIndexCache.duos!==DUOS||comboIndexCache.trios!==TRIOS||comboIndexCache.links!==CROSS_SYNERGIES){
  const duoByPair=new Map(DUOS.filter(d=>d&&d.carry&&d.support).map(d=>[`${d.carry}:${d.support}`,d]));
  const trioByMembers=new Map(),trioOrder=new Map();
  TRIOS.forEach((t,i)=>{trioOrder.set(t,i);if(t&&Array.isArray(t.members))trioByMembers.set(t.members.map(m=>`${m.role}:${m.champion}`).sort().join('|'),t);});
  const linkByChamp=new Map();
  for(const link of CROSS_SYNERGIES){for(const id of [link[0],link[1]]){if(!linkByChamp.has(id))linkByChamp.set(id,[]);linkByChamp.get(id).push(link);}}
  comboIndexCache={duos:DUOS,trios:TRIOS,links:CROSS_SYNERGIES,duoByPair,trioByMembers,trioOrder,linkByChamp};
 }
 return comboIndexCache;
}
export function recommend({slots,champions,style='fun',excluded=[],enemy=[],publicPicks=[],limit=5,offset=0,builds={},pool:heroPool=[],poolMode='off',scope='context',play={},rolePools={},catalogStatus={}}) {
 validateSlots(slots,champions);
 limit=Number.isInteger(limit)?Math.max(0,limit):5;
 offset=Number.isInteger(offset)?Math.max(0,offset):0;
 // Profiles are constant for one calculation; reuse them across the search beam.
 // Enemy traits are computed once from visibly picked enemies (no-mirror
 // draft) and reused by every grade call below.
 const context={byId:new Map(champions.map(c=>[c.id,c])),profiles:new Map(),pool:new Set(heroPool),poolMode,scope,play,rolePools,catalogStatus,enemyTraits:summarizeEnemyTraits(enemy,champions),comboCache:new Map(),gradeCache:new Map()};
 // Rune-page samples are used only as a coarse position-frequency signal.
 // They do not measure how strong a champion or a composition is.
 const maxSamples={},roleWeights={};
 for(const ref of Object.values(builds))if(Number.isFinite(ref.runeSamples))maxSamples[ref.champion]=Math.max(maxSamples[ref.champion]||1,ref.runeSamples);
 for(const ref of Object.values(builds))if(maxSamples[ref.champion])roleWeights[`${ref.champion}:${ref.role}`]=Math.max(0,Math.min(1,ref.runeSamples/maxSamples[ref.champion]));
 const targets=draftTargets(slots,scope);
 if(!targets.length){
  const g=grade(slots,champions,style,[],{},context);
  return [{id:signature(slots),slots:structuredClone(slots),...g,scope,title:g.trio?.name||g.duo?.name||'当前阵容',reason:'当前范围没有未锁定位置，下面展示已选英雄的配合与配置。',reasonPoints:['当前范围没有未锁定位置，下面展示已选英雄的配合与配置。'],targets:[],contributions:[],strategy:strategySummary(g.analysis,g.trio||g.duo,play.tempo,context.enemyTraits),catalogState:catalogStatus[(g.trio||g.duo)?.id]||null}];
 }
 const fixed=slots.map(s=>{if(!targets.includes(s.role))return {...s};const {clientCellId,manualPosition,...draft}=s;return {...draft,champion:null};});
 if(poolMode==='only'&&!heroPool.some(id=>context.byId.has(id)))throw Error('先添加英雄池，或切换为“全部英雄”');
 const blocked=new Set([...excluded,...enemy.filter(Boolean),...publicPicks.filter(id=>context.byId.has(id)),...fixed.map(s=>s.champion).filter(Boolean)]);
 const {byId}=context;
 const candidateSets={};
 // Role-profile cache for candidate filtering (analyzeTeam keeps its own
 // loadout-aware cache in context.profiles; this one is role-only).
 const profCache=new Map();
 const profOf=(c,role)=>{const k=`${c.id}:${role}`;let p=profCache.get(k);if(!p){p=profile(c,role);profCache.set(k,p);}return p;};
 for(const role of targets) {
  const allowed=c=>!blocked.has(c.id)&&(poolMode!=='only'||context.pool.has(c.id))&&(rolePools[role]?.mode!=='only'||rolePools[role].heroes?.includes(c.id))&&(role!=='bottom'||play.meleeBottom!==false||!Number.isFinite(c.stats?.attackrange)||c.stats.attackrange>250);
  let candidates=champions.filter(c=>allowed(c)&&(play.unusual===false?conventionalRole(c,role,profCache):profOf(c,role).roles.includes(role)));
  // Curated pairs can deliberately use unconventional roles.
  const extras=play.unusual===false?[]:[...DUOS.filter(d=>!catalogStatus[d.id]?.invalid).flatMap(d=>role==='bottom'?[d.carry]:role==='support'?[d.support]:[]),...TRIOS.filter(t=>!catalogStatus[t.id]?.invalid).flatMap(t=>t.members.filter(m=>m.role===role).map(m=>m.champion))];
  for(const id of extras)if(byId.has(id)&&allowed(byId.get(id))&&!candidates.some(c=>c.id===id))candidates.push(byId.get(id));
  candidates=candidates.map(c=>({c,score:grade(fixed.map(s=>s.role===role?{...s,champion:c.id}:s),champions,style,[c.id],roleWeights,context).score})).sort((a,b)=>b.score-a.score||a.c.id.localeCompare(b.c.id));
  candidateSets[role]=candidates.map(x=>x.c);
  if(!candidates.length)throw new Error(`${ROLES.find(r=>r.id===role).name}没有可选英雄，请调整英雄池或排除条件`);
 }
 // Beam search, plus every viable curated bot lane as an anchor so unusual pairs survive pruning.
 const seeds=[fixed];
 const bot=fixed.find(s=>s.role==='bottom'),sup=fixed.find(s=>s.role==='support');
 for(const duo of DUOS) {
  if(catalogStatus[duo.id]?.invalid)continue;
  if((bot.champion&&bot.champion!==duo.carry)||(sup.champion&&sup.champion!==duo.support))continue;
  if((!bot.champion&&!targets.includes('bottom'))||(!sup.champion&&!targets.includes('support')))continue;
  if(!byId.has(duo.carry)||!byId.has(duo.support)||excluded.includes(duo.carry)||excluded.includes(duo.support)||enemy.includes(duo.carry)||enemy.includes(duo.support))continue;
  if(poolMode==='only'&&((!bot.champion&&!context.pool.has(duo.carry))||(!sup.champion&&!context.pool.has(duo.support))))continue;
  const otherIds=fixed.filter(s=>!['bottom','support'].includes(s.role)).map(s=>s.champion);
  if(otherIds.includes(duo.carry)||otherIds.includes(duo.support))continue;
  if((!bot.champion&&!candidateSets.bottom?.some(c=>c.id===duo.carry))||(!sup.champion&&!candidateSets.support?.some(c=>c.id===duo.support)))continue;
  seeds.push(fixed.map(s=>s.role==='bottom'?{...s,champion:duo.carry}:s.role==='support'?{...s,champion:duo.support}:s));
 }
 for(const trio of TRIOS){
  if(catalogStatus[trio.id]?.invalid||!trio.members.some(m=>targets.includes(m.role)))continue;
  if(trio.members.some(m=>{const slot=fixed.find(s=>s.role===m.role);return slot.champion?slot.champion!==m.champion:!targets.includes(m.role)||!candidateSets[m.role]?.some(c=>c.id===m.champion);}))continue;
  if(fixed.some(s=>s.champion&&trio.members.some(m=>m.champion===s.champion&&m.role!==s.role)))continue;
  seeds.push(fixed.map(s=>{const m=trio.members.find(m=>m.role===s.role);return m?{...s,champion:m.champion}:s;}));
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
 const sorted=[...unique.values()].sort((a,b)=>b.score-a.score||signature(a.slots).localeCompare(signature(b.slots)));
 const chosen=[];
 // Keep the best result for every curated duo reachable on reroll. Filling
 // the entire pool with minor variants of a few high scores hides the library.
 const anchors=new Map();for(const entry of sorted){const key=(entry.trio||entry.duo)?.id;if(key&&!anchors.has(key))anchors.set(key,entry);}
 const anchorIds=new Set([...anchors.values()].map(e=>signature(e.slots)));
 // Creative ideas get the same anchor treatment (one best entry per
 // archetype) so they survive the pool cap and stay discoverable.
 const creativeAnchors=new Map();for(const entry of sorted){if(entry.creative&&!creativeAnchors.has(entry.creative.archetype))creativeAnchors.set(entry.creative.archetype,entry);}
 const creativeAnchorIds=new Set([...creativeAnchors.values()].map(e=>signature(e.slots)));
 const pool=[...anchors.values(),...creativeAnchors.values(),...sorted.filter(e=>!anchorIds.has(signature(e.slots))&&!creativeAnchorIds.has(signature(e.slots))).slice(0,Math.max(0,240-anchors.size-creativeAnchors.size))].sort((a,b)=>b.score-a.score);
 const count=Math.min(Math.max(0,limit+offset),pool.length);
 for(let i=0;i<count;i++) {
  let winner=0,best=-Infinity;
  for(let j=0;j<pool.length;j++) {
   const entry=pool[j];
   const entryStyle=(entry.trio||entry.duo)?.style||'balanced';
   const similarity=chosen.reduce((sum,c)=>sum+targets.filter(r=>c.slots.find(s=>s.role===r).champion===entry.slots.find(s=>s.role===r).champion).length*9+(entry.duo&&c.duo?.id===entry.duo.id?18:0)+(entry.trio&&c.trio?.id===entry.trio.id?22:0)+(entry.trio&&c.trio?.tempo===entry.trio.tempo?6:0)+(((c.trio||c.duo)?.style||'balanced')===entryStyle?10:0)+(entry.creative&&c.creative?.archetype===entry.creative.archetype?14:0),0);
   const v=entry.score-similarity;
   if(v>best){best=v;winner=j;}
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
 return chosen.slice(offset,offset+limit).map((entry,i)=>{
  const origin=entry.trio||entry.duo?'curated':entry.creative?'creative':'generated';
  const creativeCombo=entry.creative?{tempo:entry.creative.tempo,why:entry.creative.why,risk:entry.creative.caution}:null;
  const points=buildReasonPoints(entry,scope);
  return {
  ...entry,id:signature(entry.slots),targets,scope,origin,
  title:entry.creative?.name||entry.trio?.name||entry.duo?.name||(['均衡配合','控制接力','稳住再接团','一起打节奏','换个打法'][i%5]),
  reason:entry.creative?.why||entry.trio?.why||entry.duo?.why||entry.connections[0]?.[2]||`${describeComposition(entry.analysis)}。${entry.analysis.missing.length?`短板是${entry.analysis.missing.join('、')}，具体补充作用见方案详情。`:'具体补充作用见方案详情。'}`,
  reasonPoints:points,
  catalogState:catalogStatus[(entry.trio||entry.duo)?.id]||null,
  strategy:strategySummary(entry.analysis,entry.trio||entry.duo||creativeCombo,play.tempo,context.enemyTraits),
  contributions:explainContributions(scopeSlots(fixed,scope),scopeSlots(entry.slots,scope),targets,champions,context,{before:sharedBefore,after:entry.analysis}),
  };});
}

export function replaceMember(result,role,input){
  const editableTargets=result.editableTargets||result.targets;
  const target=result.slots.find(s=>s.role===role);if(!target||(!target.party&&result.scope!=='bot')||!editableTargets.includes(role))throw Error('只能替换本次推荐范围中的位置');
 // Freeze the kept members so the new search only fills the replaced role.
 const slots=result.slots.map(s=>({...s,locked:s.role!==role,champion:s.role===role?null:s.champion}));
 const next=recommend({...input,slots,excluded:[...(input.excluded||[]),target.champion],offset:0,limit:3});
 const previous=result.trio||result.duo;
 return next.map(r=>({...r,editableTargets:[...editableTargets],replacementNote:previous&&(r.trio||r.duo)?.id!==previous.id?`替换后不再构成「${previous.name}」，按新的配合与分工推荐。`:'只替换这一位，其他英雄保留；仍可继续调整其他推荐位置。'}));
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
 }else if(entry.connections[0])points.push(entry.connections[0][2]);
 points.push(`阵容面：${describeComposition(a)}`);
 if(a.missing.length)points.push(`短板：${a.missing.join('、')}偏少，${a.curve.label==='前期主动'?'尽早做事、别拖后期':'注意过渡，别在强势期前硬接团'}`);
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

export function clearClientPicks(slots){
 return slots.map(s=>{
  if(!Number.isInteger(s.clientCellId))return {...s};
  const {clientCellId,manualPosition,...manual}=s;return {...manual,champion:null,locked:false};
 });
}
