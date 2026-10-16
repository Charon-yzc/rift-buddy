const {revealDraftAction}=require('./smoke-draft-ui.cjs');
const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),https=require('node:https'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),phase=process.env.RIFT_BUDDY_PREPARATION_PHASE,windows=[];
let runeWrites=0;
globalShortcut.register=()=>false;
global.fetch=async()=>{throw Error('Isolated preparation smoke: network disabled');};
https.request=()=>{throw Error('Isolated preparation smoke: LCU and live network disabled');};
const originalHandle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>originalHandle(name,name==='client-status'?()=>({connected:false,phase:'Offline',message:'隔离配置验收'}):name==='apply-runes'?()=>{runeWrites++;throw Error('Preparation smoke must never write runes');}:handler);
const realSpawn=cp.spawn;
cp.spawn=(file,...args)=>{
 if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);
 const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;
 observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;
};
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(60);}throw Error(label);}
async function run(){
 const release=JSON.parse(await fs.readFile('release/latest.json','utf8')),archive=path.join(release.directory,'resources/app.asar');
 const manifest=JSON.parse(await fs.readFile(path.join(archive,'package.json'),'utf8'));app.getVersion=()=>manifest.version;
 require(path.join(archive,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main window missing');
 const js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=navigate]")'),'App not ready');
 const click=async selector=>{selector=await revealDraftAction(js,selector);assert.ok(await js('!!document.querySelector('+JSON.stringify(selector)+')'),selector);await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(80);};
 const change=async(selector,value)=>{await js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');el.value='+JSON.stringify(value)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(100);};
 const open=async(id,role='bottom',selection={})=>{main.webContents.send('open-build',{id,role,mode:'rift',...selection});await until(()=>js('document.querySelector(".rune-option.active")?.dataset.id'),'Build did not open');await delay(80);};
 const read=()=>js('({core:document.querySelector("[data-action=build-core].active")?.dataset.index,rune:document.querySelector(".rune-option.active")?.dataset.id,skill:document.querySelector("#build-skill")?.value||null,conditions:[...document.querySelectorAll("[data-action=build-condition].active")].map(el=>el.dataset.condition)})');
 const state=async()=>(await js('window.buddy.bootstrap()')).state;
 const differentRune=()=>js('[...document.querySelectorAll("[data-action=build-rune]")].find(el=>!el.classList.contains("active"))?.dataset.id');
 const selectRune=id=>click('[data-action=build-rune][data-id="'+id+'"]');
 const persisted=async(id,rune,comboId)=>until(async()=>{const s=await state();return s.preparations?.some(p=>p.id===id&&p.runeId===rune&&(comboId===undefined?!p.comboId:p.comboId===comboId));},'Configuration was not persisted');
 const expectedFile=path.join(root,'expected.json');
 const openFavorite=async id=>{
  if(await js('!!document.querySelector("[data-action=close]")'))await click('[data-action=close]');
  await click('[data-action=navigate][data-route=favorites]');
  const index=(await state()).favorites.findIndex(f=>f.id===id);assert.ok(index>=0,'Saved personal configuration missing');
  await click('[data-action=open-favorite][data-index="'+index+'"]');
 };
 const assertShared=async expected=>{
  await until(async()=>{const p=(await state()).preparations.find(p=>p.id==='Galio'&&p.role==='mid');return JSON.stringify(p?.sharedEquipment||null)===JSON.stringify(expected||null);},'Favorite did not restore/clear shared equipment');
  assert.equal(await js('!!document.querySelector("[data-action=build-shared-reset]")'),!!expected);
  const s=await state();assert.equal(s.guide.selection.runeId,JSON.parse(await fs.readFile(expectedFile,'utf8')).guideBefore.runeId,'Personal favorite must not replace the previously opened guide');
 };
 if(phase==='prepare'){
  await open('Aphelios');await click('[data-action=build-core][data-index="2"]');await selectRune(await differentRune());await click('[data-action=build-condition][data-condition=heal]');
  const aphelios=await read();await persisted('Aphelios',aphelios.rune);
  await click('[data-action=close]');await open('Ashe');await click('[data-action=build-core][data-index="1"]');await selectRune(await differentRune());
  const skills=await js('[...document.querySelector("#build-skill").options].filter(option=>option.value).map(option=>option.value)');assert.ok(skills.length>1);await change('#build-skill',skills.at(-1));
  const ashe=await read();await persisted('Ashe',ashe.rune);
  const s=await state();assert.equal(s.favorites.length,0);assert.equal(s.guide,null);
  await fs.writeFile(expectedFile,JSON.stringify({aphelios,ashe},null,2));
 }else if(phase==='restore'){
  const expected=JSON.parse(await fs.readFile(expectedFile,'utf8'));
  await open('Aphelios');assert.deepEqual(await read(),expected.aphelios);await click('[data-action=close]');
  await open('Ashe');assert.deepEqual(await read(),expected.ashe);await click('[data-action=open-guide]');
  const guideBefore=(await state()).guide.selection;assert.ok(guideBefore.coreId&&guideBefore.runeId&&guideBefore.skillId);
  await change('[data-build-source-field=region]','kr');await change('[data-build-source-field=region]','global');
  assert.deepEqual(await read(),expected.ashe);
  await until(async()=>JSON.stringify((await state()).guide.selection)===JSON.stringify(guideBefore),'Source roundtrip changed guide choice');
  await click('[data-action=close]');await click('[data-action=navigate][data-route=draft]');await click('[data-action=recommend]');
  await until(()=>js('document.querySelectorAll(".result-card").length>0'),'Restricted Aphelios/Thresh recommendation missing');
  await click('.result-card [data-action=build][data-id=Aphelios]');await click('[data-action=build-core][data-index="1"]');await selectRune(await differentRune());
  const teamChoice=await read();await click('[data-action=close]');await click('[data-action=favorite-result][data-index="0"]');
  await until(()=>js('document.querySelector("[data-action=favorite-result][data-index=\\"0\\"]").classList.contains("active")'),'Favorite star did not light');
  const favorite=(await state()).favorites[0];assert.equal(favorite.type,'team');assert.equal(favorite.configurations.length,2);
  const member=favorite.configurations.find(s=>s.id==='Aphelios');assert.equal(member.runeId,teamChoice.rune);assert.equal(member.coreIndex,Number(teamChoice.core));assert.ok(member.comboId);
  await click('.result-card [data-action=build][data-id=Aphelios]');await click('[data-action=build-core][data-index="0"]');await selectRune(await differentRune());await click('[data-action=close]');
  await click('[data-action=navigate][data-route=favorites]');await click('[data-action=open-favorite][data-index="0"]');
  await until(async()=>{const s=await state();return s.preparations.some(p=>p.id==='Aphelios'&&p.comboId===member.comboId&&p.runeId===member.runeId&&p.coreId===member.coreId);},'Team load did not restore saved member choices');
  await open('Aphelios');assert.deepEqual(await read(),teamChoice);
  await click('[data-action=build-core][data-index="0"]');await selectRune(await differentRune());const latestChoice=await read();assert.notEqual(latestChoice.rune,teamChoice.rune);
  await persisted('Aphelios',latestChoice.rune,member.comboId);
  const unchanged=(await state()).favorites[0];assert.deepEqual(unchanged.configurations,favorite.configurations);
  await fs.writeFile(expectedFile,JSON.stringify({...expected,teamChoice,latestChoice,favorite,guideBefore},null,2));
 }else if(phase==='team-restore'){
  const expected=JSON.parse(await fs.readFile(expectedFile,'utf8')),before=await state();
  assert.deepEqual(before.favorites[0].configurations,expected.favorite.configurations);
  await open('Aphelios');assert.deepEqual(await read(),expected.latestChoice);await click('[data-action=close]');
  await click('[data-action=navigate][data-route=favorites]');await click('[data-action=open-favorite][data-index="0"]');await open('Aphelios');assert.deepEqual(await read(),expected.teamChoice);await click('[data-action=close]');
  await click('[data-action=navigate][data-route=favorites]');
  await js('document.querySelector(".favorite-team-configurations").open=true');
  await click('[data-action=open-team-build][data-index="0"][data-member="0"]');
  const member=expected.favorite.configurations[0];assert.equal((await read()).rune,member.runeId);await click('[data-action=close]');
  await js('Promise.all([...document.images].map(image=>{image.loading="eager";return image.decode().catch(()=>{});})).then(()=>new Promise(resolve=>requestAnimationFrame(resolve)))');
  await fs.writeFile(path.join(root,'team-favorite.png'),(await main.webContents.capturePage()).toPNG());
  // Save a teammate snapshot, return to ordinary equipment, then reopen both
  // actual favorites. Neither path may inherit the other one's current state.
  const game=JSON.parse(await fs.readFile(path.join(archive,'data/game.json'),'utf8'));
  const sharedEquipment={patch:game.patch,start:[1056,2003,2003],items:[3111,3157,4005,3152]};
  await open('Galio','mid',{sharedEquipment});await click('[data-action=favorite-build]');
  const shared=(await state()).favorites.find(f=>f.type==='build'&&f.champion==='Galio'&&f.sharedEquipment);
  assert.ok(shared);assert.deepEqual(shared.sharedEquipment,sharedEquipment);
  await click('[data-action=build-shared-reset]');await click('[data-action=favorite-build]');
  const ordinary=(await state()).favorites.find(f=>f.type==='build'&&f.champion==='Galio'&&!f.sharedEquipment);assert.ok(ordinary);
  await openFavorite(shared.id);await assertShared(sharedEquipment);
  await openFavorite(ordinary.id);await assertShared(null);
  await fs.writeFile(expectedFile,JSON.stringify({...expected,sharedFavorite:{sharedId:shared.id,ordinaryId:ordinary.id,sharedEquipment}},null,2));
  await fs.writeFile(path.join(root,'result.json'),JSON.stringify({ordinaryRestart:'passed without favorite or guide',roleAndPartnerIsolation:'passed',sourceRoundtrip:'same core/rune/skill and guide',teamFavorite:'snapshot restored after later changes and restart',favoriteStar:'active after saving',runeWrites},null,2));
 }else if(phase==='shared-restore'){
  const {sharedFavorite}=JSON.parse(await fs.readFile(expectedFile,'utf8'));assert.ok(sharedFavorite);
  await openFavorite(sharedFavorite.sharedId);await assertShared(sharedFavorite.sharedEquipment);
  await fs.writeFile(path.join(root,'shared-favorite.png'),(await main.webContents.capturePage()).toPNG());
  await openFavorite(sharedFavorite.ordinaryId);await assertShared(null);
  const result=JSON.parse(await fs.readFile(path.join(root,'result.json'),'utf8'));
  await fs.writeFile(path.join(root,'result.json'),JSON.stringify({...result,sharedFavorite:'teammate snapshot and exact item order restored after changes and restart',ordinaryFavorite:'clears previously active teammate equipment'},null,2));
 }
 assert.equal(runeWrites,0);console.log('Preparation smoke '+phase+' passed');app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,phase+'-error.txt'),error.stack);app.exit(1);});
