const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),customRunes=process.env.RIFT_CURATED_CUSTOM_RUNES==='1',duoStages=process.env.RIFT_CURATED_DUO_STAGES==='1',readiness=process.env.RIFT_CURATED_READINESS==='1',routes=process.env.RIFT_CURATED_ROUTES==='1',tactics=Number(process.env.RIFT_CURATED_TACTICS)||0,independent=Number(process.env.RIFT_CURATED_INDEPENDENT)||0,restart=process.env.RIFT_CURATED_RESTART==='1',windows=[];let writes=0,copied='',pairCache,refreshedMembers=[];
globalShortcut.register=()=>false;global.fetch=async()=>{throw Error('Isolated smoke: network disabled');};https.request=()=>{throw Error('Isolated smoke: game sockets disabled');};
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>handle(name,name==='client-status'?()=>({connected:false,phase:'Offline'}):name==='apply-runes'?()=>{writes++;throw Error('Rune writes prohibited');}:name==='refresh-pairs'&&tactics?(_event,members)=>{assert.equal(members.length,tactics);refreshedMembers=members;return pairCache;}:name==='copy'?(_event,text)=>{copied=text;return true;}:name==='companion-mode'?(_event,value)=>{const w=windows[0];w.setMinimumSize(value?280:820,480);w.setContentSize(value?440:1180,850);return {docked:!!value,overlap:false};}:handler);
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(70);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar');
 for(const file of ['src/core/curated-plan.mjs','src/core/creative-plan.mjs','src/core/party-cooperation.mjs','src/core/builds.mjs','src/core/catalog-data.json','src/core/champion-windows.mjs','src/core/role-plays-extra.mjs','src/app.mjs','src/companion-view.mjs','src/build-options-view.mjs'])assert.ok((await fs.readFile(path.join(base,file))).equals(await fs.readFile(file)),'Packaged source drift: '+file);
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=async code=>{try{return await main.webContents.executeJavaScript(code,true);}catch(error){throw Error(error.message+'\nMain script: '+code);}},click=async selector=>{assert.ok(await js('!!document.querySelector('+JSON.stringify(selector)+')'),selector+' missing');await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(120);},state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'UI missing');await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card")'),'Results missing');
 if(tactics){
  const boot=await js('window.buddy.bootstrap()'),before=boot.state.draft.slots;pairCache=boot.data.pairStatistics;
  assert.equal(await js('document.querySelector("[data-action=refresh-pairs]").disabled'),false);await click('[data-action=refresh-pairs]');
  await until(()=>js('!!document.querySelector(".result-card")&&!document.querySelector("[data-action=refresh-pairs]").disabled'),'Pair refresh missing');assert.equal(refreshedMembers.length,tactics);assert.deepEqual((await state()).draft.slots,before);
  const {createPairStatisticsIndex}=await import(require('node:url').pathToFileURL(path.resolve('src/core/pair-statistics.mjs'))),evidence=createPairStatisticsIndex(pairCache,boot.data.champions,{source:boot.data.buildSource,patch:boot.data.patch}).forMembers(refreshedMembers);
  const body=await js('document.querySelector(".result-card").textContent');assert.ok(body.includes(`${evidence.pairs.length}/${tactics*(tactics-1)/2} 对有样本`));assert.ok(evidence.pairs.length>0);assert.match(body,/未提供四人、五人或全队胜率/);
  if(!restart){assert.match(body,/炮形 Q\/E.*加速门/);assert.doesNotMatch(body,/等主线实际生效/);}
 }
 if(independent&&!restart){const body=await js('document.querySelector(".result-card").textContent');assert.doesNotMatch(body,/接实际控制后|等主线实际生效/);assert.match(body,/能安全近身时 Q/);assert.match(body,/目标是否实际孤立/);if(independent===5)assert.match(body,/米利欧 W.*芸阿娜/);else assert.match(body,/成长成员实际等级.*玩家核对/);}
 await click('[data-action=companion-attach]');await until(()=>js('!!document.querySelector(".companion-candidate")'),'Sidebar missing');
 const geometry=[];for(const width of [280,360,440]){main.setContentSize(width,850);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const row=await js('(()=>{const c=document.querySelector(".companion-candidate"),buttons=[c.querySelector("[data-action=use-result]"),c.querySelector("[data-action=result-detail]"),...c.querySelectorAll("[data-action=companion-preview]")];return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,buttons:buttons.map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,visible:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};})};})()');
  assert.equal(row.overflow,false);assert.ok(row.buttons.every(b=>b.visible),'Sidebar first-screen actions clipped at '+width);geometry.push(row);
 }
 main.setContentSize(440,850);await fs.writeFile(path.join(root,restart?'restart-sidebar.png':'sidebar.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 const editVisibleRune=async(surface,slot)=>{
  await js('(()=>{const el=document.querySelector(\'[data-rune-surface="'+surface+'"][data-rune-field="'+slot+'"]\');if(!el)throw Error("Rune editor missing");const option=[...el.options].find(o=>o.value!==el.value);el.value=option.value;el.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(160);
 };
 if(customRunes&&!restart){
  await click('.companion-candidate [data-action=companion-preview][data-id="Galio"]');
  await until(()=>js('!!document.querySelector("[data-rune-surface=companion]")'),'Sidebar editor missing');
  await editVisibleRune('companion',1);await editVisibleRune('companion',6);
  for(const width of [280,360,440]){main.setContentSize(width,850);await js('document.querySelector(".rune-editor").open=true;document.querySelector(".rune-editor").scrollIntoView({block:"start"});void 0');await delay(80);assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);}
  await fs.writeFile(path.join(root,'custom-rune-sidebar.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await click('[data-action=companion-tab][data-tab=recommend]');
 }
 if(!restart){
  if(routes){await click('.companion-candidate [data-action=result-detail]');if(!tactics||tactics===5)await click('.plan-drawer [data-action=party-route]');if(tactics===5)assert.match(await js('document.querySelector(".plan-drawer h2").textContent'),/保护核心/);await click('.plan-drawer [data-action=favorite-result]');await click('.plan-drawer [data-action=use-result]');}
  else await click('.companion-candidate [data-action=use-result]');
  await until(async()=>!!(await state()).draft.creativePlan,'Adoption missing');
 }
 await click('[data-action=companion-full]');await until(()=>js('!!document.querySelector(".result-card")'),'Main results missing');
 let plan=(await state()).draft.creativePlan;if(readiness)assert.ok(['shared','cooperation'].includes(plan.archetype));else assert.equal(plan.archetype,routes||independent?'shared':'curated');
 if(restart)assert.deepEqual(plan,JSON.parse(await fs.readFile(path.join(root,'accepted.json'),'utf8')));
 else await fs.writeFile(path.join(root,'accepted.json'),JSON.stringify(plan,null,2));
 if(readiness){assert.deepEqual(plan.members.map(m=>m.champion),['Kled','Khazix','Anivia']);}
 else if(independent){assert.doesNotMatch(plan.ordered.map(m=>m.job).join(' '),/接实际控制后|等主线实际生效/);assert.equal(plan.shared.routes[0].id,independent===4?'reset':'tactical:growth');}
 else if(routes){assert.equal(plan.shared.routes.length,2);if(tactics){assert.equal(plan.tempo,tactics===5?'protect':'poke');assert.equal(plan.shared.routes[0].tempo,plan.tempo);assert.match(plan.ordered.find(m=>m.champion==='Jayce').job,/炮形 Q/);}else{assert.ok(!plan.shared.routes[0].id.startsWith('curated:'));assert.ok(plan.shared.routes[1].id.startsWith('curated:'));}}
 else{if(!duoStages){assert.match(plan.ordered.find(m=>m.champion==='Rakan').job,/W|R/);assert.match(plan.steps.join(' '),/洛/);}
  await js('(async()=>{const {TRIOS,DUOS}=await import(new URL("./core/rules.mjs",location.href).href),c=[...TRIOS,...DUOS].find(t=>t.id==='+JSON.stringify(plan.curated.id)+');c.name="Changed catalog";c.steps=["Changed lead"];c.members?.forEach(m=>m.job="Changed job");const {BOTTOM_PLAYS}=await import(new URL("./core/role-plays.mjs",location.href).href);if('+duoStages+')BOTTOM_PLAYS.Ashe[2]="Changed later action";})()');
 }
 await click('[data-action=result-detail][data-index="0"]');await click('.plan-drawer [data-action=copy-result]');
 for(const m of plan.ordered)assert.ok(copied.includes(m.job));assert.doesNotMatch(copied,/Changed catalog|Changed lead|Changed job/);
 if(readiness){
  const {championWindow}=await import(require('node:url').pathToFileURL(path.resolve('src/core/champion-windows.mjs'))),text=await js('document.querySelector(".plan-drawer .team-windows").textContent');
  for(const m of plan.members){const checkpoint=championWindow(m.champion);assert.ok(checkpoint);assert.ok(copied.includes(checkpoint.condition),m.champion+' copy missing readiness');assert.ok(text.includes(checkpoint.condition),m.champion+' detail missing readiness');}
  assert.match(text,/3\/3 位已整理/);assert.doesNotMatch(text,/尚未整理/);
  await js('document.querySelector(".plan-drawer .team-windows").scrollIntoView({block:"start"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await fs.writeFile(path.join(root,restart?'restart-readiness.png':'readiness.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 }
 let expectedCustom,expectedCustomSkill;
 if(customRunes){
  if(!restart){
   await click('.plan-drawer [data-action=build][data-id="Galio"]');await until(()=>js('!!document.querySelector("[data-rune-surface=build]")'),'Drawer editor missing');
   const before=(await state()).preparations.find(p=>p.id==='Galio'&&p.comboId===plan.id);assert.ok(before.customRunePage,'Sidebar edits lost during adoption');
   await editVisibleRune('build',8);expectedCustom=(await state()).preparations.find(p=>p.id==='Galio'&&p.comboId===plan.id).customRunePage;assert.equal(expectedCustom.selectedPerkIds[1],before.customRunePage.selectedPerkIds[1]);assert.equal(expectedCustom.selectedPerkIds[6],before.customRunePage.selectedPerkIds[6]);assert.notEqual(expectedCustom.selectedPerkIds[8],before.customRunePage.selectedPerkIds[8]);
   await js('(()=>{const el=document.querySelector("[data-skill-surface=build][data-skill-index=\\"0\\"]");el.value=[...el.options].find(o=>o.value!==el.value).value;el.dispatchEvent(new Event("change",{bubbles:true}));})()');
   await until(async()=>!!(await state()).preparations.find(p=>p.id==='Galio'&&p.comboId===plan.id)?.customSkillOrder,'Custom skill order was not saved');
   expectedCustomSkill=(await state()).preparations.find(p=>p.id==='Galio'&&p.comboId===plan.id).customSkillOrder;
   await js('document.querySelector(".skill-editor").open=true;document.querySelector(".skill-editor").scrollIntoView({block:"start"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await fs.writeFile(path.join(root,'custom-skills-main.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
   await js('document.querySelector(".rune-editor").open=true;document.querySelector(".rune-editor").scrollIntoView({block:"start"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await fs.writeFile(path.join(root,'custom-runes-main.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
   await fs.writeFile(path.join(root,'custom-page.json'),JSON.stringify(expectedCustom,null,2));await fs.writeFile(path.join(root,'custom-skill.json'),JSON.stringify(expectedCustomSkill,null,2));await click('[data-action=back-result]');
  }else{expectedCustom=JSON.parse(await fs.readFile(path.join(root,'custom-page.json'),'utf8'));expectedCustomSkill=JSON.parse(await fs.readFile(path.join(root,'custom-skill.json'),'utf8'));}
 }
 if(!routes&&!restart)await click('.plan-drawer [data-action=favorite-result]');
 await until(async()=>(await state()).favorites.some(f=>f.type==='team'),'Favorite missing');
 const favorite=(await state()).favorites.find(f=>f.type==='team');assert.deepEqual(favorite.creativePlan,plan);assert.equal(favorite.configurations.length,plan.members.length);
 if(customRunes){assert.deepEqual(favorite.configurations.find(p=>p.id==='Galio').customRunePage,expectedCustom);assert.deepEqual(favorite.configurations.find(p=>p.id==='Galio').customSkillOrder,expectedCustomSkill);assert.ok(favorite.configurations.filter(p=>p.id!=='Galio').every(p=>!p.customRunePage&&!p.customSkillOrder));}
 for(const member of plan.members){
  await click('.plan-drawer [data-action=build][data-id="'+member.champion+'"][data-role="'+member.role+'"]');
  const body=await js('document.querySelector(".drawer-content").textContent');assert.ok(body.includes(plan.ordered.find(m=>m.champion===member.champion).job));assert.doesNotMatch(body,/Changed job/);
  await click('[data-action=open-guide]');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');
  await until(()=>guide.webContents.executeJavaScript('window.guide.bootstrap().then(b=>b.model?.selection.id==='+JSON.stringify(member.champion)+')',true),'Wrong guide member');
  const payload=await guide.webContents.executeJavaScript('window.guide.bootstrap()',true);assert.deepEqual(payload.model.combo.creativePlan,plan);assert.equal(payload.model.combo.ownJob,plan.ordered.find(m=>m.champion===member.champion).job);assert.equal(payload.model.runes.length,9);assert.deepEqual(payload.model.combo.steps,plan.steps);
  if(customRunes&&member.champion==='Galio'){assert.deepEqual(payload.model.selection.customRunePage,expectedCustom);assert.deepEqual(payload.model.runes.map(r=>r.id),expectedCustom.selectedPerkIds);assert.deepEqual(payload.model.selection.customSkillOrder,expectedCustomSkill);assert.equal(payload.model.skillOrder,expectedCustomSkill.order);}
  const gjs=async code=>{try{return await guide.webContents.executeJavaScript(code,true);}catch(error){throw Error(error.message+'\nGuide script: '+code);}};
  await gjs('document.querySelector("[data-tab=team]").click();void 0');
  for(const stage of ['opening','key','later']){
   await gjs('(()=>{const el=document.querySelector("#guide-stage");el.value='+JSON.stringify(stage)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');
   await until(()=>gjs('window.guide.bootstrap().then(b=>b.model.coach.stage==='+JSON.stringify(stage)+')'),'Stage not applied');
   const expected=plan.stagePlan[stage],own=expected.memberJobs.find(m=>m.champion===member.champion),current=await gjs('window.guide.bootstrap()');
   assert.equal(current.model.coach.action,own.job);assert.deepEqual(current.model.stageHint.play.steps,expected.steps);assert.equal(current.model.stageHint.play.window,expected.window);assert.equal(current.model.stageHint.play.exit,expected.exit);
   const visible=await gjs('document.body.textContent');assert.ok(visible.includes(own.job));assert.doesNotMatch(visible,/Changed later|Changed catalog|Changed job/);
   for(const step of expected.steps)assert.ok(visible.includes(step));assert.ok(visible.includes(expected.window));assert.ok(visible.includes(expected.exit));
   assert.ok(copied.includes(own.job));
   if(duoStages&&member.champion==='Ashe'&&stage==='later'){
    assert.match(visible,/自保或反开.*保护范围/);await gjs('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    await fs.writeFile(path.join(root,restart?'restart-duo-later.png':'duo-later.png'),(await guide.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
   }
  }
  await click('[data-action=back-result]');
 }
 assert.equal(writes,0);assert.ok(windows.every(w=>!w.isVisible()));
 const proof={passed:true,archiveSha256:release.archiveSha256,routes,tactics,independent,readiness,duoStages,customRunes,restart,planId:plan.id,memberGuides:plan.members.length,memberStages:plan.members.length*3,sameIdCatalogChange:!routes&&!independent&&!readiness,refreshedMembers,sidebarGeometry:geometry,actualRuneWrites:0,realGame:'UNPROVEN'};
 await fs.writeFile(path.join(root,restart?'restart.json':'select.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'error.txt'),error.stack).catch(()=>{});for(const [i,w]of windows.entries())if(!w.isDestroyed())await fs.writeFile(path.join(root,'failure-'+i+'.png'),(await w.webContents.capturePage()).toPNG()).catch(()=>{});app.exit(1);});
