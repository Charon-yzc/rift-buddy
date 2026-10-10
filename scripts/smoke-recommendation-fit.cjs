const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[];
let fixture,sourceEntries,runeWrites=0,sourceRefreshes=0;
globalShortcut.register=()=>false;
global.fetch=async()=>{throw Error('Isolated recommendation smoke: source network disabled');};
https.request=()=>{throw Error('Isolated recommendation smoke: game sockets disabled');};
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const originalHandle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>originalHandle(name,name==='client-status'?()=>structuredClone(fixture):name==='apply-runes'?()=>{runeWrites++;throw Error('Rune writes prohibited');}:name==='refresh-build'?(_event,id,role)=>{const ref=structuredClone(sourceEntries[id+':'+role]);assert.ok(ref);sourceRefreshes++;ref.runeSamples+=sourceRefreshes*1000;ref.fetchedAt=new Date(Date.now()+sourceRefreshes*1000).toISOString();return ref;}:name==='companion-mode'?(_event,value)=>{const main=windows[0];main.setMinimumSize(value?360:820,480);main.setContentSize(value?440:1180,value?729:820);return {docked:!!value,overlap:false};}:handler);
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{
 if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);
 const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;
 observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;
};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(70);}throw Error(label);}
async function run(){
 app.setPath('userData',root);
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?{archiveSha256:null}:JSON.parse(await fs.readFile('release/latest.json','utf8')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'),'utf8')),hero=id=>data.champions.find(c=>c.id===id);
 sourceEntries=JSON.parse(await fs.readFile(path.join(base,'data/builds.json'),'utf8')).entries;
 const draft=ids=>({localPlayerCellId:1,allowDuplicatePicks:true,myTeam:[{cellId:1,championId:0,assignedPosition:'MIDDLE'}],
  theirTeam:[...ids.map((id,i)=>({cellId:6+i,championId:hero(id).key})),{cellId:10,championId:0,championPickIntent:hero('Zed').key}],bans:[],timer:{remainingMs:65000}});
 fixture={connected:true,phase:'ChampSelect',receivedAt:new Date().toISOString(),game:{gameId:'3101',mapId:11},session:draft(['DrMundo','Chogath','Garen'])};
 require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true);
 const click=async selector=>{await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(100);};
 const sync=async()=>{await click('[data-action=sync]');await until(()=>js('!document.querySelector("[data-action=sync]").disabled'),'Sync not completed');};
 const generate=async()=>{await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll(".result-card").length>0'),'Worker produced no cards');};
 const mainIds=()=>js('[...document.querySelectorAll(".result-card .card-members [data-action=build][data-role=mid]")].map(el=>el.dataset.id)');
 const sideIds=()=>js('[...document.querySelectorAll(".companion-candidate [data-action=companion-preview][data-role=mid]")].map(el=>el.dataset.id)');
 const fitIds=()=>js('[...document.querySelectorAll("[data-opponent-fit]")].map(el=>el.dataset.enemyIds)');
 const capture=async name=>{await js('[...document.images].forEach(i=>i.loading="eager")');await js('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await delay(800);await fs.writeFile(path.join(root,name),(await main.webContents.capturePage({stayHidden:true,stayAwake:true})).toPNG());};
 await until(()=>js('!!document.querySelector("#solo-role")'),'App not loaded');await sync();
 assert.equal(await js('document.querySelector("#solo-role").value'),'mid');
 await generate();const frontline=await mainIds(),headingGeometry=[];
 for(const [width,zoom,textScale] of [[1180,1,1],[1051,1.25,1],[1180,1.5,1],[1180,1,1.25],[1051,1.25,1.25],[1180,1.5,1.25]]){
  main.setContentSize(width,820);main.webContents.setZoomFactor(zoom);await js('document.documentElement.style.setProperty("--text-scale",'+textScale+')');await delay(150);
  for(const action of ['recommend','reroll']){
   await click('[data-action='+action+']');await until(()=>js('!!document.querySelector(".recommend-heading")&&!document.querySelector("[data-action=recommend]").disabled'),'Recommendation did not finish');await delay(650);
   const geometry=await js('(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}};return {viewport:[innerWidth,innerHeight],topbar:rect(".topbar"),title:rect(".recommend-heading h2"),description:rect(".recommend-heading p"),actions:[...document.querySelectorAll(".draft-result-actions button")].map(el=>{const r=el.getBoundingClientRect();return {label:el.textContent,top:r.top,bottom:r.bottom,left:r.left,right:r.right}})}})()');
   for(const r of [geometry.title,geometry.description,...geometry.actions]){assert.ok(r.top>=geometry.topbar.bottom+8,'Sticky toolbar covers recommendation: '+JSON.stringify({width,zoom,textScale,action,geometry}));assert.ok(r.bottom<=geometry.viewport[1]&&r.left>=0&&r.right<=geometry.viewport[0],'Recommendation action outside viewport: '+JSON.stringify({width,zoom,textScale,action,geometry}));}
   assert.ok(geometry.actions.length>0);headingGeometry.push({width,zoom,textScale,action,...geometry});
  }
 }
 await capture('main-heading-readable.png');main.webContents.setZoomFactor(1);main.setContentSize(1180,820);await js('document.documentElement.style.removeProperty("--text-scale")');await generate();
 assert.ok((await fitIds()).every(ids=>ids==='DrMundo,Chogath,Garen'));
 assert.equal(await js('[...document.querySelectorAll("[data-opponent-fit]")].some(el=>el.textContent.includes("劫"))'),false,'Enemy hover was treated as confirmed');
 fixture.session=draft(['Ashe','Hecarim','Fiddlesticks']);await sync();
 assert.equal(await js('document.querySelectorAll(".result-card").length'),0,'Changed public picks kept actionable stale cards');
 await generate();const engage=await mainIds();assert.notDeepEqual(frontline,engage,'Public enemy change did not affect the visible worker ordering');
 assert.ok((await fitIds()).every(ids=>ids==='Ashe,Hecarim,Fiddlesticks'));
 await js('document.querySelector(".result-card").scrollIntoView({behavior:"instant",block:"start"})');await capture('main-engage.png');
 await click('[data-action=result-detail]');assert.ok(await js('document.querySelector("#overlay-root [data-opponent-fit]")?.textContent.includes("敌方分路、出装和技能状态未确认")'));await click('[data-action=close]');
 // Hold a real worker before dispatch to prove refresh cancels an unfinished
 // recommendation rather than only clearing an already completed card list.
 await click('.result-card [data-action=build][data-role=mid]');
 await js('window.__originalWorker=window.Worker;window.__heldWorkers=[];window.__terminatedWorkers=0;window.Worker=class extends window.__originalWorker {postMessage(...args){this.heldMessage=args;window.__heldWorkers.push(this);}terminate(){window.__terminatedWorkers++;return super.terminate();}};true');
 await click('[data-action=recommend]');await until(()=>js('window.__heldWorkers.length===1'),'Pending source worker missing');
 await click('[data-action=refresh-build]');await until(()=>sourceRefreshes===1,'Source refresh did not reach isolated fixture');
 await until(()=>js('window.__terminatedWorkers===1'),'Source refresh did not cancel old worker');
 assert.equal(await js('document.querySelectorAll(".result-card").length'),0,'Source refresh kept old main cards');
 await js('window.Worker=window.__originalWorker;true');await click('[data-action=close]');await generate();
 fixture.session=draft(['Galio']);await sync();await generate();assert.ok((await mainIds()).includes('Galio'),'Mirror draft wrongly excluded public enemy');
 fixture.session.allowDuplicatePicks=false;await sync();
 assert.equal(await js('document.querySelectorAll(".result-card").length'),0,'Changing only mirror rules retained stale results');
 await generate();assert.ok(!(await mainIds()).includes('Galio'));assert.ok((await fitIds()).every(ids=>ids==='Galio'));
 await click('[data-action=companion-attach]');await until(()=>js('document.body.classList.contains("companion-mode")&&document.querySelectorAll(".companion-candidate [data-opponent-fit]").length>0'),'Sidebar fit missing');
 assert.ok(!(await sideIds()).includes('Galio'));assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);await capture('side-no-mirror.png');
 fixture.session.allowDuplicatePicks=true;await sync();await until(async()=>(await sideIds()).includes('Galio'),'Sidebar mirror change did not regenerate');
 fixture.session=draft([]);await sync();await until(()=>js('document.querySelectorAll(".companion-candidate").length>0&&document.querySelectorAll("[data-opponent-fit]").length===0'),'Removed public picks leaked an explanation');
 fixture={connected:false,phase:'Offline',message:'Isolated disconnect'};await sync();
 assert.equal(await js('document.querySelectorAll("[data-opponent-fit]").length'),0);
 fixture={connected:true,phase:'ChampSelect',receivedAt:new Date().toISOString(),game:{gameId:'3102',mapId:11},session:draft(['Sion'])};await sync();
 await until(()=>js('document.querySelectorAll("[data-opponent-fit]").length>0'),'New-game fit missing');assert.ok((await fitIds()).every(ids=>ids==='Sion'));
 await click('.companion-candidate [data-action=companion-preview][data-role=mid]');
 await until(()=>js('!!document.querySelector("[data-action=companion-refresh]")'),'Sidebar source controls missing');
 await click('[data-action=companion-refresh]');await until(()=>sourceRefreshes===2,'Sidebar source refresh missing');
 await click('[data-action=companion-tab][data-tab=recommend]');
 await until(()=>js('document.querySelectorAll(".companion-candidate").length>0'),'Sidebar did not regenerate after source refresh');
 assert.equal(runeWrites,0);
 const result={passed:true,source,headingGeometry,systemDpi:'UNPROVEN',archiveSha256:release.archiveSha256,frontline,engage,visibleWorkerOrderingChanged:true,mirrorEligibilityIndependent:true,mirrorOnlyChangeInvalidated:true,
  mainAndSidebarExplain:true,enemyHoverIgnored:true,removedEnemyCleared:true,reconnectNewGameCleared:true,sourceRefreshInvalidatedMain:true,sourceRefreshCancelledPendingWorker:true,sourceRefreshRegeneratedSidebar:true,sourceRefreshes,sidebarOverflow:false,runeWrites};
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'error.txt'),error.stack).catch(()=>{});for(const [i,w]of windows.entries())if(!w.isDestroyed())await fs.writeFile(path.join(root,'failure-'+i+'.png'),(await w.webContents.capturePage()).toPNG()).catch(()=>{});app.exit(1);});
