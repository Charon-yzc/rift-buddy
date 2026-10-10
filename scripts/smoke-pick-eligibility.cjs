const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{pathToFileURL}=require('node:url'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),phase=process.env.RIFT_BUDDY_PICK_PHASE,windows=[];let runeWrites=0,clientReads=0,pickable=null,ownChampion=0,makeClient;
globalShortcut.register=()=>false;global.fetch=async()=>{throw Error('Isolated eligibility smoke: network disabled');};https.request=()=>{throw Error('Isolated eligibility smoke: game sockets disabled');};
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>handle(name,name==='client-status'?()=>{clientReads++;return makeClient();}:name==='apply-runes'?()=>{runeWrites++;throw Error('Rune writes prohibited');}:name==='companion-mode'?(_event,value)=>{const w=windows[0];w.setMinimumSize(value?280:820,480);w.setContentSize(value?440:1180,850);return {docked:!!value,overlap:false};}:handler);
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(check,label){for(let n=0;n<170;n++){if(await check())return;await delay(70);}throw Error(label);}
async function run(){
 const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar');
 for(const file of ['services/lcu.mjs','services/storage.mjs','src/core/draft.mjs','src/core/pick-eligibility.mjs','src/core/personal-combo.mjs','src/core/team-favorites.mjs','src/core/recommend.mjs','src/app.mjs','src/companion-view.mjs','src/pick-eligibility-view.mjs','src/styles.css'])assert.ok((await fs.readFile(path.join(base,file))).equals(await fs.readFile(file)),'Packaged source drift: '+file);
 const {pickEligibilityContext}=await import(pathToFileURL(path.join(base,'src/core/pick-eligibility.mjs'))),{champions}=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),key=id=>champions.find(c=>c.id===id).key;
 pickable=phase==='empty'?[]:[key('Ahri')];
 makeClient=()=>{
  if(['offline','locked','library','restart','position-restart'].includes(phase))return {connected:false,phase:'Offline',message:'Isolated manual fixture'};
  const current={gameId:'12345',localPlayerCellId:1,myTeam:[{cellId:1,championId:ownChampion,assignedPosition:phase==='library-solo'?'':phase.startsWith('position')?ownChampion?'JUNGLE':'':'MIDDLE'},{cellId:2,championId:0,assignedPosition:'JUNGLE'}],theirTeam:['enemy','mirror'].includes(phase)?[{cellId:6,championId:key('Ahri'),assignedPosition:'MIDDLE'}]:[],bans:phase==='banned'?[key('Ahri')]:[],allowDuplicatePicks:phase==='mirror'};
  const receivedAt=new Date().toISOString();return {connected:true,phase:'ChampSelect',session:current,mode:{id:'rift',label:'峡谷模拟'},receivedAt,eligibility:{pickable,disabled:[],localPlayerCellId:1,context:pickEligibilityContext(current),receivedAt},message:'Isolated public selection'};
 };
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true),state=()=>js('window.buddy.bootstrap().then(b=>b.state)'),click=async selector=>{assert.ok(await js('!!document.querySelector('+JSON.stringify(selector)+')'),selector);await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(150);},capture=async name=>fs.writeFile(path.join(root,name+'.png'),(await main.webContents.capturePage()).toPNG());
 await until(()=>js('!!document.querySelector("[data-action=navigate]")'),'App not ready');const before=await state();assert.equal(before.preferences.autoSync,false);
 if(phase.endsWith('restart')){
  const expected=JSON.parse(await fs.readFile(path.join(root,'accepted.json')));assert.deepEqual(before.draft,expected.draft);assert.deepEqual(before.favorites,expected.favorites);assert.ok(!Object.hasOwn(before,'eligibility'));assert.equal(await js('document.querySelector(".pick-eligibility").dataset.eligibility'),'manual');
 }else if(phase==='library-solo'){
  await click('[data-action=sync]');await until(()=>js('document.querySelector(".pick-eligibility").dataset.eligibility==="checked"'),'Solo scope not read');
  await click('[data-action=combination-library]');await click('[data-action=load-duo][data-id=wind-cow]');await until(async()=>(await state()).draft.slots[3].champion==='Yasuo','Solo account scope leaked into friends library');assert.equal((await state()).draft.scope,'bot');assert.equal((await state()).draft.slots[4].champion,'Alistar');await capture('library-keeps-friends-ownership-unknown');
 }else if(phase==='library'){
  await click('[data-action=combination-library]');
  for(const [kind,id]of [['duos','wind-cow'],['trios','ball-delivery']]){
   await click('[data-action=combo-kind][data-kind='+kind+']');await click('[data-action=load-'+(kind==='duos'?'duo':'trio')+'][data-id='+id+']');
   await until(()=>js('document.body.textContent.includes("锁定英雄冲突")'),'Library bypassed lock: '+kind);assert.deepEqual((await state()).draft.slots,before.draft.slots);
  }await capture('library-preserves-locked-members');
 }else if(phase==='locked'){
  await click('[data-action=navigate][data-route=favorites]');await click('[data-action=open-favorite]');const after=await state();assert.deepEqual(after.draft.slots[2],before.draft.slots[2]);assert.equal(after.draft.slots[1].champion,'Vi');assert.match(await js('document.body.textContent'),/与锁定英雄冲突/);await capture('favorite-keeps-locked-friend');
 }else{
  if(phase!=='offline'){await click('[data-action=sync]');await until(()=>js('document.querySelector(".pick-eligibility").dataset.eligibility!=="manual"'),'Client not synchronized');}
  if(phase.startsWith('position')){
   assert.equal(await js('document.querySelector(".pick-eligibility").dataset.eligibility'),phase==='position-solo'?'checked':'position');
   await js('var role=document.querySelector("#solo-role");role.value="mid";role.dispatchEvent(new Event("change",{bubbles:true}))');await delay(150);assert.equal(await js('document.querySelector(".pick-eligibility").dataset.eligibility'),'checked');
  }
  await click('[data-action=recommend]');
  if(['empty','banned','enemy'].includes(phase)){
   await until(()=>js('!!document.querySelector(".recommendation-error")'),'Unavailable selection did not explain the conflict');assert.equal(await js('document.querySelectorAll(".result-card").length'),0);assert.match(await js('document.querySelector(".recommendation-error").textContent'),phase==='empty'?/没有可选英雄/:phase==='banned'?/已被本局禁用/:/本局不能重复选择/);assert.deepEqual((await state()).draft.slots,before.draft.slots);
   if(phase!=='empty'){await click('[data-action=navigate][data-route=favorites]');await click('[data-action=open-favorite]');assert.match(await js('document.body.textContent'),/本局不可选/);assert.equal((await state()).draft.slots[2].champion,'Ahri');
    await click('[data-action=combination-library]');await click('[data-action=combo-kind][data-kind=trios]');const preserved=(await state()).draft.slots;await click('[data-action=load-trio][data-id=vi-ahri-nautilus]');await until(()=>js('document.body.textContent.includes("这套组合有本局不可选的英雄")'),'Library bypassed public conflict');assert.deepEqual((await state()).draft.slots,preserved);
   }
   await capture('unavailable-'+phase);
  }else{
   await until(()=>js('!!document.querySelector(".result-card")'),'Result missing');const cards=await js('document.querySelector(".result-card").textContent');
   if(phase==='mirror')assert.match(cards,/阿狸/);else if(phase!=='offline')assert.match(cards,/阿狸/);
   if(phase==='owned'){
    const layouts=[];
    for(const scale of [1,1.25]){await js('window.buddy.presentation({field:"textScale",value:'+scale+'})');await delay(150);for(const width of [820,1051,1180]){main.setContentSize(width,720);await delay(100);const layout=await js('({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll(".top-actions button")].map(b=>({right:b.getBoundingClientRect().right,left:b.getBoundingClientRect().left,label:b.textContent}))})');assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));assert.ok(layout.buttons.every(b=>b.left>=0&&b.right<=layout.width+1),'Toolbar clipped '+JSON.stringify(layout));layouts.push({scale,...layout});}}
    await fs.writeFile(path.join(root,'layouts.json'),JSON.stringify(layouts,null,2));main.setContentSize(1051,720);await delay(100);await capture('main-1051-125');
    await click('[data-action=companion-attach]');await until(()=>js('!!document.querySelector(".companion-shell")'),'Sidebar missing');
    for(const width of [280,360,440]){main.setContentSize(width,850);await delay(100);assert.equal(await js('document.querySelector(".pick-eligibility").dataset.eligibility'),'checked');assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'Sidebar overflow '+width);if(width===280)await capture('sidebar-280');}
    await click('[data-action=companion-full]');await until(()=>js('!!document.querySelector(".result-card")'),'Full app missing');await click('[data-action=result-detail]');await until(()=>js('!!document.querySelector("[data-action=use-result]")'),'Accept missing');
    const draftBefore=(await state()).draft;pickable=[key('Lux')];await click('[data-action=use-result]');await until(()=>js('document.body.textContent.includes("选人已变化，请重新推荐")'),'Old result was not rejected');assert.deepEqual((await state()).draft,draftBefore);
    await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card")'),'New result missing');assert.match(await js('document.querySelector(".result-card").textContent'),/拉克丝/);
    await click('[data-action=result-detail]');await click('[data-action=use-result]');await until(async()=>(await state()).draft.slots[2].champion==='Lux','Fresh result not accepted');
    await click('[data-action=navigate][data-route=favorites]');await click('[data-action=open-favorite]');const accepted=await state();assert.equal(accepted.draft.slots[2].champion,'Lux');assert.match(await js('document.body.textContent'),/本局不可选/);assert.deepEqual(accepted.favorites,before.favorites);await fs.writeFile(path.join(root,'accepted.json'),JSON.stringify({draft:accepted.draft,favorites:accepted.favorites}));await capture('current-range-preserved');
   }else if(phase.startsWith('position')){
    await click('[data-action=result-detail]');await click('[data-action=use-result]');await until(async()=>(await state()).draft.slots[2].champion==='Ahri','Manual-position plan not accepted');assert.deepEqual((await state()).draft.playerPosition,{role:'mid',cellId:1});
    await click('[data-action=sync]');assert.equal(await js('document.querySelector(".pick-eligibility").dataset.eligibility'),'checked');assert.equal(await js('document.querySelector("#solo-role").value'),'mid');assert.equal((await state()).draft.slots[2].champion,'Ahri');
    ownChampion=key('Lux');await click('[data-action=sync]');await until(async()=>(await state()).draft.slots[2].champion==='Lux','Actual own hero ignored explicit lane');let accepted=await state();assert.equal(accepted.draft.slots[2].manualPosition,true);assert.equal(accepted.draft.slots[2].clientCellId,1);assert.deepEqual(accepted.draft.playerPosition,{role:'mid',cellId:1});await click('[data-action=move-slot][data-role=mid]');await click('[data-action=move-confirm][data-role=support]');await click('[data-action=sync]');accepted=await state();assert.equal(accepted.draft.slots[4].champion,'Lux');assert.equal(accepted.draft.slots[4].manualPosition,true);assert.deepEqual(accepted.draft.playerPosition,{role:'support',cellId:1});assert.equal(await js('document.querySelector("#solo-role").value'),'support');await fs.writeFile(path.join(root,'accepted.json'),JSON.stringify({draft:accepted.draft,favorites:accepted.favorites}));await capture('manual-position-accepted-and-actual-pick');
   }
  }
 }
 assert.equal(runeWrites,0);await fs.writeFile(path.join(root,phase+'-result.json'),JSON.stringify({phase,status:'passed',version:app.getVersion(),runeWrites,clientReads},null,2));console.log('Pick eligibility '+phase+' passed');app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,phase+'-error.txt'),error.stack);app.exit(1);});
