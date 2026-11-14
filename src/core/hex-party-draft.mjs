import {hexDraft} from './hex-draft.mjs';
import {hexDraftProfile,HEX_DRAFT_TRAITS} from './hex-draft-profiles.mjs';
import {isCurrentHexData,isReadableHexData} from './hex-data-current.mjs';
import {hexChampionStatistics} from './hex-champion-statistics.mjs';
import {pickEligibilityContext,normalizeChampionIds} from './pick-eligibility.mjs';

function coverageFit(team,profile){
 const complete=team.length===5&&new Set(team.map(p=>p.cellId)).size===5&&team.every(p=>p.hero),profiles=team.map(p=>profile(p.hero));
 const rows=HEX_DRAFT_TRAITS.map(([key,label,weight])=>({label,points:weight*10,state:profiles.some(p=>p?.traits[key]===true)?'covered':complete&&profiles.every(p=>p?.traits[key]===false)?'missing':'pending'}));
 const minimum=rows.filter(r=>r.state==='covered').reduce((n,r)=>n+r.points,0),maximum=minimum+rows.filter(r=>r.state==='pending').reduce((n,r)=>n+r.points,0);
 return {minimum,maximum,covered:rows.filter(r=>r.state==='covered').map(r=>r.label),missing:rows.filter(r=>r.state==='missing').map(r=>r.label),pending:rows.filter(r=>r.state==='pending').map(r=>r.label)};
}
function orderLineups(rows,fit=row=>row.fit,limit=rows.length){
 // There are at most 66 distinct intervals in this five-trait, ten-point grid.
 // Compare those groups once instead of a cubic sort of a large final beam.
 const grouped=new Map(),result=[];
 rows.forEach((row,index)=>{const score=fit(row);if(score.maximum<60)return;const key=score.minimum+':'+score.maximum;if(!grouped.has(key))grouped.set(key,{score,rows:[],at:0,blocked:0,after:[]});grouped.get(key).rows.push({row,index});});
 const groups=[...grouped.values()];for(const a of groups)for(const b of groups)if(a!==b&&a.score.minimum>=b.score.maximum&&a.score.maximum>b.score.minimum){a.after.push(b);b.blocked++;}
 while(result.length<limit){const ready=groups.filter(g=>!g.blocked&&g.at<g.rows.length);if(!ready.length)break;const next=ready.reduce((a,b)=>a.rows[a.at].index<b.rows[b.at].index?a:b);result.push(next.rows[next.at++].row);if(next.at===next.rows.length)for(const g of next.after)g.blocked--;}
 return result;
}

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
 const pickable=fresh?normalizeChampionIds(read.pickable):null,disabledIds=fresh?normalizeChampionIds(read.disabled):null;
 const disabled=new Set([...(disabledIds||[]),...(client?.session?.bans||[]),...(client?.session?.allowDuplicatePicks===false?(client.session.theirTeam||[]).map(p=>p.championId):[])]),bench=new Set(base.active?(client?.session?.bench?.championIds||[]).slice(0,50):[]);
 // A missing/expired eligibility cache must not turn a real bench click into
 // a read-only preview. This is permission to request a swap, not to write:
 // the selection service re-reads the session and eligibility before swapping.
 const board=data.champions.filter(hero=>bench.has(hero.key)).map(hero=>({hero,statistics:rates.get(hero.id)||null,selected:selected.get(hero.id)||null,inBench:true,available:!!base.own&&!occupied.has(hero.key)&&!selected.has(hero.id)&&(pickable===null||pickable.includes(hero.key))&&!disabled.has(hero.key)})).sort((a,b)=>(b.statistics?.winRate??-1)-(a.statistics?.winRate??-1)||a.hero.key-b.hero.key);
 if(!base.active||!base.benchKnown||!base.own||!party.length)return {...base,party,board,statistics,lineups:[]};
 const profileAvailable=isCurrentHexData(data)||isReadableHexData(data),profiles=new Map(),traits=hero=>{if(!hero||!profileAvailable)return null;if(!profiles.has(hero.id))profiles.set(hero.id,hexDraftProfile(hero,data.patch));return profiles.get(hero.id);};
 const all=new Map(data.champions.map(h=>[h.key,h])),pool=[...new Set([...bench,...party.filter(p=>p.hero).map(p=>p.hero.key)])].map(id=>all.get(id)).filter(h=>h&&!occupied.has(h.key)&&!disabled.has(h.key));
 const localAllowed=new Set(board.filter(r=>r.available).map(r=>r.hero.key));if(base.own.hero)localAllowed.add(base.own.hero.key);
 // Compare a mechanism only when every possible member has a definite value.
 // A pending trait must never become a zero that demotes its champion.
 const fixed=base.team.filter(p=>!members.has(p.cellId)),comparable=HEX_DRAFT_TRAITS.filter(([key])=>[...pool,...fixed.map(p=>p.hero)].every(h=>typeof traits(h)?.traits[key]==='boolean'));
 const weight=rows=>comparable.reduce((n,[key,,w])=>n+([...fixed,...rows].some(p=>traits(p.hero)?.traits[key]===true)?w:0),0);
 const ratesComparable=pool.every(h=>rates.has(h.id));
 const rate=rows=>ratesComparable?rows.reduce((n,p)=>n+rates.get(p.hero.id).winRate,0)/rows.length:0;
 const players=[...party].sort((a,b)=>Number(b.self)-Number(a.self)),wholeTeam=rows=>{const replacements=new Map(rows.map(p=>[p.cellId,p]));return base.team.map(p=>replacements.get(p.cellId)||p);};
 let plans=[{members:[],used:new Set(),fit:0,rate:0}];
 for(const [depth,player] of players.entries()){
  const next=[];
  for(const plan of plans)for(const hero of pool){
   if(plan.used.has(hero.key)||player.self&&!localAllowed.has(hero.key)||!player.self&&!bench.has(hero.key)&&hero.key!==player.hero?.key)continue;
   const rows=[...plan.members,{...player,hero}],used=new Set([...plan.used,hero.key]);next.push({members:rows,used,fit:weight(rows),rate:rate(rows)});
  }
  next.sort((a,b)=>b.fit-a.fit||b.rate-a.rate||a.members.map(p=>p.hero.key).join(',').localeCompare(b.members.map(p=>p.hero.key).join(',')));
  // At the same depth, identical used sets have identical future constraints.
  // Collapse permutations before the beam limit, retaining a legal assignment.
  const used=new Set(),unique=next.filter(plan=>{const key=[...plan.used].sort((a,b)=>a-b).join(',');if(used.has(key))return false;used.add(key);return true;});
  plans=depth===players.length-1?orderLineups(unique.map(plan=>({...plan,coverage:coverageFit(wholeTeam(plan.members),traits)})),row=>row.coverage,24):unique.slice(0,24);
 }
 const signatures=new Set(),lineups=plans.filter(plan=>{const signature=plan.members.map(p=>p.hero.key).sort((a,b)=>a-b).join(',');if(signatures.has(signature))return false;signatures.add(signature);return true;}).slice(0,6).map(plan=>{const team=wholeTeam(plan.members);return {members:plan.members,fit:plan.coverage,traits:comparable.filter(([key])=>team.some(p=>traits(p.hero)?.traits[key]===true)).map(([,label])=>label),evidence:plan.members.map(p=>({hero:p.hero.name,traits:traits(p.hero)?.evidence||null})),pending:plan.members.some(p=>!traits(p.hero)||HEX_DRAFT_TRAITS.some(([key])=>traits(p.hero).traits[key]===null)),unchanged:plan.members.every(p=>party.find(q=>q.cellId===p.cellId)?.hero?.id===p.hero.id)};});
 return {...base,party,board,statistics,lineups};
}
