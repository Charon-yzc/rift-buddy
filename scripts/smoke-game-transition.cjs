const {app,screen}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],delay=ms=>new Promise(r=>setTimeout(r,ms));app.on('browser-window-created',(_e,w)=>{windows.push(w);w.webContents.setBackgroundThrottling(false);});
async function until(check,label){for(let n=0;n<100;n++){const v=await check();if(v)return v;await delay(80);}throw Error(label);}
async function run(){
 app.setPath('userData',root);
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=JSON.parse(await fs.readFile('release/latest.json','utf8')),base=source?path.resolve('.'):path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));
 let phase='ChampSelect',gameId='101',hero='Ashe',role='BOTTOM',mode='rift',omitOwnPick=false,liveAvailable=false,liveRequests=0,holdLive=false,releaseLive=null,observer,practice=false;
 const mapId=()=>mode==='hex'?12:11,gameMode=()=>mode==='hex'?'KIWI':practice?'PRACTICETOOL':'CLASSIC';
 if(!source){
  const spawn=cp.spawn;
  cp.spawn=(file,...args)=>{
   if(!file.endsWith('window-observer.exe'))return spawn(file,...args);
   observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;
   observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;
  };
 }
 // Exercise real discoverClient, sanitizeSession, clientSnapshot and liveSnapshot,
 // replacing only the HTTPS sockets. No real client port is opened or contacted.
 const response=options=>{assert.equal(options.hostname,'127.0.0.1');const p=options.path;
  if((options.method||'GET')==='GET'&&['/lol-game-data/assets/v1/champion-summary.json','/lol-game-data/assets/v1/items.json'].includes(options.path)){assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);return {value:[{id:999999,name:'隔离字典'}]};}
  if(options.port===2999){liveRequests++;if(!liveAvailable)return {status:503,value:{}};
   if(p==='/liveclientdata/activeplayer')return {value:{riotId:'isolated-player',currentGold:1250,level:8,abilities:Object.fromEntries(['Q','W','E','R'].map(k=>[k,{abilityLevel:k==='Q'?4:1}]))}};
   if(p==='/liveclientdata/playerlist')return {value:[{riotId:'isolated-player',rawChampionName:'game_character_displayname_'+hero,team:'ORDER',position:role,items:[]}]};
   if(p==='/liveclientdata/gamestats')return {value:{gameMode:gameMode(),mapNumber:mapId(),gameTime:600}};
   if(p==='/liveclientdata/eventdata')return {value:{Events:[]}};
  }
  assert.equal(options.port,23456);assert.equal(options.method||'GET','GET','A real rune write must never occur in this test');
  if(p==='/lol-summoner/v1/current-summoner')return {value:{gameName:'隔离阶段玩家',tagLine:'TEST'}};
  if(p==='/lol-gameflow/v1/gameflow-phase')return {value:phase};
  if(p==='/data-store/v1/install-dir')return {value:path.join(root,'client-fixture')};
  if(p==='/lol-gameflow/v1/session')return gameId?{value:{gameData:{gameId,mapId:mapId(),queue:{id:mode==='hex'?2400:430,gameMode:gameMode()}}}}:{status:404,value:{}};
  if(p==='/lol-lobby/v2/lobby')return {status:404,value:{}};
  if(p==='/lol-champ-select/v1/session'){
   const championId=data.champions.find(c=>c.id===hero).key;
   return {value:{localPlayerCellId:1,myTeam:omitOwnPick?[]:[{cellId:1,championId,assignedPosition:role}],theirTeam:[],actions:gameId==='102'&&!omitOwnPick?[[{actorCellId:1,type:'pick',championId,completed:true}]]:[],bans:{}}};
  }
  if(['/lol-champ-select/v1/pickable-champion-ids','/lol-champ-select/v1/disabled-champion-ids'].includes(p))return {status:404,value:{message:'Optional selection scope unavailable in this fixture'}};
  throw Error('Unexpected test route '+p);
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{
  const output=response(options),send=()=>{const res=new EventEmitter();res.statusCode=output.status||200;res.resume=()=>{};callback(res);res.emit('data',Buffer.from(JSON.stringify(output.value)));res.emit('end');req.emit('close');};
  if(holdLive&&options.port===2999&&options.path==='/liveclientdata/eventdata')releaseLive=send;else send();
 });req.write=()=>{};req.destroy=e=>{if(e)req.emit('error',e);req.emit('close');};return req;};
 https.get=(options,callback)=>{const req=https.request(options,callback);req.end();return req;};
 require(path.join(base,'electron/main.cjs'));let main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing');
 const js=async code=>{
  if(main.isDestroyed()){
   const activeGuide=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/guide.html'));assert.ok(activeGuide,'A released main window must remain reopenable from the guide');
   await activeGuide.webContents.executeJavaScript('window.guide.control("main")',true);
   main=await until(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/index.html')),'Reopened main missing');
   await until(()=>main.webContents.executeJavaScript('!!window.buddy&&!!document.querySelector("[data-action=navigate]")',true),'Reopened main not ready');
  }
  return Promise.race([main.webContents.executeJavaScript(code,true),delay(8000).then(()=>{throw Error('Main renderer did not finish: '+code);})]);
 };
 await until(()=>js('!!document.querySelector("[data-action=guide-current]")'),'UI missing');const status=async()=>{console.log('TRANSITION STATUS '+phase+' '+gameId+' '+hero);const result=await js('window.buddy.client(true)');console.log('TRANSITION OBSERVED '+phase+' '+gameId);return result;},state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 const riftGuideWindow=()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/guide.html'));
 if(!source){
  const fixture=path.join(root,'client-fixture','Config','game.cfg'),original=await fs.readFile(fixture,'utf8');
  await until(()=>observer,'Native observer did not start');
  const clientBounds={...screen.dipToScreenRect(null,screen.getPrimaryDisplay().workArea),foreground:false,minimized:false};
  observer.stdout.emit('data',JSON.stringify({client:clientBounds,game:null,gameProcessPresent:false})+'\n');
  await js('document.querySelector("[data-action=navigate][data-route=settings]").click()');
  // In this fixture automatic sync is off; drive the real client read and
  // render path with the existing manual connection control.
  await js('document.querySelector("[data-client-connect]").click()');
  const action='[data-action=game-display-borderless]';
  await until(()=>js(`!!document.querySelector('${action}')`),'Fullscreen switch did not appear automatically');
  const side=await until(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('surface=companion')),'Selecting sidebar did not open');
  const sidebar=code=>side.webContents.executeJavaScript(code,true);
  await until(()=>sidebar(`!!document.querySelector('${action}')`),'Fullscreen switch missing from the selection sidebar');
  assert.equal(await fs.readFile(fixture,'utf8'),original,'Displaying the action must not edit the game');
  phase='GameStart';
  await assert.rejects(js('window.buddy.gameDisplay("borderless")'),/游戏目录已变化|下一局|进局前/);
  assert.equal(await fs.readFile(fixture,'utf8'),original);
  phase='ChampSelect';
  await sidebar(`document.querySelector('${action}').click()`);
  await until(async()=>await fs.readFile(fixture,'utf8')===original.replace('WindowMode=0','WindowMode=2'),'Borderless click did not update the fixture');
  await until(()=>js(`!document.querySelector('${action}')`),'Successful choice did not dismiss the notice');
  await until(()=>sidebar(`!document.querySelector('${action}')`),'Sidebar still offers switching after success');
  observer.stdout.emit('data','{"client":null,"game":null,"gameProcessPresent":false}\n');
  await js('document.querySelector("[data-action=navigate][data-route=draft]").click()');
 }
 // Change preferences through the renderer that owns them. A raw IPC save
 // leaves that renderer's preferences stale and a later preparation save can
 // overwrite the fixture's change; that is not the user's settings flow.
 const prefs=async patch=>{console.log('TRANSITION PREFERENCES '+JSON.stringify(patch));
  assert.deepEqual(Object.keys(patch),['autoLive']);
  await js('document.querySelector("[data-action=navigate][data-route=settings]").click()');
  await until(()=>js('!!document.querySelector("[data-action=auto-live]")'),'Live setting missing');
  const enabled=await js('document.querySelector("[data-action=auto-live]").getAttribute("aria-checked")==="true"');
  if(enabled!==patch.autoLive)await js('document.querySelector("[data-action=auto-live]").click()');
  await until(async()=>(await state()).preferences.autoLive===patch.autoLive,'Live preference did not persist');
  await js('document.querySelector("[data-action=navigate][data-route=draft]").click()');
 };
 await status();assert.equal((await state()).guide.selection.id,'Ashe','First selection must prepare a guide without opening one');assert.equal(!!riftGuideWindow(),false,'Selection prepares without displaying the in-game window');phase='GameStart';await status();phase='InProgress';await status();const guide=await until(riftGuideWindow,'Automatic guide missing'),gjs=code=>Promise.race([guide.webContents.executeJavaScript(code,true),delay(8000).then(()=>{throw Error('Guide renderer did not finish: '+code);})]);await until(()=>gjs('!!window.guide'),'Guide preload missing');await until(()=>gjs('!!document.querySelector(".compact-next")'),'Guide UI missing');await until(()=>guide.isVisible(),'Fresh installation must auto-show its first guide');phase='ChampSelect';await status();
 await gjs('window.guide.control("hide")');phase='GameStart';await status();assert.equal(guide.isVisible(),false,'Loading must not auto-show the guide before entering the game');phase='InProgress';await status();assert.equal(guide.isVisible(),false,'A hidden guide must stay hidden through same-game phase jitter');assert.equal((await state()).guide.selection.role,'support','Explicit manual position must survive the formal client role');assert.equal(liveRequests,0,'Disabled live must never read the local game API');
 // The first live inventory arrives after the selection session has disappeared.
 await prefs({autoLive:true});liveAvailable=true;await js('window.buddy.openGuide()');await until(()=>gjs('window.guide.bootstrap().then(b=>b.model.live.matched)'),'First live data missing');assert.equal((await state()).guide.selection.role,'support','Manual role lost after ChampSelect');assert.ok(liveRequests>=3);
 await prefs({autoLive:false});const route=(await gjs('window.guide.bootstrap()')).model.route;
 await gjs(`window.guide.control("item",${JSON.stringify(route[0].id)})`);await gjs(`window.guide.control("purchase-target",${JSON.stringify(route[1].id)})`);await gjs('window.guide.control("stage","key")');
 if((await state()).guide.clickThrough)await gjs('window.guide.control("interaction")');
 await gjs('window.guide.control("hide")');phase='Reconnect';await status();phase='GameStart';await status();phase='InProgress';await status();assert.equal(guide.isVisible(),false,'Same-game loading on reconnect must preserve a deliberately hidden window');
 const retained=(await state()).guide;assert.deepEqual(retained.completedItems,[route[0].id]);assert.equal(retained.purchaseTarget,route[1].id);assert.equal(retained.stage,'key');assert.equal(retained.clickThrough,false);await prefs({autoLive:true});
 phase='EndOfGame';await status();phase='ChampSelect';gameId='102';hero='Jhin';role='MIDDLE';liveAvailable=true;await status();
 omitOwnPick=true;const incomplete=await status();assert.equal(incomplete.phase,'ChampSelect');assert.deepEqual(incomplete.session.myTeam,[]);
 omitOwnPick=false;phase='GameStart';await status();
 holdLive=true;phase='InProgress';const entering=status();entering.catch(()=>{});
 try{
  await until(()=>releaseLive,'First live read did not start');
  await until(async()=>guide.isVisible()&&(await gjs('window.guide.bootstrap()')).model?.selection.id==='Jhin','Already prepared guide must appear before the first live read finishes');
  await entering;
  const model=(await gjs('window.guide.bootstrap()')).model;assert.equal(model.selection.role,'mid');assert.equal(model.live.matched,false);
  await until(()=>gjs('!!document.querySelector(".compact-route .compact-slot img")'),'Prepared equipment did not appear in the first visible card');
 }finally{holdLive=false;releaseLive?.();}
 await until(()=>gjs('window.guide.bootstrap().then(snapshot=>snapshot.model.live.matched)'),'Live data did not fill the visible guide');
 // In-game preparation with an unknown roster cannot disprove a saved combo.
 phase='EndOfGame';await status();const empty=await state();for(const s of empty.draft.slots){s.champion=null;s.locked=false;delete s.clientCellId;delete s.manualPosition;}await js(`window.buddy.saveState(${JSON.stringify(empty)})`);
 hero='Rengar';gameId='103';role='BOTTOM';liveAvailable=false;phase='ChampSelect';await status();await js('window.buddy.openGuide({id:"Rengar",role:"bottom",mode:"rift",comboId:"rengar-ivern",loadoutId:"rengar-bush"})');await gjs('window.guide.control("hide")');role='';phase='InProgress';await status();assert.equal(guide.isVisible(),true,'This game has a confirmed own Rengar preparation even while the first live read is unavailable');
 liveAvailable=true;await status();assert.equal(guide.isVisible(),true,'First unavailable live must retry after identity is ready');let unknown=(await state()).guide.selection;assert.equal(unknown.role,'bottom','Unknown formal role must preserve prepared role');assert.equal(unknown.loadoutId,'rengar-bush','Missing roster removed the explicitly selected loadout');assert.equal(unknown.comboId,'rengar-ivern','An explicitly opened reference in this confirmed game remains readable when the roster is missing');await until(()=>gjs('window.guide.bootstrap().then(snapshot=>snapshot.model.live.matched)'),'Recovered current live identity missing');assert.equal((await gjs('window.guide.bootstrap()')).model.comboConfirmed,false);
 await gjs('window.guide.control("hide")');await status();assert.equal(guide.isVisible(),false,'Retried auto-show must not repeat after manual hide');
 guide.showInactive();await delay(120);const capture=await guide.webContents.capturePage();await fs.writeFile(path.join(root,'formal-role-after-transition.png'),capture.toPNG());
 phase='EndOfGame';await status();phase='Reconnect';gameId='104';hero='Ashe';role='BOTTOM';liveAvailable=false;await status();assert.equal(guide.isVisible(),false,'Reconnect should wait for the current live hero');
 liveAvailable=true;await status();await until(async()=>guide.isVisible()&&(await gjs('window.guide.bootstrap()')).model?.selection.id==='Ashe','Direct reconnect never displayed its verified guide');

 for(const [nextMode,nextId] of [['rift','105'],['hex','106'],['rift',null]]){
  phase='EndOfGame';await status();assert.equal(guide.isVisible(),false);
  const prior=await state();
  mode=nextMode;hero=mode==='hex'?'Camille':'Jhin';gameId='';phase='GameStart';liveAvailable=false;await status();
  phase='InProgress';await status();assert.equal(guide.isVisible(),false,'No guide before the current hero is known');
  phase='GameStart';await status();liveAvailable=true;phase='InProgress';await status();
  const hexWindows=()=>windows.filter(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/hex-micro.html'));
  if(mode==='hex'){
   const shown=await until(()=>{const candidates=hexWindows();return candidates.length===2&&candidates.every(w=>w.isVisible())?candidates:null;},'Mayhem must auto-show both windows even when gameflow session returns 404');
   const rows=await Promise.all(shown.map(w=>w.webContents.executeJavaScript('window.hexMicro.bootstrap()',true)));
   assert.ok(rows.every(row=>row.hero.id===hero));
   if(data.patch==='16.22')assert.ok(rows.find(row=>row.kind==='routes').routes.some(route=>route.augments.length&&route.items.length),'Current Mayhem route needs augments and equipment');
   assert.ok(rows.find(row=>row.kind==='economy').equipment.available);
   assert.equal(guide.isVisible(),false,'Mayhem must not show the Rift equipment window');
   const report=await js('window.buddy.windowInfo()');
   assert.equal(report.guideMode,'hex');
   assert.equal(report.guideWidgets.routes.visible,true);
   assert.equal(report.guideWidgets.economy.visible,true);
  }else{
   await until(()=>guide.isVisible(),'Rift must auto-show even when gameflow session returns 404');
   const {model}=await gjs('window.guide.bootstrap()');assert.equal(model.champion.id,hero);assert.equal(model.live.matched,true);assert.equal(model.matchId,null);
  }
  assert.equal((await state()).guide.selection.id,prior.guide.selection.id,'Live-only display must not replace the saved guide');
  if(mode==='rift')await gjs('window.guide.control("hide")');
  if(!nextId){
   phase='EndOfGame';await status();
   gameId='107';hero='Rengar';phase='GameStart';await status();phase='InProgress';await status();
   await until(async()=>guide.isVisible()&&(await gjs('window.guide.bootstrap()')).model?.selection.id===hero,'Ending an unnumbered game must allow the next numbered game to open');
  }else{
   gameId=nextId;await status();
   if(mode==='rift')assert.equal(guide.isVisible(),false,'A later game id must not reopen a manually closed guide');
   else assert.ok(hexWindows().every(w=>w.isVisible()),'A later game id must not hide the active Mayhem windows');
  }
  phase='EndOfGame';await status();assert.ok(hexWindows().every(w=>!w.isVisible()));
 }
 if(!source){
  await until(()=>observer,'Native observer did not start');
  const gameWindow=(present,exclusive=false)=>observer.stdout.emit('data',JSON.stringify({client:null,game:present?{...screen.dipToScreenRect(null,screen.getPrimaryDisplay().workArea),foreground:true,minimized:false}:null,gameProcessPresent:present||exclusive,gameExclusiveFullscreen:exclusive})+'\n');
  for(const [nextMode,clientPhase] of [['rift','Lobby'],['hex','GameStart']]){
   mode=nextMode;phase=clientPhase;gameId='';hero=mode==='rift'?'Amumu':'Camille';practice=mode==='rift';liveAvailable=true;
   await status();const before=await state();
   await delay(150);assert.equal(guide.isVisible(),false);
   gameWindow(true);
   const shown=await until(()=>{
    const matching=windows.filter(w=>!w.isDestroyed()&&w.isVisible()&&w.webContents.getURL().endsWith('/src/hex-micro.html'));
    return mode==='rift'?guide.isVisible()&&[guide]:matching.length===2&&matching;
   },`${mode} overlay missing while client stays in ${clientPhase}`);
   if(mode==='rift')assert.equal((await gjs('window.guide.bootstrap()')).model?.champion.id,hero);
   else assert.ok((await Promise.all(shown.map(w=>w.webContents.executeJavaScript('window.hexMicro.bootstrap().then(p=>p.hero?.id)',true)))).every(id=>id===hero));
   assert.deepEqual((await state()).guide,before.guide,'Observed game window is only evidence for display');
   gameWindow(false,true);
   const report=await js('window.buddy.windowInfo()');
   assert.equal(report.observedGame,null);
   assert.equal(report.gameExclusiveFullscreen,true,'Window check lost the fullscreen observation when geometry disappeared');
   gameWindow(false);await delay(150);assert.ok(shown.every(w=>w.isVisible()),'One missed native frame must keep the overlays');
   await delay(5000);gameWindow(false);await until(()=>shown.every(w=>!w.isVisible()),'Observed game exit left its overlays open');
  }
 }
 const result={passed:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,fullMainStatusFlow:true,firstSelectionPrepares:true,freshInstallationAutoShows:true,realLCUSanitizers:true,loadingPreservesManualRole:true,autoShowWithoutLive:true,manualRoleAfterSessionDisappears:true,sameGameHiddenReconnect:true,sameGameLoadingRetainsProgress:true,lastDraftRosterGapBeforeLive:true,preparedGuideBeforeLive:true,liveFillsVisibleGuide:true,directReconnectWaitsForLive:true,retryAfterFirstLiveFailure:true,unknownRosterKeepsExplicitLoadout:true,unknownRosterKeepsUnconfirmedReference:true,unknownFormalRoleKeepsPreparedRole:true,lateRiftAndMayhemIdentityWithoutGameId:true,lateIdPreservesVisibility:true,observedPracticeAndMayhem:!source,loopbackSocketsMocked:true,actualRuneWrites:false,userSettingsIsolated:true};await fs.writeFile(path.join(root,'game-transition-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async e=>{console.error(e);await fs.writeFile(path.join(root,'game-transition-smoke-error.txt'),e.stack).catch(()=>{});app.exit(1);});
