const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),phase=process.env.RIFT_BUDDY_FAVORITE_PHASE,windows=[];
let fixture,runeWrites=0,clientReads=0,failNextRead=false;
globalShortcut.register=()=>false;
global.fetch=async()=>{throw Error('Isolated favorite smoke: external network disabled');};
https.request=()=>{throw Error('Isolated favorite smoke: client and live sockets disabled');};
const originalHandle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>originalHandle(name,name==='client-status'?()=>{clientReads++;return failNextRead?{connected:false,phase:'Offline',message:'隔离刷新失败'}:structuredClone(fixture);}:name==='apply-runes'?()=>{runeWrites++;throw Error('Favorite loading must not write runes');}:handler);
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{
 if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);
 const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;
 observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;
};
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(60);}throw Error(label);}
async function run(){
 const release=JSON.parse(await fs.readFile('release/latest.json','utf8')),base=path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'),'utf8')),key=id=>data.champions.find(c=>c.id===id).key;
 const online=()=>({connected:true,phase:'ChampSelect',receivedAt:new Date().toISOString(),message:'隔离公开选人',mode:{id:'rift',label:'召唤师峡谷'},game:{gameId:'2501',mapId:11},session:{localPlayerCellId:1,myTeam:[{cellId:2,championId:key('Darius'),assignedPosition:'TOP'},{cellId:1,championId:key('Vi'),assignedPosition:'JUNGLE'}],theirTeam:[],bans:[]}});
 fixture=phase==='offline'?{connected:false,phase:'Offline',message:'隔离离线准备'}:online();
 if(phase==='blind')fixture.session.myTeam=[{cellId:1,championId:key('Ahri'),assignedPosition:''}];
 require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main window missing');
 const js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=navigate]")'),'App not ready');
 const click=async selector=>{assert.ok(await js('!!document.querySelector('+JSON.stringify(selector)+')'),selector);await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(100);};
 const state=async()=>(await js('window.buddy.bootstrap()')).state;
 const sync=async()=>{await click('[data-action=sync]');await until(()=>js('!document.querySelector("[data-action=sync]").disabled'),'Client sync unfinished');};
 const currentSlots=async()=>(await state()).draft.slots;
 const ids=slots=>slots.map(s=>s.champion);
 const favoriteBefore=structuredClone((await state()).favorites[0]);
 if(phase!=='offline')await sync();
 const before=await state();
 if(phase!=='restart'){
  await click('[data-action=navigate][data-route=favorites]');
  assert.match(await js('document.querySelector("[data-action=open-favorite]").textContent'),/载入开黑成员/);
  if(phase==='failed')failNextRead=true;
  if(phase==='changed'){fixture.session.myTeam[0].championId=key('Sett');fixture.session.myTeam[1].championId=key('Volibear');}
  const reads=clientReads;await click('[data-action=open-favorite][data-index="0"]');
  if(phase!=='offline')await until(()=>clientReads>reads,'Favorite load skipped fresh public read');
 }
 if(phase==='failed'){
  await until(()=>js('document.body.textContent.includes("无法确认本局选人")'),'Refresh failure was not visible');
  assert.deepEqual(await currentSlots(),before.draft.slots,'Failed refresh changed draft');
  assert.deepEqual((await state()).preparations,before.preparations,'Failed refresh changed configurations');
 }else{
  const expected=phase==='manual'?[null,'Vi','Darius','Ashe','Nami']:phase==='blind'?[null,null,null,'Ashe','Nami']:phase==='solo'?['Darius','Vi',null,null,null]:phase==='offline'?[null,null,'Ahri','Ashe','Nami']:phase==='changed'?['Sett','Volibear','Ahri','Ashe','Nami']:['Darius','Vi','Ahri','Ashe','Nami'];
  await until(async()=>JSON.stringify(ids(await currentSlots()))===JSON.stringify(expected),'Favorite restored previous non-party picks or lost current public picks');
  if(phase==='offline'){fixture=online();await sync();expected[0]='Darius';expected[1]='Vi';}
  for(let n=0;n<2;n++)await sync();
  assert.deepEqual(ids(await currentSlots()),expected,'Repeated sync revived a previous pick');
  if(phase==='manual'){
   const mid=(await currentSlots())[2];assert.equal(mid.manualPosition,true);assert.equal(mid.clientCellId,2);
   assert.equal((await state()).preparations.find(p=>p.id==='Ahri').runeId,'previous-ahri-choice');
  }
  if(phase==='blind'){
   assert.ok(await js('!!document.querySelector("[data-action=assign-import][data-id=Ahri]")'),'Blind public hero must remain unassigned');
   assert.equal((await state()).preparations.find(p=>p.id==='Ahri').runeId,'previous-ahri-choice');
  }
  if(phase==='solo'){assert.equal((await state()).draft.soloRole,'jungle');assert.equal(await js('document.querySelector("#solo-role").value'),'jungle');}
  if(!['manual','blind','solo'].includes(phase)){
   for(const selection of favoriteBefore.configurations.filter(s=>['Ahri','Ashe','Nami'].includes(s.id))){
    const actual=(await state()).preparations.find(p=>p.id===selection.id&&p.role===selection.role&&(p.comboId||null)===(selection.comboId||null));
    for(const field of ['runeId','coreId','skillId'])assert.equal(actual?.[field],selection[field],selection.id+' '+field);
   }
   main.webContents.send('open-build',{id:'Ahri',role:'mid',mode:'rift'});
   const choice=favoriteBefore.configurations.find(s=>s.id==='Ahri');
   await until(()=>js('document.querySelector(".rune-option.active")?.dataset.id==='+JSON.stringify(choice.runeId)),'Restored member rune not selected in actual UI');
   assert.equal(await js('document.querySelector("[data-action=build-core].active")?.dataset.index'),String(choice.coreIndex));
   await click('[data-action=close]');
  }
 }
 const after=await state();assert.deepEqual(after.favorites[0],favoriteBefore,'Loading modified original favorite');
 assert.equal(after.preparations.find(p=>p.id==='Lux').runeId,'unrelated-lux-choice');assert.equal(runeWrites,0);
 if(phase==='standard')await fs.writeFile(path.join(root,'accepted.json'),JSON.stringify({slots:after.draft.slots,preparations:after.preparations}));
 if(phase==='restart'){
  const accepted=JSON.parse(await fs.readFile(path.join(root,'accepted.json'),'utf8'));assert.deepEqual(after.draft.slots,accepted.slots);
  for(const choice of accepted.preparations)assert.ok(after.preparations.some(p=>JSON.stringify(p)===JSON.stringify(choice)),'Restart lost a preparation');
 }
 await fs.writeFile(path.join(root,phase+'-result.json'),JSON.stringify({phase,status:'passed',version:app.getVersion(),slots:after.draft.slots,runeWrites,clientReads},null,2));
 console.log('Favorite context '+phase+' passed');app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,phase+'-error.txt'),error.stack);app.exit(1);});
