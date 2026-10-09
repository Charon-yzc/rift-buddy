const {app,globalShortcut}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),{EventEmitter}=require('node:events'),{pathToFileURL}=require('node:url');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[];
// Keep this isolated rune test hidden so it cannot interrupt a real game.
app.on('browser-window-created',(_e,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};});
globalShortcut.register=()=>false;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<160;n++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 app.setPath('userData',root);
 const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));
 const {getBuild}=await import(pathToFileURL(path.join(base,'src/core/builds.mjs')).href);
 const old=getBuild(data.champions.find(c=>c.id==='Ashe'),'bottom',data).runePage;
 const preset={...old,id:8000,name:'客户端预设',isEditable:false,current:false};
 const originalChampion=data.champions.find(c=>c.id==='Volibear').key;
 let phase='ChampSelect',gameId='1401',ownChampion=originalChampion,changeOnPages='',pages=[preset,{...old,id:21,name:'旧方案一',isEditable:true,current:false},{...old,id:22,name:'当前旧方案',isEditable:true,current:true}],writes=[],selections=[],selectionRejected=false;
 const response=options=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  if(options.path==='/lol-gameflow/v1/gameflow-phase')return {value:phase};
  if(options.path==='/lol-gameflow/v1/session')return {value:{gameData:{gameId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}}};
  if(options.path==='/lol-champ-select/v1/session')return {value:{localPlayerCellId:1,myTeam:[{cellId:1,championId:ownChampion,assignedPosition:'top'}],theirTeam:[],actions:[],bans:{}}};
  if(!options.method||options.method==='GET'){
   assert.equal(options.path,'/lol-perks/v1/pages');const value=structuredClone(pages);
   if(changeOnPages==='phase')phase='GameStart';else if(changeOnPages==='game')gameId='1402';else if(changeOnPages==='hero')ownChampion=data.champions.find(c=>c.id==='Zed').key;
   changeOnPages='';return {value};
  }
  if(options.path==='/lol-perks/v1/currentpage'){
   assert.equal(options.method,'PUT');const id=JSON.parse(options.body);assert.equal(pages.find(p=>p.id===id)?.isEditable,true);selections.push(id);if(selectionRejected)return {status:409,value:{message:'Selection refused'}};pages=pages.map(p=>({...p,current:p.id===id}));return {value:null};
  }
  writes.push({method:options.method,path:options.path});
  if(options.method==='POST')return {status:400,value:{message:'Page capacity reached'}};
  assert.equal(options.method,'PUT');
  const id=Number(options.path.split('/').at(-1)),target=pages.find(p=>p.id===id);assert.equal(target?.isEditable,true,'Preset or missing page targeted');
  const payload=JSON.parse(options.body);assert.equal(payload.current,true);assert.equal(payload.selectedPerkIds.length,9);
  pages=pages.map(p=>p.id===id?{...payload,id,isEditable:true,current:p.current}:p);
  return {value:pages.find(p=>p.id===id)};
 };
 https.request=(options,callback)=>{
  const req=new EventEmitter();req.write=body=>{options.body=body;};req.end=()=>queueMicrotask(()=>{
   const output=response(options),res=new EventEmitter();res.statusCode=output.status||200;callback(res);res.emit('data',Buffer.from(JSON.stringify(output.value)));res.emit('end');req.emit('close');
  });req.destroy=e=>{if(e)req.emit('error',e);};return req;
 };
 require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true),click=sel=>js('document.querySelector('+JSON.stringify(sel)+').click()');
 await until(()=>js('!!document.querySelector("#solo-role")'),'Main not loaded');assert.equal(main.isVisible(),false);
 const initial=(await js('window.buddy.bootstrap()')).state.guide;assert.equal(initial.ball,false,'Legacy saved ball survived upgrade');assert.equal(initial.collapsed,false);
 await click('[data-action=sync]');await until(()=>js('!!document.querySelector("[data-action=my-runes]")'),'Prepared rune button missing');
 assert.match(await js('document.querySelector("[data-action=my-runes]").textContent'),/替换/);assert.equal(writes.length,0,'Preparation must not apply runes');
 await click('[data-action=my-runes]');await until(()=>js('document.querySelector("[data-action=my-runes]")?.textContent.includes("重新应用")'),'First replacement not confirmed');
 assert.deepEqual(writes,[{method:'PUT',path:'/lol-perks/v1/pages/22'}]);assert.equal(pages.length,3);assert.deepEqual(pages.find(p=>p.id===8000),preset);
 assert.equal((await js('window.buddy.bootstrap()')).state.ownedPageId,22);
 // A changed client selection still reuses the previously written page.
 pages=pages.map(p=>({...p,current:p.id===21}));await click('[data-action=my-runes]');await until(()=>writes.length===2,'Reapply missing');await delay(150);
 assert.equal(writes[1].path,'/lol-perks/v1/pages/22');
 assert.deepEqual(selections,[22],'Unselected saved page was not explicitly selected');assert.equal(pages.find(p=>p.id===22).current,true);
 pages=pages.map(p=>({...p,current:p.id===21}));selectionRejected=true;await click('[data-action=my-runes]');
 await until(()=>js('document.querySelector("#toast").textContent.includes("符文已保存")'),'Partial-save failure was not explained');
 assert.match(await js('document.querySelector("[data-action=my-runes]").textContent'),/替换/,'Failed selection retained an applied marker');
 assert.equal(pages.find(p=>p.id===22).current,false);assert.equal(writes.length,3);
 selectionRejected=false;await click('[data-action=my-runes]');await until(()=>js('document.querySelector("[data-action=my-runes]")?.textContent.includes("重新应用")'),'Retry selection was not confirmed');assert.equal(writes.length,4);assert.equal(pages.find(p=>p.id===22).current,true);
 await click('[data-action=my-build]');await until(()=>js('!!document.querySelector("[data-action=apply-runes]")'),'Full build missing');
 assert.ok(await js('document.querySelector(".drawer").textContent.includes("直接覆盖一张可编辑符文页")'));assert.match(await js('document.querySelector("[data-action=apply-runes]").textContent'),/替换/);
 await click('[data-action=apply-runes]');await until(()=>writes.length===5,'Full build replacement missing');await delay(150);assert.equal(writes[4].path,'/lol-perks/v1/pages/22');
 pages=pages.map(p=>({...p,current:p.id===21}));selectionRejected=true;await click('[data-action=apply-runes]');
 await until(()=>js('document.querySelector("#toast").textContent.includes("符文已保存")'),'Drawer partial-save failure was not explained');
 assert.ok(await js('document.querySelector(".rune-application-status").textContent.includes("尚未")'),'Drawer retained an applied marker after failed selection');assert.equal(writes.length,6);
 selectionRejected=false;await click('[data-action=apply-runes]');await until(()=>js('document.querySelector(".rune-application-status").textContent.includes("已应用")'),'Drawer retry did not confirm selection');assert.equal(writes.length,7);assert.equal(pages.find(p=>p.id===22).current,true);
 // If that page was removed in the client, the remaining editable page works.
 pages=pages.filter(p=>p.id!==22).map(p=>({...p,current:p.id===21}));
 await click('[data-action=close]');await click('[data-action=my-runes]');await until(async()=>(await js('window.buddy.bootstrap()')).state.ownedPageId===21,'Missing-page fallback not saved');
 assert.equal(writes.at(-1).path,'/lol-perks/v1/pages/21');assert.equal(writes.length,8);assert.ok(writes.every(w=>w.method==='PUT'));assert.equal(pages.length,2);assert.deepEqual(pages.find(p=>p.id===8000),preset);
 const applied=pages.find(p=>p.id===21);assert.equal(applied.current,true);assert.ok(applied.name.startsWith('开黑搭子 · '));assert.equal(main.isVisible(),false);
 for(const changed of ['phase','game','hero']){
  phase='ChampSelect';gameId='1401';ownChampion=originalChampion;await click('[data-action=sync]');await until(()=>js('!!document.querySelector("[data-action=my-runes]")'),'Restored own pick missing');
  const beforePages=structuredClone(pages),beforeWrites=writes.length;changeOnPages=changed;await js('document.querySelector("#toast").textContent=""');await click('[data-action=my-runes]');
  await until(()=>js('document.querySelector("#toast").textContent.includes("尚未写入符文")'),'Changed target not rejected: '+changed);
  await until(()=>js('!document.querySelector("[data-action=my-runes]")?.disabled'),'Rejected action stayed pending');assert.equal(writes.length,beforeWrites);assert.deepEqual(pages,beforePages);
 }
 const result={passed:true,archiveSha256:release.archiveSha256,legacyBallExpandedOnBoot:true,fullCollectionReplacement:true,noBlankPageRequired:true,creationAttempts:0,lastWrittenPageReused:true,deletedPageFallback:true,currentPageSelected:true,presetsUnchanged:true,preDispatchPhaseGameAndHeroChangesRejected:true,explicitClickOnly:true,bothApplicationButtons:true,loopbackSocketsMocked:true,actualRuneWrites:false,testWindowsHidden:true};
 await fs.writeFile(path.join(root,'rune-replacement-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'rune-replacement-smoke-error.txt'),error.stack).catch(()=>{});app.exit(1);});
