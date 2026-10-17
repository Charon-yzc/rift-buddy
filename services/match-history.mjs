import crypto from 'node:crypto';
import {discoverClient,lcuRequest} from './lcu.mjs';
import {SGP_SERVERS,sgpServerId,sgpRequest} from './match-history-sgp.mjs';
import {normalizeMatch,normalizeTimeline,validPuuid,text,number} from '../src/core/match-history/model.mjs';
import {riotAliasRequest} from './match-history-riot.mjs';

const profile=p=>({puuid:p.puuid,name:text(p.gameName||p.displayName||p.summonerName)+(p.tagLine?'#'+text(p.tagLine):''),level:number(p.summonerLevel||p.level),icon:number(p.profileIconId)});
const fail=message=>{throw Error(message);};
export function createMatchHistoryService({discover=discoverClient,request=lcuRequest,sgp=sgpRequest,aliases=riotAliasRequest,installPath=()=>'',now=Date.now}={}){
 let connection='',epoch=0,running=0,clearGeneration=0,sessionId=crypto.randomBytes(16).toString('hex');const waiting=[],handles=new Map(),cache=new Map();
 function resetSession(){connection='';epoch++;sessionId=crypto.randomBytes(16).toString('hex');handles.clear();cache.clear();}
 function clear(){clearGeneration++;resetSession();}
 async function limited(fn){if(waiting.length>=12)fail('战绩查询正在排队，请稍后重试');if(running>=3)await new Promise(resolve=>waiting.push(resolve));running++;try{return await fn();}finally{running--;waiting.shift()?.();}}
 async function context(generation){
  const startedEpoch=epoch,assertCurrent=()=>{if(generation!==clearGeneration)fail('战绩会话已变化，请重新查询');};
  let auth;try{auth=await discover(typeof installPath==='function'?installPath():installPath,{includeRegion:true});}catch{assertCurrent();fail('暂时无法读取客户端连接');}assertCurrent();
  if(!auth?.port){if(startedEpoch===epoch)resetSession();fail(auth?.unreadable?'请先点击连接客户端并完成 Windows 授权':'请先登录并连接英雄联盟客户端');}
  let own;try{own=await request(auth,'/lol-summoner/v1/current-summoner');}catch{assertCurrent();if(startedEpoch===epoch)resetSession();fail('无法确认当前账号，请重新连接客户端');}assertCurrent();
  if(!validPuuid(own?.puuid))fail('客户端尚未返回当前账号，请等待登录完成后重试');
  let locale={};if(!auth.region)try{locale=await request(auth,'/riotclient/region-locale');}catch{}assertCurrent();
  const localServer=sgpServerId(auth,locale),key=crypto.createHash('sha256').update(JSON.stringify([auth.port,auth.password,own.puuid,localServer])).digest('hex');
  if(connection!==key){if(startedEpoch!==epoch)fail('客户端会话已变化，请重新查询');resetSession();connection=key;}
  return {auth,own,localServer,key,epoch};
 }
 async function check(c){if(c.epoch!==epoch||connection!==c.key)fail('账号或客户端会话已变化，请重新加载战绩');let own;try{own=await request(c.auth,'/lol-summoner/v1/current-summoner');}catch{if(c.epoch===epoch)clear();fail('客户端会话已变化，请重新加载战绩');}if(own?.puuid!==c.own.puuid||c.epoch!==epoch||connection!==c.key){if(c.epoch===epoch)clear();fail('账号或客户端会话已变化，请重新加载战绩');}}
 function put(key,value){const current=cache.get(key);const merged=current?.origin===value.origin?{...current,...value}:value;cache.delete(key);cache.set(key,merged);while(cache.size>128)cache.delete(cache.keys().next().value);return merged;}
 async function remote(c,server,kind,path,body){
  const [entitlements,session]=await Promise.all([request(c.auth,'/entitlements/v1/token'),request(c.auth,'/lol-league-session/v1/league-session-token')]);
  if(!entitlements?.accessToken||typeof session!=='string'||!session)fail('战绩后台认证尚未就绪，请稍后重试或使用客户端数据源');
  return sgp({server,route:path,token:kind==='entitlements'?entitlements.accessToken:session,common:kind!=='entitlements',...(body?{method:'POST',body}:{})});
 }
 async function target(c,p){
  const server=p.server||c.localServer;if(server&&server!==c.localServer&&!SGP_SERVERS[server])fail('不支持此战绩大区');
  let player;
  if(p.puuid){if(!validPuuid(p.puuid))fail('玩家标识格式不正确');player={puuid:p.puuid,name:''};}
  else if(p.query){
   const query=text(p.query);if(!query||query.length>81)fail('请输入有效的游戏 ID');
   const parts=query.split('#');let raw;
   if(parts.length===2&&parts.every(Boolean)){
    try{const results=await aliases(c.auth,query);if(results[0])raw=results[0];}catch{}
    if(!raw){const result=await request(c.auth,'/lol-summoner/v1/summoners/aliases','POST',[{gameName:parts[0],tagLine:parts[1]}]);raw=result?.[0];}
   }
   else if(parts.length===1)raw=await request(c.auth,'/lol-summoner/v1/summoners?name='+encodeURIComponent(query));
   if(!validPuuid(raw?.puuid))fail('未找到该玩家，请核对游戏 ID 和大区');player=profile(raw);
  }else player=profile(c.own);
  const cross=!!server&&server!==c.localServer;if(cross&&(!c.localServer||!SGP_SERVERS[server]))fail('无法确认当前大区，不能进行跨区战绩查询');
  if(cross||!player.name){try{if(cross){const s=SGP_SERVERS[server];const result=await remote(c,server,'league-session',`/summoner-ledge/v1/regions/${s.region}/summoners/puuids`,[player.puuid]);if(!result?.length||result[0].puuid!==player.puuid)fail('此大区未找到该玩家');player={...player,...profile(result[0]),name:player.name||text(result[0].gameName||result[0].summonerName)||'玩家'};}else{const raw=await request(c.auth,'/lol-summoner/v2/summoners/puuid/'+player.puuid);if(raw?.puuid===player.puuid)player=profile(raw);}}catch{if(cross)fail('无法读取该大区玩家资料，请核对大区');}}
  return {player,server,cross,preferred:['auto','lcu','sgp'].includes(p.source)?p.source:'auto',ids:new Map(),epoch:c.epoch};
 }
 async function page(c,p){
  const start=p.start??0,count=p.count??20;if(!Number.isInteger(start)||start<0||start>9900||!Number.isInteger(count)||count<1||count>100||start+count>10000)fail('战绩分页参数不正确');
  let handle=p.handle,t=handle?handles.get(handle):null;if(handle&&!t)fail('战绩会话已失效，请重新查询');if(!t){t=await target(c,p);handle=crypto.randomBytes(16).toString('hex');}
  if(t.epoch!==c.epoch)fail('战绩会话已变化，请重新查询');if(t.cross&&t.preferred==='lcu')fail('客户端数据源不支持跨区查询，请选择游戏后台');
  const local=()=>request(c.auth,`/lol-match-history/v1/products/lol/${t.player.puuid}/matches?begIndex=${start}&endIndex=${start+count-1}`);
  const tag=p.queue?`q_${Number(p.queue)}`:'';if(p.queue!==undefined&&p.queue!==''&&(!Number.isInteger(Number(p.queue))||Number(p.queue)<0||Number(p.queue)>10000))fail('战绩模式参数不正确');
  let raw,source='lcu',notice='';
  if(t.preferred!=='lcu'&&SGP_SERVERS[t.server]){
    try{const games=[];for(let offset=0;offset<count;offset+=20){const chunk=Math.min(20,count-offset),result=await remote(c,t.server,'entitlements',`/match-history-query/v1/products/lol/player/${t.player.puuid}/SUMMARY?startIndex=${start+offset}&count=${chunk}${tag?'&tag='+tag:''}`);if(!Array.isArray(result?.games))fail('游戏后台返回的战绩格式异常');games.push(...result.games.slice(0,chunk));if(result.games.length<chunk)break;}raw={games};source='sgp';}
   catch(error){if(t.cross)throw error;notice='游戏后台暂不可用，已改用当前大区客户端数据';raw=await local();}
  }else{if(t.cross)fail('该大区战绩后台不可用');raw=await local();if(t.preferred==='sgp')notice='未检测到可用的后台大区配置，已使用客户端数据';}
  const entries=source==='sgp'?raw?.games:raw?.games?.games;if(!Array.isArray(entries))fail('客户端尚未返回有效战绩，请稍后重试');
  const games=entries.slice(0,count).map(g=>normalizeMatch(g,source,t.player.puuid)).filter(Boolean);
  // LCU pages can omit identities/full teams. Match Akari's completion pass,
  // bounded to three reads at once and one page, before computing statistics.
  if(source==='lcu')for(let index=0;index<games.length;index+=3)await Promise.all(games.slice(index,index+3).map(async(game,offset)=>{
   if(game.self&&game.participants.length>=10)return;
   try{const complete=normalizeMatch(await request(c.auth,'/lol-match-history/v1/games/'+game.id),'lcu',t.player.puuid);if(complete?.id===game.id)games[index+offset]=complete;}catch{}
  }));
  if(games.some(g=>!g.completeTeams))notice+=(notice?'；':'')+'部分对局队伍资料不完整，参团率、队伍占比和评分暂不可用';
  await check(c);handles.set(handle,t);while(handles.size>12)handles.delete(handles.keys().next().value);
  for(const game of games){t.ids.set(game.id,source);while(t.ids.size>500)t.ids.delete(t.ids.keys().next().value);const key=`${handle}:${game.id}`,current=cache.get(key);put(key,{origin:source,...(current?.origin===source&&current.complete?{}:{game}),at:now()});}
  return {handle,session:sessionId,player:t.player,server:t.server,localServer:c.localServer,cross:t.cross,source,notice,start,count,hasMore:entries.length>=count,games,servers:Object.entries(SGP_SERVERS).map(([id,s])=>({id,name:s.name})),receivedAt:now()};
 }
 async function execute(operation,payload={}){
  if(!['page','search','detail','timeline','profile','replay','clear'].includes(operation))fail('不支持此战绩操作');
  if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('战绩查询参数不正确');if(operation==='clear'){clear();return true;}
  const generation=clearGeneration;return limited(async()=>{
  if(generation!==clearGeneration)fail('战绩会话已变化，请重新查询');
  const c=await context(generation);
  if(generation!==clearGeneration)fail('战绩会话已变化，请重新查询');
  if(operation==='search'){
   const query=text(payload.query);if(!query||query.length>81)fail('请输入游戏名字或完整游戏 ID');
   let results;try{results=await aliases(c.auth,query);}catch{const t=await target(c,payload);results=[{puuid:t.player.puuid,gameName:t.player.name.split('#')[0],tagLine:t.player.name.split('#')[1]||''}];}
   await check(c);return {players:results.map(p=>({puuid:p.puuid,name:p.gameName+(p.tagLine?'#'+p.tagLine:''),server:payload.server||c.localServer})),servers:Object.entries(SGP_SERVERS).map(([id,s])=>({id,name:s.name}))};
  }
  if(operation==='page')return page(c,payload);
  const t=handles.get(payload.handle);if(!t||t.epoch!==c.epoch)fail('战绩会话已失效，请重新查询');
  if(operation==='profile'){
   if(t.cross)return {ranked:[],mastery:[],notice:'跨区排位和熟练度不可用'};
   const values=await Promise.allSettled([request(c.auth,'/lol-ranked/v1/ranked-stats/'+t.player.puuid),request(c.auth,`/lol-champion-mastery/v1/${t.player.puuid}/champion-mastery`)]);
   const ranked=values[0].status==='fulfilled'?values[0].value:null,mastery=values[1].status==='fulfilled'?values[1].value:null;
   await check(c);return {ranked:(Array.isArray(ranked?.queues)?ranked.queues:Object.values(ranked?.queueMap||{})).slice(0,12).map(q=>({queue:text(q.queueType),tier:text(q.tier),division:text(q.division),lp:number(q.leaguePoints),wins:number(q.wins),losses:number(q.losses)})),mastery:(Array.isArray(mastery)?mastery:mastery?.masteries||[]).slice(0,200).map(m=>({champion:number(m.championId),level:number(m.championLevel),points:number(m.championPoints),lastPlay:number(m.lastPlayTime)})),notice:values.some(v=>v.status==='rejected')?'部分排位或熟练度资料暂未读取':''};
  }
  const id=payload.id;if(!Number.isSafeInteger(id)||!t.ids.has(id))fail('请先加载此对局，再查看详情');
  const source=t.ids.get(id),key=`${payload.handle}:${id}`,cached=cache.get(key);
  if(operation==='detail'){
   let game=cached?.complete?cached.game:null,notice=cached?.detailNotice||'';
   if(!game){let raw,actual=source;try{raw=source==='sgp'?await remote(c,t.server,'entitlements',`/match-history-query/v1/products/lol/${SGP_SERVERS[t.server].region}_${id}/SUMMARY`):await request(c.auth,'/lol-match-history/v1/games/'+id);}catch(error){if(source!=='sgp'||t.cross)throw error;raw=await request(c.auth,'/lol-match-history/v1/games/'+id);actual='lcu';notice='后台详情暂不可用，已使用当前大区客户端数据';}game=normalizeMatch(raw,actual,t.player.puuid);if(!game||game.id!==id)fail('对局详情与当前对局不匹配');}
   await check(c);if(t.ids.get(id)!==source)fail('对局数据源已变化，请重新读取详情');put(key,{origin:source,game,complete:true,detailNotice:notice});return {game,notice};
  }
  if(operation==='timeline'){
   let timeline=cached?.timeline,actual=cached?.timelineSource||source,notice=cached?.timelineNotice||'';if(!timeline){let raw;try{raw=source==='sgp'?await remote(c,t.server,'entitlements',`/match-history-query/v1/products/lol/${SGP_SERVERS[t.server].region}_${id}/DETAILS`):await request(c.auth,'/lol-match-history/v1/game-timelines/'+id);}catch(error){if(source!=='sgp'||t.cross)throw error;raw=await request(c.auth,'/lol-match-history/v1/game-timelines/'+id);actual='lcu';notice='后台时间线暂不可用，已使用当前大区客户端数据；部分属性和出装事件可能缺失';}timeline=normalizeTimeline(raw,actual);}
   await check(c);if(t.ids.get(id)!==source)fail('对局数据源已变化，请重新读取时间线');put(key,{origin:source,timeline,timelineSource:actual,timelineNotice:notice});return {id,timeline,source:actual,notice};
  }
  if(t.cross)fail('跨区对局不支持在当前客户端播放回放');
  const action=payload.action;if(!['status','download','watch'].includes(action))fail('回放操作不正确');
  let metadata;try{metadata=await request(c.auth,'/lol-replays/v1/metadata/'+id);}catch{}
  if(!metadata){
   const conf=await request(c.auth,'/lol-replays/v1/configuration');if(conf?.isReplaysEnabled!==true)fail('当前客户端未启用对局回放');
   let game=cached?.game;if(!game?.version){const raw=source==='sgp'?await remote(c,t.server,'entitlements',`/match-history-query/v1/products/lol/${SGP_SERVERS[t.server].region}_${id}/SUMMARY`):await request(c.auth,'/lol-match-history/v1/games/'+id);game=normalizeMatch(raw,source,t.player.puuid);}
   if(!game?.version||game.created===null||game.duration===null||game.queue===null)fail('对局缺少回放所需资料');
   await check(c);await request(c.auth,`/lol-replays/v2/metadata/${id}/create`,'POST',{gameVersion:game.version,gameType:game.gameType,queueId:game.queue,gameEnd:game.created+game.duration*1000});metadata=await request(c.auth,'/lol-replays/v1/metadata/'+id);
  }
  if(action!=='status'){const phase=await request(c.auth,'/lol-gameflow/v1/gameflow-phase');if(!['None','Lobby','EndOfGame','PreEndOfGame'].includes(phase))fail('请在大厅中下载或观看回放');await check(c);await request(c.auth,`/lol-replays/v1/rofls/${id}/${action}`,'POST',{componentType:'replay-button_match-history'});metadata=await request(c.auth,'/lol-replays/v1/metadata/'+id);}
  await check(c);return {id,state:text(metadata?.state),progress:['downloading','watch','download'].includes(metadata?.state)?number(metadata?.downloadProgress):null,action};
 });}
 return {execute,clear};
}
