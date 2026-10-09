const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),restart=process.env.RIFT_BUDDY_COOP_RESTART==='1',windows=[];let copies=[],runeWrites=0;
globalShortcut.register=()=>false;global.fetch=async()=>{throw Error('Isolated cooperation smoke: network disabled');};https.request=()=>{throw Error('Isolated cooperation smoke: game sockets disabled');};
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>handle(name,name==='client-status'?()=>({connected:false,phase:'Offline',message:'Isolated fixture'}):name==='apply-runes'?()=>{runeWrites++;throw Error('Rune writes prohibited');}:name==='copy'?(_event,text)=>{copies.push(text);return true;}:name==='companion-mode'?(_event,value)=>{const w=windows[0];w.setMinimumSize(value?280:820,480);w.setContentSize(value?440:1180,850);return {docked:!!value,overlap:false};}:handler);
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(70);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar');
 for(const file of ['src/core/cooperation.mjs','src/core/creative-plan.mjs','src/core/recommend.mjs','src/core/builds.mjs','src/cooperation-view.mjs','src/guide-view.mjs','src/companion-view.mjs','src/app.mjs'])assert.ok((await fs.readFile(path.join(base,file))).equals(await fs.readFile(file)),'Packaged source drift: '+file);
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true),click=async selector=>{await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(120);};
 const state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 const generate=async()=>{await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card")'),'Worker result missing');};
 const capture=async name=>{await js('[...document.images].forEach(i=>i.loading="eager")');await js('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,name),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'UI missing');await generate();
 assert.ok(await js('document.querySelector(".result-card").textContent.includes("机制搭配")'));
 const initial=await state();assert.equal(initial.draft.slots.find(s=>s.role==='top').champion,'Trundle');assert.equal(initial.draft.slots.find(s=>s.role==='top').manualPosition,true);
 await click('[data-action=result-detail][data-index="0"]');const detail=await js('document.querySelector(".plan-drawer").textContent');
 for(const text of ['成立条件','失败处理','四层','对应状态','未经组合对局验证'])assert.ok(detail.includes(text),'Missing '+text);
 assert.ok(await js('document.querySelector(".cooperation-plan [data-action=link]").dataset.url.startsWith("https://ddragon.leagueoflegends.com/")'));
 await capture(restart?'cooperation-restart-detail.png':'cooperation-detail.png');await click('[data-action=copy-result][data-index="0"]');assert.ok(copies.at(-1).includes('成立条件')&&copies.at(-1).includes('失败处理'));
 if(!restart){await click('.plan-drawer [data-action=favorite-result][data-index="0"]');await until(async()=>(await state()).favorites.some(f=>f.type==='team'),'Favorite missing');await click('[data-action=use-result][data-index="0"]');await until(()=>js('!!document.querySelector(".result-card")'),'Accepted plan missing');}
 else await click('[data-action=close]');
 const accepted=await state();for(const [role,id]of [['top','Trundle'],['jungle','Sejuani'],['mid','Seraphine']])assert.ok(accepted.draft.slots.some(s=>s.role===role&&s.champion===id&&s.locked));
 assert.ok(accepted.draft.slots.find(s=>s.role==='top').manualPosition);assert.equal(accepted.draft.slots.find(s=>s.role==='top').clientCellId,2);
 const plan=accepted.draft.creativePlan;assert.equal(plan.archetype,'cooperation');const favorite=accepted.favorites.find(f=>f.type==='team');assert.deepEqual(favorite.creativePlan,plan);assert.equal(favorite.configurations.length,3);assert.ok(favorite.configurations.every(c=>c.creativePlan.id===plan.id));
 await click('[data-action=result-detail][data-index="0"]');
 for(const member of plan.members){
  await click('[data-action=build][data-id="'+member.champion+'"][data-role="'+member.role+'"]');
  const configuration=await js('document.querySelector(".combo-config").textContent');assert.ok(configuration.includes(plan.window));assert.ok(configuration.includes('机制搭配说明'));
  assert.ok(await js('[...document.querySelectorAll("[data-action=build-partner]")].every(b=>b.textContent.length<40)'),'Partner controls must use champion names');
  await click('[data-action=open-guide]');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');
  const guideJs=code=>guide.webContents.executeJavaScript(code,true);await until(()=>guideJs('window.guide.bootstrap().then(b=>b.model?.selection.id==='+JSON.stringify(member.champion)+'&&b.model?.combo?.id==='+JSON.stringify(plan.id)+')'),'Member cooperation did not reach guide');
  const payload=await guideJs('window.guide.bootstrap()');assert.deepEqual(payload.model.combo.creativePlan,plan);assert.deepEqual(payload.model.combo.steps,plan.steps);assert.equal(payload.model.runes.length,9);assert.equal(payload.model.combo.window,plan.window);assert.equal(payload.model.combo.risk,plan.caution);
  await guideJs('document.querySelector("[data-tab=team]").click()');await until(()=>guideJs('!!document.querySelector(".team-steps")'),'Guide plan not rendered');
  const text=await guideJs('document.querySelector(".expanded main").textContent');for(const step of plan.steps)assert.ok(text.includes(step));assert.ok(text.includes(plan.window)&&text.includes(plan.caution)&&text.includes('成立条件')&&text.includes('失败处理'));
  await guideJs('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await delay(250);
  assert.ok(await guideJs('document.querySelector(".team-steps").getBoundingClientRect().height>0'),'Guide plan is not visible');
  await fs.writeFile(path.join(root,(restart?'restart-':'')+'guide-'+member.champion+'.png'),(await guide.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await click('[data-action=back-result]');
 }
 await click('[data-action=close]');
 await click('[data-action=companion-attach]');await until(()=>js('document.body.classList.contains("companion-mode")&&!!document.querySelector(".companion-candidate")'),'Sidebar missing');
 const side=await js('document.querySelector(".companion-candidate").textContent');assert.ok(side.includes('成立条件')&&side.includes('四层')&&side.includes('未经组合对局验证'));
 for(const width of [440,360,280]){main.setContentSize(width,850);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false,'Sidebar overflow '+width);}
 main.setContentSize(440,850);await capture(restart?'cooperation-restart-sidebar.png':'cooperation-sidebar.png');assert.equal(runeWrites,0);assert.ok(windows.every(w=>!w.isVisible()));
 const report={passed:true,archiveSha256:release.archiveSha256,lockedFriendPreserved:true,workerMechanismSeeds:true,explicitAcceptance:true,copyConditions:true,favorite:true,savedPlanId:plan.id,memberGuides:plan.members.map(m=>m.champion),originalConditionsAndSources:true,restart,sidebarWidths:[280,360,440],actualRuneWrites:0,realGame:'UNPROVEN'};
 await fs.writeFile(path.join(root,restart?'restart.json':'select.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'error.txt'),error.stack).catch(()=>{});for(const [i,w]of windows.entries())if(!w.isDestroyed())await fs.writeFile(path.join(root,'failure-'+i+'.png'),(await w.webContents.capturePage()).toPNG()).catch(()=>{});app.exit(1);});
