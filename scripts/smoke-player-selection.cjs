const {app,screen,globalShortcut,ipcMain,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),http=require('node:http'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),{pathToFileURL}=require('node:url');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],handlers=new Map(),attempts=[],results=[],writes=[],pointerChecks=[],guideRequests=[],runeRequests=[];
let diagnosticMain,diagnosticSide;
app.setPath('userData',root);globalShortcut.register=()=>false;
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
global.fetch=async()=>{throw Error('External network forbidden in player-selection fixture');};http.request=()=>{throw Error('Real sockets forbidden in player-selection fixture');};
const originalHandle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>{handlers.set(name,handler);originalHandle(name,async(...args)=>{if(name==='prepare-selection')attempts.push(structuredClone(args[1]));if(name==='open-guide')guideRequests.push(structuredClone(args[1]));if(name==='apply-runes')runeRequests.push(structuredClone(args[1]));const result=await handler(...args);if(name==='prepare-selection')results.push({input:structuredClone(args[1]),result:structuredClone(result)});return result;});};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<180;n++){if(await check())return;await delay(50);}throw Error(label);}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile(process.env.RIFT_BUDDY_SMOKE_RELEASE||'release/latest.json','utf8')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'),'utf8')),fixture=JSON.parse(await fs.readFile(path.join(root,'fixture.json'),'utf8')),initial=JSON.parse(await fs.readFile(path.join(root,'settings.json'),'utf8')),hero=id=>data.champions.find(value=>value.id===id);
 const {getBuild}=await import(pathToFileURL(path.join(base,'src/core/builds.mjs'))),{DEFAULT_BUILD_SOURCE,projectBuildSources}=await import(pathToFileURL(path.join(base,'src/core/build-source.mjs'))),{clientPreparationPlan}=await import(pathToFileURL(path.join(base,'src/client-preparation-view.mjs')));
 data.builds=projectBuildSources(JSON.parse(await fs.readFile(path.join(base,'data/builds.json'),'utf8')).entries,DEFAULT_BUILD_SOURCE,data.patch);data.flashSlot='d';data.clientFlashSlot='d';
 assert.equal(data.patch,fixture.patch);const expected={};for(const id of fixture.heroes){const selection={id,role:fixture.role,mode:'rift'},build=getBuild(hero(id),fixture.role,data,selection);assert.ok(build.reference&&build.reference.source==='OP.GG'&&build.reference.patch===data.patch&&build.missing.length===0);assert.deepEqual({patch:build.reference.patch,fetchedAt:build.reference.fetchedAt},fixture.sources[id]);expected[id]=clientPreparationPlan(data,{selection,build}).value;}
 let observer,intent=0,picked=0,completed=false,requests=0,refresh=0,heldRune=null,holdNextRune=false,spell1Id=4,spell2Id=21,page={id:44,name:'Isolated editable page',isEditable:true,isActive:true,current:true};
 const fixed={top:'Ornn',jungle:'Vi',mid:'Ahri',support:'Braum'},roles=['top','jungle','mid','bottom','support'],positions=['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'];
 const snapshot=()=>({gameId:540001,localPlayerCellId:3,myTeam:roles.map((role,cellId)=>({cellId,championId:cellId===3?picked:hero(fixed[role]).key,championPickIntent:cellId===3?intent:0,assignedPosition:positions[cellId],spell1Id:cellId===3?spell1Id:4,spell2Id:cellId===3?spell2Id:12})),theirTeam:[],actions:[roles.map((role,cellId)=>({id:cellId,type:'pick',actorCellId:cellId,championId:cellId===3?picked||intent:hero(fixed[role]).key,completed:cellId===3?completed:true,isInProgress:cellId===3&&!completed}))],timer:{phase:'PLANNING',remainingMs:90000-refresh},bans:{myTeamBans:[],theirTeamBans:[]},allowDuplicatePicks:false});
 const output=options=>{
  requests++;assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);const method=options.method||'GET',route=options.path,body=options.body===undefined?undefined:JSON.parse(options.body);
  if(method==='GET'){
   if(route==='/lol-summoner/v1/current-summoner')return {gameName:'隔离鼠标玩家',tagLine:'TEST'};
   if(route==='/lol-gameflow/v1/gameflow-phase')return 'ChampSelect';
   if(route==='/lol-gameflow/v1/session')return {gameData:{gameId:540001,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
   if(route==='/lol-champ-select/v1/session')return snapshot();
   if(route.endsWith('/pickable-champion-ids'))return data.champions.map(value=>value.key);if(route.endsWith('/disabled-champion-ids'))return [];
   if(route==='/lol-lobby/v2/lobby')return {localMember:{puuid:'isolated-own-player'},members:[{puuid:'isolated-own-player',isLeader:true}]};
   if(route==='/lol-perks/v1/pages')return [page];if(route==='/lol-champ-select/v1/session/my-selection')return {spell1Id,spell2Id};
   if(route==='/data-store/v1/install-dir')return path.join(root,'client-fixture','LeagueClient');if(route==='/lol-chat/v1/conversations')return [];
   throw Error('Unsupported mocked GET '+route);
  }
  writes.push({route,method,body});
  if(route==='/lol-champ-select/v1/session/actions/3'&&method==='PATCH'){assert.equal(body.completed,false,'The application must never lock a champion');intent=body.championId;return {};}
  if(route==='/lol-perks/v1/pages/44'&&method==='PUT'){page={...body,id:44,isEditable:true,isActive:true,current:true};return page;}
  if(route==='/lol-champ-select/v1/session/my-selection'&&method==='PATCH'){({spell1Id,spell2Id}=body);return {};}
  throw Error('Unsupported mocked write '+method+' '+route);
 };
 https.request=(options,callback)=>{const request=new EventEmitter();request.write=body=>{options.body=body;};request.end=()=>queueMicrotask(()=>{const send=()=>{try{const value=output(options),response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');request.emit('close');}catch(error){request.emit('error',error);}};if(holdNextRune&&options.method==='PUT'&&options.path==='/lol-perks/v1/pages/44'){holdNextRune=false;heldRune=send;}else send();});request.destroy=error=>{if(error)request.emit('error',error);};return request;};
 cp.spawn=file=>{assert.ok(file.endsWith('window-observer.exe'));observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
 cp.execFile=(file,args,options,callback)=>{assert.ok(file.endsWith('csc.exe'));queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
 require(path.join(base,'electron/main.cjs'));
 let main,side;await until(()=>{main=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().endsWith('/src/index.html'));return main;},'Main window missing');diagnosticMain=main;
 const js=(window,code)=>window.webContents.executeJavaScript(code,true),event=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame}),state=async()=>structuredClone((await handlers.get('bootstrap')(event(main))).state);
 const control=async(window,selector)=>{await until(()=>js(window,'!!document.querySelector('+JSON.stringify(selector)+')&&!document.querySelector('+JSON.stringify(selector)+').disabled'),'Enabled control missing '+selector);await js(window,'document.querySelector('+JSON.stringify(selector)+').click()');};
 await until(()=>js(main,'!!document.querySelector("[data-client-connect]")'),'Main connection control missing');await until(()=>observer,'Native observer fixture missing');
 const area=screen.getPrimaryDisplay().workArea,anchor={x:area.x+20,y:area.y+20,width:Math.max(600,area.width-500),height:Math.min(800,area.height-40)};observer.stdout.emit('data',JSON.stringify({client:{...screen.dipToScreenRect(null,anchor),foreground:false,minimized:false},game:null})+'\n');
 await control(main,'[data-client-connect]');await until(()=>{side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));return side;},'Independent sidebar missing');diagnosticSide=side;
 const avatar=(window,id)=>window===main?'[data-action=build][data-prepare-click=true][data-role=bottom][data-id='+id+']':'[data-action=companion-preview][data-role=bottom][data-id='+id+']';
 async function point(window,selector){await until(()=>js(window,'!!document.querySelector('+JSON.stringify(selector)+')'),'Real avatar missing '+selector);return js(window,'(()=>{const el=document.querySelector('+JSON.stringify(selector)+');el.scrollIntoView({block:"nearest"});window.__pressedHero=el;const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');}
 function mouse(window,type,point){window.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});}
 async function visibleControl(window,selector){
  await until(()=>js(window,'!!document.querySelector('+JSON.stringify(selector)+')&&!document.querySelector('+JSON.stringify(selector)+').disabled&&document.querySelector('+JSON.stringify(selector)+').checkVisibility()'),'Visible enabled real reentry control missing '+selector);
  await control(window,selector);
 }
 async function nativeClick(window,id,withRefresh=false){
  await js(window,'(()=>{if(window.__pointerProbe)return;window.__pointerProbe={client:0,data:0};window.buddy.onClient(()=>window.__pointerProbe.client++);window.buddy.onData(value=>window.__pointerProbe.data=value.revision);})()');
  const observed=await js(window,'window.__pointerProbe.client'),selector=avatar(window,id),p=await point(window,selector);mouse(window,'mouseMove',p);mouse(window,'mouseDown',p);
  await until(()=>js(window,'window.__pressedHero?.matches(":active")'),'Native mouseDown did not press the real hero button');
  if(withRefresh){
   const before=(await handlers.get('data-snapshot')(event(window))).revision;refresh++;await handlers.get('client-status')(event(window),true);
   const catalog=(await handlers.get('data-snapshot')(event(window))).data.catalog,entry=structuredClone(catalog.duos[0]);entry.id='local-pointer-refresh';entry.name='鼠标按住期间刷新 '+refresh;
   const changed=await handlers.get('catalog-personal')(event(window),entry);assert.ok(changed.dataRevision>before,'A real main-process catalog update must publish data');
   await until(()=>js(window,'window.__pointerProbe.client>'+observed+'&&window.__pointerProbe.data>='+changed.dataRevision),'The pressed renderer did not receive the actual status and data publications');
   await js(window,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   assert.equal(await js(window,'window.__pressedHero.isConnected&&window.__pressedHero===document.querySelector('+JSON.stringify(selector)+')'),true,'Refresh replaced the actual pressed hero button before mouseUp');
   pointerChecks.push({surface:window===main?'main':'sidebar',hero:id,statusRefresh:true,dataRevision:changed.dataRevision,sameDomButton:true});
  }
  mouse(window,'mouseUp',p);
 }
 function samePlan(actual,wanted){assert.equal(actual.champion,wanted.champion);assert.equal(actual.role,wanted.role);assert.deepEqual(actual.page.selectedPerkIds,wanted.page.selectedPerkIds);assert.deepEqual(actual.summoners,wanted.summoners);assert.deepEqual(actual.itemSet.blocks,wanted.itemSet.blocks);}
 async function assertGuide(id){
  await until(async()=>{const saved=await state();return saved.guide?.selection?.id===id&&!saved.guide.selection.comboId;},'Guide did not retain the clicked generic identity');
  let guideWindow;await until(()=>{guideWindow=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().endsWith('/src/guide.html'));return guideWindow;},'Real guide window missing');await until(()=>js(guideWindow,'!!window.guide'),'Guide preload missing');
  const model=(await js(guideWindow,'window.guide.bootstrap()')).model;assert.equal(model.selection.id,id);assert.equal(model.selection.comboId,undefined);assert.deepEqual(model.runes.map(rune=>rune.id),expected[id].page.selectedPerkIds);assert.deepEqual(model.summoners.map(spell=>spell.id),expected[id].summoners);
  const ordinary=getBuild(hero(id),fixture.role,data,{id,role:fixture.role,mode:'rift'});assert.equal(model.sourceUrl,ordinary.reference.sourceUrl);assert.equal(model.fetchedAt,ordinary.reference.fetchedAt);for(const item of ordinary.items)assert.ok(model.route.some(row=>Number(row.id)===Number(item.id)),'Guide lost default source item '+item.id);
 }
 async function assertCompleted(id){
  await until(()=>results.some(value=>!value.input.preselectOnly&&value.input.champion===id&&value.result.complete),'Full default preparation missing for '+id);
  await control(side,'[data-action=companion-tab][data-tab=plan]');await until(()=>js(side,'!!document.querySelector(".configuration-current [data-client-preparation-fingerprint]")||!!document.querySelector("[data-client-preparation-fingerprint]")'),'Sidebar current configuration missing');
  samePlan(await js(side,'JSON.parse(document.querySelector("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]'),expected[id]);
  await control(main,'[data-action=task-configuration],[data-action=task-edit]');await until(()=>js(main,'!!document.querySelector(".drawer [data-client-preparation-fingerprint]")'),'Main current configuration missing');samePlan(await js(main,'JSON.parse(document.querySelector(".drawer [data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]'),expected[id]);
  for(const window of [main,side])await until(()=>js(window,'["hover","runes","spells","items"].every(step=>document.querySelector(":is(.preparation-task,.client-preparation-result) [data-preparation-step="+step+"][data-step-status=done]"))'),'The current task did not replay all four preparation receipts');
  // The guide is explicitly opened from this real task configuration while
  // the client still has an unlocked intent, never an invented confirmed pick.
  await control(main,'.drawer [data-action=open-guide]');
  await assertGuide(id);
  const saved=await state(),selection=saved.preparations.find(value=>value.id===id&&!value.comboId);assert.ok(selection);assert.equal(saved.guide.selection.comboId,undefined);
  assert.deepEqual(saved.preparations.find(value=>value.id==='Ashe'&&value.comboId==='ashe-braum'),initial.preparations.find(value=>value.id==='Ashe'&&value.comboId==='ashe-braum'),'Choosing the generic default must preserve the independently saved old combo');
  const stored=getBuild(hero(id),fixture.role,data,selection),guide=getBuild(hero(id),fixture.role,data,saved.guide.selection);samePlan(clientPreparationPlan(data,{selection,build:stored}).value,expected[id]);samePlan(clientPreparationPlan(data,{selection:saved.guide.selection,build:guide}).value,expected[id]);
  assert.deepEqual(page.selectedPerkIds,expected[id].page.selectedPerkIds);assert.deepEqual([spell1Id,spell2Id],expected[id].summoners.map(spell=>Number(data.spells[spell].key)));
  const imported=JSON.parse(await fs.readFile(path.join(root,'client-fixture','Game','Config','Champions',id,'Recommended',expected[id].itemSet.uid+'.json'),'utf8'));assert.deepEqual(imported.blocks,expected[id].itemSet.blocks);
  const actual=results.findLast(value=>!value.input.preselectOnly&&value.input.champion===id&&value.result.complete);samePlan(actual.input,expected[id]);assert.equal(actual.input.selection.comboId,undefined);
  await control(main,'.drawer [data-action=close]');
 }
 await nativeClick(side,'Ashe',true);await assertCompleted('Ashe');await control(side,'[data-action=companion-tab][data-tab=recommend]');await control(main,'[data-action=task-compare]');
 await nativeClick(main,'Jinx',true);await assertCompleted('Jinx');await control(side,'[data-action=companion-tab][data-tab=recommend]');
 // An earlier full configuration is deliberately pending when the player changes hero.
 holdNextRune=true;await nativeClick(side,'Ashe');await until(()=>heldRune,'Earlier rune operation did not enter the controlled race');await nativeClick(side,'Jinx');await until(()=>intent===hero('Jinx').key,'The latest real avatar click did not preselect while an earlier configuration was pending');heldRune();heldRune=null;
 await until(()=>results.filter(value=>!value.input.preselectOnly&&value.input.champion==='Jinx'&&value.result.complete).length>=2,'Latest hero did not finish after the earlier operation');await assertCompleted('Jinx');
 assert.equal(intent,hero('Jinx').key);assert.ok(writes.filter(value=>value.route.includes('/session/actions/')).every(value=>value.body.completed===false));assert.ok(windows.every(window=>window.isDestroyed()||!window.isVisible()));
 // Only the simulated client/user confirms the last explicitly chosen Ashe.
 await control(side,'[data-action=companion-tab][data-tab=recommend]');const previousAshe=results.filter(value=>!value.input.preselectOnly&&value.input.champion==='Ashe'&&value.result.complete).length;await nativeClick(side,'Ashe');await until(()=>results.filter(value=>!value.input.preselectOnly&&value.input.champion==='Ashe'&&value.result.complete).length>previousAshe,'Ashe did not complete before client confirmation');await assertCompleted('Ashe');
 const beforeConfirmation=writes.length;picked=hero('Ashe').key;intent=0;completed=true;refresh++;await handlers.get('client-status')(event(main),true);await handlers.get('client-status')(event(side),true);
 await until(()=>js(main,'window.buddy.bootstrap().then(value=>value.client.session.myTeam.find(player=>player.cellId===3)?.championId==='+hero('Ashe').key+'&&value.client.session.actions.flat().some(action=>action.actorCellId===3&&action.completed))'),'The real client confirmation did not reach the main renderer');assert.equal(writes.length,beforeConfirmation,'Client confirmation must not perform application writes');
 if(await js(main,'!!document.querySelector(".drawer [data-action=close]")'))await control(main,'.drawer [data-action=close]');
 const reentryInventory=[];
 for(const route of ['draft','builds']){await control(main,'[data-action=navigate][data-route='+route+']');await until(()=>js(main,'document.querySelector("#main").dataset.page==='+JSON.stringify(route)),'Reentry route missing '+route);reentryInventory.push({surface:'main',route,myBuildCount:await js(main,'document.querySelectorAll("[data-action=my-build]").length')});}
 await control(main,'[data-action=navigate][data-route=draft]');
 const buildEntry=reentryInventory.find(value=>value.myBuildCount>0);if(buildEntry){await control(main,'[data-action=navigate][data-route='+buildEntry.route+']');await visibleControl(main,'[data-action=my-build]');await until(()=>js(main,'!!document.querySelector(".drawer [data-client-preparation-fingerprint]")'),'Actual own-build entry did not open');samePlan(await js(main,'JSON.parse(document.querySelector(".drawer [data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]'),expected.Ashe);await control(main,'.drawer [data-action=close]');await control(main,'[data-action=navigate][data-route=draft]');}
 await control(main,'.window-tools>summary');await until(()=>js(main,'document.querySelector(".window-tools").open'),'The real main window/settings menu did not open');reentryInventory.push({surface:'main',route:'draft/window 窗口与设置',guideCurrentVisible:await js(main,'document.querySelector("[data-action=guide-current]").checkVisibility()')});const beforeGuide=guideRequests.length;await visibleControl(main,'[data-action=guide-current]');await until(()=>guideRequests.length>beforeGuide,'The real current-guide button did not invoke its own-selection IPC');assert.equal(guideRequests.at(-1).id,'Ashe');assert.equal(guideRequests.at(-1).comboId,undefined);await assertGuide('Ashe');
 await control(side,'[data-action=companion-tab][data-tab=plan]');await control(side,'.companion-footer-menu>summary');await until(()=>js(side,'document.querySelector(".companion-footer-menu").open'),'Real sidebar operation menu did not open');
 reentryInventory.push({surface:'sidebar',route:'plan/footer 操作',myBuildCount:await js(side,'document.querySelectorAll("[data-action=my-build]").length'),myRunesVisible:await js(side,'document.querySelector("[data-action=my-runes][data-id=Ashe]")?.checkVisibility()')});assert.equal(reentryInventory.at(-1).myRunesVisible,true);
 const beforeRunes=writes.length,beforeRuneRequests=runeRequests.length;await visibleControl(side,'[data-action=my-runes][data-id=Ashe]');await until(()=>writes.length>beforeRunes,'Explicit current-player rune action did not write');await until(()=>js(side,'!document.querySelector("[data-action=my-runes]")?.disabled'),'Current-player rune action did not settle');
 assert.equal(runeRequests.length,beforeRuneRequests+1);assert.deepEqual(runeRequests.at(-1).selectedPerkIds,expected.Ashe.page.selectedPerkIds);assert.equal(writes.length,beforeRunes+1,'The rune-only entry must not rewrite the champion, spells or equipment');assert.equal(writes.at(-1).route,'/lol-perks/v1/pages/44');assert.deepEqual(page.selectedPerkIds,expected.Ashe.page.selectedPerkIds);await assertCompleted('Ashe');
 assert.ok(writes.filter(value=>value.route.includes('/session/actions/')).every(value=>value.body.completed===false));assert.ok(windows.every(window=>window.isDestroyed()||!window.isVisible()));
 const report={passed:true,source,archiveSha256:release?.archiveSha256||null,patch:data.patch,sources:fixture.sources,pointerChecks,latestWins:true,confirmedPickReentry:{clientConfirmed:true,taskAndOwnAgree:true,guideCurrent:true,myRunes:true,myBuild:reentryInventory.some(value=>value.myBuildCount>0)?'tested':'not-rendered; currentPreparationHTML has no production caller; real task configuration tested instead',inventory:reentryInventory},mainSidebarSavedGuideAndMockedClientAgree:true,defaultSource:'OP.GG',realRuneWrites:0,allNetworkMocked:true,requests,mockedRuneWrites:writes.filter(value=>value.route.includes('/lol-perks/')).length,guideRequests,runeRequests,attempts,results,writes};await fs.writeFile(path.join(root,'player-selection.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,guideRequests:guideRequests.length,runeRequests:runeRequests.length,attempts:attempts.length,results:results.length,writes:undefined},null,2));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'failure.json'),JSON.stringify({error:error.stack,attempts,results,writes,pointerChecks,guideRequests,runeRequests},null,2));for(const [name,window] of [['main',diagnosticMain],['sidebar',diagnosticSide]])if(window&&!window.isDestroyed())await fs.writeFile(path.join(root,'failure-'+name+'.html'),await window.webContents.executeJavaScript('document.documentElement.outerHTML').catch(()=>''));app.exit(1);});
