import {number,text,validPuuid} from './match-history/model.mjs';

export const ONGOING_TAGS={self:'自己',premade:'共同对局',flash:'闪现位置',winning:'连胜',losing:'连败',solo:'单杀',gank:'历史被抓',performance:'参考表现',damage:'伤害占比',taken:'承伤占比',gold:'金币占比',cs:'分均补刀',efficiency:'伤害经济比',pings:'信号次数',vision:'视野',killEfficiency:'击杀伤害比',met:'曾同局',tagged:'备注',privacy:'隐私',akari:'Akari 参考分'};
const DEFAULT_TAGS=['self','premade','flash','winning','losing','solo','gank','performance','killEfficiency','met','tagged','privacy','akari'];
export function normalizeOngoingSettings(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))value={};
 const integer=(key,fallback,min,max)=>Number.isInteger(value[key])&&value[key]>=min&&value[key]<=max?value[key]:fallback;
 const count=integer('count',50,1,200);
 return {enabled:value.enabled!==false,count,details:Math.min(count,integer('details',20,0,50)),concurrency:integer('concurrency',2,1,3),source:['auto','lcu','sgp'].includes(value.source)?value.source:'auto',tag:value.tag==='all'?'all':'current',sort:['default','win-rate','kda','akari-score','position','premade-team'].includes(value.sort)?value.sort:'default',usage:['recent','mastery','none'].includes(value.usage)?value.usage:'recent',lobby:value.lobby!==false,jungle:value.jungle!==false,jungleAll:value.jungleAll===true,borders:value.borders===true,autoRoute:value.autoRoute===true,streamer:value.streamer===true,threshold:integer('threshold',5,2,20),tags:Array.isArray(value.tags)?[...new Set(value.tags.filter(v=>Object.hasOwn(ONGOING_TAGS,v)))]:[...DEFAULT_TAGS]};
}
const HIDDEN=new Set(['HIDDEN','ANONYMOUS','OBFUSCATED']);
const publicIdentity=p=>!HIDDEN.has(String(p?.nameVisibilityType||'').toUpperCase());
function identityName(p){const name=text(p?.gameName||p?.riotIdGameName||p?.summonerName||p?.summonerInternalName||p?.displayName),tag=text(p?.tagLine||p?.riotIdTagline);return name+(name&&tag?'#'+tag:'');}
function selectedRole(value){
 if(typeof value!=='string'||value.length>300)return null;
 const parts=value.split('.');if(parts.length!==4&&parts.length!==5)return null;
 const [current,assignmentReason,primary,secondary,fill='NONE']=parts;
 return {current:text(current),assignmentReason:text(assignmentReason),primary:text(primary),secondary:text(secondary),fill:text(fill)};
}
export function ongoingRoster({phase='Offline',own={},lobby=null,draft=null,game=null,additional=null},session=''){
 const live=['GameStart','InProgress','Reconnect','WaitingForStats','PreEndOfGame','EndOfGame'].includes(phase),stage=phase==='ChampSelect'?'champ-select':live?'in-game':['None','Lobby','Matchmaking','ReadyCheck'].includes(phase)?'lobby':'unavailable';
 const gameId=number(draft?.gameId)||number(game?.gameData?.gameId)||0,queue=number(lobby?.gameConfig?.queueId)??number(game?.gameData?.queue?.id),mode=text(game?.gameData?.queue?.gameMode||game?.map?.gameMode),selfPuuid=validPuuid(own.puuid)?own.puuid:'';
 const players=[],teams={};
  const add=(p,team,index,selection={},identityTeam=team)=>{
   if(!p||typeof p!=='object'||p.isBot||p.isSpectator||players.length>=30)return;const visible=publicIdentity(p),puuid=visible&&validPuuid(p.puuid)?p.puuid:'',summonerId=visible&&Number.isSafeInteger(Number(p.summonerId))&&Number(p.summonerId)>0?Number(p.summonerId):null;
   const key=puuid||`${identityTeam}:cell:${number(p.cellId)??index}`;
  if(players.some(member=>member.key===key))return;
  const champion=number(selection.championId)||number(p.championId)||number(p.championPickIntent)||0;
   const actions=Array.isArray(draft?.actions)?draft.actions.flat().filter(action=>action?.type==='pick'&&Number.isInteger(p.cellId)&&action.actorCellId===p.cellId):[];
   const locked=stage!=='champ-select'||(actions.length?actions.some(action=>action.completed===true&&action.championId===champion):!!number(p.championId));
   const member={key,puuid,summonerId,name:visible?identityName(p):'',hidden:!visible,team,champion,locked,position:text(p.assignedPosition||p.selectedPosition).toUpperCase(),role:selectedRole(p.selectedRole),spells:[number(selection.spell1Id)||number(p.spell1Id),number(selection.spell2Id)||number(p.spell2Id)],group:number(p.teamParticipantId),icon:number(p.profileIconId),level:number(p.summonerLevel),self:!!puuid&&puuid===selfPuuid,cell:number(p.cellId)};
  if(stage==='lobby')member.partyKnown=true;
  players.push(member);(teams[team]||=[]).push(key);
 };
 if(stage==='lobby'&&lobby){(Array.isArray(lobby.members)?lobby.members:[]).slice(0,30).forEach((p,i)=>add(p,'LOBBY',i));}
 else if(stage==='champ-select'&&draft){
   for(const [fallback,list] of [['TEAM-100',draft.myTeam],['TEAM-200',draft.theirTeam]])(Array.isArray(list)?list:[]).slice(0,15).forEach((p,i)=>{const team=[1,100].includes(p?.team)?'TEAM-100':[2,200].includes(p?.team)?'TEAM-200':fallback;add(p,team,i);const last=players.at(-1);if(last&&Number.isInteger(draft.localPlayerCellId)&&p?.cellId===draft.localPlayerCellId&&list===draft.myTeam)last.self=true;});
 }else if(live&&game){
   const data=game.gameData||{},extra=additional?.gameId===gameId?additional:null,allSelections=[...(Array.isArray(data.playerChampionSelections)?data.playerChampionSelections:[]),...(Array.isArray(extra?.playerChampionSelections)?extra.playerChampionSelections:[])];
   for(const [team,field] of [['TEAM-100','teamOne'],['TEAM-200','teamTwo']]){
    const original=Array.isArray(data[field])?data[field]:[],supplement=Array.isArray(extra?.[field])?extra[field]:[],same=(p,q)=>validPuuid(p?.puuid)&&p.puuid===q?.puuid||Number.isSafeInteger(p?.summonerId)&&p.summonerId>0&&p.summonerId===q?.summonerId;
    const members=original.map(p=>{const more=supplement.find(q=>same(p,q));return publicIdentity(p)&&more?{...more,...p,championId:p.championId||more.championId,spell1Id:p.spell1Id||more.spell1Id,spell2Id:p.spell2Id||more.spell2Id,selectedRole:p.selectedRole||more.selectedRole,selectedPosition:p.selectedPosition||more.selectedPosition}:p;});
    if(!original.length||original.every(publicIdentity))members.push(...supplement.filter(p=>!original.some(q=>same(p,q))));
    members.slice(0,30).forEach((p,i)=>add(p,mode==='CHERRY'?'TEAM-ALL':team,i,validPuuid(p?.puuid)?allSelections.find(v=>v.puuid===p.puuid)||{}:{},team));
  }
 }
 if(stage==='lobby'&&!players.length&&selfPuuid)add(own,'LOBBY',0);
 const key=JSON.stringify([session,stage,gameId,queue,players.map(p=>[p.key,p.team,p.summonerId,p.puuid,p.hidden])]);
 return {key,session,phase:players.length?stage:'unavailable',clientPhase:phase,gameId,queue,mode,map:number(game?.map?.id),selfPuuid,players,teams,endOfGame:['WaitingForStats','PreEndOfGame','EndOfGame'].includes(phase),receivedAt:Date.now()};
}
