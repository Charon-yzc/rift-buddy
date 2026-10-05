import { ROLES, DUOS, TRIOS, CROSS_SYNERGIES, profile,conventionalRole } from './rules.mjs';
import {draftTargets,scopeSlots} from './draft.mjs';
import {comboLoadout,loadoutOptions} from './loadouts.mjs';
import {strategyTraits,strategySummary} from './strategy.mjs';

export function createSlots() {
 return ROLES.map(r=>({role:r.id, champion:null, locked:false, party:['mid','bottom','support'].includes(r.id)}));
}
export function validateSlots(slots, champions) {
 if(!Array.isArray(slots)||slots.length!==5||new Set(slots.map(s=>s.role)).size!==5||slots.some(s=>!ROLES.some(r=>r.id===s.role))) throw new Error('请为五个位置各保留一个槽位');
 const ids=slots.map(s=>s.champion).filter(Boolean);
 if(new Set(ids).size!==ids.length)throw new Error('同一英雄不能出现在我方两个位置');
 const available=new Set(champions.map(c=>c.id));
 if(ids.some(id=>!available.has(id)))throw new Error('所选英雄已不在当前资料中，请重新选择');
}
export function analyzeTeam(slots, champions, context) {
 const byId=context?.byId||new Map(champions.map(c=>[c.id,c]));
 const getProfile=s=>{
  const key=`${s.champion}:${s.role}`;
  if(context?.profiles.has(key))return context.profiles.get(key);
  const value=profile(byId.get(s.champion),s.role);context?.profiles.set(key,value);return value;
 };
 const members=slots.filter(s=>byId.has(s.champion)).map(s=>{const c=byId.get(s.champion),base=getProfile(s),combo=currentCombo(slots,c.id,s.role,context?.catalogStatus),loadout=loadoutOptions(c,s.role,'rift').find(l=>l.id===comboLoadout(combo,c,s.role));
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
 return {members,traits,warnings,known:members.length,
  strengths:Object.entries(labels).filter(([k])=>traits[k]>0).map(([,v])=>v),
  missing:Object.entries(labels).filter(([k])=>!traits[k]).map(([,v])=>v)};
}
function findDuo(slots) {
 const carry=slots.find(s=>s.role==='bottom')?.champion;
 const support=slots.find(s=>s.role==='support')?.champion;
 return DUOS.find(d=>d.carry===carry&&d.support===support);
}
export function findTrio(slots){return TRIOS.find(t=>t.members.every(m=>slots.some(s=>s.role===m.role&&s.champion===m.champion)));}
export function currentCombo(slots,champion,role,status={}){
 const matches=[...TRIOS.filter(t=>t.members.every(m=>slots.some(s=>s.role===m.role&&s.champion===m.champion))),findDuo(slots)].filter(c=>c&&!status?.[c.id]?.invalid);
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
 const a=analyzeTeam(slots,champions,context),t=a.traits;
 let score=Math.min(t.frontline,1)*10+Math.min(t.engage,1)*10+Math.min(t.peel,1)*6+Math.min(t.sustain,1)*10+Math.min(t.ap,1)*8+Math.min(t.ad,1)*8+Math.min(t.aoe,1)*3;
 score-=Math.max(0,t.frontline-2)*4;
 const foundDuo=findDuo(slots),foundTrio=findTrio(slots);
 const duo=context?.catalogStatus?.[foundDuo?.id]?.invalid?null:foundDuo;
 const trio=context?.catalogStatus?.[foundTrio?.id]?.invalid?null:foundTrio;
 if(trio)score+=33+(style===trio.style?5:0);
 if(duo)score+=style==='wild'?(duo.style==='wild'?36:duo.style==='fun'?23:9):style==='fun'?(duo.style==='fun'?29:duo.style==='wild'?16:20):(duo.style==='balanced'?28:duo.style==='fun'?17:3);
 const ids=new Set(slots.map(s=>s.champion));
 const connections=CROSS_SYNERGIES.filter(([x,y])=>ids.has(x)&&ids.has(y));
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
 return {score,analysis:a,duo,trio,connections};
}
const signature=slots=>slots.map(s=>`${s.role}:${s.champion||'-'}`).join('|');
export function recommend({slots,champions,style='fun',excluded=[],enemy=[],publicPicks=[],limit=5,offset=0,builds={},pool:heroPool=[],poolMode='off',scope='context',play={},rolePools={},catalogStatus={}}) {
 validateSlots(slots,champions);
 // Profiles are constant for one calculation; reuse them across the search beam.
 const context={byId:new Map(champions.map(c=>[c.id,c])),profiles:new Map(),pool:new Set(heroPool),poolMode,scope,play,rolePools,catalogStatus};
 // Rune-page samples are used only as a coarse position-frequency signal.
 // They do not measure how strong a champion or a composition is.
 const maxSamples={},roleWeights={};
 for(const ref of Object.values(builds))if(Number.isFinite(ref.runeSamples))maxSamples[ref.champion]=Math.max(maxSamples[ref.champion]||1,ref.runeSamples);
 for(const ref of Object.values(builds))if(maxSamples[ref.champion])roleWeights[`${ref.champion}:${ref.role}`]=Math.max(0,Math.min(1,ref.runeSamples/maxSamples[ref.champion]));
 const targets=draftTargets(slots,scope);
 if(!targets.length){
  const g=grade(slots,champions,style,[],{},context);
  return [{id:signature(slots),slots:structuredClone(slots),...g,scope,title:g.trio?.name||g.duo?.name||'当前阵容',reason:'当前范围没有未锁定位置，下面展示已选英雄的配合与配置。',targets:[],contributions:[],strategy:strategySummary(g.analysis,g.trio||g.duo,play.tempo),catalogState:catalogStatus[(g.trio||g.duo)?.id]||null}];
 }
 const fixed=slots.map(s=>{if(!targets.includes(s.role))return {...s};const {clientCellId,manualPosition,...draft}=s;return {...draft,champion:null};});
 if(poolMode==='only'&&!heroPool.some(id=>context.byId.has(id)))throw Error('先添加英雄池，或切换为“全部英雄”');
 const blocked=new Set([...excluded,...enemy.filter(Boolean),...publicPicks.filter(id=>context.byId.has(id)),...fixed.map(s=>s.champion).filter(Boolean)]);
 const byId=new Map(champions.map(c=>[c.id,c]));
 const candidateSets={};
 for(const role of targets) {
  const allowed=c=>!blocked.has(c.id)&&(poolMode!=='only'||context.pool.has(c.id))&&(rolePools[role]?.mode!=='only'||rolePools[role].heroes?.includes(c.id))&&(role!=='bottom'||play.meleeBottom!==false||!Number.isFinite(c.stats?.attackrange)||c.stats.attackrange>250);
  let candidates=champions.filter(c=>allowed(c)&&(play.unusual===false?conventionalRole(c,role):profile(c,role).roles.includes(role)));
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
  if(!bot.champion&&!targets.includes('bottom')||!sup.champion&&!targets.includes('support'))continue;
  if(!byId.has(duo.carry)||!byId.has(duo.support)||excluded.includes(duo.carry)||excluded.includes(duo.support)||enemy.includes(duo.carry)||enemy.includes(duo.support))continue;
  if(poolMode==='only'&&(!bot.champion&&!context.pool.has(duo.carry)||!sup.champion&&!context.pool.has(duo.support)))continue;
  const otherIds=fixed.filter(s=>!['bottom','support'].includes(s.role)).map(s=>s.champion);
  if(otherIds.includes(duo.carry)||otherIds.includes(duo.support))continue;
  if(!bot.champion&&!candidateSets.bottom?.some(c=>c.id===duo.carry)||!sup.champion&&!candidateSets.support?.some(c=>c.id===duo.support))continue;
  seeds.push(fixed.map(s=>s.role==='bottom'?{...s,champion:duo.carry}:s.role==='support'?{...s,champion:duo.support}:s));
 }
 for(const trio of TRIOS){
  if(catalogStatus[trio.id]?.invalid||!trio.members.some(m=>targets.includes(m.role)))continue;
  if(trio.members.some(m=>{const slot=fixed.find(s=>s.role===m.role);return slot.champion?slot.champion!==m.champion:!targets.includes(m.role)||!candidateSets[m.role]?.some(c=>c.id===m.champion);}))continue;
  if(fixed.some(s=>s.champion&&trio.members.some(m=>m.champion===s.champion&&m.role!==s.role)))continue;
  seeds.push(fixed.map(s=>{const m=trio.members.find(m=>m.role===s.role);return m?{...s,champion:m.champion}:s;}));
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
  unique.set(signature(entry.slots),{...entry,...g});
 }
 const sorted=[...unique.values()].sort((a,b)=>b.score-a.score||signature(a.slots).localeCompare(signature(b.slots)));
 const chosen=[];
 // Keep the best result for every curated duo reachable on reroll. Filling
 // the entire pool with minor variants of a few high scores hides the library.
 const anchors=new Map();for(const entry of sorted){const key=(entry.trio||entry.duo)?.id;if(key&&!anchors.has(key))anchors.set(key,entry);}
 const anchorIds=new Set([...anchors.values()].map(e=>signature(e.slots)));
 const pool=[...anchors.values(),...sorted.filter(e=>!anchorIds.has(signature(e.slots))).slice(0,Math.max(0,240-anchors.size))].sort((a,b)=>b.score-a.score);
 const count=Math.min(Math.max(0,limit+offset),pool.length);
 for(let i=0;i<count;i++) {
  let winner=0,best=-Infinity;
  for(let j=0;j<pool.length;j++) {
   const entry=pool[j];
   const similarity=chosen.reduce((sum,c)=>sum+targets.filter(r=>c.slots.find(s=>s.role===r).champion===entry.slots.find(s=>s.role===r).champion).length*9+(entry.duo&&c.duo?.id===entry.duo.id?18:0)+(entry.trio&&c.trio?.id===entry.trio.id?22:0)+(entry.trio&&c.trio?.tempo===entry.trio.tempo?6:0),0);
   const v=entry.score-similarity;
   if(v>best){best=v;winner=j;}
  }
  chosen.push(pool.splice(winner,1)[0]);
 }
 return chosen.slice(offset,offset+limit).map((entry,i)=>({
  ...entry,id:signature(entry.slots),targets,scope,
  title:entry.trio?.name||entry.duo?.name||(['均衡配合','控制接力','稳住再接团','一起打节奏','换个打法'][i%5]),
  reason:entry.trio?.why||entry.duo?.why||entry.connections[0]?.[2]||`这套覆盖${entry.analysis.strengths.slice(0,3).join('、')||'当前位置的输出分工'}，具体补充作用见方案详情。`,
  catalogState:catalogStatus[(entry.trio||entry.duo)?.id]||null,
  strategy:strategySummary(entry.analysis,entry.trio||entry.duo,play.tempo),
  contributions:explainContributions(scopeSlots(fixed,scope),scopeSlots(entry.slots,scope),targets,champions),
 }));
}

export function replaceMember(result,role,input){
  const editableTargets=result.editableTargets||result.targets;
  const target=result.slots.find(s=>s.role===role);if(!target||(!target.party&&result.scope!=='bot')||!editableTargets.includes(role))throw Error('只能替换本次推荐范围中的位置');
 const slots=result.slots.map(s=>({...s,locked:s.role!==role,champion:s.role===role?null:s.champion}));
 const next=recommend({...input,slots,excluded:[...(input.excluded||[]),target.champion],offset:0,limit:3});
 const previous=result.trio||result.duo;
 return next.map(r=>({...r,editableTargets:[...editableTargets],replacementNote:previous&&(r.trio||r.duo)?.id!==previous.id?`替换后不再构成「${previous.name}」，按新的配合与分工推荐。`:'只替换这一位，其他英雄保留；仍可继续调整其他推荐位置。'}));
}

export function explainContributions(fixed,next,targets,champions){
 const before=analyzeTeam(fixed,champions),labels={frontline:'前排承伤',engage:'先手控制',peel:'后排保护',sustain:'持续输出',poke:'远程消耗',aoe:'范围伤害'};
 return analyzeTeam(next,champions).members.filter(m=>targets.includes(m.role)).map(m=>({
  hero:m.champion,role:m.role,name:m.c.name,unusual:!conventionalRole(m.c,m.role),
  helps:Object.entries(labels).filter(([key])=>m.p[key]).map(([key,label])=>`${before.traits[key]?'增加':'补上'}${label}`),
  pairings:CROSS_SYNERGIES.filter(([a,b])=>[a,b].includes(m.champion)&&fixed.some(s=>s.champion===([a,b].find(id=>id!==m.champion)))).map(([, ,text])=>text),
 }));
}

export function mergeClientSession(slots, session, champions) {
 const byKey=new Map(champions.map(c=>[c.key,c.id]));
 const positionMap={TOP:'top',JUNGLE:'jungle',MIDDLE:'mid',MID:'mid',BOTTOM:'bottom',UTILITY:'support',SUPPORT:'support'};
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
  const role=positionMap[String(p.assignedPosition||'').toUpperCase()];
  const target=next.find(s=>s.role===role);
  if(target&&!target.champion&&!target.manualPosition){const prior=slots.find(s=>s.clientCellId===p.cellId);target.champion=id;target.locked=prior?.champion===id?prior.locked:true;target.clientCellId=p.cellId;}
  else unassigned.push({champion:id,cellId:p.cellId,local:p.cellId===session.localPlayerCellId});
 }
 return {slots:next,unassigned};
}

export function clearClientPicks(slots){
 return slots.map(s=>{
  if(!Number.isInteger(s.clientCellId))return {...s};
  const {clientCellId,manualPosition,...manual}=s;return {...manual,champion:null,locked:false};
 });
}
