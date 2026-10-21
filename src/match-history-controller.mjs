import {filterMatches,looksLikePuuid} from './core/match-history/model.mjs';
export function createHistoryController({request,onChange=()=>{},analyze=null,setTimer=setInterval,clearTimer=clearInterval}){
 const state={tabs:[],current:null,query:'',source:'auto',server:'',servers:[],error:'',searchResults:[],searching:false};let next=0,searchTicket=0,observedName='',observedSession='',observedConnected=false,autoSession='';
 const current=()=>state.tabs.find(t=>t.id===state.current);
 const replayTimers=new Map(),cancelReplay=tab=>{const timer=replayTimers.get(tab);if(timer!==undefined)clearTimer(timer);replayTimers.delete(tab);};
 const alive=(tab,ticket)=>state.tabs.includes(tab)&&tab.ticket===ticket;
 const recalculate=tab=>{if(analyze&&tab.page)tab.analysis=analyze(filterMatches(tab.page.games,tab.filter),{timelines:tab.timelines||{}});};
 const keepTimeline=(tab,id,timeline)=>{tab.timelines||={};const bytes=JSON.stringify(timeline).length*2;if(bytes>24_000_000)throw Error('单局时间线超出内存上限');const entries={...tab.timelines,[id]:timeline};let total=Object.values(entries).reduce((sum,value)=>sum+JSON.stringify(value).length*2,0);for(const key of Object.keys(entries)){if(total<=24_000_000)break;if(String(key)===String(id))continue;total-=JSON.stringify(entries[key]).length*2;delete entries[key];if(tab.details[key])delete tab.details[key].timeline;}tab.timelines=entries;};
 const message=error=>String(error?.message||'查询未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');
 async function load(tab,change={},append=false){
   if(!state.tabs.includes(tab))return;cancelReplay(tab);const ticket=++tab.ticket;tab.options={...tab.options,...change};tab.loading=true;tab.error='';tab.collecting=false;tab.analysisLoading=false;tab.challengesLoading=false;tab.collectionResult=null;onChange();
   try{let page;try{page=await request('page',tab.options);}catch(error){if(!alive(tab,ticket))return;if(tab.options.handle&&/账号|会话/.test(message(error))){tab.options={...tab.options,handle:undefined,start:0};tab.page=null;tab.profile=null;tab.details={};onChange();page=await request('page',tab.options);}else throw error;}if(!alive(tab,ticket))return;
   if(page.session&&state.session&&page.session!==state.session){for(const previous of state.tabs)if(previous!==tab)previous.ticket++;state.tabs=[tab];state.current=tab.id;}if(page.session)state.session=page.session;
   const games=append?[...new Map([...(tab.page?.games||[]),...page.games].map(g=>[g.id,g])).values()]:page.games;
    tab.page={...page,games};tab.options={...tab.options,handle:page.handle};tab.details={};tab.timelines={};recalculate(tab);state.servers=page.servers||state.servers;tab.loading=false;onChange();
   try{const profile=await request('profile',{handle:page.handle});if(alive(tab,ticket)){tab.profile=profile;onChange();}}catch{}
  }catch(error){if(alive(tab,ticket)){tab.error=message(error);tab.loading=false;onChange();}}
 }
 async function open(options={}){if(!options.background){searchTicket++;state.searching=false;state.searchResults=[];state.error='';}const {background=false,...query}={source:state.source,...options},server=query.server??state.server,previous=state.tabs.find(tab=>(server?(tab.page?.server??tab.options.server??'')===server:!tab.options.server&&!tab.page?.cross)&&(query.puuid?tab.page?.player?.puuid===query.puuid||tab.options.puuid===query.puuid:query.query?tab.options.query?.toLowerCase()===query.query.toLowerCase():!tab.options.query&&!tab.options.puuid));
  if(previous){if(!background)state.current=previous.id;if(query.source&&query.source!==previous.options.source){previous.profile=null;previous.challenges=undefined;await load(previous,{...query,handle:undefined,start:0});}else if(query.handle&&query.start!==undefined)await load(previous,query);else onChange();return previous;}
  const tab={id:++next,ticket:0,options:{source:state.source,server,...query},page:null,filter:{excludePve:true},details:{},profile:null,loading:false,error:''};state.tabs.push(tab);if(!background||state.current===null)state.current=tab.id;if(state.tabs.length>10)close(state.tabs[0].id);await load(tab);return tab;}
 async function search(){const query=state.query.trim();if(query.includes('#'))return open({query});if(looksLikePuuid(query))return open({puuid:query});const ticket=++searchTicket;state.searching=true;state.error='';state.searchResults=[];onChange();try{const result=await request('search',{query,server:state.server,source:state.source});if(ticket!==searchTicket)return;state.servers=result.servers||state.servers;state.searchResults=result.players;if(!result.players.length)state.error='没有找到匹配玩家，请输入完整游戏 ID';}catch(error){if(ticket===searchTicket)state.error=message(error);}finally{if(ticket===searchTicket){state.searching=false;onChange();}}}
 function close(id){const tab=state.tabs.find(t=>t.id===id);if(tab){tab.ticket++;cancelReplay(tab);}state.tabs=state.tabs.filter(t=>t.id!==id);if(state.current===id)state.current=state.tabs.at(-1)?.id??null;onChange();}
 async function detail(id,section='summary'){
  const tab=current();if(!tab?.page)return;let d=tab.details[id];if(d&&section==='toggle'){d.open=!d.open;onChange();return;}
  if(!d){d={open:true,section:'summary',game:tab.page.games.find(g=>g.id===id),loading:false,error:''};tab.details[id]=d;}d.open=true;d.section=section==='toggle'?'summary':section;
  const ticket=tab.ticket,handle=tab.page.handle;if(d.flight){onChange();await d.flight;if(alive(tab,ticket)&&!d.error&&['timeline','events','builds','analysis'].includes(d.section)&&!d.timeline)return detail(id,d.section);return;}d.loading=true;d.error='';onChange();let finish;d.flight=new Promise(resolve=>finish=resolve);
   try{if(!d.complete){const result=await request('detail',{handle,id});if(!alive(tab,ticket)||tab.page.handle!==handle)return;d.game=result.game;d.notice=result.notice||'';d.complete=true;tab.page.games=tab.page.games.map(g=>g.id===id?result.game:g);recalculate(tab);}
    if(['timeline','events','builds','analysis'].includes(d.section)&&!d.timeline){const result=await request('timeline',{handle,id});if(!alive(tab,ticket))return;keepTimeline(tab,id,result.timeline);d.timeline=result.timeline;d.notice=result.notice||d.notice;recalculate(tab);}
  }catch(error){if(alive(tab,ticket))d.error=message(error);}finally{delete d.flight;finish();if(alive(tab,ticket)){d.loading=false;onChange();}}
 }
 async function collect({champion=null,position='',expectedCount=500,useFilters=false,scanFromStart=false}={}){const tab=current();if(!tab?.page||tab.loading||tab.page.games.length>=500&&!scanFromStart)return;if(champion)tab.filter.champion=Number(champion);if(position)tab.filter.position=position;const expected=Math.min(500,Math.max(1,Number(expectedCount)||500));
   if(scanFromStart){tab.ticket++;tab.page={...tab.page,games:[],hasMore:true,start:0};tab.details={};tab.timelines={};tab.analysisLoading=false;tab.challengesLoading=false;}
   const selectedFilter=useFilters?structuredClone(tab.filter):{...(champion?{champion}:{}),...(position?{position}:{})},enough=()=>filterMatches(tab.page.games,selectedFilter).length>=expected;
   const ticket=tab.ticket,collection=(tab.collection||0)+1;tab.collection=collection;tab.collecting=true;tab.loading=true;tab.error='';tab.collectionResult=useFilters?{scanned:0,matched:0,limit:500}:null;onChange();let start=scanFromStart?0:tab.page.start+tab.page.count,scanned=0;
     try{for(let n=0;n<50&&tab.page.hasMore&&!enough()&&scanned<500;n++){
    const count=Math.min(20,500-tab.page.games.length),result=await request('page',{...tab.options,start,count});if(!alive(tab,ticket)||!tab.collecting||tab.collection!==collection)return;
     scanned+=result.games.length;const incoming=useFilters?filterMatches(result.games,selectedFilter):result.games,games=[...new Map([...tab.page.games,...incoming].map(g=>[g.id,g])).values()].slice(0,useFilters?expected:500);tab.page={...result,games};if(useFilters)tab.collectionResult={scanned,matched:games.length,limit:500};recalculate(tab);start+=count;onChange();
   if(games.length>=500)break;
   }}catch(error){if(alive(tab,ticket)&&tab.collection===collection)tab.error=message(error);}finally{if(alive(tab,ticket)&&tab.collection===collection){tab.loading=false;tab.collecting=false;onChange();}}
 }
 async function replay(id,action){const tab=current();if(!tab?.page)return;const d=tab.details[id];if(!d)return;const ticket=tab.ticket;cancelReplay(tab);d.loading=true;d.error='';onChange();try{const value=await request('replay',{handle:tab.page.handle,id,action});if(!alive(tab,ticket))return;d.replay=value;
  if(['checking','download','downloading'].includes(value.state)){let reads=0,pending=false;const timer=setTimer(async()=>{if(pending)return;if(!alive(tab,ticket)||++reads>120){cancelReplay(tab);return;}pending=true;try{const next=await request('replay-status',{handle:tab.page.handle,id});if(!alive(tab,ticket))return;d.replay=next;if(!['checking','download','downloading'].includes(next.state))cancelReplay(tab);onChange();}catch(error){if(alive(tab,ticket))d.error=message(error);cancelReplay(tab);onChange();}finally{pending=false;}},2000);timer?.unref?.();replayTimers.set(tab,timer);}
 }catch(error){if(alive(tab,ticket))d.error=message(error);}finally{if(alive(tab,ticket)){d.loading=false;onChange();}}}
 async function loadAnalysisDetails(limit=20){const tab=current();if(!tab?.page||tab.analysisLoading)return;const ticket=tab.ticket,handle=tab.page.handle;tab.analysisLoading=true;tab.analysisError='';tab.timelines||={};onChange();try{
  for(const game of filterMatches(tab.page.games,tab.filter).slice(0,Math.min(50,limit))){if(!alive(tab,ticket))return;if(!tab.timelines[game.id]){try{const {timeline}=await request('timeline',{handle,id:game.id});if(!alive(tab,ticket))return;keepTimeline(tab,game.id,timeline);}catch(error){tab.analysisError=message(error);}}
    recalculate(tab);onChange();}
 }finally{if(alive(tab,ticket)){tab.analysisLoading=false;onChange();}}}
 async function challenges(){const tab=current();if(!tab?.page||tab.challengesLoading)return;const ticket=tab.ticket;tab.challengesLoading=true;onChange();try{const value=await request('challenges',{handle:tab.page.handle});if(alive(tab,ticket)){tab.challenges=value;tab.challengesError='';}}catch(error){if(alive(tab,ticket))tab.challengesError=message(error);}finally{if(alive(tab,ticket)){tab.challengesLoading=false;onChange();}}}
 function clear(){for(const tab of state.tabs){tab.ticket++;cancelReplay(tab);}state.tabs=[];state.current=null;state.session='';autoSession='';searchTicket++;state.searchResults=[];state.searching=false;onChange();}
 function observeClient(client){
  if(!client?.connected){if(observedConnected||state.tabs.length)clear();observedConnected=false;observedName='';observedSession='';return;}
  const name=client.playerName||'',session=typeof client.historySession==='string'?client.historySession:observedSession;
  if(name&&observedName&&name!==observedName||observedSession&&session!==observedSession)clear();
  observedConnected=true;if(name)observedName=name;observedSession=session;
 }
 async function openOwnGame(id){
  if(!Number.isSafeInteger(Number(id))||Number(id)<=0)throw Error('对局编号不正确');
  const existing=state.tabs.find(tab=>!tab.options.query&&!tab.options.puuid&&!tab.options.server);
  const tab=existing||await open({source:'auto',server:''});
  if(!tab)return;
  if(existing){state.current=tab.id;await load(tab,{source:'auto',server:'',handle:undefined,start:0});}
  if(current()!==tab||!tab.page||tab.error)return;
  tab.filter={excludePve:true};
  if(!tab.page.games.some(game=>game.id===Number(id))){tab.error='本局战绩尚未同步，请稍后刷新';onChange();return;}
  await detail(Number(id),'summary');
 }
 function autoLoadOwn(client,summary){
  observeClient({...client,historySession:summary?.session||''});
  if(!client?.connected||!summary?.session||!['ready','partial'].includes(summary.status)||autoSession===summary.session)return Promise.resolve();
  autoSession=summary.session;
  if(state.tabs.some(tab=>!tab.options.query&&!tab.options.puuid&&!tab.options.server))return Promise.resolve();
  return open({source:state.source==='auto'?summary.source||'auto':state.source,server:'',background:true});
 }
  return {state,current,open,openOwnGame,search,load,close,detail,collect,replay,loadAnalysisDetails,challenges,clear,observeClient,autoLoadOwn,cancelSearch:()=>{searchTicket++;state.searching=false;state.searchResults=[];onChange();},select:id=>{state.current=id;onChange();},stop:()=>{const tab=current();if(tab){tab.collection=(tab.collection||0)+1;tab.loading=false;tab.collecting=false;onChange();}},filter:(key,value)=>{const tab=current();if(tab){tab.filter={...tab.filter,[key]:value};recalculate(tab);onChange();}},visible:()=>{const tab=current();return filterMatches(tab?.page?.games||[],tab?.filter);}};
}
