import {profile} from './rules.mjs';
import {mechanicReview} from './mechanic-review.mjs';
import {pickEligibilityContext,normalizeChampionIds} from './pick-eligibility.mjs';

const traits=[['frontline','前排',3],['engage','开团',2],['peel','保护',2],['sustain','持续输出',2],['poke','消耗',1],['aoe','范围伤害',1]];
const MECHANICS_PATCH='16.20'; // Base hero traits; independent of the Rift combination catalogue patch.
// Compare only the public bench against the current team. No lane assignment,
// Rift combination catalogue, imagined rerolls or unobserved augment effects.
export function hexDraft({data,client}){
 const active=client?.connected&&client.phase==='ChampSelect'&&client.mode?.id==='hex',session=active?client.session:null,lookup=new Map(data.champions.map(c=>[c.key,c]));
 const seen=new Set(),team=(session?.myTeam||[]).slice(0,5).filter(p=>Number.isInteger(p.cellId)&&!seen.has(p.cellId)&&seen.add(p.cellId)).map(p=>({cellId:p.cellId,self:p.cellId===session.localPlayerCellId,hero:lookup.get(p.championId)||null}));
 const own=team.find(p=>p.self),known=team.filter(p=>p.hero),heroCurrent=hero=>profile(hero).reviewed&&mechanicReview(hero,data.patch)==='current',reviewed=data.patch===MECHANICS_PATCH&&known.every(p=>heroCurrent(p.hero)),coverage=rows=>{
  const profiles=rows.filter(p=>p.hero).map(p=>profile(p.hero));
  return Object.fromEntries(traits.map(([key])=>[key,profiles.filter(p=>p.reviewed&&p[key]===true).length]));
 },current=reviewed?coverage(team):{},benchKnown=!!session?.bench&&Array.isArray(session.bench.championIds),occupied=new Set(known.map(p=>p.hero.key));
 const read=client?.eligibility,age=Date.now()-Date.parse(read?.receivedAt),fresh=!!session&&read?.context===pickEligibilityContext(session)&&read.localPlayerCellId===session.localPlayerCellId&&age>=-5000&&age<=15000,pickable=fresh?normalizeChampionIds(read.pickable):null,disabled=fresh?normalizeChampionIds(read.disabled):null;
 const ids=benchKnown&&own?[...new Set(session.bench.championIds)].slice(0,50):[],candidates=ids.map(id=>lookup.get(id)).filter(c=>c&&!occupied.has(c.key)&&(pickable===null||pickable.includes(c.key))&&!disabled?.includes(c.key)).map(hero=>{
  const lineup=team.map(p=>p.self?{...p,hero}:p),pending=!reviewed||!heroCurrent(hero),comparable=!pending&&!!own?.hero&&known.length===5,after=comparable?coverage(lineup):{};
  const added=comparable?traits.filter(([key])=>!current[key]&&after[key]>0):[],lost=comparable?traits.filter(([key])=>current[key]>0&&!after[key]):[];
  return {hero,lineup,added:added.map(([,label])=>'补'+label),lost:lost.map(([,label])=>'少'+label),priority:added.reduce((n,[,,weight])=>n+weight,0)-lost.reduce((n,[,,weight])=>n+weight*1.25,0),comparable,pending};
 });
 if(reviewed)candidates.sort((a,b)=>Number(b.comparable)-Number(a.comparable)||b.priority-a.priority);
 return {active,team,own,known:known.length,reviewed,benchKnown,eligibilityKnown:pickable!==null&&disabled!==null,candidates,coverage:reviewed?traits.map(([key,label])=>({label,count:current[key]})):[]};
}
