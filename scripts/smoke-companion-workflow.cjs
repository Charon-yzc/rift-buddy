const {app,globalShortcut,screen,clipboard,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),{pathToFileURL}=require('node:url');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[];
let diagnosticMain;
const copiedTexts=[];clipboard.writeText=text=>copiedTexts.push(text);
app.on('browser-window-created',(_e,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.webContents.setBackgroundThrottling(false);});globalShortcut.register=()=>false;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<160;n++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 app.setPath('userData',root);
 const release=JSON.parse(await fs.readFile('release/latest.json')),base=process.env.RIFT_BUDDY_SOURCE==='1'?process.cwd():path.join(release.directory,'resources/app.asar');
 // The fixture loads the packaged main in the Electron harness, whose default
 // getVersion is Electron's version rather than this app's packaged manifest.
 const packagedManifest=JSON.parse(await fs.readFile(path.join(base,'package.json')));app.getVersion=()=>packagedManifest.version;
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));data.builds=JSON.parse(await fs.readFile(path.join(base,'data/builds.json'))).entries;
 if(process.env.RIFT_BUDDY_SMOKE_OLD_SOURCE!=='1'){
  // Isolate cache policy from the revision of the bundled snapshot. This
  // fixture represents a source already parsed by the current collector.
  const {BUILD_PARSER_VERSION}=await import(pathToFileURL(path.join(base,'services/build-json.mjs')).href);
  await fs.mkdir(path.join(root,'data'),{recursive:true});
  await fs.writeFile(path.join(root,'data/builds.json'),JSON.stringify({schema:1,entries:{'Ashe:bottom':{...data.builds['Ashe:bottom'],parserVersion:BUILD_PARSER_VERSION,fetchedAt:new Date().toISOString()}}}));
 }
 if(process.env.RIFT_BUDDY_SMOKE_OLD_SOURCE==='1'){
  // Simulate a later season using only this test's isolated user-data cache.
  // The packaged OP.GG snapshots must remain available after the base upgrade.
  data.version='17.1.1';data.patch='17.1';
  const cached={...data};delete cached.builds;await fs.mkdir(path.join(root,'data'),{recursive:true});
  await fs.writeFile(path.join(root,'data/game.json'),JSON.stringify(cached));
 }
 const {getBuild}=await import(pathToFileURL(path.join(base,'src/core/builds.mjs')).href),hero=id=>data.champions.find(c=>c.id===id);
 let sourceFetches=0,resumeSource;const sourceWait=new Promise(resolve=>resumeSource=resolve);
 global.fetch=async url=>{assert.ok(['lol-api-champion.op.gg','op.gg'].includes(new URL(url).hostname));sourceFetches++;if(sourceFetches===1)await sourceWait;return new Response('{}',{status:503});};
 let picked='',hovered='',teammatePicked='',assigned='',enemyPicked='Malphite',observer,phase='ChampSelect',gameId='1501',offline=false,holdRuneWrite=false,resumeRuneWrite=null,writes=[];
 let page={...getBuild(hero('Ashe'),'bottom',data).runePage,id:44,isEditable:true},preparationAction=null,spells={spell1Id:4,spell2Id:7},hoverWrites=0,spellWrites=0;
 const output=options=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  if(options.path==='/lol-summoner/v1/current-summoner')return {gameName:'隔离测试玩家',tagLine:'TEST'};
  if(options.path==='/lol-gameflow/v1/gameflow-phase')return phase;
  if(options.path==='/lol-gameflow/v1/session')return {gameData:{gameId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  if(options.path==='/lol-champ-select/v1/session')return {localPlayerCellId:1,myTeam:[{cellId:1,championId:picked?hero(picked).key:0,championPickIntent:hovered?hero(hovered).key:0,assignedPosition:assigned},...(teammatePicked?[{cellId:2,championId:hero(teammatePicked).key,assignedPosition:"BOTTOM"}]:[])],theirTeam:[{cellId:6,championId:hero(enemyPicked).key}],actions:preparationAction?[[preparationAction]]:[],bans:{myTeamBans:[hero('Yone').key],theirTeamBans:[]},timer:{phase:'PLANNING',adjustedTimeLeftInPhase:65000}};
  if(preparationAction){
   if(options.path.endsWith('/pickable-champion-ids'))return data.champions.map(c=>c.key);
   if(options.path.endsWith('/disabled-champion-ids'))return [];
   if(options.path.endsWith('/actions/4')&&options.method==='PATCH'){const body=JSON.parse(options.body);assert.equal(body.completed,false);hovered=data.champions.find(c=>c.key===body.championId).id;preparationAction.championId=body.championId;hoverWrites++;return {};}
   if(options.path.endsWith('/my-selection')){if(options.method==='PATCH'){spells=JSON.parse(options.body);spellWrites++;}return spells;}
   if(options.path==='/data-store/v1/install-dir')return path.join(root,'client-fixture','LeagueClient');
  }
  if(options.path==='/lol-perks/v1/pages'){assert.ok(!options.method||options.method==='GET');return [page];}
  assert.equal(options.path,'/lol-perks/v1/pages/44');assert.equal(options.method,'PUT');
  const body=JSON.parse(options.body);writes.push(structuredClone(body));page={...body,id:44,isEditable:true};return page;
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.write=body=>{options.body=body;};req.end=()=>queueMicrotask(()=>{const send=()=>{try{if(offline)throw Object.assign(Error('Isolated client offline'),{code:'ECONNREFUSED'});const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(output(options))));res.emit('end');req.emit('close');}catch(error){req.emit('error',error);}};if(holdRuneWrite&&options.method==='PUT'&&options.path==='/lol-perks/v1/pages/44')resumeRuneWrite=send;else send();});req.destroy=e=>{if(e)req.emit('error',e);};return req;};
 const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{
  if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);
  observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.exitCode=null;observer.kill=()=>observer.stdin.end();return observer;
 };
 let favoriteGate=null;
 const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(channel,handler)=>handle(channel,async(...args)=>{
  if(channel==='save-state'&&favoriteGate&&args[1]?.favorites?.length===favoriteGate.count){
   const gate=favoriteGate;favoriteGate=null;gate.observed=true;await new Promise((resolve,reject)=>{gate.resolve=resolve;gate.reject=reject;});
  }
  return handler(...args);
 });
 require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const fullMain=main;
 diagnosticMain=main;
 const selectSurface=async side=>{await until(()=>{main=side?windows.find(w=>!w.isDestroyed()&&new URL(w.webContents.getURL()||'about:blank').searchParams.get('surface')==='companion'):fullMain;return main&&!main.isDestroyed();},'Requested surface missing');await until(()=>main.webContents.executeJavaScript('!!document.querySelector('+(side?'".companion-shell"':'"[data-action=navigate]"')+')'),'Requested surface not ready');diagnosticMain=main;};
 const js=async code=>{const result=await main.webContents.executeJavaScript(code,true).catch(error=>{console.error('Failed smoke expression:',code);throw error;});if(code==='window.buddy.companionMode(false)')await selectSurface(false);if(code==='window.buddy.companionMode(true)')await selectSurface(true);return result;};
 const click=async selector=>{if(selector.includes('companion-roster-plan')&&!await js('!!document.querySelector('+JSON.stringify(selector)+')'))await js('document.querySelector("[data-action=companion-tab][data-tab=recommend]").click()');await js('document.querySelector('+JSON.stringify(selector)+').click()');if(selector==='[data-action=companion-full]')await selectSurface(false);if(selector==='[data-action=companion-attach]')await selectSurface(true);};
 const change=async(selector,value)=>{if(selector==='#companion-scope'){await click('[data-action=draft-scope][data-scope='+value+']');return;}if(selector==='#solo-role'&&!await js('!!document.querySelector("#solo-role")'))await click('[data-action=companion-tab][data-tab=recommend]');if(selector.startsWith('[data-companion-field=')&&!await js('!!document.querySelector('+JSON.stringify(selector)+')'))await click('[data-action=companion-tab][data-tab=plan]');return js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');el.value='+JSON.stringify(String(value))+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');};
 let resumeSidebar=false;
 const sync=async()=>{if(main.isDestroyed()||phase!=='ChampSelect'||offline){if(main.isDestroyed()||main!==fullMain)resumeSidebar=true;await selectSurface(false);}await js('window.buddy.client(true)');await click('[data-action=sync]');await delay(180);if(phase==='ChampSelect'&&!offline&&resumeSidebar){await selectSurface(true);resumeSidebar=false;await click('[data-action=sync]');await delay(180);}};
 const toggleAutoSync=()=>js('(()=>{const b=document.createElement("button");b.dataset.action="auto-sync";document.body.append(b);b.click();b.remove();})()');
 const backgroundSync=async()=>{await js('window.buddy.client(true)');await delay(250);};
 await until(()=>js('!!document.querySelector("#solo-role")'),'Main not loaded');await until(()=>observer,'Observer missing');
 const area=screen.getPrimaryDisplay().workArea,anchor={x:area.x+20,y:area.y+40,width:Math.min(1200,area.width-560),height:Math.min(850,area.height-100)},anchorBefore=structuredClone(anchor);
 observer.stdout.emit('data',JSON.stringify({client:{...screen.dipToScreenRect(null,anchor),foreground:false,minimized:false},game:null})+'\n');await sync();
 await selectSurface(true);
 await until(()=>js('document.body.classList.contains("companion-mode")'),'Sidebar missing');
 resumeSource();
 const capture=async name=>{await main.webContents.executeJavaScript('[...document.images].forEach(image=>image.loading="eager")');await fs.writeFile(path.join(root,name+'.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 const state=()=>js('window.buddy.bootstrap().then(value=>value.state)');
 const payload=()=>js('JSON.parse(document.querySelector(".configuration-current").dataset.clientPreparationFingerprint)[0]');
 const wholeButton='.configuration-current [data-action=configuration-switch]';
 picked='Volibear';assigned='TOP';preparationAction={id:4,type:'pick',actorCellId:1,championId:hero(picked).key,completed:true,isInProgress:false};
 await sync();await click('[data-action=companion-tab][data-tab=plan]');
 await until(()=>js('!!document.querySelector(".configuration-current")'),'Current configuration missing');
 assert.equal(writes.length,0,'Synchronization must not apply a configuration');
 assert.equal(await js('document.querySelectorAll(".configuration-choices>.configuration-choice").length'),3);
 assert.equal(await js('document.querySelectorAll("[data-companion-field],.adjust-button").length'),0);
 assert.ok(await js('[...document.querySelectorAll(".configuration-current [data-rune-id],.configuration-current [data-item-id]")].some(node=>/\\d/.test(node.title))'));
 const alternatives=await js('[...document.querySelectorAll(".configuration-choice:not(.configuration-current) [data-action=configuration-switch]")].map(button=>({id:button.dataset.config,fingerprint:button.closest("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint}))');
 assert.ok(alternatives.length>=2,'Fixture must supply real whole alternatives');
 const selected=JSON.parse(alternatives[0].fingerprint)[0];await click('[data-action=configuration-switch][data-config="'+alternatives[0].id+'"]');
 await until(()=>writes.length===1&&spellWrites===1,'Whole switch did not apply runes and D/F once');
 await until(()=>js('!document.querySelector(".configuration-current [data-action=configuration-switch]").disabled'),'Whole switch stayed busy');
 assert.deepEqual(page.selectedPerkIds,selected.page.selectedPerkIds);assert.deepEqual(await payload(),selected);assert.equal(hoverWrites,0,'A locked hero must not be replaced');
 assert.equal(await js('document.querySelectorAll(".client-preparation-result [data-step-status=done]").length'),4);
 const beforeSource=writes.length;await change('[data-build-source-field=region]','kr');await delay(200);assert.equal(writes.length,beforeSource,'Browsing a source applied it');await change('[data-build-source-field=region]','global');await delay(250);assert.deepEqual((await payload()).page,selected.page);
 await click('[data-action=companion-favorite]');await until(async()=>(await state()).favorites.some(value=>value.type==='build'&&value.champion==='Volibear'),'Whole configuration favorite missing');
 const favorite=(await state()).favorites.find(value=>value.type==='build'&&value.champion==='Volibear'),rendered=await payload();
 const currentData=(await js('window.buddy.bootstrap()')).data,stored=getBuild(currentData.champions.find(value=>value.id==='Volibear'),'top',currentData,{...favorite,id:'Volibear'});
 assert.deepEqual(stored.runePage,rendered.page);assert.deepEqual(stored.summoners,rendered.summoners);
 for(const width of [280,360,440]){main.setContentSize(width,720);await delay(130);assert.equal(await js('document.documentElement.scrollWidth>innerWidth+1'),false,'Configuration overflow at '+width);assert.equal(await js('document.querySelectorAll(".configuration-equipment b,.configuration-runes span>span").length'),0);await capture('whole-configuration-'+width);}
 // A public teammate opens a read-only reference. My Configuration returns to
 // the actual local hero, without needing another preparation click.
 teammatePicked='Ashe';await sync();await click('[data-action=companion-tab][data-tab=recommend]');
 const beforeReadonly=writes.length;await click('[data-action=companion-roster-plan][data-id=Ashe]');
 assert.equal(await js('[...document.querySelectorAll("[data-action=configuration-switch]")].every(button=>button.disabled)'),true);
 await click('[data-action=companion-tab][data-tab=plan]');assert.equal((await payload()).champion,'Volibear');assert.equal(writes.length,beforeReadonly);
 await click('[data-action=companion-tab][data-tab=recommend]');assert.equal(await js('document.querySelectorAll(".roster-lock").length'),1);
 await change('#solo-role','support');await sync();assert.equal(picked,'Volibear');assert.equal(hoverWrites,0,'Changing lane replaced the locked hero');
 const accepted=await state();assert.equal(accepted.draft.slots.find(value=>value.champion==='Volibear').role,'support');assert.equal(accepted.draft.slots.filter(value=>value.party).length,accepted.draft.partyCount);
 gameId='1502';picked='';hovered='';teammatePicked='';assigned='';preparationAction={id:4,type:'pick',actorCellId:1,championId:0,completed:false,isInProgress:true};await sync();
 assert.equal(await js('document.querySelectorAll("[data-step-status=done]").length'),0,'New round retained configuration confirmations');
 assert.ok((await state()).favorites.some(value=>value.id===favorite.id),'Clearing round state removed a personal favorite');
 assert.ok(windows.every(window=>window.isDestroyed()||!window.isVisible()));
 const report={passed:true,archiveSha256:release.archiveSha256,wholeSwitch:true,currentPlusTwo:true,numericTooltips:true,sourceChangesDoNotWrite:true,favoritePayloadPreserved:true,lockedHeroUnchanged:true,lockedHeroLaneCanMove:true,readonlyPeerReturnsToSelf:true,newRoundClearsReceipts:true,sidebarWidths:[280,360,440],syntheticLcuOnly:true,actualRuneWrites:0,mockedRuneWrites:writes.length};
 await fs.writeFile(path.join(root,'companion-workflow.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'companion-workflow-error.txt'),error.stack).catch(()=>{});if(diagnosticMain&&!diagnosticMain.isDestroyed())await fs.writeFile(path.join(root,'failure.html'),await diagnosticMain.webContents.executeJavaScript('document.documentElement.outerHTML').catch(()=>''));app.exit(1);});
