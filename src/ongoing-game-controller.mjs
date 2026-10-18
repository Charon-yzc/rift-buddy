import {normalizeOngoingSettings} from './core/ongoing-game.mjs';
import {ongoingRoster} from './core/ongoing-game.mjs';

export function createOngoingGameController({request,analyze,teamAnalyze,infer,onChange=()=>{},settings={},setTimer=setInterval,clearTimer=clearInterval}){
 const state={roster:null,players:{},settings:normalizeOngoingSettings(settings),loading:false,error:'',draft:false,notes:{},met:{},groups:[],teamAnalysis:{}};
 let generation=0,rosterTicket=0,timer=null,active=false,rosterPending=false,timelineBytes=0,loadingPlayers=0,observedSession='',observedName='';const visited=new Set(),flights=new Map(),playerQueue=[];
 const message=error=>String(error?.message||'读取未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');
 const current=(epoch,key,entry)=>epoch===generation&&state.roster?.key===key&&(!entry||state.players[entry.memberKey]===entry);
 function drainPlayers(){while(playerQueue.length){const next=playerQueue[0];if(!next.valid()){playerQueue.shift().resolve(false);continue;}if(loadingPlayers>=state.settings.concurrency)return;loadingPlayers++;playerQueue.shift().resolve(true);}}
 const acquirePlayer=valid=>new Promise(resolve=>{playerQueue.push({resolve,valid});drainPlayers();});
 function clearPersonal(){state.notes={};state.met={};visited.clear();}
 function recalculate(){
  const roster=state.roster;if(!roster)return;const games=[];
  for(const entry of Object.values(state.players))if(entry.page?.games)games.push(...entry.page.games);
  state.groups=infer?Object.values(roster.teams).flatMap(keys=>{const visible=roster.players.filter(p=>keys.includes(p.key)&&p.puuid&&!p.hidden).map(p=>p.puuid);if(visible.length<=10)return infer(games,visible,state.settings.threshold);return visible.flatMap((id,index)=>visible.slice(index+1).flatMap(other=>infer(games,[id,other],state.settings.threshold)));}).map(group=>({...group,count:Number.isFinite(group.times)?group.times:group.count,inferred:true})):[];
  state.teamAnalysis=Object.fromEntries(Object.entries(roster.teams).map(([team,keys])=>[team,teamAnalyze?teamAnalyze(keys.map(key=>state.players[key]?.analysis).filter(Boolean)):null]));
 }
 function remember(roster){
  if(roster.phase!=='in-game'||!roster.gameId)return;
  const self=roster.players.find(p=>p.self);for(const p of roster.players){if(!p.puuid||p.self)continue;const round=roster.session+':'+roster.gameId+':'+p.puuid;if(visited.has(round))continue;visited.add(round);const v=state.met[p.puuid]||{count:0,ally:0,enemy:0,unknown:0};v.count++;const arena=roster.mode==='CHERRY'||p.team==='TEAM-ALL',known=!!self&&(!arena||Number.isSafeInteger(self.group)&&self.group>0&&Number.isSafeInteger(p.group)&&p.group>0);if(!known)v.unknown=(v.unknown||0)+1;else if(arena?p.group===self.group:p.team===self.team)v.ally++;else v.enemy++;state.met[p.puuid]=v;}
  while(visited.size>1500)visited.delete(visited.values().next().value);
  const ids=Object.keys(state.met);for(const id of ids.slice(0,Math.max(0,ids.length-300)))delete state.met[id];
 }
 async function loadPlayer(member,{force=false}={}){
  if(!member?.puuid||member.hidden)return;
  const roster=state.roster,epoch=generation,key=roster?.key;if(!key)return;
  const old=state.players[member.key];if(!force&&(old?.loading||old?.page&&!old?.cancelled))return flights.get(member.key);
  const entry={memberKey:member.key,page:force?null:old?.page||null,profile:force?null:old?.profile||null,analysis:force?null:old?.analysis||null,loading:true,error:'',notice:'',loadedDetails:0};
  state.players[member.key]=entry;onChange();
   const task=(async()=>{const acquired=await acquirePlayer(()=>current(epoch,key,entry));if(!acquired)return;try{
   const limit=Math.min(state.settings.count,Math.max(1,Math.floor(2000/Math.max(1,roster.players.length)))),count=Math.min(20,limit);
   const base={puuid:member.puuid,source:state.settings.source,server:roster.server||'',...(state.draft?{}:{rosterKey:key}),...(state.settings.tag==='current'&&Number.isInteger(roster.queue)&&roster.queue>0?{queue:roster.queue}:{})};
   const inScope=games=>base.queue?games.filter(game=>game.queue===base.queue):games;
   let page=await request('page',{...base,count,start:0});if(!current(epoch,key,entry))return;
   const scoped=(rows,server)=>inScope(rows).map(game=>({...game,server,historyKey:`${server}:${game.id}`}));
   let games=scoped(page.games,page.server||roster.server||'');entry.page={...page,games};entry.notice=page.notice||'';entry.analysis=analyze(games);recalculate();onChange();
   for(let start=count;start<limit&&page.hasMore;start+=count){page=await request('page',{...base,handle:page.handle,count:Math.min(count,limit-start),start});if(!current(epoch,key,entry))return;games=[...new Map([...games,...scoped(page.games,page.server||roster.server||'')].map(g=>[g.id,g])).values()].slice(0,limit);entry.page={...page,games};entry.analysis=analyze(games);recalculate();onChange();}
   try{const profile=await request('profile',{handle:page.handle});if(!current(epoch,key,entry))return;entry.profile=profile;}catch(error){entry.notice+=(entry.notice?'；':'')+message(error);}
   if(!current(epoch,key,entry))return;entry.loading=false;recalculate();onChange();
   const timelines={},maxDetails=Math.min(state.settings.details,games.length);let heldBytes=0;
   try{for(const game of games.slice(0,maxDetails)){
    if(!current(epoch,key,entry))return;
    entry.detailsLoading=true;onChange();
    try{const result=await request('timeline',{handle:page.handle,id:game.id});if(!current(epoch,key,entry))return;const bytes=JSON.stringify(result.timeline).length*2;
     if(timelineBytes+bytes>48_000_000){entry.notice+=(entry.notice?'；':'')+'时间线已达到本次内存上限';break;}
     timelines[game.id]=result.timeline;heldBytes+=bytes;timelineBytes+=bytes;entry.loadedDetails++;entry.analysis=analyze(games,{timelines});entry.notice=result.notice||entry.notice;recalculate();onChange();
    }catch(error){entry.detailsError=message(error);}
   }}finally{timelineBytes-=heldBytes;}
  }catch(error){if(current(epoch,key,entry)){entry.error=message(error);}}
   finally{loadingPlayers--;drainPlayers();if(current(epoch,key,entry)){entry.loading=false;entry.detailsLoading=false;recalculate();onChange();}}})();
  flights.set(member.key,task);try{await task;}finally{if(flights.get(member.key)===task)flights.delete(member.key);}
 }
 async function loadMembers({force=false}={}){
   const roster=state.roster;if(!roster)return;const pending=roster.players.filter(p=>p.puuid&&!p.hidden&&(force||!state.players[p.key]||state.players[p.key].cancelled));
   await Promise.all(pending.map(member=>loadPlayer(member,{force})));
 }
  async function refresh({force=false,background=false}={}){
  if(!state.settings.enabled)return;if(state.draft){await loadMembers({force});return;}
  const ticket=++rosterTicket,epoch=generation;state.loading=true;state.error='';onChange();
  try{const roster=await request('roster',{});if(ticket!==rosterTicket||epoch!==generation)return;
    if(observedSession&&roster.session&&observedSession!==roster.session)clearPersonal();if(roster.session)observedSession=roster.session;
    if(roster.key!==state.roster?.key){generation++;state.players={};state.groups=[];state.teamAnalysis={};drainPlayers();}
  state.roster=roster;remember(roster);state.loading=false;onChange();
    if(roster.phase==='lobby'&&!state.settings.lobby)return;const work=loadMembers({force});if(background)work.catch(()=>{});else await work;
   }catch(error){if(ticket===rosterTicket){state.error=message(error);state.loading=false;if(/账号|会话|登录|连接客户端/.test(state.error)){generation++;state.roster=null;state.players={};state.groups=[];state.teamAnalysis={};drainPlayers();}onChange();}}
 }
 function stop(){active=false;generation++;rosterTicket++;state.loading=false;for(const entry of Object.values(state.players)){entry.cancelled=entry.loading||entry.detailsLoading;entry.loading=false;entry.detailsLoading=false;}drainPlayers();if(timer!==null){clearTimer(timer);timer=null;}onChange();}
 function start(){if(active)return;active=true;if(state.draft){loadMembers().catch(()=>{});return;}const poll=async()=>{if(rosterPending||state.draft||!active)return;rosterPending=true;try{await refresh({background:true});}finally{rosterPending=false;}};poll().catch(()=>{});timer=setTimer(()=>poll().catch(()=>{}),5000);}
 function clear(){generation++;rosterTicket++;state.roster=null;state.draft=false;state.players={};state.groups=[];state.teamAnalysis={};drainPlayers();onChange();}
 function observeClient(client){const name=client?.connected?client.playerName||'':'';if(name&&observedName&&name!==observedName){clearPersonal();clear();}if(name)observedName=name;}
 async function configure(change){const previous=state.settings;state.settings=normalizeOngoingSettings({...previous,...change});
  const reload=['enabled','count','details','source','tag','lobby'].some(key=>previous[key]!==state.settings[key]);
  if(!reload){drainPlayers();recalculate();onChange();return;}
  if(!state.settings.enabled){stop();clear();state.draft=false;return;}if(state.draft&&state.roster){generation++;state.players={};state.groups=[];state.teamAnalysis={};drainPlayers();onChange();await loadMembers();return;}clear();if(active)await refresh();
 }
 async function setDraft(game){stop();clear();state.draft=true;
  const own={puuid:game.self?.puuid||''},teamOne=game.participants.filter(p=>p.team==='TEAM-100'),teamTwo=game.participants.filter(p=>p.team!=='TEAM-100');
  const raw=p=>({puuid:p.puuid,gameName:p.name,championId:p.champion,selectedPosition:p.position});
  state.roster=ongoingRoster({phase:'InProgress',own,game:{map:{id:game.map,gameMode:game.mode},gameData:{gameId:game.id,queue:{id:game.queue,gameMode:game.mode},teamOne:teamOne.map(raw),teamTwo:teamTwo.map(raw)}}},'historical-draft');state.roster.phase='draft';state.roster.server=game.server||'';onChange();await loadMembers();
 }
 async function exitDraft(){stop();state.draft=false;clear();start();}
 return {state,refresh,start,stop,clear,observeClient,configure,setDraft,exitDraft,reloadPlayer:key=>loadPlayer(state.roster?.players.find(p=>p.key===key),{force:true}),note:(key,value)=>{const member=state.roster?.players.find(p=>p.key===key);if(!member?.puuid)return;const clean=String(value||'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200);if(clean)state.notes[member.puuid]=clean;else delete state.notes[member.puuid];const ids=Object.keys(state.notes);for(const id of ids.slice(0,Math.max(0,ids.length-300)))delete state.notes[id];onChange();}};
}
