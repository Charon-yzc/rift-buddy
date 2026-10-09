const {app,ipcMain,globalShortcut,clipboard}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),restart=false,windows=[];let diagnosticMain,writes=0;
app.on('browser-window-created',(_e,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.webContents.setBackgroundThrottling(false);});globalShortcut.register=()=>false;clipboard.writeText=()=>{};
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>handle(name,name==='companion-mode'?(_e,value)=>{const main=windows[0];main.setMinimumSize(value?280:820,480);main.setContentSize(value?440:1180,value?850:850);return {docked:!!value,overlap:false};}:handler);
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(check,label){for(let n=0;n<160;n++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),hero=id=>data.champions.find(c=>c.id===id);
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;global.fetch=async()=>{throw Error('Isolated matchup smoke: external network disabled');};
 const sourceFiles=[];async function walk(directory){for(const entry of await fs.readdir(path.resolve(directory),{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())await walk(file);else if(/\.(mjs|cjs|css|html|json)$/.test(file))sourceFiles.push(file);}}
 for(const directory of ['electron','services','src'])await walk(directory);
 const helperFiles=[];for(const file of sourceFiles){assert.ok((await fs.readFile(path.resolve(file))).equals(await fs.readFile(path.join(base,file))),`Packaged source differs: ${file}`);if(file.startsWith('services'+path.sep)||file.startsWith(path.join('src','core')+path.sep)||file==='electron'+path.sep+'client-helper-entry.mjs'){assert.ok((await fs.readFile(path.resolve(file))).equals(await fs.readFile(path.join(release.directory,'resources/connection',file))),`Helper source differs: ${file}`);helperFiles.push(file);}}
 const packageSource={passed:true,archiveSha256:release.archiveSha256,sourceFiles,helperFiles};await fs.writeFile(path.join(root,'package-source.json'),JSON.stringify(packageSource,null,2));
 let picked='Volibear',assigned='TOP',enemy='Fiora',gameId='1540';
 const output=options=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);if(options.method&&options.method!=='GET'){writes++;throw Error('Rune writes prohibited in matchup selection smoke');}
  if(options.path==='/lol-gameflow/v1/gameflow-phase')return 'ChampSelect';
  if(options.path==='/lol-gameflow/v1/session')return {gameData:{gameId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  if(options.path==='/lol-champ-select/v1/session')return {localPlayerCellId:1,myTeam:[{cellId:1,championId:hero(picked).key,assignedPosition:assigned}],theirTeam:[...(enemy?[{cellId:6,championId:hero(enemy).key}]:[]),{cellId:7,championId:0,championPickIntent:hero('Janna').key}],actions:[],bans:{myTeamBans:[],theirTeamBans:[]},timer:{adjustedTimeLeftInPhase:65000}};
  if(options.path==='/lol-perks/v1/pages')return [];throw Error('Unexpected fixture request '+options.path);
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.write=body=>{options.body=body;};req.end=()=>queueMicrotask(()=>{try{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(output(options))));res.emit('end');req.emit('close');}catch(error){req.emit('error',error);}});req.destroy=error=>{if(error)req.emit('error',error);};return req;};
 cp.spawn=file=>{assert.ok(file.endsWith('window-observer.exe'));const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};cp.execFile=(file,args,options,callback)=>{queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
 require(path.join(base,'electron/main.cjs'));let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');diagnosticMain=main;
 const js=code=>main.webContents.executeJavaScript(code,true),click=selector=>js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el)throw Error("Control missing");el.click();})()'),change=(selector,value)=>js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');el.value='+JSON.stringify(value)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');
 const sync=async()=>{await js('window.buddy.client(true)');await click('[data-action=sync]');await delay(250);},state=async()=>(await js('window.buddy.bootstrap()')).state;
 const capture=async name=>{await js('document.querySelector("#toast").classList.remove("show")');await js('[...document.images].forEach(i=>i.loading="eager")');await js('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,name),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 await until(()=>js('!!document.querySelector("[data-action=sync]")'),'UI missing');await sync();await sync();await click('[data-action=my-build]');
 const phase=process.env.RIFT_GEAR_SMOKE_PHASE;
 const own=async()=>(await state()).preparations.find(p=>p.id==='Volibear'&&p.role==='top'&&!p.comboId);
 if(phase==='select'){
  await js('document.querySelectorAll("#overlay-root .gear-choices").forEach(d=>d.open=true);void 0');
  await click('[data-action=build-start][data-id=start-1054-2003]');await click('[data-action=build-boots][data-id=boots-3158]');
  await click('[data-action=build-condition][data-condition=control]');
  await until(async()=>{const s=await own();return s?.startId==='start-1054-2003'&&s.bootsId==='boots-3158';},'Drawer choices not saved');
  assert.match(await js('document.querySelector("#overlay-root").textContent'),/保留自选鞋子/);
  await click('[data-action=favorite-build]');
  await js('document.querySelector("#overlay-root .gear-choices").open=true;document.querySelector("#overlay-root .gear-choices").scrollIntoView({block:"start"});void 0');await capture('volibear-gear-drawer.png');
 }else{
  assert.equal((await own()).startId,'start-1054-2003');assert.equal((await own()).bootsId,'boots-3158');
  const restored=await js('({start:document.querySelector("[data-action=build-start][data-id=start-1054-2003]")?.getAttribute("aria-pressed"),boots:document.querySelector("[data-action=build-boots][data-id=boots-3158]")?.getAttribute("aria-pressed")})');
  assert.equal(restored.start,'true');assert.equal(restored.boots,'true');
 }
 await click('[data-action=close]');await click('[data-action=companion-attach]');await until(()=>js('document.body.classList.contains("companion-mode")'),'Sidebar missing');await click('[data-action=companion-tab][data-tab=plan]');
 const sidebar=await js('({start:document.querySelector("[data-action=companion-start][data-id=start-1054-2003]")?.getAttribute("aria-pressed"),boots:document.querySelector("[data-action=companion-boots][data-id=boots-3158]")?.getAttribute("aria-pressed")})');assert.equal(sidebar.start,'true');assert.equal(sidebar.boots,'true');
 await delay(300);const geometry=[];
 for(const size of [{width:360,height:600},{width:280,height:480},{width:440,height:850}]){
  main.setMinimumSize(280,480);main.setContentSize(size.width,size.height);await until(()=>js(`Math.abs(innerWidth-${size.width})<=1`),'Sidebar did not reach the requested width');
  await js('document.querySelectorAll(".companion-shell .gear-choices").forEach(d=>d.open=true);document.querySelector("[data-companion-section=items]").scrollIntoView({block:"start"});void 0');await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const current=await js('({width:innerWidth,scroll:document.documentElement.scrollWidth,tooWide:[...document.querySelectorAll(".gear-choices button")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).length})');assert.ok(current.scroll<=current.width+1);assert.equal(current.tooWide,0);
  current.controls=[];
  for(const kind of ['start','boots']){
   await js(`document.querySelector('[data-action=companion-${kind}][aria-pressed=true]').scrollIntoView({block:'center'});void 0`);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   const visible=await js(`(()=>{const el=document.querySelector('[data-action=companion-${kind}][aria-pressed=true]'),other=document.querySelector('[data-action=companion-${kind}][aria-pressed=false]'),target=el.getBoundingClientRect(),nav=document.querySelector('.companion-plan-nav').getBoundingClientRect(),footer=document.querySelector('.companion-footer').getBoundingClientRect();return {kind:'${kind}',top:target.top,bottom:target.bottom,navBottom:nav.bottom,footerTop:footer.top,height:target.height,selectedLabel:el.textContent.includes('已选'),selectedStyle:getComputedStyle(el).backgroundColor!==getComputedStyle(other).backgroundColor};})()`);
   assert.ok(visible.height>0&&visible.top>=visible.navBottom-1&&visible.bottom<=visible.footerTop+1,JSON.stringify(visible));assert.ok(visible.selectedLabel&&visible.selectedStyle,'Selected gear must be recognizable');current.controls.push(visible);await capture('volibear-gear-sidebar-'+phase+'-'+size.width+'-'+kind+'.png');
  }
  geometry.push(current);
 }
 await click('[data-action=guide-current]');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');
 const gjs=code=>guide.webContents.executeJavaScript(code,true);await until(()=>gjs('window.guide.bootstrap().then(b=>b.model?.selection.startId==="start-1054-2003"&&b.model.selection.bootsId==="boots-3158")'),'Guide did not receive selected starter and footwear');
 const guideModel=await gjs('window.guide.bootstrap().then(b=>({start:b.model.start.map(i=>i.id),route:b.model.route.map(i=>i.id)}))');assert.deepEqual(guideModel.start,['1054','2003']);assert.equal(guideModel.route.filter(id=>id==='3158').length,1);assert.ok(!guideModel.route.includes('3111'));
 const favorite=(await state()).favorites.find(f=>f.type==='build'&&f.champion==='Volibear');assert.equal(favorite.startId,'start-1054-2003');assert.equal(favorite.bootsId,'boots-3158');
 if(phase==='select'){
  await click('[data-action=companion-boots][data-id=""]');await until(async()=>!(await own()).bootsId,'Default footwear did not clear manual choice');
  await until(()=>gjs('window.guide.bootstrap().then(b=>b.model.route.some(i=>i.id==="3111")&&!b.model.route.some(i=>i.id==="3158"))'),'Restoring defaults did not update conditional footwear');
  await click('[data-action=companion-boots][data-id=boots-3158]');
  await until(async()=>(await own()).bootsId==='boots-3158','Restored manual footwear did not save');
  picked='Chogath';assigned='JUNGLE';await sync();await change('#solo-role','jungle');await sync();
  await until(()=>js('!!document.querySelector("[data-action=companion-start][data-id=start-1103-2003]")'),'Jungle pet choices missing');
  await click('[data-action=companion-start][data-id=start-1103-2003]');
  assert.ok((await state()).preparations.some(p=>p.id==='Chogath'&&p.role==='jungle'&&p.startId==='start-1103-2003'));
  picked='Volibear';assigned='TOP';await sync();await change('#solo-role','top');await sync();
 }
 assert.equal(writes,0);assert.ok(windows.every(w=>!w.isVisible()));
 const report={passed:true,phase,archiveSha256:release.archiveSha256,drawerAndSidebarChoices:true,guideStarterAndFootwear:true,savedFavorite:true,wholeProcessRestart:phase==='restart',junglePetSelection:phase==='select',geometry,actualRuneWrites:0,realGame:'UNPROVEN'};await fs.writeFile(path.join(root,'gear-workflow-'+phase+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.quit();
}
run().catch(async error=>{console.error(error);if(diagnosticMain&&!diagnosticMain.isDestroyed())await fs.writeFile(path.join(root,'failure-state.json'),JSON.stringify(await diagnosticMain.webContents.executeJavaScript('window.buddy.bootstrap()').catch(()=>null),null,2));app.exit(1);});
