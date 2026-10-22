const {revealDraftAction}=require('./smoke-draft-ui.cjs');
const {app,session,ipcMain,globalShortcut}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),https=require('node:https'),{EventEmitter}=require('node:events'),{pathToFileURL}=require('node:url');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),phase=process.env.RIFT_BUDDY_CURRENT_PHASE,restart=phase==='restart',syncMode=phase?.startsWith('hex-sync-'),syncDelay=syncMode?Number(phase.slice('hex-sync-'.length)):0,windows=[];let syncHits=0;
globalShortcut.register=()=>false;
global.fetch=async()=>{throw Error('Current-data smoke: external network disabled');};https.request=()=>{throw Error('Current-data smoke: real client and writes prohibited');};
app.setPath('userData',root);app.on('browser-window-created',(_event,w)=>{windows.push(w);w.setFocusable(false);w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);const p=new EventEmitter();p.stdout=new EventEmitter();p.stdout.setEncoding=()=>{};p.exitCode=null;p.stdin={end(){p.exitCode=0;p.emit('exit',0);}};p.kill=()=>p.stdin.end();return p;};
const mockExec=(_file,_args,_options,callback)=>{if(callback)queueMicrotask(()=>callback(null,'',''));return new EventEmitter();};mockExec[require('node:util').promisify.custom]=async()=>({stdout:'',stderr:''});cp.execFile=mockExec;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function until(check,label){for(let n=0;n<200;n++){if(await check())return;await delay(80);}throw Error(label);}
async function run(){
 const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));assert.equal(data.patch,'16.21');assert.equal(data.augments.length,249);
 const register=ipcMain.handle.bind(ipcMain);if(syncMode){assert([0,180,500].includes(syncDelay));ipcMain.handle=(channel,handler)=>register(channel,channel==='update-guide'?async(...args)=>{syncHits++;await delay(syncDelay);return handler(...args);}:handler);}
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Current main missing');const js=code=>main.webContents.executeJavaScript(code,true),state=async()=>(await js('window.buddy.bootstrap()')).state;
 const click=async selector=>{selector=await revealDraftAction(js,selector);assert(await js('!!document.querySelector('+JSON.stringify(selector)+')'),selector);await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(100);};
 await until(()=>js('!!document.querySelector("[data-action=navigate]")'),'Current renderer missing');ipcMain.handle=register;const bootstrap=await js('window.buddy.bootstrap()');assert.equal(bootstrap.data.patch,data.patch);assert.equal(bootstrap.data.version,data.version);
 const original=JSON.parse(await fs.readFile(path.join(root,'original-favorite.json')));assert.deepEqual((await state()).favorites.find(f=>f.id===original.id),original,'Current startup changed historical personal data');
 if(syncMode||phase?.startsWith('spells-')){
  const checks=await require('./smoke-current-configuration.cjs')({phase,root,main,windows,js,click,state,until,delay,syncDelay,syncHits:()=>syncHits});assert.deepEqual((await state()).favorites.find(f=>f.id===original.id),original);
  const proof={passed:true,phase,patch:data.patch,archiveSha256:release.archiveSha256,dataInjected:false,realClientWrites:0,...checks};await fs.writeFile(path.join(root,'current-'+phase+'.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));app.quit();return;
 }
 const {createCooperationGraph,cooperationPlan}=await import(pathToFileURL(path.join(base,'src/core/cooperation.mjs')));assert.equal(cooperationPlan([{champion:'Trundle',role:'top'},{champion:'Sejuani',role:'jungle'},{champion:'Seraphine',role:'mid'}],createCooperationGraph(data.champions)),null,'Raw update must not renew the old skill link');
 let expected;
 if(!restart){
  await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll(".result-card").length>=3&&!document.querySelector("[data-action=recommend],[data-action=reroll]").disabled'),'Current three-position worker results missing');
  assert.equal(await js('document.querySelectorAll(".cooperation-plan").length'),0);assert.equal(await js('/控制接力链|突进爆发|由机制规则推导/.test(document.querySelector("#app").textContent)'),false);
  const before=(await state()).draft.slots.filter(s=>['top','jungle'].includes(s.role));await js('document.querySelector(".result-card .candidate-details").open=true');await click('.result-card [data-action=favorite-result][data-index="0"]');
  await until(async()=>(await state()).favorites.some(f=>f.type==='team'&&f.id!==original.id),'Current ordinary lineup favorite missing');const currentFavorite=(await state()).favorites.find(f=>f.type==='team'&&f.id!==original.id);assert.equal(currentFavorite.creativePlan,undefined);
  await click('.result-card [data-action=use-result][data-index="0"]');await until(async()=>(await state()).draft.slots.filter(s=>s.party).every(s=>s.champion&&s.locked),'Ordinary lineup adoption missing');assert.deepEqual((await state()).draft.slots.filter(s=>['top','jungle'].includes(s.role)),before,'Current adoption moved fixed manual friends');
 }
 main.webContents.send('open-build',{id:'Ahri',role:'mid',mode:'rift'});await until(()=>js('!!document.querySelector(".rune-option.active")'),'Current full configuration missing');
 if(!restart){
  const alternative=await js('[...document.querySelectorAll("[data-action=build-rune]")].find(b=>!b.classList.contains("active"))?.dataset.id');assert(alternative,'Current Ahri source must offer a second rune choice');
  await click('[data-action=build-rune][data-id="'+alternative+'"]');await until(async()=>(await state()).preparations.some(p=>p.id==='Ahri'&&p.role==='mid'&&p.runeId===alternative),'Current rune selection not saved');
  await click('[data-action=favorite-build]');await until(async()=>(await state()).favorites.some(f=>f.type==='build'&&f.champion==='Ahri'),'Current configuration favorite missing');expected={preparation:(await state()).preparations.find(p=>p.id==='Ahri'&&p.role==='mid'),currentFavorite:(await state()).favorites.find(f=>f.type==='team'&&f.id!==original.id)};await fs.writeFile(path.join(root,'expected-current.json'),JSON.stringify(expected));
 }else{expected=JSON.parse(await fs.readFile(path.join(root,'expected-current.json')));assert.equal(await js('document.querySelector(".rune-option.active").dataset.id'),expected.preparation.runeId);assert.deepEqual((await state()).favorites.find(f=>f.id===expected.currentFavorite.id),expected.currentFavorite);assert((await state()).favorites.some(f=>f.type==='build'&&f.champion==='Ahri'));}
 assert.deepEqual((await state()).favorites.find(f=>f.id===original.id),original,'Current actions changed historical personal identity');
 await js('document.querySelector(".drawer-content")?.scrollTo(0,0)');await fs.writeFile(path.join(root,restart?'current-restart.png':'current-preparation.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 const proof={passed:true,restart,archiveSha256:release.archiveSha256,patch:data.patch,dataInjected:false,actualWorkerThreePositions:!restart,oldMechanismsNotRenewed:true,currentConfigurationSaved:true,historicalPersonalBytesPreserved:true,realClientWrites:0};await fs.writeFile(path.join(root,restart?'current-restart.json':'current-prepare.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'current-error-'+restart+'.txt'),error.stack).catch(()=>{});app.exit(1);});
