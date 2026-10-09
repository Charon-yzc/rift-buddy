const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),https=require('node:https'),{EventEmitter}=require('node:events'),{createHash}=require('node:crypto');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),phase=process.env.RIFT_BUDDY_SUMMONER_PHASE,windows=[],copies=[];
const pair=['SummonerDot','SummonerFlash'],hexPair=['SummonerMana','SummonerFlash'];let runeWrites=0;
globalShortcut.register=()=>false;
global.fetch=async()=>{throw Error('Isolated summoner smoke: network disabled');};
https.request=()=>{throw Error('Isolated summoner smoke: game sockets disabled');};
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>handle(name,name==='client-status'?()=>({connected:false,phase:'Offline',message:'隔离召唤师技能验收'}):name==='apply-runes'?()=>{runeWrites++;throw Error('Rune writes prohibited');}:name==='copy'?(_event,text)=>{copies.push(text);return true;}:name==='companion-mode'?(_event,value)=>{const w=windows[0];w.setMinimumSize(value?280:820,480);w.setContentSize(value?440:1180,850);return {docked:!!value,overlap:false};}:handler);
const spawn=cp.spawn;
cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return spawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(70);}throw Error(label);}
async function run(){
 app.setPath('userData',root);
 const release=JSON.parse(await fs.readFile('release/latest.json')),archive=path.join(release.directory,'resources/app.asar');
 const archiveSha256=createHash('sha256').update(await require('original-fs').promises.readFile(archive)).digest('hex');assert.equal(archiveSha256,release.archiveSha256);
 for(const file of ['src/core/summoner-selection.mjs','src/summoner-selection-view.mjs','src/core/builds.mjs','src/core/build-favorites.mjs','src/core/guide.mjs','src/core/preparation.mjs','src/core/companion-plan.mjs','src/app.mjs','src/companion-view.mjs','src/guide-view.mjs','src/styles.css'])assert.ok((await fs.readFile(path.join(archive,file))).equals(await fs.readFile(file)),file+' drift');
 const version=JSON.parse(await fs.readFile(path.join(archive,'package.json'))).version;app.getVersion=()=>version;
 require(path.join(archive,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true),state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 const click=async selector=>{assert.ok(await js('!!document.querySelector('+JSON.stringify(selector)+')'),selector);await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(110);};
 const change=async(selector,value)=>{await js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el)throw Error("Control missing");el.value='+JSON.stringify(value)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(110);};
 const read=(compact=false)=>js('[...document.querySelectorAll('+JSON.stringify(compact?'[data-companion-field^="summoner-"]':'[data-build-summoner]')+')].map(s=>s.value)');
 const preparePair=async(ids,compact=false)=>{const attr=compact?'data-companion-field':'data-build-summoner',prefix=compact?'summoner-':'';await change('['+attr+'="'+prefix+'d"]',ids[0]);await change('['+attr+'="'+prefix+'f"]',ids[1]);assert.deepEqual(await read(compact),ids);};
 const open=async(id='Ashe',role='bottom',mode='rift')=>{main.webContents.send('open-build',{id,role,mode});await until(()=>js('!!document.querySelector("[data-build-summoner]")'),'Configuration missing');await delay(100);};
 const guidePair=async ids=>{await until(async()=>{const s=await state();return JSON.stringify(s.guide?.selection.summonerIds)===JSON.stringify(ids);},'Guide selection lost spells');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');const gjs=code=>guide.webContents.executeJavaScript(code,true);await until(()=>gjs('window.guide.bootstrap().then(b=>JSON.stringify(b.model?.summoners.map(s=>s.id))==='+JSON.stringify(JSON.stringify(ids))+')'),'Guide model lost D/F');await gjs('document.querySelector("[data-tab=skills]").click()');await until(()=>gjs('document.body.textContent.includes("D / F")'),'Guide lacks preparation context');assert.deepEqual(await gjs('[...document.querySelectorAll(".spells span")].map(s=>s.textContent)'),ids.map((id,i)=>(i?'F':'D')+' · '+(id==='SummonerDot'?'引燃':'闪现')));};
 const capture=async(name)=>{await js('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>{});})).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,name),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 await until(()=>js('!!document.querySelector("[data-action=navigate]")'),'UI missing');
 if(phase==='prepare'){
  await open();const defaults=await read();await click('[data-action=favorite-build]');await preparePair(pair);
  await click('[data-action=build-summoner][data-field=summoner-swap]');assert.deepEqual(await read(),[...pair].reverse());
  await change('[data-build-summoner=d]',pair[0]);assert.deepEqual(await read(),pair,'Duplicate choice must swap slots');
  await click('[data-action=build-summoner][data-field=summoner-reset]');assert.deepEqual(await read(),defaults);await preparePair(pair);
  await click('[data-action=favorite-build]');await click('[data-action=copy-build]');assert.match(copies.at(-1),/召唤师技能：D 引燃 \/ F 闪现/);
  await click('[data-action=open-guide]');await guidePair(pair);
  await change('[data-build-source-field=region]','kr');await change('[data-build-source-field=region]','global');assert.deepEqual(await read(),pair);await guidePair(pair);
  await click('[data-action=build-core][data-index="1"]');await click('[data-action=build-condition][data-condition=heal]');assert.deepEqual(await read(),pair);
  await click('[data-action=build-mode][data-mode=hex]');await until(()=>js('!!document.querySelector("[data-build-summoner] option[value=SummonerMana]")'),'Mayhem spell options missing');
  for(const id of ['SummonerExhaust','SummonerSmite','SummonerTeleport'])assert.equal(await js('!!document.querySelector("[data-build-summoner] option[value='+id+']")'),false,id+' illegal in Mayhem');
  await preparePair(hexPair);await click('[data-action=favorite-build]');await click('[data-action=build-mode][data-mode=rift]');assert.deepEqual(await read(),pair,'Separate mode choice lost');
  await click('[data-action=build-jump][data-section=skills]');await js('document.querySelector(".summoner-preparation").scrollIntoView({block:"center"})');await delay(300);await capture('full-summoner-preparation.png');await click('[data-action=close]');
  await click('[data-action=navigate][data-route=draft]');await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card")'),'Results missing');
  const before=(await state()).draft.slots;await click('[data-action=companion-attach]');await click('[data-action=companion-preview][data-result-index="0"][data-id=Aphelios]');
  await preparePair(pair,true);assert.deepEqual((await state()).draft.slots,before,'Preview accepted draft unexpectedly');
  for(const width of [280,360,440]){main.setContentSize(width,850);await until(()=>js('Math.abs(innerWidth-'+width+')<=2'),'Resize did not settle');await delay(250);assert.deepEqual(await read(true),pair);assert.equal(await js('document.documentElement.scrollWidth>innerWidth+1'),false,'Sidebar overflow '+width);assert.ok(await js('[...document.querySelectorAll("[data-companion-field^=summoner-]")].every(s=>{const r=s.getBoundingClientRect();return r.width>80&&r.left>=0&&r.right<=innerWidth+1;})'),'Clipped spell controls '+width);await js('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');await click('[data-action=companion-jump][data-section=skills]');await js('document.querySelector(".companion-content .summoner-preparation").scrollIntoView({block:"center"})');await delay(350);const box=await js('(()=>{const r=document.querySelector(".companion-content .summoner-preparation").getBoundingClientRect(),c=document.querySelector(".companion-content").getBoundingClientRect();return {top:r.top,bottom:r.bottom,clipTop:c.top,clipBottom:c.bottom};})()');assert.ok(box.top>=box.clipTop&&box.bottom<=box.clipBottom,"Spell preparation outside scroll viewport "+width+JSON.stringify(box));await capture('sidebar-summoners-'+width+'.png');}
  await click('[data-action=companion-full]');await click('[data-action=favorite-result][data-index="0"]');const favorite=(await state()).favorites.find(f=>f.type==='team');assert.deepEqual(favorite.configurations.find(m=>m.id==='Aphelios').summonerIds,pair);
  await click('[data-action=result-detail][data-index="0"]');await click('[data-action=use-result][data-index="0"]');await until(()=>js('!!document.querySelector(".result-card")'),'Accepted results missing');
  await open('Aphelios');assert.deepEqual(await read(),pair);await click('[data-action=open-guide]');await guidePair(pair);await click('[data-action=close]');
  await fs.writeFile(path.join(root,'expected.json'),JSON.stringify({favorite,defaults},null,2));
 }else{
  const expected=JSON.parse(await fs.readFile(path.join(root,'expected.json'))),saved=await state();
  assert.deepEqual(saved.favorites.find(f=>f.type==='team').configurations,expected.favorite.configurations);
  await open('Aphelios');assert.deepEqual(await read(),pair);await click('[data-action=build-summoner][data-field=summoner-reset]');await click('[data-action=close]');
  await click('[data-action=navigate][data-route=favorites]');const team=(await state()).favorites.findIndex(f=>f.type==='team');await click('[data-action=open-favorite][data-index="'+team+'"]');await open('Aphelios');assert.deepEqual(await read(),pair,'Team snapshot must restore manual spells');await click('[data-action=open-guide]');await guidePair(pair);await click('[data-action=close]');
  await click('[data-action=navigate][data-route=favorites]');let favorites=(await state()).favorites;const ashe=favorites.findIndex(f=>f.type==='build'&&f.champion==='Ashe'&&f.mode==='rift'&&f.summonerIds);await click('[data-action=open-favorite][data-index="'+ashe+'"]');assert.deepEqual(await read(),pair);await click('[data-action=close]');
  await click('[data-action=navigate][data-route=favorites]');favorites=(await state()).favorites;const sourceDefault=favorites.findIndex(f=>f.type==='build'&&f.champion==='Ashe'&&f.mode==='rift'&&!f.summonerIds);await click('[data-action=open-favorite][data-index="'+sourceDefault+'"]');assert.deepEqual(await read(),expected.defaults,'Source-following favorite must clear a later manual choice');assert.equal(await js('document.querySelector("[data-action=build-summoner][data-field=summoner-reset]").disabled'),true);await click('[data-action=close]');
  await click('[data-action=navigate][data-route=favorites]');favorites=(await state()).favorites;const hex=favorites.findIndex(f=>f.type==='build'&&f.champion==='Ashe'&&f.mode==='hex');await click('[data-action=open-favorite][data-index="'+hex+'"]');assert.deepEqual(await read(),hexPair);await capture('restored-hex-summoners.png');
 }
 assert.equal(runeWrites,0);await fs.writeFile(path.join(root,phase+'.json'),JSON.stringify({passed:true,phase,version,archiveSha256,actualRuneWrites:runeWrites,manualDAndF:true,modeRestrictions:true,guideAndFavorites:true,offlineRestart:phase==='restore'},null,2));console.log('Summoner preparation '+phase+' passed');app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,phase+'-error.txt'),error.stack);app.exit(1);});
