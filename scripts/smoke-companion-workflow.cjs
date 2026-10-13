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
  if(options.path==='/lol-gameflow/v1/gameflow-phase')return phase;
  if(options.path==='/lol-gameflow/v1/session')return {gameData:{gameId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  if(options.path==='/lol-champ-select/v1/session')return {localPlayerCellId:1,myTeam:[{cellId:1,championId:picked?hero(picked).key:0,championPickIntent:hovered?hero(hovered).key:0,assignedPosition:assigned},...(teammatePicked?[{cellId:2,championId:hero(teammatePicked).key,assignedPosition:"BOTTOM"}]:[])],theirTeam:[{cellId:6,championId:hero(enemyPicked).key}],actions:preparationAction?[[preparationAction]]:[],bans:{myTeamBans:[hero('Yone').key],theirTeamBans:[]},timer:{phase:'PLANNING',adjustedTimeLeftInPhase:65000}};
  if(preparationAction){
   if(options.path.endsWith('/pickable-champion-ids'))return data.champions.map(c=>c.key);
   if(options.path.endsWith('/disabled-champion-ids'))return [];
   if(options.path.endsWith('/actions/4')&&options.method==='PATCH'){const body=JSON.parse(options.body);assert.equal(body.completed,false);hovered=data.champions.find(c=>c.key===body.championId).id;preparationAction.championId=body.championId;hoverWrites++;return {};}
   if(options.path.endsWith('/my-selection')){if(options.method==='PATCH'){spells=JSON.parse(options.body);spellWrites++;}return spells;}
   if(options.path==='/data-store/v1/install-dir')return path.join(root,'client-fixture');
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
 await until(()=>js('document.querySelectorAll(".companion-candidate").length===3'),'Three primary automatic candidates missing');
 assert.ok(main.getBounds().width>=438&&main.getBounds().width<=441,'Default sidebar must use 440 logical pixels when space is available');assert.ok(!fullMain.isDestroyed(),'Main and sidebar must coexist');assert.deepEqual(anchor,anchorBefore);assert.equal(main.isVisible(),false);assert.equal(writes.length,0);
 const capture=async name=>{
  await js('[...document.images].forEach(i=>i.loading="eager")');
  await until(()=>js('[...document.querySelectorAll(".companion-shell img")].every(i=>i.complete&&i.naturalWidth>0)'),'Missing bundled image');
  await js('document.querySelector("#toast").className=""');
  await js('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
  await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await delay(150);
  await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await fs.writeFile(path.join(root,name+'.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 };
 await capture('recommend');
 // Default party recommendations are intentional. This section exercises
 // the explicit personal-recommendation task and its lane changes.
 await click('[data-action=draft-scope][data-scope=solo]');
 await click('[data-action=companion-tab][data-tab=plan]');
 // A declared lane exists before choosing a champion. Visible lane and
 // candidates follow the formal lane until the player explicitly overrides it.
 await change('#solo-role','top');assigned='JUNGLE';await sync();
 assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.draft.soloRole)'),'top','Declared lane overwrote the explicit before-pick lane');
 await click('[data-action=position-auto]');await sync();
 assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.draft.soloRole)'),'jungle');
 assert.equal(await js('!!document.querySelector("#solo-role")?.disabled'),false);
 await click('[data-action=companion-tab][data-tab=recommend]');
 await until(()=>js('document.querySelectorAll(".companion-candidate").length===3&&[...document.querySelectorAll(".companion-candidate [data-action=companion-preview]")].every(b=>b.dataset.role==="jungle")'),'Before-pick candidates ignored the declared jungle lane');
 assert.equal((await js('window.buddy.bootstrap()')).state.draft.soloRole,'jungle');
 assert.equal(writes.length,0);await capture('assigned-before-pick');
 assigned='';await sync();await click('[data-action=companion-tab][data-tab=recommend]');await change('#solo-role','jungle');
 await js('window.beforeAssignmentRole=document.querySelector("#solo-role");beforeAssignmentRole.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));void 0');
 assigned='JUNGLE';await sync();
 assert.equal(await js('!!document.querySelector("#solo-role")?.disabled'),false,'The player must be able to explicitly change the tactical lane');
 assert.equal(await js('beforeAssignmentRole.isConnected'),false,'A newly declared lane did not replace the stale editable control');
 assigned='';await sync();await change('#solo-role','');
 await click('[data-action=companion-tab][data-tab=recommend]');
 await until(()=>js('!!document.querySelector("[data-action=more-candidates]")'),'More candidates missing');await click('[data-action=more-candidates]');
 await until(()=>js('new Set([...document.querySelectorAll(".companion-candidate [data-action=companion-preview]")].map(b=>b.dataset.role)).size===5'),'Unknown lane did not restore separate lane candidates');
 hovered='Volibear';await sync();
 assert.equal(await js('document.querySelector(".companion-tabs .active").dataset.tab'),'recommend','A client hover must preserve the selection and team view');
 await click('[data-action=companion-tab][data-tab=plan]');
 assert.equal(await js('document.querySelector("[data-companion-field=rune]")?.dataset.plan==="Volibear:top:rift"'),true);assert.equal(await js('document.querySelectorAll("[data-action=my-runes]").length'),0);
 await change('#solo-role','top');
 const previewRune=getBuild(hero('Volibear'),'top',data).runeOptions.at(-1);
 await change('[data-companion-field=rune]',previewRune.id);await change('[data-companion-field=core]',1);await capture('intent-plan');
 assert.equal((await js('window.buddy.bootstrap()')).state.guide,null,'Preselection must not create an in-game selection');assert.equal(writes.length,0);
 hovered='Vayne';await sync();await click('[data-action=companion-tab][data-tab=plan]');assert.ok(await js('document.querySelector(".companion-complete-summary").textContent.includes("薇恩")'));
 hovered='Volibear';await sync();await click('[data-action=companion-tab][data-tab=plan]');assert.equal(await js('document.querySelector("[data-companion-field=rune]").value'),previewRune.id);assert.equal(await js('document.querySelector("[data-companion-field=core]").value'),'1');
 await click('[data-action=companion-tab][data-tab=recommend]');
 await click('[data-action=companion-preview]');assert.ok(await js('!!document.querySelector(".companion-preview")'));assert.equal(await js('document.querySelectorAll(".drawer").length'),0);assert.equal(writes.length,0);
 const manualPreview=await js('document.querySelector("[data-companion-field=rune]").dataset.plan');hovered='Vayne';await sync();assert.equal(await js('document.querySelector("[data-companion-field=rune]").dataset.plan'),manualPreview,'Intent changes replaced a manually viewed plan');
 hovered='Volibear';await sync();await click('[data-action=companion-current]');
 picked='Volibear';hovered='';await sync();await until(async()=>((await js('window.buddy.bootstrap()')).state.guide?.selection.runeId===previewRune.id),'Actual pick lost the preview rune choice');
 assert.equal((await js('window.buddy.bootstrap()')).state.guide.selection.coreIndex,1,'Actual pick lost the preview equipment route');
 await until(()=>js('document.querySelector(".companion-complete-summary")?.textContent.includes("沃利贝尔")&&!document.querySelector(".companion-preview")'),'Actual pick did not replace the intent view');
 assert.equal(await js('document.querySelector(".companion-tabs .active").dataset.tab'),'plan','An actual pick must open the current configuration');assert.equal(await js('document.querySelectorAll(".companion-preview").length'),0);
 await click('[data-action=companion-tab][data-tab=plan]');
 await change('#solo-role','top');await delay(200);
 assert.equal((await js('window.buddy.bootstrap()')).state.draft.slots.find(s=>s.role==='top').champion,'Volibear');
 // Both presentations edit the same manually chosen position in blind pick.
 await js('window.buddy.companionMode(false)');await until(()=>js('!document.body.classList.contains("companion-mode")'),'Full UI did not open for lane choice');
 await change('#solo-role','jungle');await sync();
 assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.draft.soloRole)'),'jungle','A poll undid the full-window manual lane choice');
 assert.equal((await js('window.buddy.bootstrap()')).state.draft.slots.find(s=>s.role==='jungle').champion,'Volibear','Full-window lane choice did not move the local pick');
 await until(async()=>((await js('window.buddy.bootstrap()')).state.guide.selection.role==='jungle'),'Changed manual lane did not reach the actual preparation');
 await change('#solo-role','top');await sync();
 await js('window.buddy.companionMode(true)');await until(()=>js('document.body.classList.contains("companion-mode")'),'Sidebar did not return after lane choice');
 await click('[data-action=companion-tab][data-tab=plan]');await until(()=>js('!!document.querySelector("[data-companion-field=core]")'),'Inline core selector missing');
 const b=getBuild(hero('Volibear'),'top',data),rune=b.runeOptions.find(o=>o.page.selectedPerkIds[0]!==b.runePage.selectedPerkIds[0]),skill=b.skillChoices.at(-1);
 await change('[data-companion-field=rune]',rune.id);await change('[data-companion-field=core]',1);await change('[data-companion-field=skill]',skill.id);
 await until(async()=>{const selected=(await js('window.buddy.bootstrap()')).state.guide?.selection;return selected?.id==='Volibear'&&selected.role==='top'&&selected.runeId===rune.id&&selected.skillId===skill.id&&selected.coreIndex===1;},'Inline configuration edits were not saved');
 assert.equal(await js('document.querySelector("[data-companion-field=rune]").value'),rune.id);assert.equal(await js('document.querySelector("[data-companion-field=core]").value'),'1');
 const prepared=(await js('window.buddy.bootstrap()')).state.guide.selection;assert.equal(prepared.runeId,rune.id);assert.equal(prepared.skillId,skill.id);assert.equal(prepared.coreIndex,1);
 await toggleAutoSync();
 await js('document.querySelector("[data-action=companion-favorite]").focus();void 0');
 assert.equal(await js('document.activeElement.dataset.action'),'companion-favorite','Fixture did not focus the actual favorite control');
 await backgroundSync();
 assert.equal(await js('document.activeElement.dataset.action'),'companion-favorite','A same-plan client refresh lost keyboard focus');
 await js('window.openCoreSelect=document.querySelector("[data-companion-field=core]");openCoreSelect.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));void 0');
 enemyPicked='Vayne';await backgroundSync();
 assert.equal(await js('openCoreSelect===document.querySelector("[data-companion-field=core]")'),true,'A public pick update destroyed the open equipment menu');
 await change('[data-companion-field=core]',0);await delay(100);
 assert.equal(await js('openCoreSelect.isConnected'),false,'Finished selection did not repaint the newest preparation');
 await change('[data-companion-field=core]',1);
 await js('window.openCoreSelect=document.querySelector("[data-companion-field=core]");openCoreSelect.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));void 0');
 enemyPicked='Malphite';await backgroundSync();
 assert.equal(await js('openCoreSelect.isConnected'),true,'A second public pick update closed the menu');
 await js('openCoreSelect.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));void 0');await delay(100);
 assert.equal(await js('openCoreSelect.isConnected'),false,'Cancelling selection did not repaint the pending update');
 assert.equal(await js('document.querySelector("[data-companion-field=core]").value'),'1');
 // A delayed Escape from the previous menu cannot close a newly opened one.
 await js('(()=>{const previous=document.querySelector("[data-companion-field=core]");previous.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));previous.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));window.nextRuneSelect=document.querySelector("[data-companion-field=rune]");nextRuneSelect.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));})()');
 enemyPicked='Vayne';await backgroundSync();assert.equal(await js('nextRuneSelect.isConnected'),true,'An old menu cancellation closed the new rune menu');
 await js('nextRuneSelect.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));void 0');await delay(100);
 assert.equal(await js('nextRuneSelect.isConnected'),false,'The current menu cancellation must still apply the pending update');
 enemyPicked='Malphite';await backgroundSync();
 await toggleAutoSync();
 assert.equal(writes.length,0,'Changing options must not write client runes');await capture('plan');
 assert.equal(await js('document.querySelector(".companion-items").children.length'),2,'Repeated potions wasted another row');
 assert.ok(await js('document.querySelector(".companion-items").textContent.includes("生命药水 × 2")'));
 assert.ok(await js('document.querySelector(".companion-items").textContent.includes("100 金")'));
 assert.equal(await js('document.querySelectorAll("[data-action=companion-core]").length'),3,'Core comparison missing');
 await click('[data-action=companion-jump][data-section=items]');
 assert.equal(await js('document.querySelector("[data-companion-disclosure=edit-items]").open'),true,'Opening equipment adjustment must show source routes immediately');
 await sync();
 assert.equal(await js('document.querySelector("[data-companion-disclosure=edit-items]").open'),true,'Client sync closed the core comparison');
 await click('[data-action=companion-core][data-id="0"]');await until(async()=>(await js('window.buddy.bootstrap()')).state.guide.selection.coreIndex===0,'First core route was not saved');
 assert.equal(await js('document.querySelector("[data-companion-disclosure=edit-items]").open'),true,'Changing a route closed the comparison');
 await click('[data-action=companion-core][data-id="1"]');await until(async()=>(await js('window.buddy.bootstrap()')).state.guide.selection.coreIndex===1,'Second core route was not saved');
 assert.equal(writes.length,0,'Core cards must not apply runes');
 await click('[data-companion-disclosure=edit-items] > summary');
 await click('[data-companion-disclosure=source] > summary');await click('[data-action=companion-refresh]');
 await until(()=>sourceFetches===1,'Public source refresh missing');
 await until(()=>js('document.querySelector("[data-action=companion-refresh]").disabled'),'Sidebar refresh button was not disabled');
 assert.ok(await js('document.querySelector(".companion-refresh-state").textContent.includes("正在刷新")'));
 await sync();assert.equal(await js('document.querySelector("[data-companion-disclosure=source]").open'),true,'Polling closed the source details');
 await capture('refresh-pending');resumeSource();
 await until(()=>js('document.querySelector(".companion-refresh-state")?.textContent.includes("保留当前参考")'),'Source failure was not visible in the sidebar');
 assert.equal(await js('document.querySelector(".companion-refresh-state").textContent.includes("Error invoking")'),false,'Technical IPC text leaked into the product');
 assert.equal(await js('document.querySelector("[data-action=companion-refresh]").disabled'),false);
 assert.equal(await js('document.querySelector("[data-companion-field=rune]").value'),rune.id);
 assert.equal(await js('document.querySelector("[data-companion-field=core]").value'),'1');assert.equal(sourceFetches,2);
 await capture('refresh-failed');await click('[data-companion-disclosure=source] > summary');
 await click('[data-action=companion-favorite]');await delay(150);const favorite=(await js('window.buddy.bootstrap()')).state.favorites.find(f=>f.champion==='Volibear');assert.equal(favorite.runeId,rune.id);assert.equal(favorite.skillId,skill.id);
 assert.equal(await js('document.querySelector("[data-action=companion-favorite]").getAttribute("aria-pressed")'),'true');
 const favoriteLater=await js('document.querySelector("[data-action=companion-later]").dataset.id');
 await click('[data-companion-disclosure=later] > summary');
 await click('[data-action=companion-later]');await delay(150);
 assert.equal(await js('document.querySelector("[data-companion-disclosure=later]").open'),true,'Late selection closed the options');
 await sync();assert.equal(await js('document.querySelector("[data-companion-disclosure=later]").open'),true,'Polling closed late equipment');
 assert.equal(await js('document.querySelector("[data-action=companion-favorite]").getAttribute("aria-pressed")'),'false','A different late plan is already marked saved');
 await click('[data-action=companion-favorite]');await delay(150);
 const savedLate=(await js('window.buddy.bootstrap()')).state.favorites.filter(f=>f.champion==='Volibear');
 assert.equal(savedLate.length,2,'Saving another late plan removed the earlier favorite');
 const lateFavorite=savedLate.find(f=>f.laterIds?.includes(Number(favoriteLater)));assert.ok(lateFavorite);
 await click('[data-action=companion-later]');await delay(150);
 assert.equal(await js('document.querySelector("[data-action=companion-favorite]").getAttribute("aria-pressed")'),'true','Original saved plan was lost');
 await click('[data-action=companion-full]');await click('[data-action=presentation-open]');await click('[data-field=textScale][data-value="1.25"]');
 await until(()=>js('getComputedStyle(document.querySelector(".presentation-preview b")).fontSize==="21.25px"'),'Sidebar font setting missing');
 assert.equal((await js('window.buddy.bootstrap()')).state.preferences.presentation.textScale,1.25);
 await click('[data-action=close]');await click('[data-action=companion-attach]');await sync();await click('[data-action=companion-tab][data-tab=plan]');await capture('sidebar-settings');await click('[data-action=companion-jump][data-section=items]');await capture('large-plan');
 await js('window.buddy.bootstrap().then(b=>window.buddy.saveState({...b.state,preferences:{...b.state.preferences,presentation:{textScale:1,guideModules:[]}}}))');
 assert.equal((await js('window.buddy.bootstrap()')).state.preferences.presentation.textScale,1.25,'A stale whole-state write overwrote new presentation');
 await js('window.buddy.presentation({field:"reset"})');await delay(100);

 await click('[data-action=companion-jump][data-section=runes]');await capture('runes');
 assert.equal(await js('document.querySelectorAll(".companion-rune").length'),6);
 const position=await js('document.querySelector(".companion-content").scrollTop');assert.ok(position>100);
 await click('[data-action=companion-tab][data-tab=team]');assert.ok(await js('document.querySelector(".companion-content").textContent.includes("墨菲特")'));assert.ok(await js('document.querySelector(".companion-content").textContent.includes("永恩")'));await capture('team');
 await click('[data-action=companion-tab][data-tab=plan]');assert.ok(Math.abs((await js('document.querySelector(".companion-content").scrollTop'))-position)<=3);await sync();
 assert.equal(await js('document.querySelector("[data-companion-field=rune]").value'),rune.id);assert.ok(Math.abs((await js('document.querySelector(".companion-content").scrollTop'))-position)<=3);
 await click('[data-action=my-runes]');await until(()=>writes.length===1,'Explicit rune replacement missing');await until(()=>js('document.querySelector("[data-action=my-runes]")?.textContent.includes("重新应用符文")'),'Standalone rune confirmation missing');assert.deepEqual(writes[0].selectedPerkIds,rune.page.selectedPerkIds);
 // A preview has its own choices; the persistent action always names the actual local champion.
 teammatePicked='Ashe';await sync();await click('[data-action=companion-roster-plan][data-id=Ashe]');
 assert.match(await js('document.querySelector("[data-action=my-runes]").textContent'),/符文/);assert.equal(await js('document.querySelector("[data-action=my-runes]").dataset.id'),'Volibear');
 await click('[data-action=companion-current]');assert.equal(await js('document.querySelector("[data-companion-field=rune]").value'),rune.id);teammatePicked='';await sync();
 await js('window.staleSelect=document.querySelector("[data-companion-field=rune]").cloneNode(true);void 0');
 await toggleAutoSync();
 await js('window.previousHeroSelect=document.querySelector("[data-companion-field=rune]");previousHeroSelect.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));void 0');
 await js('document.querySelector("[data-action=my-runes]").focus();void 0');
 picked='Ashe';assigned='bottom';await backgroundSync();
 await until(()=>js('!previousHeroSelect.isConnected'),'Changing the local champion retained an invalid open menu');
 assert.equal(await js('previousHeroSelect.isConnected'),false,'Changing the local champion retained an invalid open menu');
 await toggleAutoSync();
 await click('[data-action=companion-tab][data-tab=plan]');
 assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.draft.soloRole)'),'top','Champion swap lost the manual position');
 await click('[data-action=position-auto]');await sync();
 assert.equal(await js('document.querySelector("[data-action=my-runes]").dataset.id'),'Ashe');assert.equal(await js('!!document.querySelector("#solo-role")?.disabled'),false);
 assert.notEqual(await js('document.activeElement.dataset.action'),'my-runes','Changing champion carried keyboard focus onto another rune target');
 assert.equal(await js('document.querySelector("[data-companion-disclosure=later]").open'),false,'Another hero inherited the open options');
 assert.equal(await js('document.querySelectorAll(".companion-refresh-state").length'),0,'Another hero inherited a source error');
 await js('document.body.append(staleSelect);staleSelect.dispatchEvent(new Event("change",{bubbles:true}));staleSelect.remove()');assert.ok(await js('document.querySelector("#toast").textContent.includes("选人已变化")'));assert.equal(writes.length,1);
 await js('window.buddy.presentation({field:"textScale",value:1.25})');await delay(100);
 await click('[data-action=companion-jump][data-section=runes]');
 main.setSize(280,320);await delay(150);
 assert.ok(main.getSize()[1]>=Math.min(320,area.height),'Sidebar allowed shrinking below its minimum');
 assert.ok(await js('document.querySelector(".companion-content").clientHeight>0'),'Minimum sidebar height must retain a scrollable content area');
 for(const size of [{width:360,height:600},{width:280,height:480}]){
  observer.stdout.emit('data',JSON.stringify({client:{...screen.dipToScreenRect(null,anchor),foreground:false,minimized:false},game:null})+'\n');
  main.setContentSize(size.width,size.height);await until(()=>js('Math.abs(innerWidth-'+size.width+')<=1'),'Sidebar content did not reach '+size.width+' logical pixels');
  await click('[data-action=companion-jump][data-section=runes]');
  const metrics=await js('({width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,content:document.querySelector(".companion-content").clientHeight,footer:document.querySelector(".companion-footer").getBoundingClientRect().bottom,button:document.querySelector("[data-action=my-runes]").getBoundingClientRect().bottom})');
  assert.ok(metrics.scroll<=metrics.width,'Horizontal overflow at '+size.width+': '+JSON.stringify(metrics));assert.ok(metrics.content>=150,'Content squeezed at '+size.width);assert.ok(metrics.footer<=metrics.height+1);assert.ok(metrics.button<=metrics.height);await capture('plan-'+size.width);
  const copiesBefore=copiedTexts.length;await click('[data-action=window-info]');
  await until(()=>js('document.querySelector("[data-window-info]")?.textContent.includes("按缩放换算")'),'Window report missing');
  assert.equal(copiedTexts.length,copiesBefore,'Opening window info copied without a click');
  assert.ok(await js('document.querySelector("[data-window-info]").textContent.includes("游戏：未检测到当前外框")'));
  const info=await js('window.buddy.windowInfo()');assert.equal(info.observedClient.pixels.width,screen.dipToScreenRect(null,anchor).width);assert.equal(info.observedGame,null);
  assert.doesNotMatch(JSON.stringify(info),/isolated-test-only|lockfile|installPath|auth|token/);
  assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'),'Window report overflowed at '+size.width);
  await capture('window-info-'+size.width+'-top');
  await js('document.querySelector("[data-window-info]").scrollTop=10000;void 0');
  assert.ok(await js('document.querySelector("[data-action=window-info-copy]").getBoundingClientRect().bottom<=innerHeight'),'Window report actions were not reachable');
  await click('[data-action=window-info-copy]');assert.equal(copiedTexts.length,copiesBefore+1);assert.match(copiedTexts.at(-1),/DIP/);assert.match(copiedTexts.at(-1),/外框不等于/);
  await capture('window-info-'+size.width);
  await click('[data-action=close]');
 }
 await js('window.buddy.presentation({field:"reset"})');await delay(100);
 main.setBounds({...main.getBounds(),width:440,height:850});picked='Chogath';assigned='jungle';await sync();
 await click('[data-action=companion-tab][data-tab=plan]');
 assert.equal(await js('document.querySelector("[data-action=my-runes]").dataset.id'),'Chogath');
 const cho=getBuild(hero('Chogath'),'jungle',data);assert.equal(cho.runePage.selectedPerkIds[0],9923);
 assert.equal(await js('document.querySelector(".companion-content").textContent.includes("旧版本参考")'),cho.referenceStale);
 assert.ok(await js('document.querySelector("[data-companion-field=rune]").selectedOptions[0].textContent.includes("丛刃")'));
 await click('[data-action=companion-jump][data-section=items]');
 const later=await js('document.querySelector("[data-action=companion-later]").dataset.id');
 await js('document.querySelector("[data-action=companion-later]").closest("details").open=true');
 await click('[data-action=companion-later]');await until(async()=>JSON.stringify((await js('window.buddy.bootstrap()')).state.guide.selection.laterIds)===JSON.stringify([Number(later)]),'Late choice did not reach the saved guide');
 assert.deepEqual((await js('window.buddy.bootstrap()')).state.guide.selection.laterIds,[Number(later)]);
 assert.equal(writes.length,1,'Late choices must not write runes');await capture('chogath-jungle');
 await click('[data-action=my-runes]');await until(()=>writes.length===2,'Cho source rune application missing');assert.equal(writes.length,2);assert.deepEqual(writes.at(-1).selectedPerkIds,cho.runePage.selectedPerkIds);
 await until(()=>js('document.querySelector(".companion-shell")?.dataset.tab==="plan"&&document.querySelector("[data-action=my-runes]")?.textContent.includes("重新应用符文")'),'Successful rune application must finish on the current configuration with its confirmation');
 await click('[data-action=companion-tab][data-tab=plan]');
 const restoredDisclosureScope=await js('document.querySelector(".companion-content").dataset.disclosureScope');assert.equal(restoredDisclosureScope,'plan:Chogath:jungle:rift','Resume late choices in the same declared plan');
 await js('document.querySelector("[data-action=companion-later]").closest("details").open=true');
 await click('[data-action=companion-later]');await until(async()=>JSON.stringify((await js('window.buddy.bootstrap()')).state.guide.selection.laterIds)==='[]','Removing the late choice did not reach the saved guide');
 assert.deepEqual((await js('window.buddy.bootstrap()')).state.guide.selection.laterIds,[]);
 assert.equal(await js('document.querySelector(".companion-content").dataset.disclosureScope'),restoredDisclosureScope);assert.equal(await js('document.querySelector("[data-companion-disclosure=later]").open'),true,'Late choices must remain open before full UI');

 await js('window.buddy.companionMode(false)');await until(()=>js('!document.body.classList.contains("companion-mode")'),'Full UI not restored');
 assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.draft.soloRole)'),'jungle');
 assert.equal(await js('!!document.querySelector("#solo-role")?.disabled'),false,'Full UI must allow an explicit tactical position');
 assert.equal(await js('[...document.querySelectorAll("[data-action=solo-role]")].every(b=>!b.disabled)'),true,'Full UI position buttons must allow an explicit tactical override');
 await js('window.buddy.companionMode(true)');await until(()=>js('document.body.classList.contains("companion-mode")'),'Sidebar not restored');
 assert.equal(await js('document.querySelector(".companion-shell").dataset.tab'),'plan');assert.equal(await js('document.querySelector(".companion-content").dataset.disclosureScope'),restoredDisclosureScope,'Full UI must restore the same plan disclosure scope');
 assert.equal(await js('document.querySelector("[data-companion-disclosure=later]").open'),true,'Opening full UI dropped the disclosure state');
 await js('window.buddy.companionMode(false)');await until(()=>js('!document.body.classList.contains("companion-mode")'),'Full UI not restored for favorites');
 await click('[data-action=navigate][data-route=favorites]');
 await js('document.querySelectorAll(".favorite-card img").forEach(i=>i.loading="eager")');
 await until(()=>js('Array.from(document.querySelectorAll(".favorite-card .portrait")).every(i=>i.complete&&i.naturalWidth>0)'),'Favorite hero portraits did not load');
 const favoriteCards=await js('Array.from(document.querySelectorAll(".favorite-card")).map(c=>c.textContent)');
 assert.equal(favoriteCards.length,2);assert.ok(favoriteCards.some(t=>t.includes('自选后期：尚未添加')));
 assert.ok(favoriteCards.some(t=>t.includes('自选后期：'+data.items[Number(favoriteLater)].name)));
 await delay(200);await fs.writeFile(path.join(root,'favorite-list.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 const lateIndex=(await js('window.buddy.bootstrap()')).state.favorites.findIndex(f=>f.id===lateFavorite.id);assert.ok(lateIndex>=0);
 await click('[data-action=open-favorite][data-index="'+lateIndex+'"]');
 await until(()=>js('!!document.querySelector(".drawer")'),'Favorite did not open');
 assert.equal(await js('document.querySelector('+JSON.stringify('.drawer [data-action=build-later][data-id="'+favoriteLater+'"]')+')?.getAttribute("aria-pressed")'),'true','Opening favorite dropped selected late gear');
 assert.equal(await js('document.querySelector("[data-action=favorite-build]").textContent.includes("已收藏")'),true);
 await js('document.querySelectorAll(".drawer img").forEach(i=>i.loading="eager")');await delay(250);
 await fs.writeFile(path.join(root,'favorite-restored.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 await js('window.drawerPosition=document.querySelector(".drawer");drawerPosition.scrollTop=500;void 0');
 assert.equal(await js('drawerPosition.scrollTop'),500,'Fixture did not select the actual scroll container');
 await change('#build-skill',skill.id);
 assert.ok(Math.abs((await js('document.querySelector(".drawer").scrollTop'))-500)<=3,'Changing a configuration reset the drawer scroll');
 await js('window.buddy.openGuide('+JSON.stringify({...lateFavorite,id:'Volibear',role:'top',mode:'rift'})+')');await delay(150);
 await js('window.backgroundDrawerSelect=document.querySelector("#build-role");backgroundDrawerSelect.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));void 0');
 await js('window.buddy.bootstrap().then(b=>window.buddy.updateGuide({...b.state.guide.selection,changedFields:[]}))');await delay(150);
 assert.equal(await js('backgroundDrawerSelect===document.querySelector("#build-role")'),true,'An unchanged guide update destroyed the open build menu');
 await js('backgroundDrawerSelect.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));void 0');await delay(100);
 assert.equal(await js('backgroundDrawerSelect.isConnected'),false,'Cancelling the build menu did not display the pending update');
 assert.equal(await js('!!document.querySelector(".drawer")'),true,'Cancelling a pending menu update closed the drawer');
 assert.ok(Math.abs((await js('document.querySelector(".drawer").scrollTop'))-500)<=3,'A pending update reset the reading position');
 await js('window.backgroundDrawerSelect=document.querySelector("#build-skill");backgroundDrawerSelect.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));void 0');
 await js('window.buddy.bootstrap().then(b=>window.buddy.updateGuide({...b.state.guide.selection,changedFields:[]}))');await delay(100);
 assert.equal(await js('backgroundDrawerSelect.isConnected'),true);
 await change('#build-skill',skill.id);await delay(100);
 assert.equal(await js('backgroundDrawerSelect.isConnected'),false,'Finishing the build selection left its pending update behind');
 await toggleAutoSync();
 await js('window.backgroundDrawerSelect=document.querySelector("#build-role");backgroundDrawerSelect.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));void 0');
 picked='Ashe';assigned='bottom';await backgroundSync();
 assert.equal(await js('backgroundDrawerSelect.isConnected'),false,'A local hero change retained a stale build menu');
 assert.ok(await js('document.querySelector(".rune-target-warning").textContent.includes("艾希")'),'The viewed build kept the previous rune target notice');
 assert.equal(writes.length,2,'Build synchronisation must not write client runes');
 await toggleAutoSync();
 await js('window.drawerSelect=document.querySelector("#build-role");drawerSelect.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));drawerSelect.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));void 0');await delay(100);
 assert.equal(await js('!!document.querySelector(".drawer")'),true,'Cancelling a native select closed the entire build drawer');
 await js('document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));void 0');
 assert.equal(await js('!!document.querySelector(".drawer")'),false,'Second Escape did not close the build drawer');
 await click('[data-action=navigate][data-route=settings]');await click('[data-action=presentation-open]');await click('[data-field=textScale][data-value="1.25"]');
 await until(()=>js('getComputedStyle(document.querySelector(".presentation-preview b")).fontSize==="21.25px"'),'Full UI font not applied');await click('[data-action=close]');
 const fullMetrics=()=>js('({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,top:document.querySelector(".top-actions").getBoundingClientRect().right})');
 main.setSize(1050,720);await delay(180);const fm=await fullMetrics();assert.ok(fm.scroll<=fm.width&&fm.body<=fm.width,'Full UI overflow at minimum size');assert.ok(fm.top<=fm.width+1,'Header actions out of view');
 await fs.writeFile(path.join(root,'full-settings-large.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 await click('[data-action=window-info]');await until(()=>js('document.querySelector("[data-window-info]")?.textContent.includes("按缩放换算")'),'Full window report missing');
 const infoReadAt=await js('document.querySelector("[data-window-info]").dataset.windowInfo');
 await click('[data-action=recover-guide]');await until(()=>js('document.querySelector("[data-window-info]")?.dataset.windowInfo!=='+JSON.stringify(infoReadAt)+'&&document.querySelector("[data-window-info]")?.textContent.includes("展开")'),'Recovery did not refresh the window report');
 await js('document.querySelector("[data-window-info]").scrollTop=0;void 0');
 assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'),'Large text window report overflowed');
 await capture('window-info-full');await click('[data-action=close]');
 await js('window.buddy.openGuide()');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Cross-window guide missing');
 const guideJs=c=>guide.webContents.executeJavaScript(c,true);await until(()=>guideJs('!!window.guide'),'Guide preload missing');await guideJs('window.guide.control("layout","details")');await until(()=>guideJs('!!document.querySelector(".next-item")'),'Cross-window guide not rendered');
 await guideJs('window.guide.control("presentation",{field:"textScale",value:1.1})');
 await until(()=>js('Math.abs(parseFloat(getComputedStyle(document.querySelector(".nav-item")).fontSize)-14.3)<0.01'),'Guide font did not reach main');
 assert.equal((await js('window.buddy.bootstrap()')).state.preferences.presentation.textScale,1.1);
 await guideJs('window.guide.control("presentation",{field:"toggleModule",value:"scoreboard"})');assert.equal((await js('window.buddy.bootstrap()')).state.preferences.presentation.guideModules.includes('scoreboard'),false);
 await guideJs('window.guide.control("presentation",{field:"reset"})');
 assert.equal(main.isVisible(),false);assert.ok(windows.filter(w=>!w.isDestroyed()).every(w=>!w.isVisible()));
 if(process.env.RIFT_BUDDY_SMOKE_OLD_SOURCE!=='1'){
 const freshFetches=sourceFetches;await click('[data-action=auto-check]');
 await js('(()=>{const b=document.createElement("button");b.dataset.action="build";b.dataset.id="Ashe";b.dataset.role="bottom";document.body.append(b);b.click();b.remove();})()');
 await until(()=>js('!!document.querySelector(".drawer #build-role")'),'Fresh configuration drawer missing');await delay(900);
 assert.equal(sourceFetches,freshFetches,'A current parser snapshot fetched the source again before its expiry');
 await click('[data-action=close]');await click('[data-action=auto-check]');
 }
 // A confirmation belongs to this draft, including after an asynchronous write.
 await click('[data-action=companion-attach]');await sync();
 await until(()=>js('!!document.querySelector(".companion-shell")'),'Lifecycle sidebar missing');
 const applied=()=>js('document.querySelector("[data-action=my-runes]")?.textContent.includes("重新应用符文")===true');
 const apply=async()=>{await click('[data-action=my-runes]');await until(applied,'This draft write not confirmed');};
 const startWrites=writes.length;await apply();await sync();assert.equal(await applied(),true,'Ordinary polling lost this click');assert.equal(writes.length,startWrites+1);
 await capture('runes-this-draft');
 for(const nextPhase of ['InProgress','EndOfGame','Lobby']){phase=nextPhase;await sync();}
 page={...getBuild(hero('Volibear'),'jungle',data).runePage,id:44,isEditable:true,current:true};gameId='1502';phase='ChampSelect';await sync();
 await until(()=>js('!!document.querySelector(".companion-shell")'),'Next draft sidebar missing');
 assert.equal(await applied(),false,'Same hero next draft retained previous success');assert.equal(writes.length,startWrites+1,'Lifecycle wrote runes without a click');await capture('runes-new-draft');
 await apply();offline=true;await sync();offline=false;await sync();
 await until(()=>js('!!document.querySelector(".companion-shell")'),'Reconnected sidebar missing');assert.equal(await applied(),false,'Reconnect retained a previous write confirmation');assert.equal(writes.length,startWrites+2);
 holdRuneWrite=true;resumeRuneWrite=null;await click('[data-action=my-runes]');await until(()=>typeof resumeRuneWrite==='function','Pending mock write missing');
 assert.equal(await js('document.querySelector("[data-action=my-runes]").disabled'),true,'Pending write left its action enabled');
 const duringWrites=writes.length;await click('[data-action=my-runes]');assert.equal(writes.length,duringWrites,'Repeated pending click wrote another page');
 // The client changes during the write; no intervening fixture sync informs the renderer.
 gameId='1503';holdRuneWrite=false;resumeRuneWrite();resumeRuneWrite=null;
 await until(()=>js('document.querySelector("#toast").textContent.includes("写入已完成")'),'Late write did not explain the changed context');
 await until(()=>js('!document.querySelector("[data-action=my-runes]").disabled'),'Late write did not release the button');
 assert.equal(await applied(),false,'Late old-context request confirmed the new draft');assert.equal(writes.length,startWrites+3);await capture('runes-late-write');
 await apply();assert.equal(writes.length,startWrites+4);assert.equal(main.isVisible(),false);
 await click('[data-action=companion-full]');
 await js('(()=>{const b=document.createElement("button");b.dataset.action="my-build";document.body.append(b);b.click();b.remove();})()');
 await until(()=>js('document.querySelector(".rune-application-status")?.textContent.includes("本次已应用")'),'Current drawer confirmation missing');
 gameId='1504';await sync();assert.equal(await js('document.querySelector(".rune-application-status").textContent.includes("尚未")'),true,'Same-phase new game retained the drawer confirmation');
 holdRuneWrite=true;resumeRuneWrite=null;await click('[data-action=apply-runes]');await until(()=>typeof resumeRuneWrite==='function','Pending drawer write missing');
 gameId='1505';holdRuneWrite=false;resumeRuneWrite();resumeRuneWrite=null;
 await until(()=>js('document.querySelector("#toast").textContent.includes("写入已完成")'),'Late drawer write did not explain changed context');
 await until(()=>js('!document.querySelector("[data-action=apply-runes]").disabled'),'Drawer action stayed pending');
 assert.equal(await js('document.querySelector(".rune-application-status").textContent.includes("尚未")'),true,'Late drawer request confirmed a different draft');assert.equal(writes.length,startWrites+5);await capture('runes-drawer-new-draft');
 await click('[data-action=apply-runes]');await until(()=>js('document.querySelector(".rune-application-status").textContent.includes("本次已应用")'),'Drawer retry did not confirm');assert.equal(writes.length,startWrites+6);
 gameId='1506';await click('[data-action=apply-runes]');
 await until(()=>js('!document.querySelector("[data-action=apply-runes]").disabled'),'Fresh pre-write check did not settle');
 assert.ok(await js('document.querySelector("#toast").textContent.includes("选人会话已变化")'),'Cached pre-write status failed to detect the new draft');
 assert.equal(writes.length,startWrites+6,'A stale drawer click wrote to a newer draft before checking it');
 assert.equal(await js('document.querySelector(".rune-application-status").textContent.includes("尚未")'),true,'Rejected stale click retained confirmation');
 // Choosing a region/tier reads only its cache, including in the actual sidebar.
 await click('[data-action=close]');await click('[data-action=companion-attach]');await sync();
 picked='';hovered='Chogath';assigned='';await sync();
 for(const selectedScope of ['party','context','bot']){
  await click('[data-action=companion-tab][data-tab=recommend]');
  await change('#companion-scope',selectedScope);await change('#solo-role','jungle');
  await click('[data-action=companion-tab][data-tab=plan]');
  assert.equal(await js('document.querySelector("[data-companion-field=rune]").dataset.plan'),'Chogath:jungle:rift','Preview ignored manual role in '+selectedScope);
 }
 picked='Chogath';hovered='';await sync();
 await click('[data-action=companion-tab][data-tab=plan]');
 await until(()=>js('document.querySelector("[data-companion-field=rune]").dataset.plan==="Chogath:jungle:rift"'),'Actual pick lost the manual role from combination scope');
 await click('[data-action=companion-tab][data-tab=recommend]');await change('#companion-scope','solo');await click('[data-action=companion-tab][data-tab=plan]');
 picked='Ashe';assigned='bottom';await sync();
 await until(()=>js('window.buddy.bootstrap().then(b=>b.state.draft.slots.some(s=>s.champion==="Ashe"&&s.clientCellId===1))'),'New public Ashe pick did not settle before releasing the manual lane');
 await click('[data-action=companion-tab][data-tab=plan]');await click('[data-action=position-auto]');
 await until(()=>js('window.buddy.bootstrap().then(b=>b.state.draft.soloRole==="bottom"&&!b.state.draft.playerPosition&&b.state.draft.slots.some(s=>s.champion==="Ashe"&&s.role==="bottom"&&!s.manualPosition))'),'Releasing the lane did not restore the public bottom assignment');
 await sync();await click('[data-companion-disclosure=source] > summary');
 const fetchesBeforeFilters=sourceFetches,writesBeforeFilters=writes.length;
 for(const region of ['global','kr'])for(const tier of ['gold_plus','emerald_plus','diamond_plus']){
  await change('[data-build-source-field=region]',region);await change('[data-build-source-field=tier]',tier);
  await until(()=>js(`window.buddy.bootstrap().then(b=>b.state.preferences.buildSource.region===${JSON.stringify(region)}&&b.state.preferences.buildSource.tier===${JSON.stringify(tier)})`),'Filter preference not saved');
  assert.equal(await js('document.querySelector("[data-build-source-field=region]").value'),region);assert.equal(await js('document.querySelector("[data-build-source-field=tier]").value'),tier);
  const label=(region==='kr'?'韩国':'全球')+({gold_plus:'黄金',emerald_plus:'翡翠',diamond_plus:'钻石'}[tier])+'及以上排位';
  assert.ok((await js('document.querySelector("[data-build-source-status]").textContent')).includes(label));
  if(region!=='global'||tier!=='emerald_plus')assert.ok(await js('document.querySelector("[data-build-source-status]").textContent.includes("未缓存")'));
  assert.equal(sourceFetches,fetchesBeforeFilters,'Filter change fetched without a refresh click');assert.equal(writes.length,writesBeforeFilters,'Filter change wrote runes');
 }
 await capture('source-kr-diamond-uncached');assert.ok(await js('document.querySelector("[data-action=build-source-cache]").textContent.includes("全球翡翠")'));
 await click('[data-action=build-source-cache]');
 await until(()=>js('window.buddy.bootstrap().then(b=>b.state.preferences.buildSource.region==="global"&&b.state.preferences.buildSource.tier==="emerald_plus")'),'Cached source choice not persisted');
 assert.equal(sourceFetches,fetchesBeforeFilters,'Cached source choice fetched network');assert.equal(writes.length,writesBeforeFilters,'Cached source choice wrote runes');
 assert.equal(await js('document.querySelector("[data-build-source-field=region]").value'),'global');assert.equal(await js('document.querySelector("[data-build-source-field=tier]").value'),'emerald_plus');
 await until(()=>js('document.querySelector("[data-build-source-status]").textContent.includes("实际参考：全球翡翠")'),'Cached default did not return');await capture('source-global-emerald-cached');
 // A condition click in an uncached source cannot accept its display fallback
 // for independent core/rune/skill choices, including when saving a favorite.
 picked='Ahri';assigned='MIDDLE';await sync();await change('#solo-role','mid');await sync();
 const ahri=getBuild(hero('Ahri'),'mid',data),originalChoices={coreId:'core-'+ahri.reference.core[1].items.join('-'),runeId:ahri.runeOptions[1].id,skillId:ahri.skillChoices[1].id};
 await change('[data-companion-field=core]','1');await change('[data-companion-field=rune]',originalChoices.runeId);await change('[data-companion-field=skill]',originalChoices.skillId);
 await until(()=>js('window.buddy.bootstrap().then(b=>b.state.guide?.selection.runeId==='+JSON.stringify(originalChoices.runeId)+')'),'Original Ahri choices did not reach guide');
 await change('[data-build-source-field=region]','kr');await change('[data-build-source-field=tier]','diamond_plus');
 assert.ok(await js('document.querySelector("[data-build-source-status]").textContent.includes("未缓存")'));
 await click('[data-action=companion-condition][data-condition=ap]');
 await until(()=>js('window.buddy.bootstrap().then(b=>b.state.guide?.selection.conditions.includes("ap"))'),'Edited pressure did not reach guide');
 const paused=(await js('window.buddy.bootstrap()')).state.guide.selection;for(const [key,value]of Object.entries(originalChoices))assert.equal(paused[key],value,'Paused edit overwrote '+key);
 await click('[data-action=companion-favorite]');
 await until(()=>js('window.buddy.bootstrap().then(b=>b.state.favorites.some(f=>f.type==="build"&&f.champion==="Ahri"))'),'Paused choice favorite missing');
 const pausedFavorite=(await js('window.buddy.bootstrap()')).state.favorites.find(f=>f.type==='build'&&f.champion==='Ahri');for(const [key,value]of Object.entries(originalChoices))assert.equal(pausedFavorite[key],value,'Favorite overwrote '+key);
 await capture('source-paused-condition');await change('[data-build-source-field=region]','global');await change('[data-build-source-field=tier]','emerald_plus');
 await until(()=>js('document.querySelector("[data-companion-field=core]")?.value==="1"'),'Original core route not restored');
 assert.equal(await js('document.querySelector("[data-companion-field=rune]").value'),originalChoices.runeId);assert.equal(await js('document.querySelector("[data-companion-field=skill]").value'),originalChoices.skillId);
 const restoredChoices=(await js('window.buddy.bootstrap()')).state.guide.selection;for(const [key,value]of Object.entries(originalChoices))assert.equal(restoredChoices[key],value);
 assert.equal(writes.length,writesBeforeFilters,'Source fallback edit wrote runes');assert.equal(sourceFetches,fetchesBeforeFilters,'Source fallback edit fetched without a refresh click');
 await capture('source-choice-restored');
 // A rejected/slow save must not announce success, lose earlier favorites or
 // prevent a preference changed while the collection write was pending.
 const beforeFailure=(await js('window.buddy.bootstrap()')).state,countBeforeFailure=beforeFailure.favorites.length;
 const direction=await js('document.querySelector("[data-action=companion-favorite]").getAttribute("aria-pressed")==="true"?-1:1');
 await js('document.querySelector("#toast").textContent=""');
 const rejectedFavorite={count:countBeforeFailure+direction};favoriteGate=rejectedFavorite;
 await click('[data-action=companion-favorite]');await until(()=>rejectedFavorite.observed,'Favorite save was not intercepted');
 assert.doesNotMatch(await js('document.querySelector("#toast").textContent'),/已收藏|已取消收藏/);
 await click('[data-action=companion-favorite]');await until(()=>js('document.querySelector("#toast").textContent.includes("收藏正在保存")'),'Duplicate favorite click was not blocked');
 await js('(()=>{const b=document.createElement("button");b.dataset.action="auto-live";document.body.append(b);b.click();b.remove();})()');
 rejectedFavorite.reject(Error('Isolated favorite write rejected'));
 await until(()=>js('document.querySelector("#toast").textContent.includes("收藏未保存，已保留原收藏")'),'Failed favorite save was not explained');
 await until(()=>js('window.buddy.bootstrap().then(b=>b.state.favorites.length==='+countBeforeFailure+'&&b.state.preferences.autoLive==='+JSON.stringify(!beforeFailure.preferences.autoLive)+')'),'Favorite recovery lost originals or the newer preference');
 const recovered=(await js('window.buddy.bootstrap()')).state;assert.deepEqual(recovered.favorites,beforeFailure.favorites);
 await js('document.querySelector("#toast").textContent=""');const confirmedFavorite={count:countBeforeFailure+direction};favoriteGate=confirmedFavorite;
 await click('[data-action=companion-favorite]');await until(()=>confirmedFavorite.observed,'Retried favorite save was not intercepted');
 assert.doesNotMatch(await js('document.querySelector("#toast").textContent'),/已收藏|已取消收藏/);confirmedFavorite.resolve();
 await until(()=>js('document.querySelector("#toast").textContent.includes('+JSON.stringify(direction>0?'已收藏':'已取消收藏')+')'),'Favorite success did not wait for confirmation');
 assert.equal((await js('window.buddy.bootstrap()')).state.favorites.length,countBeforeFailure+direction);
 const beforeAddFailure=(await js('window.buddy.bootstrap()')).state.favorites;
 // The source-path fixture above already saved this build. Its successful
 // cancellation leaves the same control available for a rejected new add.
 assert.equal(direction,-1);const rejectedAdd={count:beforeAddFailure.length+1};favoriteGate=rejectedAdd;
 await click('[data-action=companion-favorite]');await until(()=>rejectedAdd.observed,'New favorite save was not intercepted');rejectedAdd.reject(Error('Isolated new favorite write rejected'));
 await until(()=>js('document.querySelector("#toast").textContent.includes("收藏未保存，已保留原收藏")'),'Failed new favorite was not explained');
 await until(()=>js('window.buddy.bootstrap().then(b=>b.state.favorites.length==='+beforeAddFailure.length+')'),'Rejected new favorite remained saved');
 assert.deepEqual((await js('window.buddy.bootstrap()')).state.favorites,beforeAddFailure);
 await click('[data-action=companion-favorite]');await until(()=>js('document.querySelector("#toast").textContent.includes("已收藏，下次就玩这套")'),'New favorite could not recover after rejection');
 await capture('favorite-write-confirmed');
 // A formal MIDDLE assignment does not override the player's explicit support preparation.
 picked='Lux';assigned='MIDDLE';await sync();await click('[data-action=companion-full]');
 await until(()=>js('!document.body.classList.contains("companion-mode")'),'Full assistant did not open');
 await click('[data-action=navigate][data-route=draft]');
 await click('[data-action=move-slot][data-role=mid]');await click('[data-action=move-confirm][data-role=support]');
 await sync();await sync();
 assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.draft.soloRole)'),'support');
 assert.match(await js('document.querySelector(".preparation-task").textContent'),/拉克丝.*辅助/);
 await click('[data-action=task-edit]');
 assert.equal(await js('document.querySelector("#build-role").value'),'support');
 const luxSupport=getBuild(hero('Lux'),'support',data);
 assert.equal(writes.length,writesBeforeFilters,'Changing tactical lane wrote a rune page');
 await click('[data-action=close]');await click('[data-action=companion-attach]');await sync();
 await click('[data-action=companion-tab][data-tab=plan]');
 assert.equal(await js('document.querySelector("[data-companion-field=rune]").dataset.plan'),'Lux:support:rift');
 assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.draft.soloRole)'),'support');
 assert.ok(await js('document.querySelector(".companion-position-note").textContent.includes("中路")'));
 await click('[data-action=guide-current]');
 await until(()=>guideJs('window.guide.bootstrap().then(b=>b.model?.selection?.role==="support")'),'Guide lost the tactical support position');
 const supportGuide=await guideJs('window.guide.bootstrap()');
 assert.equal(supportGuide.current.role,'support');assert.equal(supportGuide.current.formalRole,'mid');
 assert.equal(supportGuide.model.live.kind,undefined);
 assert.deepEqual(supportGuide.model.runes.map(r=>r.id),luxSupport.runePage.selectedPerkIds);
 await capture('lux-manual-support');
 picked='Nami';assigned='BOTTOM';await sync();
 await click('[data-action=companion-tab][data-tab=plan]');
 assert.equal(await js('document.querySelector("[data-companion-field=rune]").dataset.plan'),'Nami:support:rift');
 const swapGuide=await guideJs('window.guide.bootstrap()');assert.equal(swapGuide.current.role,'support');assert.equal(swapGuide.current.formalRole,'bottom');
 await click('[data-action=position-auto]');await sync();
 assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.draft.soloRole)'),'bottom');
 assert.equal((await js('window.buddy.bootstrap()')).state.draft.slots.find(s=>s.champion==='Nami').manualPosition,undefined);
 assert.equal(writes.length,writesBeforeFilters,'Releasing a tactical override wrote runes');
 // A new public game ID can arrive without any observable lobby transition.
 picked='Lux';assigned='MIDDLE';await sync();await change('#solo-role','support');await sync();
 const oldGameState=await js('window.buddy.bootstrap().then(b=>b.state)');assert.equal(oldGameState.draft.clientGameId,'1506');
 gameId='1507';await sync();await sync();
 await click('[data-action=companion-tab][data-tab=plan]');
 assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.draft.soloRole)'),'mid','New game inherited the previous tactical lane');
 assert.equal(await js('document.querySelector("[data-companion-field=rune]").dataset.plan'),'Lux:mid:rift');
 await click('[data-action=guide-current]');await until(()=>guideJs('window.guide.bootstrap().then(b=>b.model?.selection?.role==="mid")'),'New game guide inherited the previous tactical lane');
 assert.equal((await js('window.buddy.bootstrap()')).state.draft.clientGameId,'1507');
 await js('window.buddy.saveState('+JSON.stringify(oldGameState)+')');
 const delayedSave=await js('window.buddy.bootstrap()');assert.equal(delayedSave.state.draft.clientGameId,'1507');assert.equal(delayedSave.state.draft.slots.find(s=>s.champion==='Lux').role,'mid','Delayed old-game save restored the old binding');
 assert.equal(writes.length,writesBeforeFilters,'New game reconciliation wrote runes');
 // The default hero click must finish setup once, and show that fact after
 // the player confirms the same hero. No extra application is needed on polls.
 gameId='1508';picked='';hovered='';assigned='MIDDLE';preparationAction={id:4,type:'pick',actorCellId:1,championId:0,completed:false,isInProgress:true};
 await fs.writeFile(path.join(root,'client-fixture','LeagueClient.exe'),'isolated fixture');await sync();
 await click('[data-action=player-flow-settings]');await click('[data-action=player-flow-toggle][data-field=clickPrepare]');await click('[data-action=close]');
 await click('[data-action=companion-tab][data-tab=recommend]');await until(()=>js('!!document.querySelector("[data-action=companion-preview][data-role=mid]")'),'No mid candidate for default preparation');
 const beforePrepareWrites=writes.length;await click('[data-action=companion-preview][data-role=mid]');
 await until(()=>js('document.querySelectorAll(".preparation-task [data-step-status=done]").length===4&&document.querySelector("#toast")?.textContent==="预选与配置已完成，锁定请在客户端确认"'),'Default click must confirm preselection and all three configuration writes');
 await click('[data-action=companion-tab][data-tab=plan]');
 await until(()=>js('document.querySelectorAll(".client-preparation [data-step-status=done]").length===4'),'Default click did not complete all four steps');
 assert.equal(await js('document.querySelectorAll(".client-preparation-result [data-step-status=done]").length'),4,'All four preparation results must remain available in the receipt');
 assert.equal(hoverWrites,1);assert.equal(spellWrites,1);assert.equal(writes.length,beforePrepareWrites+1);assert.equal(preparationAction.completed,false);
 await click('[data-action=companion-tab][data-tab=recommend]');picked=hovered;preparationAction.completed=true;await sync();
 await until(()=>js('document.querySelector(".companion-shell")?.dataset.tab==="plan"&&document.querySelector(".client-preparation [data-preparation-step=runes]")?.dataset.stepStatus==="done"'),'Actual hero confirmation must open the current configuration without losing its rune receipt');
 assert.match(await js('document.querySelector(".client-preparation [data-action=client-prepare]").textContent'),/应用当前修改/);
 await sync();assert.equal(writes.length,beforePrepareWrites+1,'Confirming or polling the hero reapplied runes');
 await capture('one-click-confirmed-status');gameId='1509';await sync();
 await until(async()=>{const current=await js('window.buddy.bootstrap().then(b=>({gameId:b.client?.game?.gameId,draftGameId:b.state.draft.clientGameId,championId:b.client?.session?.myTeam?.find(p=>p.cellId===b.client.session.localPlayerCellId)?.championId,target:document.querySelector(".client-preparation [data-action=client-prepare]")?.dataset.plan,ready:document.querySelector(".client-preparation [data-preparation-step=runes]")?.dataset.stepStatus}))');return current.gameId==='1509'&&current.draftGameId==='1509'&&current.championId===hero(picked).key&&current.target===picked+':mid:rift'&&current.ready===undefined;},'New game did not clear the same champion rune confirmation after synchronization');
 assert.equal(await js('document.querySelector(".client-preparation [data-preparation-step=runes]")?.dataset.stepStatus'),undefined,'New game retained a previous rune confirmation');assert.equal(writes.length,beforePrepareWrites+1,'Starting a new game reapplied runes');preparationAction=null;
 // Retain the final manual choice in this isolated profile for restart validation.
 picked='Lux';assigned='MIDDLE';await sync();await change('#solo-role','support');await sync();await click('[data-action=guide-current]');
 await until(()=>guideJs('window.guide.bootstrap().then(b=>b.model?.selection?.role==="support")'),'Final support guide missing');
 const report={passed:true,archiveSha256:release.archiveSha256,baseDataVersion:data.version,sourcePatch:cho.reference.patch,choJungleHail:true,sourceVersionLabelCorrect:true,oldSourceVisible:cho.referenceStale,lateChoicesSync:true,threePrimaryCandidates:true,allLanesInMoreCandidates:true,automaticPlanOnPick:true,inlineCoreRuneSkill:true,comparisonCards:true,favoriteSelection:true,presentationPersisted:true,stalePreferenceWriteProtected:true,crossWindowPresentation:true,minimumFullWindowReadable:true,guideSelectionMatches:true,explicitRuneClickOnly:true,runeConfirmationLifecycle:true,lateRuneWriteRejected:true,pendingRuneClickBlocked:true,previewSeparated:true,staleHeroActionRejected:true,tabAndSyncScrollPreserved:true,publicEnemiesAndBans:true,wideAndNarrowLayouts:true,clientGeometryUnchanged:true,testWindowsHidden:true,loopbackSocketsMocked:true,actualRuneWrites:false};
 report.defaultClickPreparationStatus=true;report.sameHeroConfirmationNoRepeatWrite=true;report.newGameClearsPreparedRuneStatus=true;
 report.manualFormalLanePreparation=true;report.manualChampionSwap=true;report.manualLaneRelease=true;report.manualLaneRuneWrites=0;
 report.manualNewGameReleased=true;report.staleGameSaveRejected=true;report.finalGameId=gameId;
 report.cachedSourceSwitch=true;report.cachedSourceNoFetch=true;report.cachedSourceNoRuneWrite=true;
 report.sourceFallbackSingleEditPreserved=true;report.sourceFallbackFavoritePreserved=true;report.sourceRestoredOriginalChoices=true;
 report.favoriteWriteConfirmation=true;report.favoriteFailureRollback=true;report.favoriteConcurrentPreferencePreserved=true;
 await fs.writeFile(path.join(root,'companion-workflow.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'companion-workflow-error.txt'),error.stack).catch(()=>{});if(diagnosticMain&&!diagnosticMain.isDestroyed()){const state=await diagnosticMain.webContents.executeJavaScript('window.buddy.bootstrap().then(b=>({client:b.client,draft:b.state.draft,guide:b.state.guide,ui:{text:document.body.innerText,candidates:document.querySelectorAll(".companion-candidate").length,current:document.querySelector(".companion-current")?.textContent,preview:document.querySelector(".companion-preview")?.textContent,tab:document.querySelector(".companion-tabs .active")?.dataset.tab,plan:document.querySelector("[data-companion-field=rune]")?.dataset.plan,toast:document.querySelector("#toast")?.textContent}}))').catch(()=>null);await fs.writeFile(path.join(root,'companion-failure-state.json'),JSON.stringify(state,null,2)).catch(()=>{});}app.exit(1);});

