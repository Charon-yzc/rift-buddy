import crypto from 'node:crypto';
import {discoverClient,lcuRequest} from './lcu.mjs';
import {SGP_SERVERS,sgpServerId,sgpRequest} from './match-history-sgp.mjs';
import {normalizeTimeline,validPuuid,looksLikePuuid,text,number} from '../src/core/match-history/model.mjs';
import {normalizeAkariMatch as normalizeMatch,compactAkariTimeline} from '../src/core/akari/bridge.mjs';
import {riotAliasRequest} from './match-history-riot.mjs';
import {ongoingRoster} from '../src/core/ongoing-game.mjs';
import {cleanPlayerChallenges,cleanPlayerProfile,normalizePublicRanked,normalizePublicMastery} from './match-history-profile.mjs';

const profile=p=>({puuid:p.puuid,name:text(p.gameName||p.displayName||p.summonerName||p.name)+(p.tagLine?'#'+text(p.tagLine):''),level:number(p.summonerLevel||p.level),icon:number(p.profileIconId),privacy:['PUBLIC','PRIVATE'].includes(p.privacy)?p.privacy:'unknown'});
const fail=message=>{throw Error(message);};
// Remember a healthy source without suppressing the other allowed fallback.
const SOURCE_COOLDOWN_MS=60000;
// A session or account change must never be reported as a source outage.
// Only an outage earns a cooldown. A rejected token or a local refusal is
// retried on the next query so a refreshed credential can succeed at once.
// A batch must not hang because one page never answers.
function withDeadline(promise,ms,message){
 let timer=null;
 const guard=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);timer.unref?.();});
 return Promise.race([promise,guard]).finally(()=>{if(timer)clearTimeout(timer);});
}
const isSourceOutage=error=>{const status=Number(error?.status);if(status>=400&&status<=599)return status>=500;return /超时|中断|无法连接|暂不可用|不可达|连接失败/.test(String(error?.message||''));};
const isSessionChange=error=>/会话|账号|重新查询|重新连接/.test(String(error?.message||''));
const HISTORY_SOURCES_ALL_FAILED='战绩数据源暂时不可用：游戏后台与当前大区客户端的战绩接口都返回了错误。这通常是战绩服务正在维护或暂时不可达，请稍后重试。';
// One hero-statistics read returns a bounded batch. The backend page is 20 games,
const SCAN_PAGE=20,SCAN_BATCH=80,SCAN_LOCAL_BATCH=100,SCAN_DEADLINE_MS=15000,FOREGROUND_WAIT_MS=3000;
// A visible read must never hold a concurrency slot indefinitely: three stalled
// transports would stop every later read and leave the page loading forever.
const OPERATION_DEADLINE_MS=8000;
// Paging back and forth re-read the same page from the network every time.
// A short-lived page cache keeps navigation instant; an explicit refresh, or
// a session change, bypasses and drops it.
const LIST_CACHE_MS=60000,LIST_CACHE_MAX=12;
export function createMatchHistoryService({discover=discoverClient,request=lcuRequest,sgp=sgpRequest,aliases=riotAliasRequest,installPath=()=>'',now=Date.now,operationDeadlineMs=OPERATION_DEADLINE_MS}={}){
 let connection='',epoch=0,running=0,clearGeneration=0,sessionId=crypto.randomBytes(16).toString('hex'),rosterCache=null,gsmCache=null,discovery=null,discoveredAt=0,usageScan=null,usageReplay=null,usageRevision=0,foreground=0;const waiting=[],lowWaiting=[],idleWaiters=[],handles=new Map(),cache=new Map(),cacheBytes=new Map(),tokens=new Map(),listCache=new Map();let totalCacheBytes=0;
 const preferredSource=new Map(),failedSource=new Map();
 const rememberSource=(server,source)=>preferredSource.set(server,source);
 const sourceBlocked=(server,source)=>now()<(failedSource.get(server+':'+source)??-Infinity);
 const blockSource=(server,source)=>failedSource.set(server+':'+source,now()+SOURCE_COOLDOWN_MS);
 function resetSession(){connection='';epoch++;sessionId=crypto.randomBytes(16).toString('hex');handles.clear();cache.clear();cacheBytes.clear();tokens.clear();totalCacheBytes=0;listCache.clear();rosterCache=null;gsmCache=null;usageScan=null;usageReplay=null;usageRevision++;preferredSource.clear();failedSource.clear();}
 function clear(){clearGeneration++;discovery=null;discoveredAt=0;resetSession();}
 // Ongoing-game samples and deeper pages wait in a low-priority lane, so a page
 // or player the user opens starts at the next free slot instead of behind them.
 async function limited(fn,low=false){if(waiting.length+lowWaiting.length>=12)fail('战绩查询正在排队，请稍后重试');if(running>=3)await new Promise(resolve=>(low?lowWaiting:waiting).push(resolve));running++;try{return await fn();}finally{running--;(waiting.shift()||lowWaiting.shift())?.();}}
 // The usage scan reads the shared backend quota four pages at a time.
 // A foreground read must not queue behind it, so the scan waits for the
 // running foreground read to finish. The wait is bounded: the scan still
 // progresses when a foreground read stalls.
 function waitForeground(ms){
  if(!foreground)return Promise.resolve();
  return new Promise(resolve=>{
   const entry={resolve:()=>{clearTimeout(timer);resolve();}};
   const timer=setTimeout(()=>{const index=idleWaiters.indexOf(entry);if(index>=0)idleWaiters.splice(index,1);resolve();},ms);
   timer.unref?.();idleWaiters.push(entry);
  });
 }
 function releaseForeground(){if(--foreground>0)return;for(const waiter of idleWaiters.splice(0))waiter.resolve();}
 async function context(generation,fresh=false){
  const startedEpoch=epoch,assertCurrent=()=>{if(generation!==clearGeneration)fail('战绩会话已变化，请重新查询');};
  // Discovery queries the client process through PowerShell (about 0.6 s), so
  // a known connection is reused while the client still answers on it. A
  // failed identity read re-discovers once; a failed discovery is not kept.
  const lookup=async force=>{
   let auth;try{if(force||!discovery||now()<discoveredAt){discoveredAt=now();discovery=discover(typeof installPath==='function'?installPath():installPath,{includeRegion:true});}auth=await discovery;}catch{assertCurrent();if(startedEpoch===epoch){discovery=null;resetSession();}fail('暂时无法读取客户端连接');}assertCurrent();
   if(!auth?.port){if(startedEpoch===epoch){discovery=null;resetSession();}fail(auth?.unreadable?'需要先确认 Windows 权限，再读取战绩':'请先登录并连接英雄联盟客户端');}
   return auth;
  };
  const reused=!fresh&&!!discovery&&now()>=discoveredAt,used=discovery;
  let auth=await lookup(fresh),own,read=false;
  try{own=await request(auth,'/lol-summoner/v1/current-summoner');read=true;}catch{assertCurrent();}
  // Concurrent reads that held the same stale connection share one re-discovery.
  if(!read&&reused){auth=await lookup(discovery===used);try{own=await request(auth,'/lol-summoner/v1/current-summoner');read=true;}catch{assertCurrent();}}
  if(!read){if(startedEpoch===epoch){discovery=null;resetSession();}fail('无法确认当前账号，请重新连接客户端');}
  assertCurrent();
  if(!validPuuid(own?.puuid)){if(startedEpoch===epoch)resetSession();fail('客户端尚未返回当前账号，请等待登录完成后重试');}
  let locale={};if(!auth.region)try{locale=await request(auth,'/riotclient/region-locale');}catch{if(fresh){assertCurrent();if(startedEpoch===epoch)resetSession();fail('无法确认当前大区，请重新连接客户端');}}assertCurrent();
  const localServer=sgpServerId(auth,locale),key=crypto.createHash('sha256').update(JSON.stringify([auth.port,auth.password,own.puuid,localServer])).digest('hex');
  if(connection!==key){if(startedEpoch!==epoch)fail('客户端会话已变化，请重新查询');resetSession();connection=key;}
  return {auth,own,localServer,key,epoch};
 }
 async function check(c){if(c.epoch!==epoch||connection!==c.key)fail('账号或客户端会话已变化，请重新加载战绩');let own;try{own=await request(c.auth,'/lol-summoner/v1/current-summoner');}catch{if(c.epoch===epoch)clear();fail('客户端会话已变化，请重新加载战绩');}if(own?.puuid!==c.own.puuid||c.epoch!==epoch||connection!==c.key){if(c.epoch===epoch)clear();fail('账号或客户端会话已变化，请重新加载战绩');}}
 async function checkUsage(c){if(c.epoch!==epoch||connection!==c.key)fail('英雄统计会话已变化，请重新读取');const fresh=await context(clearGeneration,true);if(c.epoch!==fresh.epoch||c.key!==fresh.key)fail('英雄统计会话已变化，请重新读取');}
 function put(key,value){const current=cache.get(key);const merged=current?.origin===value.origin?{...current,...value}:value;totalCacheBytes-=cacheBytes.get(key)||0;cache.delete(key);cacheBytes.delete(key);const bytes=JSON.stringify(merged).length*2;if(bytes<=48_000_000){cache.set(key,merged);cacheBytes.set(key,bytes);totalCacheBytes+=bytes;}while(cache.size>128||totalCacheBytes>48_000_000){const oldest=cache.keys().next().value;totalCacheBytes-=cacheBytes.get(oldest)||0;cache.delete(oldest);cacheBytes.delete(oldest);}return merged;}
 function assertSession(c){if(c.epoch!==epoch||c.key!==connection)fail('账号或客户端会话已变化，请重新加载战绩');}
 const completedKey=(c,id)=>`lcu-game:${c.localServer}:${id}`;
 function keepCompleted(c,id,raw){assertSession(c);put(completedKey(c,id),{origin:'lcu',raw,at:now()});}
 async function remote(c,server,kind,path,body){
  assertSession(c);const cached=tokens.get(kind),age=cached?now()-cached.at:-1;let token;
  if(cached&&age>=0&&age<60000)token=cached.value;
  else{
   const response=await request(c.auth,kind==='entitlements'?'/entitlements/v1/token':'/lol-league-session/v1/league-session-token');
   assertSession(c);
   token=kind==='entitlements'?response?.accessToken:response;
   if(typeof token!=='string'||!token)fail('战绩后台认证尚未就绪，请稍后重试或使用客户端数据源');
   tokens.set(kind,{value:token,at:now()});
  }
  assertSession(c);
  try{return await sgp({server,route:path,token,common:kind!=='entitlements',...(body?{method:'POST',body}:{})});}
  catch(error){
   if([401,403].includes(error?.status)&&c.epoch===epoch&&c.key===connection&&tokens.get(kind)?.value===token)tokens.delete(kind);
   throw error;
  }
 }
 async function roster(c,p){
  const phase=await request(c.auth,'/lol-gameflow/v1/gameflow-phase');
  const safe=async route=>{try{return await request(c.auth,route);}catch{return null;}};
  const [lobby,draft,game]=await Promise.all([['None','Lobby','Matchmaking','ReadyCheck'].includes(phase)?safe('/lol-lobby/v2/lobby'):null,phase==='ChampSelect'?safe('/lol-champ-select/v1/session'):null,safe('/lol-gameflow/v1/session')]);
  const after=await request(c.auth,'/lol-gameflow/v1/gameflow-phase');if(after!==phase)fail('对局阶段已变化，正在重新同步');
  let additional=null;
  if(['InProgress','Reconnect','WaitingForStats','PreEndOfGame','EndOfGame'].includes(phase)&&SGP_SERVERS[c.localServer]&&Number.isSafeInteger(game?.gameData?.gameId)){
   const id=game.gameData.gameId;
   if(gsmCache?.id===id&&now()-gsmCache.at<30000)additional=gsmCache.value;
    else try{
     const result=await remote(c,c.localServer,'league-session',`/gsm/v1/ledge/region/${SGP_SERVERS[c.localServer].region}/puuid/${c.own.puuid}`),raw=result?.game;
     if(raw?.id===id){
      // Sanitize the two transport arrays separately so Arena's combined display
      // grouping cannot discard either array before the final roster is built.
      const clean=ongoingRoster({phase,own:c.own,game:{gameData:{gameId:id,queue:{id:game.gameData.queue?.id,gameMode:'CLASSIC'},teamOne:raw.teamOne,teamTwo:raw.teamTwo,playerChampionSelections:raw.playerChampionSelections}}},sessionId);
      const player=v=>({puuid:v.puuid,summonerId:v.summonerId,summonerName:v.name,nameVisibilityType:v.hidden?'HIDDEN':'VISIBLE',championId:v.champion,selectedPosition:v.position,profileIconId:v.icon,teamParticipantId:v.group,spell1Id:v.spells[0],spell2Id:v.spells[1],selectedRole:v.role?[v.role.current,v.role.assignmentReason,v.role.primary,v.role.secondary,v.role.fill].join('.'):''});
      additional={gameId:id,teamOne:clean.players.filter(v=>v.team==='TEAM-100').map(player),teamTwo:clean.players.filter(v=>v.team==='TEAM-200').map(player)};await check(c);gsmCache={id,at:now(),value:additional};
     }
    }catch{}
  }
  const result=ongoingRoster({phase,own:c.own,lobby,draft,game,additional},sessionId);
  const unresolved=result.players.filter(player=>!player.hidden&&!player.puuid&&player.summonerId);
  for(let index=0;index<unresolved.length;index+=3)await Promise.all(unresolved.slice(index,index+3).map(async player=>{
   const raw=player.summonerId===c.own.summonerId?c.own:await safe('/lol-summoner/v1/summoners/'+player.summonerId);
    if(Number(raw?.summonerId)!==player.summonerId||!validPuuid(raw?.puuid))return;
   player.puuid=raw.puuid;player.name=profile(raw).name||player.name;player.self=raw.puuid===c.own.puuid;
  }));
   const finalPhase=await request(c.auth,'/lol-gameflow/v1/gameflow-phase');if(finalPhase!==phase)fail('对局阶段已变化，正在重新同步');
   if(phase==='ChampSelect'||['None','Lobby','Matchmaking','ReadyCheck'].includes(phase)){
    const finalSnapshot=await safe(phase==='ChampSelect'?'/lol-champ-select/v1/session':'/lol-lobby/v2/lobby'),before=ongoingRoster({phase,own:c.own,lobby,draft,game},sessionId),after=ongoingRoster({phase,own:c.own,lobby:phase==='ChampSelect'?lobby:finalSnapshot,draft:phase==='ChampSelect'?finalSnapshot:draft,game},sessionId);
    if(!finalSnapshot||before.key!==after.key)fail('当前对局成员已变化，正在重新同步');
   }
  if(['GameStart','InProgress','Reconnect'].includes(phase)){const finalGame=await safe('/lol-gameflow/v1/session');if(finalGame?.gameData?.gameId!==game?.gameData?.gameId)fail('当前对局已变化，正在重新同步');}
  await check(c);
  const previous=rosterCache?.key===result.key?rosterCache:null;rosterCache={key:result.key,at:now(),players:result.players};
  for(const player of result.players){if(player.puuid)continue;if(!player.hidden&&player.summonerId){const known=previous?.players.find(v=>v.key===player.key&&v.summonerId===player.summonerId);if(known?.puuid)Object.assign(player,{puuid:known.puuid,name:known.name||player.name});}}
  result.server=c.localServer;result.connected=true;return result;
 }
 async function target(c,p){
  const server=p.server||c.localServer;if(server&&server!==c.localServer&&!SGP_SERVERS[server])fail('不支持此战绩大区');
  let player;
  if(p.puuid){if(!validPuuid(p.puuid))fail('玩家标识格式不正确');player={puuid:p.puuid,name:''};}
  else if(p.query){
   const query=text(p.query);if(!query||query.length>81)fail('请输入有效的游戏 ID');
   if(looksLikePuuid(query)){player={puuid:query,name:''};}
   else{
   const parts=query.split('#');let raw;
   if(parts.length===2&&parts.every(Boolean)){
    try{const results=await aliases(c.auth,query);if(results[0])raw=results[0];}catch{}
    if(!raw){const result=await request(c.auth,'/lol-summoner/v1/summoners/aliases','POST',[{gameName:parts[0],tagLine:parts[1]}]);raw=result?.[0];}
   }
   else if(parts.length===1)raw=await request(c.auth,'/lol-summoner/v1/summoners?name='+encodeURIComponent(query));
   if(!validPuuid(raw?.puuid))fail('未找到该玩家，请核对游戏 ID 和大区');player=profile(raw);}
  }else player=profile(c.own);
  const cross=!!server&&server!==c.localServer;if(cross&&(!c.localServer||!SGP_SERVERS[server]))fail('无法确认当前大区，不能进行跨区战绩查询');
   if(cross||!player.name){try{if(cross){const s=SGP_SERVERS[server];const result=await remote(c,server,'league-session',`/summoner-ledge/v1/regions/${s.region}/summoners/puuids`,[player.puuid]);if(!result?.length||result[0].puuid!==player.puuid)fail('此大区未找到该玩家');const found=profile(result[0]);player={...player,...found,name:player.name||found.name||'玩家'};}else{const raw=await request(c.auth,'/lol-summoner/v2/summoners/puuid/'+player.puuid);if(raw?.puuid===player.puuid)player=profile(raw);}}catch{if(cross)fail('无法读取该大区玩家资料，请核对大区');}}
  return {player,server,cross,preferred:['auto','lcu','sgp'].includes(p.source)?p.source:'auto',ids:new Map(),epoch:c.epoch};
 }
 // Recommendation counts deliberately bypass page(): its missing-team completion
 // fetches individual games. This scan reads at most500 summary records only.
 async function ownSummaryPage(c,p){
  if(Object.keys(p).some(key=>!['cursor','source','session'].includes(key))||p.source!==undefined&&!['auto','lcu','sgp'].includes(p.source))fail('英雄统计参数不正确');
  if(p.session!==undefined&&p.session!==sessionId)fail('英雄统计会话已变化，请重新读取');
  // A helper response can be lost after commit. Replaying the one previous
  // request returns its immutable cumulative result; it never reads/advances.
  if(typeof p.cursor==='string'&&usageReplay?.cursor===p.cursor){const replay=usageReplay.scan;await checkUsage(c);return usageResult(replay);}
  if(p.cursor!==undefined&&(typeof p.cursor!=='string'||!usageScan||p.cursor!==usageScan.cursor||usageScan.epoch!==c.epoch))fail('英雄统计会话已变化，请重新读取');
  const scan=p.cursor?usageScan:{cursor:crypto.randomBytes(16).toString('hex'),epoch:c.epoch,scanned:0,identified:0,counts:{},seen:new Set(),source:p.source==='lcu'||!SGP_SERVERS[c.localServer]?'lcu':'sgp',complete:false};
  const revision=++usageRevision;
  if(scan.complete){await checkUsage(c);if(revision!==usageRevision)fail('英雄统计已重新开始，请忽略旧结果');return usageResult(scan);}
  const start=scan.scanned;let source=scan.source,count=Math.min(source==='sgp'?(start?SCAN_BATCH:SCAN_PAGE):SCAN_LOCAL_BATCH,500-start),entries;
  // Each page uses an independent offset; counts need no per-game details.
  if(source==='sgp'){
   // Yield the backend to a running foreground read before fanning out.
   await waitForeground(FOREGROUND_WAIT_MS);
   try{entries=await summaryPages(c,c.localServer,c.own.puuid,start,count);}
   catch{await check(c);if(revision!==usageRevision)fail('英雄统计已重新开始，请忽略旧结果');if(start)fail('英雄统计暂时中断，已保留读取结果，请重试');source='lcu';count=Math.min(SCAN_LOCAL_BATCH,500-start);}
  }
  if(source==='lcu'){const result=await request(c.auth,`/lol-match-history/v1/products/lol/${c.own.puuid}/matches?begIndex=${start}&endIndex=${start+count-1}`);if(!Array.isArray(result?.games?.games))fail('客户端尚未返回有效战绩，请稍后重试');entries=result.games.games;}
  const next={...scan,cursor:crypto.randomBytes(16).toString('hex'),source,counts:{...scan.counts},seen:new Set(scan.seen)};
  for(const entry of entries.slice(0,count)){
   next.scanned++;const game=source==='sgp'?entry?.json:entry;
   if(!Number.isSafeInteger(game?.gameId)||game.gameId<=0||next.seen.has(game.gameId))continue;next.seen.add(game.gameId);
   const players=Array.isArray(game.participants)?game.participants.slice(0,30):[],identities=Array.isArray(game.participantIdentities)?game.participantIdentities.slice(0,30):[];
   const ownPlayers=source==='sgp'?players.filter(player=>player?.puuid===c.own.puuid):players.filter(player=>{if(!Number.isSafeInteger(player?.participantId)||player.participantId<=0)return false;const matches=identities.filter(identity=>identity?.participantId===player.participantId);return matches.length===1&&matches[0]?.player?.puuid===c.own.puuid;});
   if(ownPlayers.length!==1)continue;const hero=ownPlayers[0].championId;if(!Number.isSafeInteger(hero)||hero<=0||hero>10000)continue;
   next.identified++;next.counts[hero]=(next.counts[hero]||0)+1;
  }
  next.complete=next.scanned>=500||entries.length<count;
  await checkUsage(c);if(revision!==usageRevision)fail('英雄统计已重新开始，请忽略旧结果');usageReplay=p.cursor?{cursor:p.cursor,scan:next}:null;usageScan=next;return usageResult(next);
 }
 function usageResult(scan){return {session:sessionId,cursor:scan.cursor,scanned:scan.scanned,identified:scan.identified,target:500,complete:scan.complete,source:scan.source,counts:{...scan.counts}};}
 // Start a bounded set together, then consume only its contiguous prefix.
 // A short page ends history; speculative later failures cannot erase it.
 async function summaryPages(c,server,puuid,start,count,tag=''){
  const chunks=[];for(let offset=0;offset<count;offset+=SCAN_PAGE)chunks.push([offset,Math.min(SCAN_PAGE,count-offset)]);
  const pending=chunks.map(async([offset,chunk])=>{
   const result=await remote(c,server,'entitlements',`/match-history-query/v1/products/lol/player/${puuid}/SUMMARY?startIndex=${start+offset}&count=${chunk}${tag?'&tag='+tag:''}`);assertSession(c);
   if(!Array.isArray(result?.games))fail('游戏后台返回的战绩格式异常');return result.games.slice(0,chunk);
  }).map(promise=>promise.then(games=>({games}),error=>({error})));
  return withDeadline((async()=>{const entries=[];for(let i=0;i<pending.length;i++){
   assertSession(c);const part=await pending[i];assertSession(c);if(part.error)throw part.error;entries.push(...part.games);if(part.games.length<chunks[i][1])break;
  }return entries;})(),SCAN_DEADLINE_MS,'英雄战绩读取超时');
 }
 async function loadList(c,t,{start,count,tag,batch=false}){
  const server=t.server,hasBackend=!!SGP_SERVERS[server];
  const backendAllowed=hasBackend&&t.preferred!=='lcu';
  const localAllowed=!t.cross;
  const readLocal=async()=>{const raw=await request(c.auth,`/lol-match-history/v1/products/lol/${t.player.puuid}/matches?begIndex=${start}&endIndex=${start+count-1}`);const entries=raw?.games?.games;if(!Array.isArray(entries))fail('客户端尚未返回有效战绩，请稍后重试');return {raw,source:'lcu',entries};};
  const readBackend=async()=>{const games=await summaryPages(c,server,t.player.puuid,start,count,tag);return {raw:{games},source:'sgp',entries:games};};
  // The first page is what the user waits for. A healthy client answers it in
  // tens of milliseconds, while the game backend needs about a second and shares
  // a rate limit with the usage scan. Deeper pages keep the order that last
  // worked: the client route cannot page past its own recent window on every
  // build, so it is only trusted for the first page. A roster batch is the
  // exception: the client serves other players' histories one at a time (about
  // a second each, so ten cards fill one by one), while the backend answers
  // three at once in about the same time.
  const localFirst=t.preferred==='lcu'||t.preferred==='auto'&&start===0&&!batch;
  const preferred=t.preferred==='sgp'?'sgp':localFirst?'lcu':preferredSource.get(server),order=preferred==='lcu'?['lcu','sgp']:['sgp','lcu'];
  const attempts=order.filter(source=>(source==='sgp'?backendAllowed:localAllowed)&&!sourceBlocked(server,source));
  if(!attempts.length){
   if(t.cross)fail('该大区战绩后台不可用');
   if(!backendAllowed)fail('当前大区客户端战绩接口暂不可用，请稍后重试');
   fail(HISTORY_SOURCES_ALL_FAILED);
  }
  let lastError=null,emptyLocal=null,backendFailed=sourceBlocked(server,'sgp');
  const resultOf=result=>{assertSession(c);if(start>0)rememberSource(server,result.source);const notice=result.source==='lcu'&&backendAllowed&&backendFailed?'游戏后台暂不可用，已改用当前大区客户端数据':result.source==='lcu'&&t.preferred==='sgp'&&!hasBackend?'未检测到可用的后台大区配置，已使用客户端数据':'';return {raw:result.raw,source:result.source,notice};};
  for(const source of attempts){
   assertSession(c);
   try{
    const result=await (source==='sgp'?readBackend():readLocal());assertSession(c);
    if(source==='lcu'&&!result.entries.length&&attempts.includes('sgp')&&!backendFailed){emptyLocal=result;continue;}
    return resultOf(result);
   }catch(error){
    assertSession(c);lastError=error;
    if(isSessionChange(error))throw error;
    if(source==='sgp')backendFailed=true;
    if(isSourceOutage(error))blockSource(server,source);
    if(source==='sgp'&&t.cross)throw error;
   }
  }
  if(emptyLocal)return resultOf(emptyLocal);
  if(t.cross)throw lastError||Error('该大区战绩后台不可用');
  if(!backendAllowed)throw lastError||Error('当前大区客户端战绩接口暂不可用，请稍后重试');
  fail(HISTORY_SOURCES_ALL_FAILED);
 }
 async function page(c,p){
  const start=p.start??0,count=p.count??20;if(!Number.isInteger(start)||start<0||start>9900||!Number.isInteger(count)||count<1||count>100||start+count>10000)fail('战绩分页参数不正确');
  if(p.rosterKey&&(!rosterCache||rosterCache.key!==p.rosterKey||now()-rosterCache.at>15000||!rosterCache.players.some(v=>v.puuid===p.puuid&&!v.hidden)))fail('当前对局成员已变化，请刷新实时对局');
   let handle=p.handle,t=handle?handles.get(handle):null;if(handle&&!t)fail('战绩会话已失效，请重新查询');if(!t){t=await target(c,p);handle=crypto.randomBytes(16).toString('hex');}
   if(p.rosterKey&&t.player.puuid!==p.puuid)fail('对局成员与查询句柄不匹配');
  if(t.epoch!==c.epoch)fail('战绩会话已变化，请重新查询');if(t.cross&&t.preferred==='lcu')fail('客户端数据源不支持跨区查询，请选择游戏后台');
  const tag=p.queue?`q_${Number(p.queue)}`:'';
  const pageKey=`${handle}|${start}|${count}|${tag}|${t.preferred}`;if(p.queue!==undefined&&p.queue!==''&&(!Number.isInteger(Number(p.queue))||Number(p.queue)<0||Number(p.queue)>10000))fail('战绩模式参数不正确');
  const cachedPage=p.fresh===true?null:listCache.get(pageKey);
  if(cachedPage&&now()-cachedPage.at<LIST_CACHE_MS)return {...cachedPage.value,games:[...cachedPage.value.games]};
  const loaded=await loadList(c,t,{start,count,tag,batch:p.batch===true});
  const raw=loaded.raw,source=loaded.source;let notice=loaded.notice;
  const entries=source==='sgp'?raw?.games:raw?.games?.games;if(!Array.isArray(entries))fail('客户端尚未返回有效战绩，请稍后重试');
  const games=entries.slice(0,count).map(g=>normalizeMatch(g,source,t.player.puuid)).filter(Boolean);
  // LCU pages can omit identities/full teams. Match Akari's completion pass,
  // Bound each completion batch; cached raw games share the same 48 MB budget
  // and session invalidation as normalized details and timelines.
  if(source==='lcu'){
   const pending=[];
   for(let i=0;i<games.length;i++){
    const game=games[i];
    if(game.self&&game.participants.length>=10)continue;
    assertSession(c);const key=completedKey(c,game.id),raw=cache.get(key)?.raw;
    if(raw){
     const complete=normalizeMatch(raw,'lcu',t.player.puuid);
     if(complete?.id===game.id){put(key,cache.get(key));games[i]=complete;continue;}
    }
    pending.push({game,index:i});
   }
   for(let index=0;index<pending.length;index+=8){
    await Promise.all(pending.slice(index,index+8).map(async({game,index:i})=>{
     try{
      const raw=await request(c.auth,'/lol-match-history/v1/games/'+game.id);
      const complete=normalizeMatch(raw,'lcu',t.player.puuid);
      if(complete?.id===game.id){keepCompleted(c,game.id,raw);games[i]=complete;}
     }catch{}
    }));
   }
  }
  if(games.some(g=>!g.completeTeams))notice+=(notice?'；':'')+'部分对局队伍资料不完整，参团率、队伍占比和评分暂不可用';
   // The all-player raw matrix is fetched with the explicit detail action.
   // Keep hundred-game pages small enough for the bounded authorized pipe.
   for(const game of games)for(const player of game.participants)delete player.publicStats;
  await check(c);if(p.rosterKey&&rosterCache?.key!==p.rosterKey)fail('当前对局已变化，已忽略旧查询');handles.set(handle,t);while(handles.size>48)handles.delete(handles.keys().next().value);
  for(const game of games){t.ids.set(game.id,source);while(t.ids.size>500)t.ids.delete(t.ids.keys().next().value);const key=`${handle}:${game.id}`,current=cache.get(key);put(key,{origin:source,...(current?.origin===source&&current.complete?{}:{game}),at:now()});}
  const result={handle,session:sessionId,player:t.player,server:t.server,localServer:c.localServer,cross:t.cross,source,notice,start,count,hasMore:entries.length>=count,games,servers:Object.entries(SGP_SERVERS).map(([id,s])=>({id,name:s.name})),receivedAt:now()};
  listCache.delete(pageKey);listCache.set(pageKey,{at:now(),value:result});
  while(listCache.size>LIST_CACHE_MAX)listCache.delete(listCache.keys().next().value);
  return result;
 }
 async function execute(operation,payload={}){
    if(!['own-summary-context','own-summary-page','page','search','roster','detail','timeline','profile','challenges','replay','replay-status','clear'].includes(operation))fail('不支持此战绩操作');
  if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('战绩查询参数不正确');if(operation==='clear'){clear();return true;}
  const generation=clearGeneration,background=operation==='own-summary-page';return limited(async()=>{
  if(!background)foreground++;
  try{
   const work=async()=>{
    if(generation!==clearGeneration)fail('战绩会话已变化，请重新查询');
   const c=await context(generation,operation==='own-summary-context');
   if(generation!==clearGeneration)fail('战绩会话已变化，请重新查询');
   if(operation==='own-summary-context')return {session:sessionId,server:c.localServer,cacheKey:SGP_SERVERS[c.localServer]?crypto.createHash('sha256').update(JSON.stringify(['own-champion-usage-v1',c.localServer,c.own.puuid])).digest('hex'):''};
   if(operation==='own-summary-page')return await ownSummaryPage(c,payload);
   if(operation==='roster')return await roster(c,payload);
  if(operation==='search'){
   const query=text(payload.query);if(!query||query.length>81)fail('请输入游戏名字或完整游戏 ID');
    let results;try{results=await aliases(c.auth,query);}catch{const t=await target(c,payload);results=[{puuid:t.player.puuid,gameName:t.player.name.split('#')[0],tagLine:t.player.name.split('#')[1]||''}];}
    const server=payload.server||c.localServer;if(server&&server!==c.localServer&&!SGP_SERVERS[server])fail('不支持此战绩大区');results=results.filter(p=>validPuuid(p.puuid)).slice(0,50);let players=[];
    if(SGP_SERVERS[server]){try{const raw=await remote(c,server,'league-session',`/summoner-ledge/v1/regions/${SGP_SERVERS[server].region}/summoners/puuids`,results.map(p=>p.puuid));players=(Array.isArray(raw)?raw:[]).filter(p=>results.some(v=>v.puuid===p.puuid)).map(p=>{const alias=results.find(v=>v.puuid===p.puuid);return {...profile(p),name:alias?.gameName?alias.gameName+(alias.tagLine?'#'+alias.tagLine:''):profile(p).name,server};});}catch(error){if(server!==c.localServer)throw error;}}
    if(!SGP_SERVERS[server]||!players.length&&server===c.localServer){for(let i=0;i<results.length;i+=3)await Promise.all(results.slice(i,i+3).map(async alias=>{try{const raw=await request(c.auth,'/lol-summoner/v2/summoners/puuid/'+alias.puuid);if(raw?.puuid===alias.puuid)players.push({...profile(raw),name:alias.gameName?alias.gameName+(alias.tagLine?'#'+alias.tagLine:''):profile(raw).name,server});}catch{}}));}
    await check(c);return {players,servers:Object.entries(SGP_SERVERS).map(([id,s])=>({id,name:s.name}))};
  }
  if(operation==='page')return await page(c,payload);
  const t=handles.get(payload.handle);if(!t||t.epoch!==c.epoch)fail('战绩会话已失效，请重新查询');
  if(operation==='challenges'){
   if(!SGP_SERVERS[t.server])fail('当前大区未提供挑战数据源');
   const raw=await remote(c,t.server,'league-session',`/challenges-client/v2/all-player-data/?puuid=${t.player.puuid}`,[]);if(raw?.puuid!==t.player.puuid)fail('挑战数据与当前玩家不匹配');await check(c);return cleanPlayerChallenges(raw);
  }
  if(operation==='profile'){
   if(t.cross)return {ranked:[],mastery:[],notice:'跨区排位和熟练度不可用'};
   const values=await Promise.allSettled([request(c.auth,'/lol-ranked/v1/ranked-stats/'+t.player.puuid),request(c.auth,`/lol-champion-mastery/v1/${t.player.puuid}/champion-mastery`),request(c.auth,'/lol-summoner/v1/summoner-profile?puuid='+t.player.puuid)]);
   const ranked=values[0].status==='fulfilled'?values[0].value:null,mastery=values[1].status==='fulfilled'?values[1].value:null;
    await check(c);return {ranked:normalizePublicRanked(ranked),...normalizePublicMastery(mastery),cosmetics:values[2].status==='fulfilled'?cleanPlayerProfile(values[2].value):null,notice:values.some(v=>v.status==='rejected')?'部分排位、熟练度或主页资料暂未读取':''};
  }
  const id=payload.id;if(!Number.isSafeInteger(id)||!t.ids.has(id))fail('请先加载此对局，再查看详情');
  const source=t.ids.get(id),key=`${payload.handle}:${id}`,cached=cache.get(key);
  if(operation==='detail'){
   let game=cached?.complete?cached.game:null,notice=cached?.detailNotice||'';
   if(!game){
    assertSession(c);let raw,actual=source;
    try{raw=source==='sgp'?await remote(c,t.server,'entitlements',`/match-history-query/v1/products/lol/${SGP_SERVERS[t.server].region}_${id}/SUMMARY`):cache.get(completedKey(c,id))?.raw||await request(c.auth,'/lol-match-history/v1/games/'+id);}
    catch(error){
     if(t.cross)throw error;
     if(source==='sgp'){raw=await request(c.auth,'/lol-match-history/v1/games/'+id);actual='lcu';notice='后台详情暂不可用，已使用当前大区客户端数据';}
     else{const remoteServer=SGP_SERVERS[t.server];if(!remoteServer)throw error;raw=await remote(c,t.server,'entitlements',`/match-history-query/v1/products/lol/${remoteServer.region}_${id}/SUMMARY`);actual='sgp';notice='客户端详情暂不可用，已改用游戏后台数据';}
    }
    game=normalizeMatch(raw,actual,t.player.puuid);if(!game||game.id!==id)fail('对局详情与当前对局不匹配');
    if(actual==='lcu')keepCompleted(c,id,raw);
   }
   await check(c);if(t.ids.get(id)!==source)fail('对局数据源已变化，请重新读取详情');put(key,{origin:source,game,complete:true,detailNotice:notice});return {game,notice};
  }
  if(operation==='timeline'){
   // The client timeline route returns only kills, epic monsters and buildings.
   // An automatic first page is read locally for speed, so its timelines still
   // come from the backend; only an explicit client source keeps the client route.
   const primary=source==='lcu'&&t.preferred!=='lcu'&&SGP_SERVERS[t.server]&&!sourceBlocked(t.server,'sgp')?'sgp':source;
   let timeline=cached?.timeline,actual=cached?.timelineSource||primary,notice=cached?.timelineNotice||'';if(!timeline){let raw;try{raw=primary==='sgp'?await remote(c,t.server,'entitlements',`/match-history-query/v1/products/lol/${SGP_SERVERS[t.server].region}_${id}/DETAILS`):await request(c.auth,'/lol-match-history/v1/game-timelines/'+id);}catch(error){
    if(t.cross)throw error;
    if(primary==='sgp'){raw=await request(c.auth,'/lol-match-history/v1/game-timelines/'+id);actual='lcu';notice='后台时间线暂不可用，已使用当前大区客户端数据；部分属性和出装事件可能缺失';}
    else{const remoteServer=SGP_SERVERS[t.server];if(!remoteServer)throw error;raw=await remote(c,t.server,'entitlements',`/match-history-query/v1/products/lol/${remoteServer.region}_${id}/DETAILS`);actual='sgp';notice='客户端时间线暂不可用，已改用游戏后台数据';}
   }timeline=normalizeTimeline(raw,actual);}
   await check(c);if(t.ids.get(id)!==source)fail('对局数据源已变化，请重新读取时间线');
   // Ongoing-game analysis reads only positions, levels, farm, damage, kills and
   // epic monsters: return that compact copy (about a twentieth of the bytes over
   // the helper pipe and IPC) and keep the full timeline out of the shared cache.
   if(payload.compact===true)return {id,timeline:compactAkariTimeline(timeline),source:actual,notice};
   put(key,{origin:source,timeline,timelineSource:actual,timelineNotice:notice});return {id,timeline,source:actual,notice};
  }
   if(t.cross)fail('跨区对局不支持在当前客户端播放回放');
   if(operation==='replay-status'){const metadata=await request(c.auth,'/lol-replays/v1/metadata/'+id);await check(c);return {id,state:text(metadata?.state),progress:['downloading','watch','download'].includes(metadata?.state)?number(metadata?.downloadProgress):null};}
  const action=payload.action;if(!['status','download','watch'].includes(action))fail('回放操作不正确');
  let metadata;try{metadata=await request(c.auth,'/lol-replays/v1/metadata/'+id);}catch{}
  if(!metadata){
   const conf=await request(c.auth,'/lol-replays/v1/configuration');if(conf?.isReplaysEnabled!==true)fail('当前客户端未启用对局回放');
   let game=cached?.game;if(!game?.version){const raw=source==='sgp'?await remote(c,t.server,'entitlements',`/match-history-query/v1/products/lol/${SGP_SERVERS[t.server].region}_${id}/SUMMARY`):await request(c.auth,'/lol-match-history/v1/games/'+id);game=normalizeMatch(raw,source,t.player.puuid);}
    const version=game?.version||(source==='lcu'?text(conf.gameVersion):'');if(!version||game.created===null||game.duration===null||game.queue===null)fail('对局缺少回放所需资料');
    await check(c);await request(c.auth,`/lol-replays/v2/metadata/${id}/create`,'POST',{gameVersion:version,gameType:game.gameType,queueId:game.queue,gameEnd:game.created+game.duration*1000});metadata=await request(c.auth,'/lol-replays/v1/metadata/'+id);
  }
  if(action!=='status'){const phase=await request(c.auth,'/lol-gameflow/v1/gameflow-phase');if(!['None','Lobby','EndOfGame','PreEndOfGame'].includes(phase))fail('请在大厅中下载或观看回放');await check(c);await request(c.auth,`/lol-replays/v1/rofls/${id}/${action}`,'POST',{componentType:'replay-button_match-history'});metadata=await request(c.auth,'/lol-replays/v1/metadata/'+id);}
  await check(c);return {id,state:text(metadata?.state),progress:['downloading','watch','download'].includes(metadata?.state)?number(metadata?.downloadProgress):null,action};
   };
   // A timed-out operation keeps running; swallow its late rejection so the
   // main process never sees an unhandled promise.
   const pending=work();pending.catch(()=>{});
   return background?await pending:await withDeadline(pending,operationDeadlineMs,'战绩查询超时，请重试');
 }finally{if(!background)releaseForeground();}
 },payload.background===true&&['page','timeline'].includes(operation));}
 return {execute,clear};
}
