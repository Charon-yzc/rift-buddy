import {isCurrentHexData} from './hex-data-current.mjs';
import {hexDraftProfile,HEX_DRAFT_TRAITS as traits} from './hex-draft-profiles.mjs';
import {pickEligibilityContext,normalizeChampionIds} from './pick-eligibility.mjs';

// Compare only the public bench against the current team. No lane assignment,
// Rift combination catalogue, imagined rerolls or unobserved augment effects.
export function hexDraft({data,client}){
 const active=client?.connected&&client.phase==='ChampSelect'&&client.mode?.id==='hex',session=active?client.session:null,lookup=new Map(data.champions.map(c=>[c.key,c]));
 const seen=new Set(),team=(session?.myTeam||[]).slice(0,5).filter(p=>Number.isInteger(p.cellId)&&!seen.has(p.cellId)&&seen.add(p.cellId)).map(p=>({cellId:p.cellId,self:p.cellId===session.localPlayerCellId,hero:lookup.get(p.championId)||null}));
 // Hash each observed kit once per projection, including when the bench has
 // fifty heroes. Never retain compatibility results across data refreshes.
 const profiles=new Map(),getProfile=hero=>{if(!hero||!isCurrentHexData(data))return null;if(!profiles.has(hero))profiles.set(hero,hexDraftProfile(hero,data.patch));return profiles.get(hero);};
 const own=team.find(p=>p.self),known=team.filter(p=>p.hero),heroCurrent=hero=>!!getProfile(hero),reviewed=known.length>0&&known.every(p=>heroCurrent(p.hero)),coverage=rows=>{
  const selected=rows.filter(p=>p.hero).map(p=>getProfile(p.hero));
  return Object.fromEntries(traits.map(([key])=>[key,{count:selected.filter(p=>p?.traits[key]===true).length,uncertain:selected.filter(p=>p?.traits[key]===null).length}]));
 },current=reviewed?coverage(team):{},benchKnown=!!session?.bench&&Array.isArray(session.bench.championIds),occupied=new Set(known.map(p=>p.hero.key));
 const read=client?.eligibility,age=Date.now()-Date.parse(read?.receivedAt),fresh=!!session&&read?.context===pickEligibilityContext(session)&&read.localPlayerCellId===session.localPlayerCellId&&age>=-5000&&age<=15000,pickable=fresh?normalizeChampionIds(read.pickable):null,disabled=fresh?normalizeChampionIds(read.disabled):null;
 const ids=benchKnown&&own?[...new Set(session.bench.championIds)].slice(0,50):[],candidates=ids.map(id=>lookup.get(id)).filter(c=>c&&!occupied.has(c.key)&&(pickable===null||pickable.includes(c.key))&&!disabled?.includes(c.key)).map(hero=>{
  const lineup=team.map(p=>p.self?{...p,hero}:p),sourcePending=!reviewed||!heroCurrent(hero),complete=!sourcePending&&!!own?.hero&&known.length===5,after=complete?coverage(lineup):{},compared=complete?traits.filter(([key])=>!current[key].uncertain&&!after[key].uncertain):[],comparable=compared.length>0,pending=sourcePending||(complete&&!comparable);
  const added=compared.filter(([key])=>!current[key].count&&after[key].count>0),lost=compared.filter(([key])=>current[key].count>0&&!after[key].count);
  return {hero,lineup,added:added.map(([,label])=>'补'+label),lost:lost.map(([,label])=>'少'+label),priority:added.reduce((n,[,,weight])=>n+weight,0)-lost.reduce((n,[,,weight])=>n+weight*1.25,0),comparable,pending,evidence:getProfile(hero)?.evidence||null,removedEvidence:lost.length?{hero:own.hero,traits:getProfile(own.hero).evidence}:null};
 });
 if(reviewed)candidates.sort((a,b)=>Number(b.comparable)-Number(a.comparable)||b.priority-a.priority);
 return {active,team,own,known:known.length,reviewed,benchKnown,eligibilityKnown:pickable!==null&&disabled!==null,candidates,coverage:reviewed?traits.map(([key,label])=>({label,...current[key]})):[],evidence:reviewed?known.map(p=>({hero:p.hero,traits:getProfile(p.hero).evidence})).filter(p=>p.traits):[]};
}
