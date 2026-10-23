import {hexDraft} from './hex-draft.mjs';
import {hexDraftProfile,HEX_DRAFT_TRAITS} from './hex-draft-profiles.mjs';
import {isCurrentHexData} from './hex-data-current.mjs';
import {hexChampionStatistics} from './hex-champion-statistics.mjs';
import {pickEligibilityContext,normalizeChampionIds} from './pick-eligibility.mjs';

// Keep party membership tied to current public cells, never default Rift lanes.
export function hexPartyCells(client,slots=[]){
 const session=client?.session,team=session?.myTeam||[],cells=new Set(team.map(p=>p.cellId)),members=new Set([session?.localPlayerCellId]);
 for(const member of client?.party?.members||[])if(cells.has(member.cellId))members.add(member.cellId);
 for(const slot of slots)if(cells.has(slot.clientCellId)&&slot.partyManual){if(slot.party)members.add(slot.clientCellId);else if(slot.clientCellId!==session?.localPlayerCellId)members.delete(slot.clientCellId);}
 return [...members].filter(cell=>Number.isInteger(cell)&&cells.has(cell));
}

export function hexPartyDraft({data,client,slots=[]}){
 const base=hexDraft({data,client}),members=new Set(hexPartyCells(client,slots)),party=base.team.filter(p=>members.has(p.cellId)),occupied=new Set(base.team.filter(p=>!members.has(p.cellId)&&p.hero).map(p=>p.hero.key));
 const statistics=hexChampionStatistics(data),rates=new Map((statistics?.rows||[]).map(r=>[r.hero,r])),selected=new Map(base.team.filter(p=>p.hero).map(p=>[p.hero.id,p.self?'self':members.has(p.cellId)?'party':'teammate']));
 const read=client?.eligibility,age=Date.now()-Date.parse(read?.receivedAt),fresh=base.active&&read?.context===pickEligibilityContext(client.session)&&read.localPlayerCellId===client.session.localPlayerCellId&&age>=-5000&&age<=15000;
 const pickable=fresh?normalizeChampionIds(read.pickable):null,disabled=new Set(fresh?normalizeChampionIds(read.disabled)||[]:[]),bench=new Set(base.active?(client?.session?.bench?.championIds||[]).slice(0,50):[]);
 const board=data.champions.map(hero=>({hero,statistics:rates.get(hero.id)||null,selected:selected.get(hero.id)||null,inBench:bench.has(hero.key),available:bench.has(hero.key)&&!occupied.has(hero.key)&&!selected.has(hero.id)&&pickable!==null&&pickable.includes(hero.key)&&!disabled.has(hero.key)})).sort((a,b)=>(b.statistics?.winRate??-1)-(a.statistics?.winRate??-1)||a.hero.key-b.hero.key);
 if(!base.active||!base.benchKnown||!base.own||!party.length)return {...base,party,board,statistics,lineups:[]};
 const profiles=new Map(),traits=hero=>{if(!hero||!isCurrentHexData(data))return null;if(!profiles.has(hero.id))profiles.set(hero.id,hexDraftProfile(hero,data.patch));return profiles.get(hero.id);};
 const all=new Map(data.champions.map(h=>[h.key,h])),pool=[...new Set([...bench,...party.filter(p=>p.hero).map(p=>p.hero.key)])].map(id=>all.get(id)).filter(h=>h&&!occupied.has(h.key)&&!disabled.has(h.key));
 const localAllowed=new Set(base.candidates.map(r=>r.hero.key));if(base.own.hero)localAllowed.add(base.own.hero.key);
 // Compare a mechanism only when every possible member has a definite value.
 // A pending trait must never become a zero that demotes its champion.
 const comparable=HEX_DRAFT_TRAITS.filter(([key])=>pool.every(h=>typeof traits(h)?.traits[key]==='boolean'));
 const weight=rows=>comparable.reduce((n,[key,,w])=>n+(rows.some(p=>traits(p.hero).traits[key]===true)?w:0),0);
 const rate=rows=>rows.reduce((n,p)=>n+(rates.get(p.hero.id)?.winRate??.5),0)/rows.length;
 let plans=[{members:[],used:new Set(),fit:0,rate:0}];
 for(const player of [...party].sort((a,b)=>Number(b.self)-Number(a.self))){
  const next=[];
  for(const plan of plans)for(const hero of pool){
   if(plan.used.has(hero.key)||player.self&&!localAllowed.has(hero.key)||!player.self&&!bench.has(hero.key)&&hero.key!==player.hero?.key)continue;
   const rows=[...plan.members,{...player,hero}],used=new Set([...plan.used,hero.key]);next.push({members:rows,used,fit:weight(rows),rate:rate(rows)});
  }
  next.sort((a,b)=>b.fit-a.fit||b.rate-a.rate||a.members.map(p=>p.hero.key).join(',').localeCompare(b.members.map(p=>p.hero.key).join(',')));
  // At the same depth, identical used sets have identical future constraints.
  // Collapse permutations before the beam limit, retaining a legal assignment.
  const used=new Set();plans=next.filter(plan=>{const key=[...plan.used].sort((a,b)=>a-b).join(',');if(used.has(key))return false;used.add(key);return true;}).slice(0,24);
 }
 const signatures=new Set(),lineups=plans.filter(plan=>{const signature=plan.members.map(p=>p.hero.key).sort((a,b)=>a-b).join(',');if(signatures.has(signature))return false;signatures.add(signature);return true;}).slice(0,6).map(plan=>({members:plan.members,traits:comparable.filter(([key])=>plan.members.some(p=>traits(p.hero).traits[key]===true)).map(([,label])=>label),evidence:plan.members.map(p=>({hero:p.hero.name,traits:traits(p.hero)?.evidence||null})),pending:plan.members.some(p=>!traits(p.hero)||HEX_DRAFT_TRAITS.some(([key])=>traits(p.hero).traits[key]===null)),unchanged:plan.members.every(p=>party.find(q=>q.cellId===p.cellId)?.hero?.id===p.hero.id)}));
 return {...base,party,board,statistics,lineups};
}
