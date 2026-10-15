import {proposalKey} from './room.mjs';
import {CROSS_SYNERGIES,RULES_PATCH,RULES_VERSION} from './rules.mjs';
import {analyzeTeam} from './recommend.mjs';
import {createCooperationGraph} from './cooperation.mjs';
import {compositionFit} from './composition-fit.mjs';
import {effectiveDraftScope} from './draft.mjs';
import {clientContextDraft,publicAllyIds} from './client-context-draft.mjs';
import {editableLocalDraft} from './draft-intents.mjs';

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
function fitContext(champions){
 let context=contexts.get(champions);
 if(!context||context.links!==CROSS_SYNERGIES||context.patch!==RULES_PATCH||context.reviewedAt!==RULES_VERSION){
  context={byId:new Map(champions.map(c=>[c.id,c])),profiles:new Map(),cooperationGraph:createCooperationGraph(champions),comboCache:new Map(),comboLoadouts:new Map(),links:CROSS_SYNERGIES,patch:RULES_PATCH,reviewedAt:RULES_VERSION};
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
 if(options.editableRoles?.length){
  const cellId=options.clientSession?.localPlayerCellId,role=(Number.isInteger(cellId)?current.find(s=>s.clientCellId===cellId)?.role:'')||options.soloRole;
  if(options.editableRoles.includes(role)){const editable=editableLocalDraft(current,options.clientSession,champions,role);current=editable.slots;options={...options,clientSession:editable.session};}
 }
 current=clientContextDraft(current,champions,options.clientSession,{scope:effectiveDraftScope(current,options.scope||'party'),soloRole:options.soloRole||''});
 const range=fitLineupSlots(lineup,current,options),context={...(options.context||fitContext(champions)),publicAllies:['context','solo'].includes(range.scope)?publicAllyIds(options.clientSession,champions):[]};
 const fixed=current.filter(s=>range.controlledRoles.includes(s.role)&&s.champion&&(Number.isInteger(s.clientCellId)||s.manualPosition||s.publicIntent||s.locked&&!s.automaticPosition));
 const heroMatches=fixed.filter(s=>lineup.some(m=>m.champion===s.champion)).length;
 const roleMatches=fixed.filter(s=>lineup.some(m=>m.champion===s.champion&&m.role===s.role)).length;
 const proposed=lineup.filter(s=>s.champion),unique=new Set(proposed.map(s=>s.champion)).size===proposed.length&&new Set(proposed.map(s=>s.role)).size===proposed.length;
 const unplacedAllies=context.publicAllies.filter(id=>!current.some(s=>s.champion===id));
 const taken=proposed.some(s=>range.controlledRoles.includes(s.role)&&unplacedAllies.includes(s.champion));
 const compatible=unique&&!taken&&heroMatches===fixed.length,exact=compatible&&roleMatches===fixed.length;
 const analysis=analyzeTeam(range.slots,champions,context,true);
 // analyzeTeam omits unknown IDs; retain their planned place in expectedSize.
 const fit=compositionFit(analysis,context.cooperationGraph,{expectedSize:range.expectedSize});
 const cap=compatible?(exact?100:45):20,score=fit.score===null?null:Math.min(cap,fit.score),rawScore=fit.score===null?0:Math.min(cap,fit.rawScore);
 const constraint=!unique?'同一英雄或位置重复，方案存在冲突。':!compatible?'与已固定英雄冲突。':!exact?'已选英雄保留，但固定位置冲突。':'';
 return {...fit,score,rawScore,compatible,exact,scope:range.scope,
  gaps:constraint?[constraint,...fit.gaps]:fit.gaps,
  reason:`${constraint}${fit.reason}${constraint&&fit.score!==null?` 冲突方案最高计 ${cap} 分。`:''}`};
}
export function roomBallotBoard(room,current,champions,options={}){
 const members=(room?.members||[]).filter(m=>m.online!==false),groups=new Map();
 for(const member of members){const proposal=member.share?.ballot?.proposal;if(!proposal)continue;const key=proposalKey(proposal);let row=groups.get(key);
  if(!row){row={key,proposal,from:member.nick,proposers:[],voters:[],adopters:[],mine:false,fit:lineupFit(proposal.lineup,current,champions,options)};groups.set(key,row);}row.proposers.push(member.nick);
 }
 for(const member of members){const row=groups.get(member.share?.ballot?.vote);if(row){row.voters.push(member.nick);if(member.self)row.mine=true;}}
 for(const row of groups.values()){
  row.proposers.sort();row.voters.sort();row.from=row.proposers[0];
  row.adopters=members.map(m=>memberAdoption(m,row)).filter(Boolean).sort((a,b)=>a.nick.localeCompare(b.nick));
 }
 return [...groups.values()].sort((a,b)=>Number(b.fit.compatible)-Number(a.fit.compatible)||Number(b.fit.exact)-Number(a.fit.exact)||b.voters.length-a.voters.length||(b.fit.score??-1)-(a.fit.score??-1)||a.key.localeCompare(b.key));
}
