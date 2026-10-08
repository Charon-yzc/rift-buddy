const {app}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],delay=ms=>new Promise(r=>setTimeout(r,ms));app.on('browser-window-created',(_e,w)=>windows.push(w));
async function until(check,label){for(let n=0;n<100;n++){const v=await check();if(v)return v;await delay(80);}throw Error(label);}
async function run(){
 app.setPath('userData',root);
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=JSON.parse(await fs.readFile('release/latest.json','utf8')),base=source?path.resolve('.'):path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));
 let phase='ChampSelect',gameId='101',hero='Ashe',role='BOTTOM',liveAvailable=false,liveRequests=0;
 // Exercise real discoverClient, sanitizeSession, clientSnapshot and liveSnapshot,
 // replacing only the HTTPS sockets. No real client port is opened or contacted.
 const response=options=>{assert.equal(options.hostname,'127.0.0.1');const p=options.path;
  if(options.port===2999){liveRequests++;if(!liveAvailable)return {status:503,value:{}};
   if(p==='/liveclientdata/activeplayer')return {value:{riotId:'isolated-player',currentGold:1250,level:8,abilities:Object.fromEntries(['Q','W','E','R'].map(k=>[k,{abilityLevel:k==='Q'?4:1}]))}};
   if(p==='/liveclientdata/playerlist')return {value:[{riotId:'isolated-player',rawChampionName:'game_character_displayname_'+hero,items:[]}]};
   if(p==='/liveclientdata/gamestats')return {value:{gameMode:'CLASSIC',mapNumber:11,gameTime:600}};
   if(p==='/liveclientdata/eventdata')return {value:{Events:[]}};
  }
  assert.equal(options.port,23456);assert.equal(options.method||'GET','GET','A real rune write must never occur in this test');
  if(p==='/lol-gameflow/v1/gameflow-phase')return {value:phase};
  if(p==='/lol-gameflow/v1/session')return {value:{gameData:{gameId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}}};
  if(p==='/lol-champ-select/v1/session')return {value:{localPlayerCellId:1,myTeam:[{cellId:1,championId:data.champions.find(c=>c.id===hero).key,assignedPosition:role}],theirTeam:[],actions:[],bans:{}}};
  throw Error('Unexpected test route '+p);
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const output=response(options),res=new EventEmitter();res.statusCode=output.status||200;res.resume=()=>{};callback(res);res.emit('data',Buffer.from(JSON.stringify(output.value)));res.emit('end');req.emit('close');});req.write=()=>{};req.destroy=e=>{if(e)req.emit('error',e);req.emit('close');};return req;};
 https.get=(options,callback)=>{const req=https.request(options,callback);req.end();return req;};
 require(path.join(base,'electron/main.cjs'));const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=c=>main.webContents.executeJavaScript(c,true);
 await until(()=>js('!!document.querySelector("[data-action=guide-current]")'),'UI missing');const status=()=>js('window.buddy.client(true)'),state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 // Change preferences through the renderer that owns them. A raw IPC save
 // leaves that renderer's preferences stale and a later preparation save can
 // overwrite the fixture's change; that is not the user's settings flow.
 const prefs=async patch=>{
  assert.deepEqual(Object.keys(patch),['autoLive']);
  await js('document.querySelector("[data-action=navigate][data-route=settings]").click()');
  await until(()=>js('!!document.querySelector("[data-action=auto-live]")'),'Live setting missing');
  const enabled=await js('document.querySelector("[data-action=auto-live]").getAttribute("aria-checked")==="true"');
  if(enabled!==patch.autoLive)await js('document.querySelector("[data-action=auto-live]").click()');
  await until(async()=>(await state()).preferences.autoLive===patch.autoLive,'Live preference did not persist');
  await js('document.querySelector("[data-action=navigate][data-route=draft]").click()');
 };
 await status();assert.equal((await state()).guide.selection.id,'Ashe','First selection must prepare a guide without opening one');assert.equal(windows.some(w=>w.webContents.getURL().endsWith('/src/guide.html')),false,'Selection prepares without displaying the in-game window');phase='GameStart';await status();phase='InProgress';await status();const guide=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html')),'Automatic guide missing'),gjs=c=>guide.webContents.executeJavaScript(c,true);await until(()=>gjs('!!document.querySelector(".next-item")'),'Guide UI missing');await until(()=>guide.isVisible(),'Fresh installation must auto-show its first guide');phase='ChampSelect';await status();
 await gjs('window.guide.control("hide")');phase='GameStart';await status();assert.equal(guide.isVisible(),false,'Loading must not auto-show the guide before entering the game');phase='InProgress';const entered=await status();if(!guide.isVisible())console.log(JSON.stringify({entered,guide:await gjs('window.guide.bootstrap()')}));assert.equal(guide.isVisible(),true,'Confirmed prepared guide must auto-show with autoLive disabled');assert.equal((await state()).guide.selection.role,'bottom');assert.equal(liveRequests,0,'Disabled live must never read the local game API');
 // The first live inventory arrives after the selection session has disappeared.
 await prefs({autoLive:true});liveAvailable=true;await js('window.buddy.openGuide()');await until(()=>gjs('window.guide.bootstrap().then(b=>b.model.live.matched)'),'First live data missing');assert.equal((await state()).guide.selection.role,'bottom','Formal role lost after ChampSelect');assert.ok(liveRequests>=3);
 await prefs({autoLive:false});const route=(await gjs('window.guide.bootstrap()')).model.route;
 await gjs(`window.guide.control("item",${JSON.stringify(route[0].id)})`);await gjs(`window.guide.control("purchase-target",${JSON.stringify(route[1].id)})`);await gjs('window.guide.control("stage","key")');
 if((await state()).guide.clickThrough)await gjs('window.guide.control("interaction")');
 await gjs('window.guide.control("hide")');phase='Reconnect';await status();phase='GameStart';await status();phase='InProgress';await status();assert.equal(guide.isVisible(),false,'Same-game loading on reconnect must preserve a deliberately hidden window');
 const retained=(await state()).guide;assert.deepEqual(retained.completedItems,[route[0].id]);assert.equal(retained.purchaseTarget,route[1].id);assert.equal(retained.stage,'key');assert.equal(retained.clickThrough,false);await prefs({autoLive:true});
 phase='EndOfGame';await status();phase='ChampSelect';gameId='102';hero='Jhin';role='MIDDLE';liveAvailable=false;await status();phase='GameStart';await status();phase='InProgress';await status();assert.equal(guide.isVisible(),true,'Unavailable first live must still show this game\'s confirmed preparation');assert.equal((await state()).guide.selection.id,'Jhin');assert.equal((await state()).guide.selection.role,'mid');
 // In-game preparation with an unknown roster cannot disprove a saved combo.
 phase='EndOfGame';await status();const empty=await state();for(const s of empty.draft.slots){s.champion=null;s.locked=false;delete s.clientCellId;delete s.manualPosition;}await js(`window.buddy.saveState(${JSON.stringify(empty)})`);
 hero='Rengar';gameId='103';liveAvailable=false;await js('window.buddy.openGuide({id:"Rengar",role:"bottom",mode:"rift",comboId:"rengar-ivern",loadoutId:"rengar-bush"})');await gjs('window.guide.control("hide")');phase='InProgress';await status();assert.equal(guide.isVisible(),false,'Unknown identity should wait before automatic display');
 liveAvailable=true;await status();assert.equal(guide.isVisible(),true,'First unavailable live must retry after identity is ready');let unknown=(await state()).guide.selection;assert.equal(unknown.role,'bottom','Unknown formal role must preserve prepared role');assert.equal(unknown.comboId,'rengar-ivern','Missing roster disproved a saved combination');assert.equal((await gjs('window.guide.bootstrap()')).model.live.matched,true);assert.equal((await gjs('window.guide.bootstrap()')).model.comboConfirmed,false);
 await gjs('window.guide.control("hide")');await status();assert.equal(guide.isVisible(),false,'Retried auto-show must not repeat after manual hide');
 guide.showInactive();await delay(120);const capture=await guide.webContents.capturePage();await fs.writeFile(path.join(root,'formal-role-after-transition.png'),capture.toPNG());
 const result={passed:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,fullMainStatusFlow:true,firstSelectionPrepares:true,freshInstallationAutoShows:true,realLCUSanitizers:true,loadingPreservesFormalRole:true,autoShowWithoutLive:true,formalRoleAfterSessionDisappears:true,sameGameHiddenReconnect:true,sameGameLoadingRetainsProgress:true,newGameUnavailableLivePreparesCurrent:true,retryAfterFirstLiveFailure:true,unknownRosterKeepsPreparedCombo:true,unknownFormalRoleKeepsPreparedRole:true,loopbackSocketsMocked:true,actualRuneWrites:false,userSettingsIsolated:true};await fs.writeFile(path.join(root,'game-transition-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async e=>{console.error(e);await fs.writeFile(path.join(root,'game-transition-smoke-error.txt'),e.stack).catch(()=>{});app.exit(1);});
