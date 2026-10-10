const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),https=require('node:https'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),phase=process.env.RIFT_BUDDY_PAIR_PHASE,windows=[],requests=[];
globalShortcut.register=()=>false;https.request=()=>{throw Error('Isolated pair smoke: client network disabled');};
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>handle(name,name==='client-status'?()=>({connected:false,phase:'Offline',message:'隔离推荐验收'}):name==='apply-runes'?()=>{throw Error('Pair smoke must never write runes');}:handler);
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);const child=new EventEmitter();child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};child.exitCode=null;child.stdin={end(){child.exitCode=0;child.emit('exit',0);}};child.kill=()=>child.stdin.end();return child;};
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(check,label){for(let n=0;n<220;n++){const value=await check();if(value)return value;await delay(70);}throw Error(label);}
async function run(){
 const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;
 let held=false,resume=null,invalid=false;
 global.fetch=async value=>{
  assert.equal(phase,'refresh','Restart must be offline');const url=new URL(value),match=url.pathname.match(/^\/api\/(global|kr)\/champions\/ranked\/(\d+)\/(jungle|mid)\/synergies$/);assert.equal(url.hostname,'lol-api-champion.op.gg');assert.ok(match,'Unexpected public request '+url.pathname);assert.equal(url.searchParams.get('version'),data.patch);
  requests.push({region:match[1],champion:Number(match[2]),role:match[3],tier:url.searchParams.get('tier')});
  if(held){held=false;await new Promise(r=>resume=r);}
  const ally=match[3]==='jungle'?'Vex':'Graves',position=match[3]==='jungle'?'JUNGLE':'MID';
  return new Response(JSON.stringify({meta:{version:invalid&&match[3]==='mid'?'16.19':data.patch},data:[{champion_id:Number(match[2]),position,synergy_champion_id:data.champions.find(c=>c.id===ally).key,synergy_position:position==='MID'?'JUNGLE':'MID',play:1000,win:match[1]==='kr'?650:550,win_rate:match[1]==='kr'?.65:.55}]}));
 };
 require(path.join(base,'electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=c=>main.webContents.executeJavaScript(c,true);
 await until(()=>js('!!document.querySelector("[data-pair-refresh]")'),'Pair controls missing');
 const click=async selector=>{assert.ok(await js('!!document.querySelector('+JSON.stringify(selector)+')'),selector);await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(90);};
 const change=async(selector,value)=>{await js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');el.value='+JSON.stringify(value)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(100);};
 const boot=()=>js('window.buddy.bootstrap()'),state=async()=>(await boot()).state;
 const cacheFile=path.join(root,'data/pair-statistics-cache.json');
 const openPairs=async()=>{await js('document.querySelector("[data-pair-refresh]").open=true');await delay(90);};
 if(phase==='refresh'){
  await openPairs();held=true;await click('[data-action=refresh-pairs]');await until(()=>resume,'First request not held');
  await change('[data-pair-refresh] [data-build-source-field=region]','kr');assert.equal(await js('document.querySelector("[data-action=refresh-pairs]").disabled'),false);
  await click('[data-action=refresh-pairs]');resume();await until(()=>js('document.querySelector("#toast").textContent.includes("已刷新所选成员")'),'Selected source did not finish');
  assert.equal(requests.length,4);assert.equal(requests.filter(r=>r.region==='kr').length,2);assert.ok(await js('document.querySelector("[data-pair-refresh]").open'));
  await until(()=>js('document.querySelector(".pair-statistics")?.textContent.includes("65.0%")'),'New pair evidence missing');assert.ok(await js('document.querySelector(".pair-statistics").textContent.includes("韩国")'));
  const before=await fs.readFile(cacheFile),beforeData=(await boot()).data.pairStatistics;
  invalid=true;await js('document.querySelector("#toast").textContent=""');await click('[data-action=refresh-pairs]');await until(()=>js('document.querySelector("#toast").textContent.includes("原同队参考保留")'),'Partial failure not explained');assert.deepEqual(await fs.readFile(cacheFile),before);assert.deepEqual((await boot()).data.pairStatistics,beforeData);assert.ok(await js('!!document.querySelector(".result-card")'));
  invalid=false;held=true;resume=null;await click('[data-action=refresh-pairs]');await until(()=>resume,'Changed-member request not held');await click('[data-action=reset-draft]');resume();await until(()=>requests.length===8,'Changed-member request unfinished');await delay(1000);assert.equal(await js('document.querySelectorAll(".result-card").length'),0);
  const current=await state(),original=JSON.parse(await fs.readFile(path.join(root,'initial-state.json')));current.draft=original.draft;await js('window.buddy.saveState('+JSON.stringify(current)+')');
  await new Promise(r=>{main.webContents.once('did-finish-load',r);main.webContents.reload();});await until(()=>js('!!document.querySelector("[data-pair-refresh]")'),'Reload missing');
  await openPairs();await fs.writeFile(path.join(root,'pair-refresh-main.png'),(await main.webContents.capturePage()).toPNG());
  main.webContents.send('window-layout',{docked:true,overlap:false});await until(()=>js('!!document.querySelector(".companion-shell")'),'Sidebar missing');
  for(const width of [280,360,440]){main.setMinimumSize(240,500);main.setBounds({x:20,y:30,width,height:850});await delay(100);await openPairs();const box=await js('(()=>{const el=document.querySelector("[data-pair-refresh]");return {width:el.clientWidth,scroll:el.scrollWidth,button:!!el.querySelector("[data-action=refresh-pairs]")};})()');assert.ok(box.scroll<=box.width+1);assert.ok(box.button);await fs.writeFile(path.join(root,'pair-refresh-sidebar-'+width+'.png'),(await main.webContents.capturePage()).toPNG());}
  main.webContents.send('window-layout',{docked:false});await until(()=>js('!!document.querySelector("[data-action=navigate]")'),'Full view missing');main.setMinimumSize(1050,720);main.setBounds({x:20,y:20,width:1300,height:900});
  await click('[data-action=navigate][data-route=builds]');
  for(const [id,role]of [['Swain','top'],['Malphite','mid'],['Aatrox','jungle']]){await click('[data-action=library-role][data-role='+role+']');await js('(()=>{const el=document.querySelector("#library-search");el.value='+JSON.stringify(id)+';el.dispatchEvent(new Event("input",{bubbles:true}));})()');assert.ok(await js('!!document.querySelector(".hero-tile[data-id='+id+']")'),id+' source role hidden');}
  main.webContents.send('open-build',{id:'Ashe',role:'bottom',mode:'rift'});await until(()=>js('!!document.querySelector("[data-action=build-quest-plan]")'),'Ashe build missing');await click('[data-action=open-guide]');await until(async()=>(await state()).guide?.selection.id==='Ashe','Guide missing');
  await click('[data-action=build-quest-plan]');await until(async()=>(await state()).guide.selection.bottomQuestPlan===true,'Quest-only enable not synced');
  await click('[data-action=build-quest-plan]');await until(async()=>!(await state()).guide.selection.bottomQuestPlan,'Quest-only disable not synced');assert.equal(await js('document.querySelector("[data-action=build-quest-plan]").getAttribute("aria-pressed")'),'false');
  await click('[data-action=build-quest-plan]');await until(async()=>(await state()).guide.selection.bottomQuestPlan===true,'Quest reenable not synced');await click('[data-action=favorite-build]');await until(async()=>(await state()).favorites.some(f=>f.type==='build'&&f.bottomQuestPlan),'Quest favorite missing');
  await until(()=>windows.find(w=>w.webContents.getURL().includes('/src/guide.html')),'Guide window missing');
  // A validated guide-side selection omits false; receive it through the actual event.
  const disabled={...(await state()).guide.selection};delete disabled.bottomQuestPlan;await js('window.buddy.updateGuide('+JSON.stringify({...disabled,changedFields:['bottomQuestPlan']})+')');
  await until(()=>js('document.querySelector("[data-action=build-quest-plan]").getAttribute("aria-pressed")==="false"'),'Guide disable left stale drawer state');
  await fs.writeFile(path.join(root,'pair-refresh-prepare.json'),JSON.stringify({requests,archiveSha256:release.archiveSha256}));
 }else{
  const cached=(await boot()).data.pairStatistics;assert.ok(cached.snapshots.some(s=>s.region==='kr'&&s.entries.length===2));assert.ok(cached.snapshots.some(s=>s.region==='global'));await openPairs();assert.match(await js('document.querySelector("[data-pair-refresh-status]").textContent'),/16.20/);
  await click('[data-action=navigate][data-route=favorites]');await click('[data-action=open-favorite]');await until(()=>js('document.querySelector("[data-action=build-quest-plan]")?.getAttribute("aria-pressed")==="true"'),'Quest favorite restore missing');assert.equal(requests.length,0);
  const result={passed:true,archiveSha256:release.archiveSha256,realRefreshIPC:true,selectedMembersOnly:true,sourceChangeIgnoresOldResponse:true,memberChangeIgnoresOldResponse:true,partialFailureKeepsMemoryAndDisk:true,offlineRestart:true,sidebarWidths:[280,360,440],sourcePositionLibrary:true,questOnlyEnableDisableAndGuideReturn:true,questFavoriteRestored:true,actualRuneWrites:0,testWindowsHidden:true,realGame:'UNPROVEN'};await fs.writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
 assert.ok(windows.every(w=>!w.isVisible()));app.quit();
}
run().catch(error=>{console.error(error);app.exit(1);});
