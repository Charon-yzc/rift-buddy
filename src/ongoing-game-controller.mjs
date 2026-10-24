import {normalizeOngoingSettings} from './core/ongoing-game.mjs';
import {ongoingRoster} from './core/ongoing-game.mjs';

export function createOngoingGameController({request,analyze,teamAnalyze,infer,compact=timeline=>timeline,onChange=()=>{},settings={},setTimer=setInterval,clearTimer=clearInterval}){
 const state={roster:null,players:{},settings:normalizeOngoingSettings(settings),loading:false,error:'',draft:false,notes:{},met:{},groups:[],teamAnalysis:{}};
 let generation=0,rosterTicket=0,timer=null,active=false,rosterPending=false,timelineBytes=0,loadingPlayers=0,backgroundRunning=0,pagesRunning=0,sharedEpoch=-1,observedSession='',observedName='',paintedLoading=false;const visited=new Set(),flights=new Map(),playerQueue=[],backgroundQueue=[],sharedTimelines=new Map();
 const message=error=>String(error?.message||'读取未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');
 // Everything a card shows from the roster itself; used to skip no-op repaints.
 // group drives the Arena subteam sections, role the position cells and level
 // the avatar badge, so a later snapshot that fills them must still repaint.
 const rosterIdentity=roster=>roster?JSON.stringify([roster.key,roster.phase,roster.queue,roster.mode,(roster.players||[]).map(p=>[p.key,p.name,p.team,p.champion,p.locked,p.position,p.hidden,p.spells,p.group,p.role,p.level,p.self])]):'';
 const current=(epoch,key,entry)=>epoch===generation&&state.roster?.key===key&&(!entry||state.players[entry.memberKey]===entry);
 function drainPlayers(){while(playerQueue.length){const next=playerQueue[0];if(!next.valid()){playerQueue.shift().resolve(false);continue;}if(loadingPlayers>=state.settings.concurrency)break;loadingPlayers++;playerQueue.shift().resolve(true);}drainBackground();}
 const acquirePlayer=valid=>new Promise(resolve=>{playerQueue.push({resolve,valid});drainPlayers();});
 // Deeper history pages and detailed samples take about 1-2 s each (up to 20
 // samples per player), so a player slot covers only the first page and rank.
 // The rest shares one background queue across players: deeper pages first,
 // then every player's first sample, then every second sample, and so on. While
 // a first page is still loading, one background read runs so first pages keep
 // the request slots; afterwards three run (the measured fastest backend
 // concurrency). Deeper pages take 2-8 s and hold at most one of those slots,
 // so samples never stall behind them. The service runs these reads at low
 // priority, so a page the user opens starts next. A game in several histories
 // (premades, a simulated match) is read once.
 function drainBackground(){
  for(let i=backgroundQueue.length-1;i>=0;i--)if(!backgroundQueue[i].valid())backgroundQueue.splice(i,1)[0].resolve(false);
  while(backgroundRunning<(loadingPlayers||playerQueue.length?1:3)){
   let best=-1;for(let i=0;i<backgroundQueue.length;i++){const item=backgroundQueue[i];if(item.rank<0&&pagesRunning)continue;if(best<0||item.rank<backgroundQueue[best].rank)best=i;}
   if(best<0)break;const item=backgroundQueue.splice(best,1)[0];backgroundRunning++;if(item.rank<0)pagesRunning++;item.resolve(true);
  }
 }
 async function background(rank,valid,run){
  if(!await new Promise(resolve=>{backgroundQueue.push({rank,resolve,valid});drainBackground();}))return null;
  try{return await run();}finally{backgroundRunning--;if(rank<0)pagesRunning--;drainBackground();}
 }
 function sampleTimeline(game,handle,rank,valid){
  if(sharedEpoch!==generation){sharedTimelines.clear();sharedEpoch=generation;timelineBytes=0;}
  const id=game.historyKey||String(game.id),known=sharedTimelines.get(id);if(known){known.waiters.push(valid);return known.flight;}
  const epoch=generation,shared={waiters:[valid]};
  shared.flight=background(rank,()=>shared.waiters.some(test=>test()),async()=>{
   const result=await request('timeline',{handle,id:game.id,compact:true,background:true}),timeline=compact(result.timeline),bytes=JSON.stringify(timeline).length*2;
   if(epoch!==sharedEpoch)return null;
   if(timelineBytes+bytes>48_000_000)return {exceeded:true};
   timelineBytes+=bytes;return {timeline,notice:result.notice||''};
  });
  // A skipped or failed read is not kept, so another player can still read it.
  const forget=()=>{if(sharedTimelines.get(id)===shared)sharedTimelines.delete(id);};
  shared.flight.then(value=>{if(!value?.timeline)forget();},forget);
  sharedTimelines.set(id,shared);return shared.flight;
 }
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
   const task=(async()=>{const acquired=await acquirePlayer(()=>current(epoch,key,entry));if(!acquired)return;let holding=true;const release=()=>{if(!holding)return;holding=false;loadingPlayers--;drainPlayers();};try{
   const limit=Math.min(state.settings.count,Math.max(1,Math.floor(2000/Math.max(1,roster.players.length)))),count=Math.min(20,limit);
   const base={puuid:member.puuid,source:state.settings.source,server:roster.server||'',...(state.draft?{}:{rosterKey:key}),...(state.settings.tag==='current'&&Number.isInteger(roster.queue)&&roster.queue>0?{queue:roster.queue}:{})};
   const inScope=games=>base.queue?games.filter(game=>game.queue===base.queue):games;
   let page=await request('page',{...base,count,start:0});if(!current(epoch,key,entry))return;
   const scoped=(rows,server)=>inScope(rows).map(game=>({...game,server,historyKey:`${server}:${game.id}`}));
   let games=scoped(page.games,page.server||roster.server||'');entry.page={...page,games};entry.notice=page.notice||'';entry.analysis=analyze(games);recalculate();onChange();
   const handle=page.handle,valid=()=>current(epoch,key,entry),note=text=>{if(text&&!entry.notice.includes(text))entry.notice+=(entry.notice?'；':'')+text;};
   try{const profile=await request('profile',{handle});if(!valid())return;entry.profile=profile;}catch(error){if(!valid())return;note(message(error));}
   entry.loading=false;release();
   const max=Math.min(state.settings.details,limit),timelines={},sampled=new Set();let unpainted=0,pending=0,exceeded=false;
   entry.detailsLoading=page.hasMore&&count<limit||games.length>0&&max>0;onChange();
   // Repaint every four samples; one arrives roughly every second.
   const sample=(game,rank)=>{sampled.add(game.id);pending++;return (async()=>{
    try{
     const result=await sampleTimeline(game,handle,rank,valid);
     if(!result||!valid())return;
     if(result.exceeded){if(!exceeded){exceeded=true;note('时间线已达到本次内存上限');}return;}
     note(result.notice);timelines[game.id]=result.timeline;entry.loadedDetails++;unpainted++;
    }catch(error){if(valid())entry.detailsError=message(error);}
    finally{pending--;if(valid()&&unpainted&&(unpainted>=4||!pending)){unpainted=0;entry.analysis=analyze(games,{timelines});recalculate();onChange();}}
   })();};
   const wave=()=>Promise.all(games.slice(0,max).map((game,rank)=>sampled.has(game.id)?null:sample(game,rank)));
   const deeper=(async()=>{
    for(let start=count;start<limit&&page.hasMore;){
     const size=Math.min(100,limit-start),next=await background(-1,valid,()=>request('page',{...base,handle,count:size,start,background:true}));if(!next||!valid())return;
     page=next;start+=size;games=[...new Map([...games,...scoped(page.games,page.server||roster.server||'')].map(g=>[g.id,g])).values()].slice(0,limit);entry.page={...page,games};entry.analysis=analyze(games,{timelines});recalculate();onChange();
    }
   })().catch(error=>{if(valid())note(message(error));});
   // Samples from the first page start at once; a short first page (other
   // queues filtered out) continues with the deeper games once they arrive.
   await Promise.all([wave(),deeper.then(wave)]);
  }catch(error){if(current(epoch,key,entry)){entry.error=message(error);}}
   finally{release();if(current(epoch,key,entry)){entry.loading=false;entry.detailsLoading=false;recalculate();onChange();}}})();
  flights.set(member.key,task);try{await task;}finally{if(flights.get(member.key)===task)flights.delete(member.key);}
 }
 async function loadMembers({force=false}={}){
   const roster=state.roster;if(!roster)return;const pending=roster.players.filter(p=>p.puuid&&!p.hidden&&(force||!state.players[p.key]||state.players[p.key].cancelled));
   await Promise.all(pending.map(member=>loadPlayer(member,{force})));
 }
  async function refresh({force=false,background=false}={}){
  if(!state.settings.enabled)return;if(state.draft){await loadMembers({force});return;}
  const ticket=++rosterTicket,epoch=generation;
  // A background tick must not repaint an unchanged page: that would drop the
  // open hover detail, the rail scroll position and keyboard focus every few
  // seconds while players and matches keep loading.
  const quiet=background&&!force,previous=state.roster;
  if(!quiet){state.loading=true;state.error='';paintedLoading=true;onChange();}
  try{const roster=await request('roster',{});if(ticket!==rosterTicket||epoch!==generation)return;
    if(observedSession&&roster.session&&observedSession!==roster.session)clearPersonal();if(roster.session)observedSession=roster.session;
    if(roster.key!==state.roster?.key){generation++;state.players={};state.groups=[];state.teamAnalysis={};drainPlayers();}
  state.roster=roster;remember(roster);state.loading=false;
    // A quiet tick must still repaint when the page is currently painted in the
    // loading state (a foreground refresh can be superseded by a tick) and must
    // clear a stale failure message, otherwise the page would keep claiming an
    // error or a load that is already resolved.
    const recovered=!!state.error;if(recovered)state.error='';
    if(!quiet||recovered||paintedLoading||!previous||rosterIdentity(previous)!==rosterIdentity(roster)){paintedLoading=false;onChange();}
    if(roster.phase==='lobby'&&!state.settings.lobby)return;const work=loadMembers({force});if(background)work.catch(()=>{});else await work;
   }catch(error){if(ticket===rosterTicket){state.error=message(error);state.loading=false;if(/账号|会话|登录|连接客户端/.test(state.error)){generation++;state.roster=null;state.players={};state.groups=[];state.teamAnalysis={};drainPlayers();}paintedLoading=false;onChange();}}
 }
 function stop(){active=false;generation++;rosterTicket++;state.loading=false;for(const entry of Object.values(state.players)){entry.cancelled=entry.loading||entry.detailsLoading;entry.loading=false;entry.detailsLoading=false;}drainPlayers();if(timer!==null){clearTimer(timer);timer=null;}paintedLoading=false;onChange();}
 function start(){if(active)return;active=true;if(state.draft){loadMembers().catch(()=>{});return;}const poll=async()=>{if(rosterPending||state.draft||!active)return;rosterPending=true;try{await refresh({background:true});}finally{rosterPending=false;}};poll().catch(()=>{});timer=setTimer(()=>poll().catch(()=>{}),5000);}
 function clear(){generation++;rosterTicket++;state.roster=null;state.draft=false;state.players={};state.groups=[];state.teamAnalysis={};drainPlayers();paintedLoading=false;onChange();}
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
