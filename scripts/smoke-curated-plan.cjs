const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),routes=process.env.RIFT_CURATED_ROUTES==='1',restart=process.env.RIFT_CURATED_RESTART==='1',windows=[];let writes=0,copied='';
globalShortcut.register=()=>false;global.fetch=async()=>{throw Error('Isolated smoke: network disabled');};https.request=()=>{throw Error('Isolated smoke: game sockets disabled');};
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>handle(name,name==='client-status'?()=>({connected:false,phase:'Offline'}):name==='apply-runes'?()=>{writes++;throw Error('Rune writes prohibited');}:name==='copy'?(_event,text)=>{copied=text;return true;}:name==='companion-mode'?(_event,value)=>{const w=windows[0];w.setMinimumSize(value?280:820,480);w.setContentSize(value?440:1180,850);return {docked:!!value,overlap:false};}:handler);
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(70);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar');
 for(const file of ['src/core/curated-plan.mjs','src/core/creative-plan.mjs','src/core/party-cooperation.mjs','src/core/builds.mjs','src/core/catalog-data.json','src/app.mjs','src/companion-view.mjs','src/build-options-view.mjs'])assert.ok((await fs.readFile(path.join(base,file))).equals(await fs.readFile(file)),'Packaged source drift: '+file);
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true),click=async selector=>{assert.ok(await js('!!document.querySelector('+JSON.stringify(selector)+')'),selector+' missing');await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(120);},state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'UI missing');await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card")'),'Results missing');
 await click('[data-action=companion-attach]');await until(()=>js('!!document.querySelector(".companion-candidate")'),'Sidebar missing');
 const geometry=[];for(const width of [280,360,440]){main.setContentSize(width,850);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const row=await js('(()=>{const c=document.querySelector(".companion-candidate"),buttons=[c.querySelector("[data-action=use-result]"),c.querySelector("[data-action=result-detail]"),...c.querySelectorAll("[data-action=companion-preview]")];return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,buttons:buttons.map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,visible:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};})};})()');
  assert.equal(row.overflow,false);assert.ok(row.buttons.every(b=>b.visible),'Sidebar first-screen actions clipped at '+width);geometry.push(row);
 }
 main.setContentSize(440,850);await fs.writeFile(path.join(root,restart?'restart-sidebar.png':'sidebar.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 if(!restart){
  if(routes){await click('.companion-candidate [data-action=result-detail]');await click('.plan-drawer [data-action=party-route]');await click('.plan-drawer [data-action=favorite-result]');await click('.plan-drawer [data-action=use-result]');}
  else await click('.companion-candidate [data-action=use-result]');
  await until(async()=>!!(await state()).draft.creativePlan,'Adoption missing');
 }
 await click('[data-action=companion-full]');await until(()=>js('!!document.querySelector(".result-card")'),'Main results missing');
 let plan=(await state()).draft.creativePlan;assert.equal(plan.archetype,routes?'shared':'curated');
 if(restart)assert.deepEqual(plan,JSON.parse(await fs.readFile(path.join(root,'accepted.json'),'utf8')));
 else await fs.writeFile(path.join(root,'accepted.json'),JSON.stringify(plan,null,2));
 if(routes){assert.equal(plan.shared.routes.length,2);assert.ok(!plan.shared.routes[0].id.startsWith('curated:'));assert.ok(plan.shared.routes[1].id.startsWith('curated:'));}
 else{assert.match(plan.ordered.find(m=>m.champion==='Rakan').job,/W|R/);assert.match(plan.steps.join(' '),/洛/);
  await js('(async()=>{const {TRIOS}=await import(new URL("./core/rules.mjs",location.href).href),c=TRIOS.find(t=>t.id==='+JSON.stringify(plan.curated.id)+');c.name="Changed catalog";c.steps=["Changed lead"];c.members.forEach(m=>m.job="Changed job");})()');
 }
 await click('[data-action=result-detail][data-index="0"]');await click('.plan-drawer [data-action=copy-result]');
 for(const m of plan.ordered)assert.ok(copied.includes(m.job));assert.doesNotMatch(copied,/Changed catalog|Changed lead|Changed job/);
 if(!routes&&!restart)await click('.plan-drawer [data-action=favorite-result]');
 await until(async()=>(await state()).favorites.some(f=>f.type==='team'),'Favorite missing');
 const favorite=(await state()).favorites.find(f=>f.type==='team');assert.deepEqual(favorite.creativePlan,plan);assert.equal(favorite.configurations.length,plan.members.length);
 for(const member of plan.members){
  await click('.plan-drawer [data-action=build][data-id="'+member.champion+'"][data-role="'+member.role+'"]');
  const body=await js('document.querySelector(".drawer-content").textContent');assert.ok(body.includes(plan.ordered.find(m=>m.champion===member.champion).job));assert.doesNotMatch(body,/Changed job/);
  await click('[data-action=open-guide]');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');
  await until(()=>guide.webContents.executeJavaScript('window.guide.bootstrap().then(b=>b.model?.selection.id==='+JSON.stringify(member.champion)+')',true),'Wrong guide member');
  const payload=await guide.webContents.executeJavaScript('window.guide.bootstrap()',true);assert.deepEqual(payload.model.combo.creativePlan,plan);assert.equal(payload.model.combo.ownJob,plan.ordered.find(m=>m.champion===member.champion).job);assert.equal(payload.model.runes.length,9);assert.deepEqual(payload.model.combo.steps,plan.steps);
  await click('[data-action=back-result]');
 }
 assert.equal(writes,0);assert.ok(windows.every(w=>!w.isVisible()));
 const proof={passed:true,archiveSha256:release.archiveSha256,routes,restart,planId:plan.id,memberGuides:plan.members.length,sameIdCatalogChange:!routes,sidebarGeometry:geometry,actualRuneWrites:0,realGame:'UNPROVEN'};
 await fs.writeFile(path.join(root,restart?'restart.json':'select.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'error.txt'),error.stack).catch(()=>{});for(const [i,w]of windows.entries())if(!w.isDestroyed())await fs.writeFile(path.join(root,'failure-'+i+'.png'),(await w.webContents.capturePage()).toPNG()).catch(()=>{});app.exit(1);});
