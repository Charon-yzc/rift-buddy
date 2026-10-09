const {app,globalShortcut,clipboard}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),restart=process.env.RIFT_BUDDY_CREATIVE_RESTART==='1',reordered=process.env.RIFT_BUDDY_CREATIVE_REORDERED==='1',windows=[],copied=[];let diagnosticMain,writes=0;
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.webContents.setBackgroundThrottling(false);});globalShortcut.register=()=>false;clipboard.writeText=text=>copied.push(text);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function until(read,name){for(let n=0;n<160;n++){if(await read())return;await delay(100);}throw Error(name);}
async function run(){
 app.setPath('userData',root);const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),hero=id=>data.champions.find(c=>c.id===id);
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;
 global.fetch=async()=>{throw Error('Isolated creative workflow: external network disabled');};
 let phase=restart?'ChampSelect':'Lobby',gameId=restart?'1510':'0',support='Rell';
 const output=options=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);if(options.method&&options.method!=='GET'){writes++;throw Error('No rune writes allowed in creative workflow');}
  if(options.path==='/lol-gameflow/v1/gameflow-phase')return phase;
  if(options.path==='/lol-gameflow/v1/session')return {gameData:{gameId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  if(options.path==='/lol-champ-select/v1/session')return {localPlayerCellId:1,myTeam:[{cellId:1,championId:hero('Annie').key,assignedPosition:'TOP'},{cellId:2,championId:hero('Ashe').key,assignedPosition:'BOTTOM'},{cellId:3,championId:hero(support).key,assignedPosition:'UTILITY'}],theirTeam:[],actions:[],bans:{myTeamBans:[],theirTeamBans:[]},timer:{adjustedTimeLeftInPhase:65000}};
  if(options.path==='/lol-perks/v1/pages')return [];throw Error('Unexpected fixture request '+options.path);
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.write=body=>{options.body=body;};req.end=()=>queueMicrotask(()=>{try{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(output(options))));res.emit('end');req.emit('close');}catch(error){req.emit('error',error);}});req.destroy=error=>{if(error)req.emit('error',error);};return req;};
 cp.spawn=file=>{assert.ok(file.endsWith('window-observer.exe'),'Native subprocess blocked');const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();observer.exitCode=null;return observer;};
 cp.execFile=(file,args,options,callback)=>{const done=typeof options==='function'?options:callback;queueMicrotask(()=>done?.(null,'',''));return new EventEmitter();};
 require(path.join(base,'electron/main.cjs'));let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Creative main missing');diagnosticMain=main;
 const js=code=>main.webContents.executeJavaScript(code,true),click=selector=>js('(()=>{const node=document.querySelector('+JSON.stringify(selector)+');if(!node)throw Error("Missing fixture control");node.click();})()');
 const capture=async(w,name)=>{await w.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,name),(await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 const sync=async()=>{await js('window.buddy.client(true)');await click('[data-action=sync]');await delay(350);};
 await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'Creative UI missing');
 if(reordered){
  if(restart){await click('[data-action=navigate][data-route=favorites]');await click('[data-action=open-favorite][data-index="0"]');}
  await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll("[data-action=result-detail]").length>0'),'Reordered plan missing');await click('[data-action=result-detail][data-index="0"]');
  if(!restart){await click('[data-action=favorite-result]');await until(()=>js('window.buddy.bootstrap().then(b=>b.state.favorites.some(f=>f.type==="team"))'),'Reordered plan could not be saved');}
  const favorite=(await js('window.buddy.bootstrap()')).state.favorites.find(f=>f.type==='team'),plan=favorite.creativePlan;
  assert.notDeepEqual(plan.members.map(m=>m.champion),plan.ordered.map(m=>m.champion));assert.equal(favorite.configurations.length,3);
  for(const member of plan.members){
   await click('[data-action=build][data-id="'+member.champion+'"][data-role="'+member.role+'"]');await until(()=>js('!!document.querySelector("#build-role")'),'Reordered member could not open');
   assert.equal(await js('document.querySelector("#build-role").value'),member.role);
   for(const job of plan.ordered)assert.ok((await js('document.querySelector(".combo-config").textContent')).includes(job.job));
   await click('[data-action=close]');await click('[data-action=result-detail][data-index="0"]');
  }
  await capture(main,restart?'reordered-reopened.png':'reordered-saved.png');assert.equal(writes,0);
  const report={passed:true,archiveSha256:release.archiveSha256,actionOrder:plan.ordered.map(m=>m.champion),memberOrder:plan.members.map(m=>m.champion),savedMembers:favorite.configurations.length,restart,realRuneWrites:0,realGame:'UNPROVEN'};
  await fs.writeFile(path.join(root,restart?'reordered-restart.json':'reordered-workflow.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.quit();return;
 }
 let original;
 if(!restart){
  await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll("[data-action=result-detail]").length>0'),'Creative recommendation missing');await click('[data-action=result-detail][data-index="0"]');
  assert.match(await js('document.querySelector(".plan-drawer h2").textContent'),/创意/);
  await click('[data-action=copy-result]');await until(()=>copied.length>0,'Original copy missing');assert.match(copied[0],/顺序：/);assert.match(copied[0],/保存资料/);
  await click('[data-action=favorite-result]');await until(()=>js('window.buddy.bootstrap().then(b=>b.state.favorites.some(f=>f.type==="team"&&f.creativePlan))'),'Creative favorite missing');
  const saved=(await js('window.buddy.bootstrap()')).state.favorites.find(f=>f.type==='team');original=saved.creativePlan;assert.equal(saved.configurations.length,3);assert.ok(saved.configurations.every(s=>s.creativePlan.id===original.id));
  await click('[data-action=use-result]');await until(()=>js('document.querySelectorAll("[data-action=result-detail]").length>0'),'Accepted creative result was not refreshed');await click('[data-action=result-detail][data-index="0"]');assert.ok(await js('document.querySelector(".plan-drawer").textContent.includes('+JSON.stringify(original.window)+')'));
  await click('[data-action=close]');await click('[data-action=navigate][data-route=favorites]');assert.match(await js('document.querySelector(".favorite-card").textContent'),/原保存的创意分工/);await click('[data-action=open-favorite][data-index="0"]');
  await until(()=>js('window.buddy.bootstrap().then(b=>!!b.state.draft.creativePlan)'),'Loaded draft dropped its creative plan');
  await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll("[data-action=result-detail]").length>0'),'Locked creative recommendation missing');await click('[data-action=result-detail][data-index="0"]');
  const detail=await js('document.querySelector(".plan-drawer").textContent');for(const m of original.ordered)assert.ok(detail.includes(m.job));assert.ok(detail.includes(original.window));assert.ok(detail.includes(original.rulesVersion));
  await capture(main,'creative-original-detail.png');
  await click('[data-action=build][data-id=Annie][data-role=mid]');assert.equal(await js('document.querySelector("#build-role").value'),'mid');assert.ok(await js('document.querySelector(".combo-config").textContent.includes('+JSON.stringify(original.window)+')'));
  await click('[data-action=favorite-build]');await until(()=>js('window.buddy.bootstrap().then(b=>b.state.favorites.some(f=>f.type==="build"&&f.creativePlan))'),'Creative member favorite dropped context');
  await click('[data-action=build-partner][data-role=bottom]');assert.equal(await js('document.querySelector("#build-role").value'),'bottom');assert.ok(await js('document.querySelector(".combo-config").textContent.includes('+JSON.stringify(original.ordered.find(m=>m.champion==='Ashe').job)+')'));
  await click('[data-action=close]');phase='ChampSelect';gameId='1510';await sync();await sync();
 }else{
  original=JSON.parse(await fs.readFile(path.join(root,'creative-plan-original.json'),'utf8'));await sync();await sync();
  const saved=await js('window.buddy.bootstrap()');assert.deepEqual(saved.state.draft.creativePlan,original);assert.deepEqual(saved.state.favorites.find(f=>f.type==='team').creativePlan,original);
  await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll("[data-action=result-detail]").length>0'),'Restart creative recommendation missing');await click('[data-action=result-detail][data-index="0"]');
  const detail=await js('document.querySelector(".plan-drawer").textContent');for(const step of original.steps)assert.ok(detail.includes(step));assert.ok(detail.includes(original.window));await capture(main,'creative-reopened-detail.png');await click('[data-action=close]');
 }
 await click('[data-action=guide-current]');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Creative guide missing');
 const guideJs=code=>guide.webContents.executeJavaScript(code,true);await until(()=>guideJs('window.guide.bootstrap().then(b=>b.model?.combo?.origin==="creative")'),'Creative context did not reach guide');
 const payload=await guideJs('window.guide.bootstrap()'),model=payload.model;assert.equal(model.comboConfirmed,true);assert.deepEqual(model.combo.creativePlan,original);assert.deepEqual(model.combo.steps,original.steps);assert.equal(model.combo.window,original.window);assert.equal(model.runes.length,9);assert.equal(model.selection.role,'mid');assert.equal(payload.current.formalRole,'top');
 await guideJs('document.querySelector("[data-tab=team]").click()');await until(()=>guideJs('!!document.querySelector(".team-steps")'),'Creative guide steps were not rendered');
 const guideText=await guideJs('document.querySelector(".expanded main").textContent');for(const step of original.steps)assert.ok(guideText.includes(step));assert.ok(guideText.includes(original.window));assert.ok(guideText.includes(original.ordered.find(m=>m.champion==='Annie').job));assert.ok(guideText.includes(original.dataVersion));
 await guideJs('document.querySelector(".team-steps").scrollIntoView({block:"center"})');
 await capture(guide,restart?'creative-reopened-guide.png':'creative-original-guide.png');
 await js('[...document.images].forEach(i=>i.loading="eager")');await js('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await js('document.querySelector("#toast").className=""');
 await fs.writeFile(path.join(root,restart?'creative-reopened.png':'creative-loaded.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 if(restart){
  support='Nami';await sync();await sync();const changed=await js('window.buddy.bootstrap()');assert.equal(changed.state.draft.creativePlan,undefined);assert.deepEqual(changed.state.favorites.find(f=>f.type==='team').creativePlan,original);
  assert.match(await js('document.querySelector("[data-creative-plan-notice]").textContent'),/原分工不再适用/);
  await until(()=>guideJs('window.guide.bootstrap().then(b=>b.model?.combo?.id!=='+JSON.stringify(original.id)+')'),'Changed member retained the original confirmed guide');
 }
 assert.equal(writes,0);assert.ok(windows.every(w=>!w.isVisible()));await fs.writeFile(path.join(root,'creative-plan-original.json'),JSON.stringify(original,null,2));
 const report={passed:true,archiveSha256:release.archiveSha256,planId:original.id,originalOrderAndWindowPreserved:true,memberConfigurationsPreserved:true,guideContextPreserved:true,manualRolePreservedAgainstFormalRole:true,wholeProcessRestart:restart,changedMemberInvalidated:restart,realRuneWrites:0,fixtureWrites:writes,realGame:'UNPROVEN'};
 await fs.writeFile(path.join(root,restart?'creative-plan-restart.json':'creative-plan-workflow.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,restart?'creative-plan-restart-error.txt':'creative-plan-workflow-error.txt'),error.stack).catch(()=>{});if(diagnosticMain&&!diagnosticMain.isDestroyed()){const state=await diagnosticMain.webContents.executeJavaScript('window.buddy.bootstrap()').catch(()=>null);await fs.writeFile(path.join(root,'creative-plan-failure.json'),JSON.stringify(state,null,2)).catch(()=>{});}app.exit(1);});
