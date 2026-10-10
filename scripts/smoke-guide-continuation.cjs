const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),phase=process.env.RIFT_BUDDY_CONTINUATION_PHASE,windows=[],delay=ms=>new Promise(r=>setTimeout(r,ms));let runeWrites=0;
globalShortcut.register=()=>false;global.fetch=async()=>{throw Error('Isolated continuation smoke: network disabled');};https.request=()=>{throw Error('Isolated continuation smoke: sockets disabled');};
app.on('browser-window-created',(_e,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,callback)=>callback({cancel:true})));
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>handle(name,name==='client-status'?()=>({connected:false,phase:'Offline'}):name==='apply-runes'?()=>{runeWrites++;throw Error('Rune writes prohibited');}:handler);
const spawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return spawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
async function until(check,label){for(let n=0;n<180;n++){if(await check())return;await delay(50);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const source=process.env.RIFT_BUDDY_SOURCE==='1',release=JSON.parse(await fs.readFile('release/latest.json')),base=source?path.resolve('.'):path.join(release.directory,'resources/app.asar');require(path.join(base,'electron/main.cjs'));
 let main,guide;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');const js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'UI missing');const state=()=>js('window.buddy.bootstrap().then(b=>b.state)'),expectedFile=path.join(root,'expected.json'),expected=phase==='restart'?JSON.parse(await fs.readFile(expectedFile)):{};
 for(const[id,role]of [['Ashe','bottom'],['Nautilus','support']]){
  const saved=phase==='restart'?(await state()).preparations.find(p=>p.id===id&&p.role===role):{id,role,mode:'rift'};assert.ok(saved);await js('window.buddy.openGuide('+JSON.stringify(saved)+')');
  await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');const gjs=code=>guide.webContents.executeJavaScript(code,true),snapshot=()=>gjs('window.guide.bootstrap()');
  await until(()=>gjs('!!window.guide'),'Guide API missing');await until(async()=>(await snapshot()).model?.selection.id===id,'Guide context missing');
  if(phase==='select'){
   let model=(await snapshot()).model;for(const item of model.route)await gjs('window.guide.control("item",'+JSON.stringify(item.id)+')');
   await until(()=>gjs('document.body.textContent.includes("核心路线完成，继续选择后期装备")'),'No post-core continuation');
   await gjs('document.querySelector("button[data-tab=items]").click()');await until(()=>gjs('!!document.querySelector("[data-guide-section=later]")'),'Late pool missing in guide');
   model=(await snapshot()).model;assert.equal(model.next,null);assert.equal(model.maxLaterItems,id==='Nautilus'?1:2);const progress=[...model.completedItems],choice=model.laterChoices.find(i=>i.fitsRoute&&!i.blockedReason);assert.ok(choice);
   await gjs('document.querySelector('+JSON.stringify('[data-action=later][data-id="'+choice.id+'"]')+').click()');
   await until(async()=>(await snapshot()).model.selection.laterIds?.includes(Number(choice.id)),'Late selection not accepted');model=(await snapshot()).model;assert.equal(model.next.id,choice.id);assert.deepEqual(model.completedItems,progress);assert.equal(model.route.length,5);assert.ok(model.laterChoices.find(i=>i.id===choice.id).selected);
   expected[id]={selection:model.selection,progress,chosen:choice.id};main.webContents.send('open-build',model.selection);await until(()=>js('!!document.querySelector("[data-action=favorite-build]")'),'Main configuration missing');await delay(100);await js('document.querySelector("[data-action=favorite-build]").click()');
   await until(async()=>(await state()).favorites.some(f=>f.champion===id&&f.laterIds?.includes(Number(choice.id))),'Favorite did not retain guide late choice');
   for(const width of [360,440]){guide.setSize(width,740);await delay(100);const layout=await gjs('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert.ok(layout.scroll<=layout.width,'Late pool overflow');await fs.writeFile(path.join(root,id+'-'+width+'.png'),(await guide.webContents.capturePage()).toPNG());}
  }else{
   const model=(await snapshot()).model;assert.deepEqual(model.selection.laterIds,expected[id].selection.laterIds);assert.ok(model.route.some(i=>i.id===expected[id].chosen));assert.ok((await state()).favorites.some(f=>f.champion===id&&f.laterIds?.includes(Number(expected[id].chosen))));
  }
 }
 assert.equal(runeWrites,0);assert.ok(windows.every(w=>!w.isVisible()));
 if(phase==='select')await fs.writeFile(expectedFile,JSON.stringify(expected,null,2));else{const report={passed:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,postCoreDecision:true,inGuideLateChoice:true,coreProgressPreserved:true,supportTaskSlotReserved:true,preparationsFavoritesAndRestart:true,widths:[360,440],actualRuneWrites:0,userSettingsIsolated:true,realGame:'UNPROVEN'};await fs.writeFile(path.join(root,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}app.quit();
}
run().catch(async e=>{console.error(e);await fs.writeFile(path.join(root,phase+'-error.txt'),e.stack).catch(()=>{});app.exit(1);});
