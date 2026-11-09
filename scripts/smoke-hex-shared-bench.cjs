// Actual main/preload/renderer and selection service; all client traffic stays
// in this fixture. No real client discovery, credentials or writes are used.
const {app,ipcMain,globalShortcut,session:electronSession,shell}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),http=require('node:http'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),{promisify}=require('node:util');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],writes=[],opened=[];
shell.openExternal=async url=>{opened.push(url);};
app.setPath('userData',root);globalShortcut.register=()=>false;
global.fetch=async()=>{throw Error('External network disabled for shared-bench smoke');};
global.WebSocket=class{constructor(){throw Error('Room network disabled for shared-bench smoke');}};
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<200;n++){const value=await check();if(value)return value;await delay(80);}throw Error(label);}
async function run(){
 await fs.mkdir(root,{recursive:true});
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile('release/latest.json')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 const {defaultState}=await import(require('node:url').pathToFileURL(path.resolve('services/storage.mjs'))),state=defaultState(),install=path.join(root,'fake-client');
 await fs.mkdir(install,{recursive:true});await fs.writeFile(path.join(install,'lockfile'),'LeagueClient:0:23456:isolated-bench:https');
 Object.assign(state.preferences,{installPath:install,autoSync:false,autoCheck:false,appUpdateCheck:false,roomAuto:false,guideAutoShow:false,autoLive:false,chatNotice:false,clickPrepare:true});
 await fs.writeFile(path.join(root,'settings.json'),JSON.stringify(state));
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),key=id=>data.champions.find(c=>c.id===id).key;
 let holdSwap=false,releaseSwap,swapStarted;
 let phase='ChampSelect',benchKnown=true;let ownHero='Lux',bench=['Malphite','Xerath','Teemo','Karma','Trundle','Brand','Morgana','Garen','Nami','Lulu','Kennen','Braum'];
 const raw=()=>({gameId:777,localPlayerCellId:0,myTeam:[ownHero,'Ashe','Veigar','Sona','Jinx'].map((id,cellId)=>({cellId,championId:key(id),assignedPosition:'',spell1Id:4,spell2Id:32})),theirTeam:[],benchEnabled:benchKnown,benchChampions:bench.map(id=>({championId:key(id)})),actions:[],bans:{myTeamBans:[],theirTeamBans:[]},timer:{phase:'FINALIZATION',adjustedTimeLeftInPhase:28000}});
 https.request=(options,callback)=>{
  const request=new EventEmitter();request.write=()=>{throw Error('Unexpected client payload');};request.destroy=error=>{if(error)request.emit('error',error);};
  request.end=()=>queueMicrotask(async()=>{try{
   assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);assert.equal(options.auth,'riot:isolated-bench');
   let value;
   if(options.method==='POST'){
    const target=Number(options.path.match(/^\/lol-champ-select\/v1\/session\/bench\/swap\/(\d+)$/)?.[1]),index=bench.findIndex(id=>key(id)===target);
    assert(index>=0,'Only a current shared-bench swap is allowed');if(holdSwap){holdSwap=false;swapStarted();await new Promise(resolve=>releaseSwap=resolve);}writes.push(options.path);[ownHero,bench[index]]=[bench[index],ownHero];value=null;
   }else{
    assert.equal(options.method||'GET','GET');
    const values={'/lol-gameflow/v1/gameflow-phase':phase,'/lol-gameflow/v1/session':{gameData:{gameId:777,mapId:12,queue:{id:2400,gameMode:'KIWI'}}},'/lol-champ-select/v1/session':raw(),'/lol-champ-select/v1/pickable-champion-ids':data.champions.map(c=>c.key),'/lol-champ-select/v1/disabled-champion-ids':[],'/lol-summoner/v1/current-summoner':{summonerId:1,displayName:'隔离测试'},'/lol-lobby/v2/lobby':{members:[{summonerId:1}],localMember:{summonerId:1}},'/lol-perks/v1/pages':[],'/lol-chat/v1/conversations':[]};
    assert(Object.hasOwn(values,options.path),'Unexpected mock route '+options.path);value=values[options.path];
   }
   const response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');request.emit('close');
  }catch(error){request.emit('error',error);}});return request;
 };
 http.request=()=>{throw Error('Unexpected HTTP request');};
 const execFile=(_file,_args,_options,callback)=>{if(callback)queueMicrotask(()=>callback(null,'--app-port=23456 --remoting-auth-token=isolated-bench',''));return new EventEmitter();};
 execFile[promisify.custom]=async()=>({stdout:'--app-port=23456 --remoting-auth-token=isolated-bench',stderr:''});cp.execFile=execFile;
 cp.spawn=file=>{assert(file.endsWith('window-observer.exe'),'Unexpected process');const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.stderr=new EventEmitter();observer.stderr.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
 let main;
 const handle=ipcMain.handle.bind(ipcMain);
 ipcMain.handle=(name,handler)=>handle(name,async(event,...args)=>{
  if(name==='companion-mode'){const layout={docked:!!args[0],overlap:false};main.setMinimumSize(360,480);main.setContentSize(440,820);main.webContents.send('window-layout',layout);return layout;}
  return handler(event,...args);
 });
 await app.whenReady();
 const images=new Map();for(const [name,url]of require(path.join(base,'services/image-cache.mjs')).imageEntries(data)){if(!images.has(url))try{images.set(url,await fs.readFile(path.join(base,'data/images',name+'.png')));}catch{}}
 const fallback=images.values().next().value;assert(fallback?.length);
 for(const scheme of ['https','http'])electronSession.defaultSession.protocol.handle(scheme,request=>new Response(images.get(request.url)||fallback,{headers:{'Content-Type':'image/png'}}));
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;require(path.join(base,'electron/main.cjs'));
 main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true),click=async selector=>{await until(()=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.click();return true})()`),'Missing '+selector);};
 await until(()=>js('!!window.buddy&&!!document.querySelector("[data-action=sync]")'),'Renderer missing');
 await click('[data-action=sync]');await until(()=>js('document.querySelector("[data-action=sync]")?.disabled===false'),'Initial sync missing');
 await until(()=>js('!!document.querySelector(".page .hex-main-workspace .hex-shared-bench")'),'Full main must use the same Hex bench as sidebar');
 assert.equal(await js('!!document.querySelector(".page #solo-role,.page .task-roster")'),false,'Mayhem main must not invent Rift lanes');
 await js('window.buddy.companionMode(true)');await until(()=>js('!!document.querySelector(".hex-companion .hex-shared-bench")'),'Shared bench missing');
 const ids=()=>js('[...document.querySelectorAll(".hex-shared-bench [data-action=hex-quick-pick]")].map(e=>e.dataset.id)');
 const heroStats=require(path.join(base,'src/core/hex-champion-statistics.mjs')).hexChampionStatistics(data),rates=new Map((heroStats?.rows||[]).map(row=>[row.hero,row.winRate]));
 const expectedPool=()=>[...bench].sort((a,b)=>(rates.get(b)??-1)-(rates.get(a)??-1)||key(a)-key(b));
 assert.deepEqual(await ids(),expectedPool(),'Bench must retain descending win-rate order, with hero key as a stable unknown-rate tie break');assert.equal(writes.length,0);
 const sourceURL='https://github.com/czgreat/aramhex-data',licenseURL=sourceURL+'/blob/f4d80d48110951b7319ab74ffaa2c351bc7c8652/LICENSE';
 for(const url of [sourceURL,licenseURL])await js(`window.buddy.openLink(${JSON.stringify(url)})`);
 assert.deepEqual(opened,[sourceURL,licenseURL]);
 assert.equal(await js(`window.buddy.openLink(${JSON.stringify(sourceURL+'?redirect=bad')}).then(()=>false,()=>true)`),true);
 const expectedAugmentRows=require(path.join(base,'src/core/hex-augment-statistics.mjs')).hexAugmentStatistics(data)?.rows.length||0;
 if(expectedAugmentRows){
 await js(`(()=>{const row=document.querySelector('.hex-augment-ranking-entry');row.scrollIntoView({block:'center'});const r=row.getBoundingClientRect();row.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,clientX:r.x+3,clientY:r.y+3}));})()`);
 await until(()=>js('document.querySelector(".game-tooltip:popover-open .game-tooltip-condition")?.textContent.includes("结算持有胜率")'),'Compact augment statistics tooltip missing');
 }else {assert.equal(await js('document.querySelectorAll(".hex-augment-ranking-entry").length'),0);assert.match(await js('document.querySelector(".hex-augment-ranking").textContent'),/暂无当版统计/);}
 await js('document.querySelector(".companion-content").scrollTop=0');
 const screenshot=async name=>{await js('Promise.all([...document.querySelectorAll(".hex-shared-bench img")].map(i=>i.decode().catch(()=>{})))');await fs.writeFile(path.join(root,name),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 const layouts=[];
 for(const width of [360,440])for(const zoom of [1,1.25]){
  main.setContentSize(width,820);main.webContents.setZoomFactor(zoom);await delay(100);
  const bounds=await js('(()=>{const pool=document.querySelector(".hex-bench-grid"),r=pool.getBoundingClientRect(),heroes=[...pool.querySelectorAll(".hex-bench-hero")];return {overflow:document.documentElement.scrollWidth>innerWidth,allVisible:heroes.every(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&b.left>=r.left-1&&b.right<=r.right+1}),rows:new Set(heroes.map(e=>e.offsetTop)).size}})()');
  assert.equal(bounds.overflow,false);assert(bounds.allVisible);assert(bounds.rows>1);layouts.push({width,zoom,...bounds});await screenshot(`bench-${width}-${zoom}.png`);
 }
 main.webContents.setZoomFactor(1);main.setContentSize(440,820);
 bench.push('Hecarim');bench=bench.filter(id=>id!=='Xerath');
 await js('window.buddy.client(true)');await until(async()=>(await ids()).includes('Hecarim')&&!(await ids()).includes('Xerath'),'Teammate bench update missing');
 assert.deepEqual(await ids(),expectedPool(),'A teammate update must preserve the actual visible ranking order');
 await click('.hex-shared-bench [data-id=Hecarim]');await until(()=>ownHero==='Hecarim','Shared hero click never reached bench swap');
 await until(async()=>{const pool=await ids();return pool.includes('Lux')&&!pool.includes('Hecarim');},'Swap did not refresh the shared pool');
 await until(()=>js('!document.body.textContent.includes("正在预选并配置")'),'Preparation did not settle');
 assert.equal(await js('document.querySelector(".hex-companion").dataset.tab'),'recommend','Hex swap navigated to configuration');assert.equal(writes.length,1);
 await screenshot('bench-after-swap.png');
 holdSwap=true;const started=new Promise(resolve=>swapStarted=resolve);
 await click('.hex-shared-bench [data-id=Malphite]');await started;
 await click('.hex-shared-bench [data-id=Karma]');await delay(100);assert.equal(writes.length,1,'A later swap must wait for the in-flight transport');releaseSwap();
 await until(()=>ownHero==='Karma','Latest avatar click did not win');
 await until(async()=>!(await ids()).includes('Karma'),'Latest bench did not render');assert.equal(writes.length,3);

 const count=writes.length;await click('.hex-shared-bench .teammate[data-action=hex-reference-preview]');await until(()=>js('!!document.querySelector("#overlay-root>*")'),'Read-only reference missing');assert.equal(writes.length,count);await click('[data-action=close]');
 bench=[];await js('window.buddy.client(true)');await until(async()=>(await ids()).length===0,'Emptied bench retained stale heroes');
 assert.equal(await js('document.querySelector(".hex-companion").dataset.tab'),'recommend');
 const live=await js('window.buddy.hexRound({operation:"snapshot"})');assert(live.live?.context,'Live round missing');await js('window.buddy.hexRound('+JSON.stringify({operation:'own',id:1004,context:live.live.context,revision:live.live.revision})+')');
 benchKnown=false;await js('window.buddy.client(true)');await until(()=>js('!!document.querySelector(".hex-reference-board")'),'Missing-bench hero ranking missing');await click('.hex-reference-board [data-id=Ahri]');await until(()=>js('document.querySelector(".hex-companion").dataset.configHero==="Ahri"'),'Manual preview lost behind live round');assert.equal(writes.length,count);
 const invokeAction=(action,id)=>js('(()=>{const b=document.createElement("button");b.dataset.action='+JSON.stringify(action)+';b.dataset.id='+JSON.stringify(String(id||''))+';document.body.appendChild(b);b.click();b.remove()})()');
 await invokeAction('augment-detail',1004);await until(()=>js('!!document.querySelector(".augment-modal [data-action=own-augment]")'),'Manual augment details missing');assert.equal(await js('document.querySelector(".augment-modal [data-action=own-augment]").disabled'),false,'Live owned state leaked into manual preview');await click('.augment-modal [data-action=close]');
 await invokeAction('companion-current');await invokeAction('augment-detail',1004);await until(()=>js('!!document.querySelector(".augment-modal [data-action=own-augment]")'),'Live augment details missing');assert.equal(await js('document.querySelector(".augment-modal [data-action=own-augment]").disabled'),true,'Returning to live failed to restore owned state');await click('.augment-modal [data-action=close]');await click('[data-action=companion-tab][data-tab=recommend]');
 phase='Lobby';await js('window.buddy.client(true)');await until(()=>js('document.querySelectorAll(".hex-reference-board .hex-bench-hero").length===173'),'Offline hero ranking missing');
 assert.equal(await js('document.querySelectorAll(".hex-augment-ranking-entry").length'),expectedAugmentRows);
 await click('.hex-reference-board [data-id=Ahri]');await until(()=>js('document.querySelector(".hex-companion").dataset.tab==="plan"&&!!document.querySelector(".hex-configuration-workspace")'),'Local hero configuration missing');assert.equal(writes.length,count);
 phase='ChampSelect';benchKnown=true;await js('window.buddy.client(true)');await until(()=>js('window.buddy.bootstrap().then(b=>b.client?.phase==="ChampSelect")'),'Return to simulated draft missing');await click('[data-action=companion-tab][data-tab=recommend]');
 const partyLayouts=[];
 for(const width of [360,440])for(const zoom of [1,1.25]){
  main.setContentSize(width,820);main.webContents.setZoomFactor(zoom);
  await js(`(async()=>{const boot=await window.buddy.bootstrap(),{hexDraftView}=await import('./hex-draft-view.mjs');boot.client.party={members:boot.client.session.myTeam.map(p=>({cellId:p.cellId}))};boot.client.session.bench={championIds:[]};boot.client.eligibility=null;let host=document.getElementById('party-fixture');if(!host){host=document.createElement('div');host.id='party-fixture';host.className='companion-shell sidebar-focused recommendation-ui hex-companion';host.style='position:fixed;inset:0;z-index:999;overflow-y:auto;background:#061927';document.body.appendChild(host);}host.innerHTML=hexDraftView({data:boot.data,client:boot.client});})()`);
  await delay(100);
  const bounds=await js(`(()=>{const host=document.getElementById('party-fixture'),rows=[...host.querySelectorAll('.hex-party-lineup')],previews=[...host.querySelectorAll('.hex-party-preview')];return {previewBounds:previews.map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height};}),maxRowHeight:Math.max(...rows.map(e=>e.getBoundingClientRect().height)),rows:rows.length,members:rows[0]?.querySelectorAll('.hex-party-member').length,overflow:document.documentElement.scrollWidth>innerWidth,contained:rows.every(row=>{const r=row.getBoundingClientRect();return [...row.querySelectorAll('.hex-party-member,.hex-party-preview')].every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1;});})}})()`);
  await screenshot(`party-five-${width}-${zoom}.png`);assert.equal(bounds.members,5);assert(bounds.rows>0);assert.equal(bounds.overflow,false);assert(bounds.contained,'Five-member avatar actions overflow');assert(bounds.maxRowHeight<72,'Avatar actions became tall text buttons');assert(bounds.previewBounds.every(r=>r.width<=16&&r.height<=16),'Preview corner must stay small');partyLayouts.push({width,zoom,...bounds});
 }
 const proof={passed:true,source,archiveSha256:release?.archiveSha256||null,initialSharedHeroes:12,teammateUpdates:true,swapRefresh:true,staysOnLineup:true,rankingReadOnly:true,emptyPoolCleared:true,mockedBenchSwaps:writes.length,latestClickWins:true,emptyPickActions:true,emptyDraftRankings:true,localConfigurationWithLiveRound:true,manualOwnedIsolation:true,augmentRanking:expectedAugmentRows,statsTooltip:expectedAugmentRows>0,missingCurrentStatistics:expectedAugmentRows===0,statisticsSourcesExact:true,realClientWrites:0,layouts,partyLayouts};
 await fs.writeFile(path.join(root,'proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({...proof,root}));app.quit();
}
run().catch(async error=>{console.error(error);await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'error.txt'),error.stack);app.exit(1);});
