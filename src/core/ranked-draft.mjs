import {identifyMode} from './game-mode.mjs';
import {CLIENT_POSITION_ROLES} from './draft.mjs';

// Queue metadata is authoritative. A CLASSIC map alone cannot identify ranked.
export function rankedDraftPolicy(client={}){
 const game=client.game||client,knownQueue=Number.isInteger(game.queueId),ranked=knownQueue&&identifyMode(game).id==='rift'&&[420,440].includes(game.queueId);
 return {ranked,queue:ranked?(game.queueId===420?'solo':'flex'):null,label:ranked?(game.queueId===420?'单双排':'灵活排位'):'',preselection:!ranked,consumePreselection:knownQueue&&identifyMode(game).id==='rift'&&[0,400,430,490].includes(game.queueId)};
}

// Reference scope is a once-per-game default, never premade ownership or
// permission to change another player's pick. Late queue metadata can set it.
export function selectionReferenceScope(draft,client){
 const queue=client?.game?.queueId,policy=rankedDraftPolicy(client);
 if(!client?.connected||client.phase!=='ChampSelect'||!Number.isInteger(queue)||identifyMode(client.game).id!=='rift'||Number.isInteger(draft?.referenceQueue))return null;
 return {queue,scope:['party','context'].includes(draft?.scopeSelection)?draft.scopeSelection:policy.ranked?'context':'party'};
}

const championKey=value=>Number.isSafeInteger(Number(value))&&Number(value)>0&&Number(value)<10000000?Number(value):0;
// Only completed public actions can fill a lagging roster row. An intent or
// in-progress action never establishes a locked champion. No role inference.
export function publicDraftTeam(session,side='myTeam'){
 const actions=(Array.isArray(session?.actions)?session.actions:[]).flat();
 return (Array.isArray(session?.[side])?session[side]:[]).slice(0,5).map(player=>{
  const picks=actions.filter(action=>action?.type==='pick'&&action.actorCellId===player.cellId),completed=[...new Set(picks.filter(action=>action.completed===true).map(action=>championKey(action.championId)).filter(Boolean))];
  // Completed actions retain the original pick after a champion trade. The
  // current nonzero roster is therefore authoritative over the action's ID.
  const locked=completed.length===1?completed[0]:0,championId=championKey(player.championId)||locked;
  const confirmed=!!championId&&completed.length<=1&&!picks.some(action=>action.completed===false)&&(picks.some(action=>action.completed===true)||player.pickState==='locked');
  return {...player,championId,pickState:confirmed?'locked':championId?'selecting':'empty',role:CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()]||null};
 });
}

export function publicRankedDraft(client,champions=[]){
 const policy=rankedDraftPolicy(client),byKey=new Map(champions.map(champion=>[Number(champion.key),champion]));
 const team=side=>publicDraftTeam(client?.session,side).map(player=>({...player,champion:byKey.get(player.championId)?.id||null}));
 const allies=team('myTeam'),enemies=team('theirTeam');
 const all=[...allies,...enemies],complete=client?.connected===true&&client.phase==='ChampSelect'&&policy.ranked&&allies.length===5&&enemies.length===5&&all.every(player=>player.champion&&player.pickState==='locked')&&new Set(all.map(player=>player.championId)).size===10;
 return {...policy,allies,enemies,complete};
}

// Curve availability is independent of ranked recommendation policy. Blind
// matches can contain the same hero on opposite teams; intents are not locks.
export function publicCurveDraft(client,champions=[],slots=[]){
 const draft=publicRankedDraft(client,champions),active=client?.connected===true&&client.phase==='ChampSelect'&&identifyMode(client.game||{}).id==='rift';
 const placed=draft.allies.map(player=>{
  const manual=slots.find(slot=>slot.manualPosition&&slot.clientCellId===player.cellId&&slot.champion===player.champion);
  const bound=slots.find(slot=>slot.clientCellId===player.cellId&&slot.champion===player.champion);
  return {...player,...(manual?{role:manual.role,manualRole:true}:{}),displayRole:manual?.role||player.role||bound?.role||null};
 });
 const claimed=new Set(placed.filter(player=>player.manualRole).map(player=>player.role));
 const allies=placed.map(player=>!player.manualRole&&claimed.has(player.role)?{...player,role:null}:player);
 const ready=players=>players.length===5&&players.every(player=>player.champion&&player.pickState==='locked')&&new Set(players.map(player=>player.championId)).size===5;
 const own=allies.find(player=>player.cellId===client?.session?.localPlayerCellId),alliesReady=active&&ready(allies),complete=active&&draft.ranked&&ready(allies)&&ready(draft.enemies)&&new Set([...allies,...draft.enemies].map(player=>player.championId)).size===10;
 return {...draft,allies,own,alliesReady,complete,ownReady:active&&!!own?.champion&&own.pickState==='locked'};
}
