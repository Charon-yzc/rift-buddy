import {publicDraftTeam} from './ranked-draft.mjs';

// Factory snapshots (including personal catalog entries) are local data only
// and are replaced transactionally by renderer-data-state.
// Everything draft-dependent is still compared by content on every new action.
export const RECOMMENDATION_FACTORY_FIELDS=['catalog','champions','builds','pairStatistics'];
const trimAction=action=>!action? action:{type:action.type,actorCellId:action.actorCellId,championId:action.championId,completed:action.completed};
const trimSession=value=>!value?value:{localPlayerCellId:value.localPlayerCellId,allowDuplicatePicks:value.allowDuplicatePicks,bans:value.bans,
 myTeam:value.myTeam?.map(player=>({cellId:player.cellId,championId:player.championId,championPickIntent:player.championPickIntent,assignedPosition:player.assignedPosition,pickState:player.pickState})),
 theirTeam:value.theirTeam?.map(player=>({cellId:player.cellId,championId:player.championId,championPickIntent:player.championPickIntent,assignedPosition:player.assignedPosition,pickState:player.pickState})),
 actions:value.actions?.map(actions=>Array.isArray(actions)?actions.map(trimAction):trimAction(actions))};
const rankedInput=value=>!value?.ranked?null:{ranked:true,queue:value.queue,enemies:(value.enemies||[]).slice(0,5).map(player=>({cellId:player.cellId,champion:player.champion||null,role:player.role||null,manualRole:player.manualRole===true}))};
const partyInput=value=>!value?null:{status:value.status,lobbyCount:value.lobbyCount,members:value.members?.map(member=>({cellId:member.cellId,local:member.local,firstPosition:member.firstPosition,secondPosition:member.secondPosition,intentRole:member.intentRole}))};
export function splitRecommendationInput(input){
 const conditions={...input},factory={};
 for(const field of RECOMMENDATION_FACTORY_FIELDS){factory[field]=conditions[field];delete conditions[field];}
 delete conditions.factoryGeneration;
 conditions.clientSession=trimSession(conditions.clientSession);conditions.fitSession=trimSession(conditions.fitSession);
 conditions.rankedDraft=rankedInput(conditions.rankedDraft);conditions.party=partyInput(conditions.party);
 if(Array.isArray(conditions.sourceRoles))conditions.sourceRoles=conditions.sourceRoles.map(row=>({champion:row.champion,role:row.role}));
 return {factory,conditions};
}
function effectiveSession(value,includePreselected){
 if(!value||includePreselected)return value;
 const actions=(value.actions||[]).flat();
 const team=side=>!Array.isArray(value[side])?null:publicDraftTeam(value,side).map((player,index)=>{
  const raw=value[side][index],picks=actions.filter(action=>action?.type==='pick'&&action.actorCellId===player.cellId);
  // A completed action can establish a lock even while championId lags. Raw
  // positive IDs and pending actions also affect reference-only fit evidence.
  return {cellId:player.cellId,championId:Number(raw?.championId)||0,publicChampionId:player.championId,assignedPosition:player.assignedPosition,pickState:player.pickState,
   completed:[...new Set(picks.filter(action=>action.completed===true).map(action=>Number(action.championId)||0))].sort((a,b)=>a-b),
   pending:!!player.championId&&picks.some(action=>action.completed===false),...(player.cellId===value.localPlayerCellId?{ownPending:picks[0]?.completed===false}:{})};
 });
 return {localPlayerCellId:value.localPlayerCellId,allowDuplicatePicks:value.allowDuplicatePicks,bans:value.bans,myTeam:team('myTeam'),theirTeam:team('theirTeam'),overflow:[value.myTeam?.slice(5),value.theirTeam?.slice(5)]};
}
export function recommendationConditionsKey(input){
 const {conditions}=splitRecommendationInput(input);
 const {randomSeed,offset,continueSearch,newRecommendationPage,searchHandle,searchStep,communityAfter,...snapshot}=conditions;
 const byId=new Map((input.champions||[]).map(champion=>[champion.id,Number(champion.key)]));
 const fitSlots=snapshot.includePreselected===true?snapshot.fitSlots:snapshot.fitSlots?.map(slot=>{
  if(!slot.publicIntent||(snapshot.fitSession?.myTeam||[]).some(player=>Number(player.championId)>0&&Number(player.championId)===byId.get(slot.champion)&&(!Number.isInteger(slot.clientCellId)||slot.clientCellId===player.cellId)))return slot;
  const {publicIntent,...rest}=slot;return {...rest,champion:null,locked:false};
 });
 return JSON.stringify({...snapshot,fitSlots,clientSession:effectiveSession(snapshot.clientSession,snapshot.includePreselected===true),fitSession:effectiveSession(snapshot.fitSession,snapshot.includePreselected===true)});
}
