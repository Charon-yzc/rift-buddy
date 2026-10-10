const {app,ipcMain,globalShortcut,session,dialog}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
let failure='',renames=0,blocked=false,releaseWrite,writeStarted=false,failedWrites=0;
const writeFile=fs.writeFile.bind(fs),rename=fs.rename.bind(fs),settingsTemp=file=>String(file).startsWith(path.join(root,'settings.json.'));
fs.writeFile=async(file,...args)=>{if(settingsTemp(file)){if(blocked){writeStarted=true;await new Promise(resolve=>{releaseWrite=resolve;});}if(failure==='ENOSPC'||failure==='ENOSPC_ONCE'){if(failure==='ENOSPC_ONCE')failure='';failedWrites++;throw Object.assign(Error('Isolated ENOSPC fixture'),{code:'ENOSPC'});}}return writeFile(file,...args);};
fs.rename=async(from,...args)=>{if(settingsTemp(from)&&failure==='EPERM'){renames++;throw Object.assign(Error('Isolated EPERM fixture'),{code:'EPERM'});}return rename(from,...args);};
globalShortcut.register=()=>false;global.fetch=async()=>{throw Error('Isolated transaction smoke: network disabled');};https.request=()=>{throw Error('Isolated transaction smoke: sockets disabled');};
app.on('browser-window-created',(_e,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,callback)=>callback({cancel:true})));
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>handle(name,name==='client-status'?()=>({connected:false,phase:'Offline'}):name==='apply-runes'?()=>{throw Error('Rune writes prohibited');}:handler);
const spawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return spawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(root,'incoming.json')]});dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(root,'export.json')});
async function until(check,label){for(let n=0;n<180;n++){if(await check())return;await delay(50);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const source=process.env.RIFT_BUDDY_SOURCE==='1',release=JSON.parse(await fs.readFile('release/latest.json')),base=source?path.resolve('.'):path.join(release.directory,'resources/app.asar');require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');const js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'UI missing');await delay(250);
 const bootstrap=()=>js('window.buddy.bootstrap().then(b=>({state:b.state,source:b.data.buildSource}))'),before=await bootstrap(),bytes=await fs.readFile(path.join(root,'settings.json'));
 for(const code of ['ENOSPC','EPERM']){
  failure=code;const error=await js('window.buddy.importState().then(()=>null,e=>e.message)');failure='';assert.ok(error?.includes(code));assert.deepEqual(await bootstrap(),before);assert.deepEqual(await fs.readFile(path.join(root,'settings.json')),bytes);
  await js('window.buddy.exportState()');const exported=JSON.parse(await fs.readFile(path.join(root,'export.json')));assert.deepEqual(exported.favorites,before.state.favorites);assert.deepEqual(exported.excluded,before.state.excluded);assert.deepEqual(exported.preferences.buildSource,before.source);
 }
 assert.equal(renames,7,'Windows rename retries were exhausted');
 // Also cover analogous ordinary save, guide and presentation failures.
 failure='ENOSPC';
 for(const call of ['window.buddy.saveState({...b.state,excluded:["Zed"]})','window.buddy.openGuide({id:"Ashe",role:"bottom",mode:"rift"})','window.buddy.presentation({field:"textScale",value:1.25})']){
  const error=await js('window.buddy.bootstrap().then(b=>'+call+').then(()=>null,e=>e.message)');assert.ok(error?.includes('ENOSPC'));assert.deepEqual(await bootstrap(),before);
 }
 failure='';assert.deepEqual(await fs.readFile(path.join(root,'settings.json')),bytes);
 // A queued import must not replace a later guide/presentation update or an
 // unrelated renderer field; the renderer's unchanged favorites stay current.
 blocked=true;const importing=js('window.buddy.importState()');await until(()=>writeStarted,'Import did not reach atomic save');assert.deepEqual(await bootstrap(),before);
 const pendingSave=js('window.buddy.bootstrap().then(b=>window.buddy.saveState({...b.state,preferences:{...b.state.preferences,autoCheck:true}},b.state))');
 const pendingGuide=js('window.buddy.openGuide({id:"Ashe",role:"bottom",mode:"rift"})');
 const pendingPresentation=js('window.buddy.presentation({field:"textScale",value:1.25})');
 await delay(100);blocked=false;releaseWrite();await Promise.all([importing,pendingSave,pendingGuide,pendingPresentation]);
 const accepted=await bootstrap();assert.equal(accepted.state.favorites.filter(f=>f.id==='imported-once').length,1);assert.equal(accepted.state.preferences.autoCheck,true);assert.equal(accepted.state.preferences.presentation.textScale,1.25);assert.equal(accepted.state.guide.selection.id,'Ashe');assert.equal(accepted.state.preparations[0].id,'Ashe');assert.deepEqual(accepted.source,{region:'kr',tier:'diamond_plus'});
 await js('window.buddy.importState()');const retried=await bootstrap();assert.equal(retried.state.favorites.filter(f=>f.id==='imported-once').length,1);assert.equal(retried.state.guide.selection.id,'Ashe');assert.equal(retried.state.preferences.presentation.textScale,1,'An explicit retry imports its saved display preference');assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'settings.json'))),retried.state);
 // Guide controls can overlap while disk is slow, including automatic bounds
 // saves. Each accepted change must preserve independent guide fields.
 let guideWindow;await until(()=>{guideWindow=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guideWindow;},'Guide missing');const gjs=code=>guideWindow.webContents.executeJavaScript(code,true);
 await until(()=>gjs('!!window.guide'),'Guide preload missing');blocked=true;writeStarted=false;
 const toggleGuide=gjs('window.guide.control("live-advice")');await until(()=>writeStarted,'Guide toggle did not block');
 const opacityGuide=gjs('window.guide.control("opacity",0.65)');await delay(100);blocked=false;releaseWrite();await Promise.all([toggleGuide,opacityGuide]);
 assert.equal((await bootstrap()).state.guide.liveAdvice,false,'Opacity restored the old live-advice value');assert.equal((await bootstrap()).state.guide.opacity,0.65);
 blocked=true;writeStarted=false;
 const conditionGuide=gjs('window.guide.control("condition","heal")');await until(()=>writeStarted,'Guide condition did not block');
 const stageGuide=gjs('window.guide.control("stage","later")');await delay(100);blocked=false;releaseWrite();await Promise.all([conditionGuide,stageGuide]);
 assert.ok((await bootstrap()).state.guide.selection.conditions.includes('heal'),'Stage restored the old equipment conditions');assert.equal((await bootstrap()).state.guide.stage,'later');
 // Recalling another hero changes preparation recency without changing its
 // configuration. A later edit must merge by hero context, retaining additions.
 await js('window.buddy.openGuide({id:"Ahri",role:"mid",mode:"rift"})');await delay(100);const preparationBase=await bootstrap();
 await js('window.buddy.openGuide({id:"Ahri",role:"mid",mode:"rift",summonerIds:["SummonerFlash","SummonerTeleport"]})');await delay(100);await js('window.buddy.openGuide({id:"Ashe",role:"bottom",mode:"rift"})');await delay(100);await js('window.buddy.openGuide({id:"Nautilus",role:"support",mode:"rift"})');await delay(100);
 const edited=structuredClone(preparationBase.state);edited.preparations.find(p=>p.id==='Ahri').conditions=['ad'];await js('window.buddy.saveState('+JSON.stringify(edited)+','+JSON.stringify(preparationBase.state)+')');
 const mergedPreparations=(await bootstrap()).state.preparations;assert.deepEqual(mergedPreparations.find(p=>p.id==='Ahri').conditions,['ad']);assert.deepEqual(mergedPreparations.find(p=>p.id==='Ahri').summonerIds,["SummonerFlash","SummonerTeleport"]);assert.ok(mergedPreparations.some(p=>p.id==='Nautilus'));assert.ok(mergedPreparations.some(p=>p.id==='Ashe'));
 const conflictBase=(await bootstrap()).state;await js('window.buddy.openGuide({id:"Ahri",role:"mid",mode:"rift",conditions:["heal"]})');await delay(100);const conflicting=structuredClone(conflictBase);conflicting.preparations.find(p=>p.id==='Ahri').conditions=['control'];
 const conflictError=await js('window.buddy.saveState('+JSON.stringify(conflicting)+','+JSON.stringify(conflictBase)+').then(()=>null,e=>e.message)');assert.match(conflictError,/同时发生变化/);assert.deepEqual((await bootstrap()).state.preparations.find(p=>p.id==='Ahri').conditions,['heal']);
 await js('window.buddy.bootstrap().then(b=>window.buddy.saveState({...b.state,excluded:["Zed","Lux"]},b.state))');assert.deepEqual((await bootstrap()).state.excluded,['Zed','Lux']);
 // Exercise the real renderer, not just direct IPC: rejected rune, equipment
 // and manual-position input must agree with the last confirmed preparation.
 await js('window.buddy.bootstrap().then(b=>window.buddy.saveState({...b.state,preferences:{...b.state.preferences,buildSource:{region:"global",tier:"emerald_plus"}}},b.state))');
 await new Promise(resolve=>{main.webContents.once('did-finish-load',resolve);main.webContents.reload();});await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'Renderer reload missing');
 const openAhri=async()=>{main.webContents.send('open-build',{id:'Ahri',role:'mid',mode:'rift'});await until(()=>js('document.querySelectorAll("[data-action=build-rune]").length>1'),'Rune choices missing');await delay(250);};
 await openAhri();
 for(const action of ['build-rune','build-core']){
  const selector='[data-action="'+action+'"]',active=await js('[...document.querySelectorAll('+JSON.stringify(selector)+')].find(b=>b.classList.contains("active"))?.dataset');
  const button=await js('[...document.querySelectorAll('+JSON.stringify(selector)+')].find(b=>!b.classList.contains("active"))?.dataset');assert.ok(button,'An alternate '+action+' is required');
  const beforeUI=(await bootstrap()).state,failedBefore=failedWrites;failure='ENOSPC';
  await js('[...document.querySelectorAll('+JSON.stringify(selector)+')].find(b=>!b.classList.contains("active")).click()');await until(()=>failedWrites>failedBefore,'UI save did not fail');
  await until(()=>js('[...document.querySelectorAll('+JSON.stringify(selector)+')].find(b=>b.classList.contains("active"))?.dataset.'+(action==='build-rune'?'id':'index')+'==='+JSON.stringify(action==='build-rune'?active.id:active.index)),'Rejected choice stayed selected');
  assert.deepEqual((await bootstrap()).state,beforeUI);assert.match(await js('document.querySelector("#toast").textContent'),/已恢复上次保存/);
  await js('document.querySelector("[data-action=close]").click()');await openAhri();
  assert.equal(await js('[...document.querySelectorAll('+JSON.stringify(selector)+')].find(b=>b.classList.contains("active"))?.dataset.'+(action==='build-rune'?'id':'index')),action==='build-rune'?active.id:active.index);
  failure='';
 }
 await js('document.querySelector("[data-action=close]").click()');
 const roleBefore=await js('document.querySelector("#solo-role").value'),failedBefore=failedWrites;failure='ENOSPC';
 await js('(()=>{const select=document.querySelector("#solo-role");select.value="top";select.dispatchEvent(new Event("change",{bubbles:true}));})()');await until(()=>failedWrites>failedBefore,'Position save did not fail');await until(()=>js('document.querySelector("#solo-role").value==='+JSON.stringify(roleBefore)),'Rejected position stayed selected');failure='';
 await new Promise(resolve=>{main.webContents.once('did-finish-load',resolve);main.webContents.reload();});await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'Reload missing');await openAhri();
 assert.equal(await js('document.querySelector("[data-action=build-rune].active").dataset.id'),(await bootstrap()).state.preparations.find(p=>p.id==='Ahri'&&p.role==='mid').runeId);
 // Queue an independent equipment-condition edit while the rune save is
 // blocked. Only the rejected rune is undone; the later edit reaches the guide.
 const runeBefore=await js('document.querySelector("[data-action=build-rune].active").dataset.id');
 writeStarted=false;blocked=true;failure='ENOSPC_ONCE';
 await js('[...document.querySelectorAll("[data-action=build-rune]")].find(b=>!b.classList.contains("active")).click()');await until(()=>writeStarted,'Rune save did not block');
 await js('document.querySelector("[data-action=build-condition][data-condition=ad]").click()');blocked=false;releaseWrite();
 await until(async()=>{const s=(await bootstrap()).state,p=s.preparations.find(p=>p.id==='Ahri'&&p.role==='mid');return p?.runeId===runeBefore&&p.conditions.includes('ad')&&s.guide?.selection?.conditions.includes('ad')&&s.guide.selection.runeId===runeBefore;},'Independent queued edit or restored rune did not reach guide');
 assert.equal(await js('document.querySelector("[data-action=build-rune].active").dataset.id'),runeBefore);assert.equal(await js('document.querySelector("[data-action=build-condition][data-condition=ad]").classList.contains("active")'),true);
 const report={passed:true,concurrentGuideAndSelectionFieldsPreserved:true,queuedRendererEditReachesGuideWithoutRejectedRune:true,rendererRejectedRuneEquipmentAndPositionRestored:true,realPreparationConflictRejectedAndQueueRecovered:true,preparationRecencyAndIndependentEditsPreserved:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,failedImportMemoryDiskSourceAndExportPreserved:true,ENOSPC:true,exhaustedWindowsRename:true,ordinarySaveGuideAndPresentationFailuresPreserved:true,queuedImportPreservesLaterEdits:true,retryDeduplicates:true,actualRuneWrites:0,userSettingsIsolated:true,realGame:'UNPROVEN'};await writeFile(path.join(root,'state-transaction-smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.quit();
}
run().catch(async e=>{console.error(e);await writeFile(path.join(root,'error.txt'),e.stack).catch(()=>{});app.exit(1);});
