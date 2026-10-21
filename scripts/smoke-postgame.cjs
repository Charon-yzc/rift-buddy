const {app,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),http=require('node:http'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],writes=[],errors=[],cacheSmoke=process.env.RIFT_BUDDY_USAGE_CACHE_SMOKE,usageSmoke=process.env.RIFT_BUDDY_USAGE_SMOKE==='1',roomUsageSmoke=process.env.RIFT_BUDDY_ROOM_USAGE_SMOKE==='1',historyReads=[],roomSockets=[],roomFrames=[];let main,observer,offline=false,clientPhase='Lobby',holdUsage=false,releaseUsage=null;
app.setPath('userData',root);globalShortcut.register=()=>false;
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);window.webContents.on('console-message',(_event,_level,message)=>{if(typeof message==='string'&&/TypeError|ReferenceError|SyntaxError/.test(message))errors.push(message);});});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
global.fetch=async()=>{throw Error('External network disabled');};http.request=()=>{throw Error('Real network forbidden');};
// No WebSocket or relay request leaves this isolated process. Real main IPC,
// room service, publisher and renderer workers still run unchanged.
if(roomUsageSmoke)global.WebSocket=class {
 constructor(url){this.url=url;this.readyState=0;this.bufferedAmount=0;roomSockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}
 receive(frame){this.onmessage?.({data:JSON.stringify(frame)});}
 send(text){const frame=JSON.parse(text);roomFrames.push(frame);if(frame.kind==='hello')queueMicrotask(()=>this.receive({kind:'welcome',v:1,room:new URL(this.url).pathname.split('/').at(-1),members:[{nick:frame.nick,packedStates:2},{nick:'示例队友#TEST',packedStates:2}],ballots:1,multiVotes:1,adoptions:1,packedStates:2,championUsage:1}));if(frame.kind==='ping')queueMicrotask(()=>this.receive({kind:'pong',v:1}));}
 close(code=1000){this.readyState=3;this.onclose?.({code});}
};
const own={puuid:'fixture-own-player-0001',summonerId:1,gameName:'战绩测试玩家',tagLine:'TEST',summonerLevel:100},friend={puuid:'fixture-friend-player-2',summonerId:2,gameName:'示例队友',tagLine:'TEST'};
function game(id){const identities=[own,friend,...Array.from({length:8},(_,i)=>({puuid:'fixture-public-player-'+(i+3),gameName:'模拟玩家'+(i+3),tagLine:'TEST'}))];return {gameId:id,gameCreation:Date.now()-id*3600000,gameDuration:1800,gameMode:'CLASSIC',gameType:'MATCHED_GAME',gameVersion:'16.20',queueId:420,mapId:11,teams:[],participantIdentities:identities.map((p,i)=>({participantId:i+1,player:p})),participants:identities.map((p,i)=>({participantId:i+1,championId:[22,412,99,86,64,103,51,89,122,17][i],teamId:i<5?100:200,spell1Id:4,spell2Id:7,stats:{kills:8,deaths:2,assists:10,win:i<5?id%2===1:id%2===0,totalDamageDealtToChampions:25000,totalDamageTaken:15000,goldEarned:12000,totalMinionsKilled:140,neutralMinionsKilled:20,totalHeal:2000,visionScore:30,champLevel:16,item0:3006,item1:3031,perk0:8005,perkPrimaryStyle:8000,perkSubStyle:8100}}))};}
let settlement=null,settlementReads=0,holdSettlement=false,releaseSettlement=null;
const output=options=>{assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);const route=options.path,method=options.method||'GET';if(offline)throw Error('fixture offline');
 if(route==='/lol-end-of-game/v1/eog-stats-block'){settlementReads++;return holdSettlement?new Promise(resolve=>releaseSettlement=()=>{releaseSettlement=null;resolve(settlement);}):settlement;}
 if(route==='/lol-summoner/v1/current-summoner')return own;
 if(route==='/riotclient/region-locale')return {region:cacheSmoke?'KR':'unconfigured-fixture'};
 if(cacheSmoke&&route.includes('/matches?'))throw Error('Isolated match-history maintenance');
 if(route==='/lol-gameflow/v1/gameflow-phase')return clientPhase;
 if(route==='/lol-lobby/v2/lobby')return {localMember:own,members:[own,friend],gameConfig:{queueId:420}};
 if(route==='/lol-gameflow/v1/session'){const g=game(100),player=p=>({...g.participantIdentities.find(v=>v.participantId===p.participantId).player,championId:p.championId,spell1Id:p.spell1Id,spell2Id:p.spell2Id,selectedPosition:p.participantId===1?'BOTTOM':p.participantId===2?'UTILITY':'MIDDLE',selectedRole:'BOTTOM.PRIMARY.BOTTOM.UTILITY.NONE'});return {map:{id:11,gameMode:'CLASSIC'},gameData:{gameId:100,queue:{id:420,gameMode:'CLASSIC'},teamOne:g.participants.slice(0,5).map(player),teamTwo:g.participants.slice(5).map(player)}};}
 if(route==='/lol-champ-select/v1/session')return {gameId:100,localPlayerCellId:0,myTeam:[{...own,cellId:0,championId:22,assignedPosition:'BOTTOM'},{...friend,cellId:1,championId:412,assignedPosition:'UTILITY'}],theirTeam:[{cellId:5,nameVisibilityType:'HIDDEN',championId:99}]};
 if(route==='/lol-summoner/v1/summoner-profile?puuid='+own.puuid||route==='/lol-summoner/v1/summoner-profile?puuid='+friend.puuid)return {backgroundSkinId:22000,regalia:'fixture'};
 if(route.startsWith('/lol-summoner/v2/'))return route.endsWith(friend.puuid)?friend:own;
 if(route==='/lol-summoner/v1/summoners/aliases')return [friend];
 if(route.startsWith('/lol-summoner/v1/summoners?name='))return friend;
 if(route.includes('/matches?')){const q=new URLSearchParams(route.split('?')[1]),start=Number(q.get('begIndex')),count=Number(q.get('endIndex'))-start+1;historyReads.push({start,count});const value={games:{games:(clientPhase==='EndOfGame'?[game(100)]:[]).concat(Array.from({length:usageSmoke?Math.max(0,Math.min(count,500-start)):start===0?count:3},(_,i)=>{const row=game(start+i+1);if(usageSmoke)row.participants[0].championId=[22,103,99,64,412,86][(start+i)%6];return row;}))}};return holdUsage&&count===100&&start>0?new Promise(resolve=>releaseUsage=()=>{releaseUsage=null;resolve(value);}):value;}
 if(route.startsWith('/lol-match-history/v1/games/')){if(usageSmoke)throw Error('Summary must not fetch individual games');return game(Number(route.split('/').at(-1)));}
 if(route.includes('/game-timelines/'))return {frames:[{timestamp:60000,participantFrames:{1:{participantId:1,totalGold:600,currentGold:200,minionsKilled:6,jungleMinionsKilled:0,level:2,xp:300}},events:[{type:'ITEM_PURCHASED',timestamp:20000,participantId:1,itemId:1001},{type:'SKILL_LEVEL_UP',timestamp:0,participantId:1,skillSlot:1},{type:'CHAMPION_KILL',timestamp:50000,killerId:1,victimId:2}]}]};
 if(route.startsWith('/lol-ranked/'))return {queues:[{queueType:'RANKED_SOLO_5x5',tier:'GOLD',division:'I',leaguePoints:40,wins:30,losses:20}]};
 if(route.startsWith('/lol-champion-mastery/'))return [{championId:22,championLevel:10,championPoints:100000}];
 if(route.includes('/rofls/')&&method==='POST'){writes.push(route);return {};}
 if(route.includes('/metadata/'))return {state:'readyToWatch',downloadProgress:100};
 throw Error('Unexpected fixture route');
};
https.request=(options,callback)=>{assert.equal(typeof options,'object','External URL request forbidden');const req=new EventEmitter();req.write=body=>options.body=body;req.end=()=>queueMicrotask(async()=>{try{const value=await output(options),res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(value)));res.emit('end');}catch(error){req.emit('error',error);}});req.destroy=error=>{if(error)req.emit('error',error);};return req;};
cp.spawn=()=>{observer=new EventEmitter();const current=observer;current.stdout=new EventEmitter();current.stdout.setEncoding=()=>{};current.exitCode=null;current.stdin={end(){current.exitCode=0;current.emit('exit',0);}};current.kill=()=>current.stdin.end();return current;};
cp.execFile=(file,args,options,callback)=>{queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<120;n++){if(await check())return;await delay(80);}throw Error(label);}

async function run(){
 const {mockRawEog}=await import('../tests/fixtures/post-game.mjs');
 settlement=structuredClone(mockRawEog);settlement.gameId=100;delete settlement.queueId;
 const keys=[22,412,99,86,64,103,51,89,122,17];settlement.teams.flatMap(t=>t.players).forEach((p,i)=>{p.championId=keys[i];p.summonerId=i+1;p.items=[3006,3031,3072,0,0,0,3340];});settlement.teams[0].players[0].puuid=own.puuid;
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile('release/latest.json')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;require(path.join(base,'electron/main.cjs'));
 await until(()=>{main=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true),sync=()=>js('window.buddy.client(true)'),post=()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/postgame.html'));
 await until(()=>js('!!window.buddy'),'Preload missing');await sync();
 holdSettlement=true;clientPhase='EndOfGame';await sync();await until(()=>releaseSettlement,'Held settlement missing');
 clientPhase='ChampSelect';await sync();releaseSettlement();await delay(300);assert.equal(post(),undefined,'Late old settlement created a window');
 clientPhase='EndOfGame';holdSettlement=false;const original=settlement.teams[0].players[0].stats;settlement.teams[0].players[0].stats={};await sync();await delay(200);assert.equal(post(),undefined,'Incomplete statistics scored');
 settlement.teams[0].players[0].stats=original;
 const publicClient=await sync();const {parsePostGameReport}=await import('../services/post-game.mjs');assert.ok(parsePostGameReport(settlement,{own,game:publicClient.game}),'Fixture must match the real parser');
 await fs.writeFile(path.join(root,'client-fixture.json'),JSON.stringify({publicClient,settlementReads}));
 await until(async()=>{await delay(200);await sync();return post();},'Complete result never displayed');const window=post();
 await until(()=>window.webContents.executeJavaScript('document.querySelectorAll(".postgame-player-row").length===10'),'Rows missing');
 const body=await window.webContents.executeJavaScript('document.body.innerText');assert.ok(body.includes('本地规则评分'));assert.ok(!body.includes('WeGame'));assert.equal(await window.webContents.executeJavaScript('document.querySelectorAll(".postgame-item-icon").length'),40);
 await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(root,'postgame.png'),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 const scorePoint=await window.webContents.executeJavaScript('(()=>{const r=document.querySelector(".postgame-score-box").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');window.webContents.sendInputEvent({type:'mouseMove',...scorePoint});await delay(80);
 const tooltip=await window.webContents.executeJavaScript('(()=>{const e=document.querySelector(".postgame-score-detail"),r=e.getBoundingClientRect();return {display:getComputedStyle(e).display,top:r.top,bottom:r.bottom,height:innerHeight};})()');assert.notEqual(tooltip.display,'none');assert.ok(tooltip.top>=0&&tooltip.bottom<=tooltip.height);
 await fs.writeFile(path.join(root,'postgame-hover.png'),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 await window.webContents.executeJavaScript('document.querySelector("[data-action=review]").click()');await until(()=>js('Array.from(document.querySelectorAll("[data-history-match]")).some(el=>el.dataset.historyMatch==="100")'),'Exact review missing');
 const settings=await js('window.buddy.bootstrap()');settings.state.preferences.postGamePopup=false;await js('window.buddy.saveState('+JSON.stringify(settings.state)+')');await until(async()=>JSON.parse(await fs.readFile(path.join(root,'settings.json'),'utf8')).preferences.postGamePopup===false,'Preference not persisted');
 const reads=settlementReads;clientPhase='ChampSelect';await sync();clientPhase='EndOfGame';await sync();await delay(100);assert.equal(settlementReads,reads,'Disabled setting still reads');assert.equal(writes.length,0);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify({version:app.getVersion(),source,lateResponseRejected:true,incompleteNotScored:true,nativeItems:true,exactOwnReview:true,preferencePersisted:true,realClientWrites:writes.length,errors,settlementReads},null,2));console.log('POSTGAME PASS '+root);app.quit();
}
app.whenReady().then(run).catch(error=>{console.error(error);app.exit(1);});setTimeout(()=>{console.error('Postgame smoke timed out');app.exit(1);},90000).unref();
