import {proposalKey,ballotVotes} from './room.mjs';
import {CROSS_SYNERGIES,RULES_PATCH,RULES_VERSION} from './rules.mjs';
import {analyzeTeam} from './recommend.mjs';
import {createCooperationGraph} from './cooperation.mjs';
import {compositionFit} from './composition-fit.mjs';
import {effectiveDraftScope,CLIENT_POSITION_ROLES} from './draft.mjs';
import {clientContextDraft,publicAllyIds} from './client-context-draft.mjs';
import {editableLocalDraft,lockedOwnSlot,confirmedPlayerPick} from './draft-intents.mjs';
import {publicDraftTeam} from './ranked-draft.mjs';

// A lobby proposal survives entering that draft, but never carries into the
// next game. Unknown/disconnected reads alone are not a new round.
export function createBallotRoundObserver(){
 let phase='',gameId='';
 return client=>{
  if(!client?.connected)return false;
  const lobby=['None','Lobby','Matchmaking','ReadyCheck'].includes(client.phase);
  const returned=lobby&&['ChampSelect','GameStart','InProgress','Reconnect','WaitingForStats','PreEndOfGame','EndOfGame'].includes(phase);
  const next=lobby?'':String(client.session?.gameId||client.game?.gameId||'');
  const changed=returned||!!next&&!!gameId&&next!==gameId;
  if(lobby)gameId='';else if(next)gameId=next;
  phase=client.phase;return changed;
 };
}

const contexts=new WeakMap();
// These are shared plan choices, never a receipt that runes reached the LCU.
// Ignore display/source prose and each player's D/F ordering of the same spells.
const setupKey=config=>JSON.stringify(['start','items','boots','runes','skills','priority','first','attributePlan','spells'].map(k=>k==='spells'?[...(config[k]||[])].sort():k==='first'?config.first??config.skills?.slice(0,3)??null:config[k]??null));
export function memberAdoption(member,row){
 const accepted=member.share?.ballot?.accepted;
 if(accepted?.key!==row.key)return null;
 const expected=row.proposal.lineup.find(s=>s.role===accepted.role&&s.champion);
 if(!expected)return null;
 const pick=member.share?.pick;
 let state=!pick?'pending':pick.role!==expected.role||pick.champion!==expected.champion?'changed-pick':'matched';
 const planned=row.proposal.configurations?.find(c=>c.role===expected.role&&c.champion===expected.champion);
 const actual=member.share?.configurations?.find(c=>c.role===expected.role&&c.champion===expected.champion);
 if(state==='matched'&&planned)state=!actual?'pending-configuration':setupKey(planned)!==setupKey(actual)?'changed-configuration':'matched';
 return {nick:member.nick,role:accepted.role,state};
}
function fitContext(champions,{patch=champions[0]?.combatStatsSource?.patch||RULES_PATCH,catalogStatus}={}){
 let context=contexts.get(champions);
 if(!context||context.links!==CROSS_SYNERGIES||context.patch!==patch||context.catalogStatus!==catalogStatus||context.reviewedAt!==RULES_VERSION){
  context={byId:new Map(champions.map(c=>[c.id,c])),profiles:new Map(),cooperationGraph:createCooperationGraph(champions,{currentPatch:patch}),comboCache:new Map(),comboLoadouts:new Map(),links:CROSS_SYNERGIES,patch,catalogStatus,reviewedAt:RULES_VERSION};
  contexts.set(champions,context);
 }
 return context;
}

// Only our positions accept proposal picks. When one of us is playing, the
// other real selected allies become context, never additional editable picks.
export function fitLineupSlots(lineup,current,{scope='party',soloRole=''}={}){
 const effective=effectiveDraftScope(current,scope),party=current.filter(s=>s.party);
 if(!current.length)return {slots:lineup.map(s=>({...s})),expectedSize:lineup.length,scope:effective,controlledRoles:lineup.map(s=>s.role)};
 const controlled=effective==='bot'?current.filter(s=>['bottom','support'].includes(s.role)):effective==='solo'&&soloRole?current.filter(s=>s.role===soloRole):party;
 const controlledRoles=new Set(controlled.map(s=>s.role));
 const own=controlled.map(s=>({...s,champion:lineup.find(m=>m.role===s.role)?.champion||null}));
 const allies=['context','solo'].includes(effective)?current.filter(s=>!controlledRoles.has(s.role)&&s.champion):[];
 return {slots:[...own,...allies],expectedSize:own.length+allies.length,scope:effective,controlledRoles:[...controlledRoles]};
}

export function lineupFit(lineup,current,champions,options={}){
 if(typeof options==='string')options={scope:options};
 const visible=current;
 if(options.editableRoles?.length){
  const cellId=options.clientSession?.localPlayerCellId,role=(Number.isInteger(cellId)?current.find(s=>s.clientCellId===cellId)?.role:'')||options.soloRole;
  if(options.editableRoles.includes(role)){const editable=editableLocalDraft(current,options.clientSession,champions,role);current=editable.slots;options={...options,clientSession:editable.session};}
 }
 current=clientContextDraft(current,champions,options.clientSession,{scope:effectiveDraftScope(current,options.scope||'party'),soloRole:options.soloRole||'',party:options.party,includePreselected:options.includePreselected===true});
 const range=fitLineupSlots(lineup,current,options),mandatoryOwn=lockedOwnSlot(current,options.clientSession),context={...(options.context||fitContext(champions,options)),mandatoryOwn,publicAllies:['context','solo'].includes(range.scope)?publicAllyIds(options.clientSession,champions,{includePreselected:options.includePreselected===true}):[]};
 const own=options.clientSession?.myTeam?.find(player=>player.cellId===options.clientSession.localPlayerCellId);
 if(confirmedPlayerPick(own,options.clientSession)&&!mandatoryOwn)return {score:null,rawScore:0,known:0,size:range.expectedSize,compatible:false,exact:false,scope:range.scope,breakdown:[],strengths:[],gaps:['请先确认已锁定英雄的分路'],reason:'请先确认已锁定英雄的分路，再核对这套阵容'};
 if(mandatoryOwn&&!range.slots.some(slot=>slot.champion===mandatoryOwn.champion))range.expectedSize++;
 const fixed=current.filter(s=>range.controlledRoles.includes(s.role)&&s.champion&&(Number.isInteger(s.clientCellId)||s.manualPosition||s.publicIntent||s.locked&&!s.automaticPosition));
 const heroMatches=fixed.filter(s=>lineup.some(m=>m.champion===s.champion)).length;
 const roleMatches=fixed.filter(s=>lineup.some(m=>m.champion===s.champion&&m.role===s.role)).length;
 const proposed=lineup.filter(s=>s.champion),unique=new Set(proposed.map(s=>s.champion)).size===proposed.length&&new Set(proposed.map(s=>s.role)).size===proposed.length;
 const unplacedAllies=context.publicAllies.filter(id=>!current.some(s=>s.champion===id));
 const taken=proposed.some(s=>range.controlledRoles.includes(s.role)&&unplacedAllies.includes(s.champion));
 const ownConflict=mandatoryOwn&&lineup.some(slot=>slot.role===mandatoryOwn.role&&slot.champion&&slot.champion!==mandatoryOwn.champion);
 const compatible=unique&&!taken&&!ownConflict&&heroMatches===fixed.length,exact=compatible&&roleMatches===fixed.length;
 // The displayed full team may contain a public championId without a lock
 // action. Use it only as labelled fit evidence, never as confirmation or a
 // selectable/proposable member. Explicit unfinished picks still obey the
 // preselection switch. Unknown lanes retain unknown-lane scoring.
 const references=[];let referenceConflict=false;
 if(range.scope==='context')for(const slot of visible){
  if(!slot.champion||range.controlledRoles.includes(slot.role)||range.slots.some(row=>row.champion===slot.champion&&!row.publicIntent&&!range.controlledRoles.includes(row.role)))continue;
  const hero=champions.find(c=>c.id===slot.champion),team=options.clientSession?.myTeam||[];
  const matching=team.filter(p=>Number(p.championId)===Number(hero?.key)&&(!Number.isInteger(slot.clientCellId)||slot.clientCellId===p.cellId));
  if(!hero||matching.length!==1||team.filter(p=>p.championId&&Number(p.championId)===Number(hero.key)).length!==1)continue;
  const player=matching[0];if(!Number.isInteger(player.cellId)||player.cellId===options.clientSession.localPlayerCellId||team.filter(p=>p.cellId===player.cellId).length!==1||confirmedPlayerPick(player,options.clientSession))continue;
  if(!options.includePreselected&&(options.clientSession.actions||[]).flat().some(a=>a.type==='pick'&&a.actorCellId===player.cellId&&a.completed===false))continue;
  if(references.some(row=>row.clientCellId===player.cellId))continue;
  if(range.slots.some(row=>row.champion===slot.champion&&range.controlledRoles.includes(row.role))||references.some(row=>row.champion===slot.champion)){referenceConflict=true;continue;}
  const role=slot.manualPosition&&slot.clientCellId===player.cellId||CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()]===slot.role?slot.role:'';
  if(role&&([...range.slots,...references].some(row=>row.role===role&&row.champion&&row.champion!==slot.champion))){referenceConflict=true;continue;}
  references.push({...slot,role,clientCellId:player.cellId,publicIntent:false,referenceOnly:true,locked:false});
 }
 const analysis=analyzeTeam([...range.slots.filter(row=>!references.some(ref=>ref.champion===row.champion)),...references],champions,context,true);
 // analyzeTeam omits unknown IDs; retain their planned place in expectedSize.
 const fit=compositionFit(analysis,context.cooperationGraph,{expectedSize:range.expectedSize+references.filter(ref=>!range.slots.some(row=>row.champion===ref.champion)).length});
 const cap=compatible&&!referenceConflict?(exact?100:45):20,score=fit.score===null?null:Math.min(cap,fit.score),rawScore=fit.score===null?0:Math.min(cap,fit.rawScore);
 const constraint=!unique?'同一英雄或位置重复，方案存在冲突。':!compatible?'与已固定英雄冲突。':!exact?'已选英雄保留，但固定位置冲突。':'';
 const breakdown=[...fit.breakdown];if(Number.isFinite(score)&&score!==fit.score)breakdown.push({key:'constraint',label:'选人冲突限制',points:score-fit.score,max:0});
 const referenceNote=references.length?`含 ${references.length} 位未确认的公开已选英雄，仅作阵容参考。`:'';
 return {...fit,score,rawScore,breakdown,compatible:compatible&&!referenceConflict,exact:exact&&!referenceConflict,scope:range.scope,referenceCount:references.length,
  gaps:[...(referenceConflict?['与未确认的公开已选英雄或位置冲突。']:[]),...(constraint?[constraint]:[]),...fit.gaps],
  reason:`${referenceNote}${constraint}${fit.reason}${constraint&&fit.score!==null?` 冲突方案最高计 ${cap} 分。`:''}`};
}
// A proposal cannot assign a public pick to another player, or replace a
// confirmed pick. Offline plans and ignored hovers are not client evidence.
function proposalAvailable(lineup,current,champions,{clientSession,includePreselected=false}={}){
 if(!Array.isArray(clientSession?.myTeam))return true;
 const team=publicDraftTeam(clientSession),byKey=new Map(champions.map(c=>[Number(c.key),c.id]));
 for(const player of team){
  const confirmed=confirmedPlayerPick(player,clientSession);
  if(!confirmed&&!includePreselected)continue;
  if(!Number.isInteger(player.cellId)||player.cellId<0||player.cellId>=30||team.filter(p=>p.cellId===player.cellId).length!==1)continue;
  const key=Number(player.championId||player.championPickIntent),hero=byKey.get(key);
  if(!hero)continue;
  const same=team.filter(p=>Number(p.championId||p.championPickIntent)===key),locked=same.filter(p=>confirmedPlayerPick(p,clientSession));
  if(confirmed?locked.length!==1:locked.length||same.length!==1)continue;
  const bound=current.filter(s=>s.clientCellId===player.cellId);
  if(bound.length>1)continue;
  const role=bound[0]?.role||CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()],proposed=lineup.find(s=>s.champion===hero);
  const owner=proposed&&current.find(s=>s.role===proposed.role)?.clientCellId;
  if(proposed&&Number.isInteger(owner)&&owner!==player.cellId)return false;
  if(role&&(proposed&&proposed.role!==role||lineup.some(s=>s.role===role&&s.champion&&s.champion!==hero)))return false;
 }
 return true;
}
export function roomBallotBoard(room,current,champions,options={}){
 const members=(room?.members||[]).filter(m=>m.online!==false),groups=new Map();
 for(const member of members){const proposal=member.share?.ballot?.proposal;if(!proposal||!proposalAvailable(proposal.lineup,current,champions,options))continue;const key=proposalKey(proposal);let row=groups.get(key);
  if(!row){row={key,proposal,from:member.nick,proposers:[],voters:[],adopters:[],mine:false,fit:lineupFit(proposal.lineup,current,champions,options)};groups.set(key,row);}row.proposers.push(member.nick);
 }
 for(const member of members)for(const key of ballotVotes(member.share?.ballot)){const row=groups.get(key);if(row){if(!row.voters.includes(member.nick))row.voters.push(member.nick);if(member.self)row.mine=true;}}
 for(const row of groups.values()){
  row.proposers.sort();row.voters.sort();row.from=row.proposers[0];
  row.adopters=members.map(m=>memberAdoption(m,row)).filter(Boolean).sort((a,b)=>a.nick.localeCompare(b.nick));
 }
 return [...groups.values()].sort((a,b)=>Number(b.fit.compatible)-Number(a.fit.compatible)||Number(b.fit.exact)-Number(a.fit.exact)||b.voters.length-a.voters.length||(b.fit.score??-1)-(a.fit.score??-1)||a.key.localeCompare(b.key));
}
