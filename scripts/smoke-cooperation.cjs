const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),restart=process.env.RIFT_BUDDY_COOP_RESTART==='1',windows=[];let copies=[],runeWrites=0;
const shooters=process.env.RIFT_BUDDY_COOP_SHOOTERS==='1',farming=process.env.RIFT_BUDDY_COOP_FARMING==='1',anchorRole=shooters?'mid':'top',previewRole=shooters?'support':'jungle';
const coverageData=process.env.RIFT_BUDDY_COOP_COVERAGE==='1';
const adaptiveData=process.env.RIFT_BUDDY_COOP_DATA==='1';
const crossLane=process.env.RIFT_BUDDY_COOP_CROSS_LANE==='1',lockedFriends=process.env.RIFT_BUDDY_COOP_LOCKED_FRIENDS==='1',friend=shooters?'Lux':farming?'Garen':coverageData?'Shen':adaptiveData?'Gwen':lockedFriends?'Fiora':crossLane?'Darius':'Trundle',expectedMembers=shooters?[['mid','Lux'],['bottom','Jhin'],['support','Nautilus']]:farming?[['top','Garen'],['jungle','MasterYi'],['mid','Annie']]:[['top',friend],['jungle',coverageData?'Poppy':adaptiveData?'Graves':lockedFriends?'JarvanIV':crossLane?'LeeSin':'Sejuani'],['mid',coverageData?'Brand':adaptiveData?'Vex':lockedFriends?'Syndra':crossLane?'Ahri':'Seraphine']],marker=shooters?'标记':farming?'击杀或助攻':coverageData?'撞墙':adaptiveData?'恐惧':lockedFriends?'破绽':crossLane?'魅惑':'四层';
globalShortcut.register=()=>false;global.fetch=async()=>{throw Error('Isolated cooperation smoke: network disabled');};https.request=()=>{throw Error('Isolated cooperation smoke: game sockets disabled');};
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>handle(name,name==='client-status'?()=>({connected:false,phase:'Offline',message:'Isolated fixture'}):name==='apply-runes'?()=>{runeWrites++;throw Error('Rune writes prohibited');}:name==='copy'?(_event,text)=>{copies.push(text);return true;}:name==='companion-mode'?(_event,value)=>{const w=windows[0];w.setMinimumSize(value?280:820,480);w.setContentSize(value?440:1180,850);return {docked:!!value,overlap:false};}:handler);
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(70);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar');
 for(const file of ['src/core/cooperation.mjs','src/core/cooperation-skills.mjs','src/core/pair-statistics.mjs','src/pair-statistics-view.mjs','services/pair-statistics.mjs','data/pair-statistics.json','src/core/creative-plan.mjs','src/core/recommend.mjs','src/core/builds.mjs','src/cooperation-view.mjs','src/guide-view.mjs','src/companion-view.mjs','src/app.mjs'])assert.ok((await fs.readFile(path.join(base,file))).equals(await fs.readFile(file)),'Packaged source drift: '+file);
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=async code=>{try{return await main.webContents.executeJavaScript(code,true);}catch(error){throw Error('Renderer probe failed: '+code,{cause:error});}},click=async selector=>{await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(120);};
 const state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 const generate=async()=>{await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card")'),'Worker result missing');};
 const capture=async name=>{await js('[...document.images].forEach(i=>i.loading="eager")');await js('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,name),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'UI missing');await generate();
 assert.ok(await js('document.querySelector(".result-card").textContent.includes("机制搭配")'));
 if((crossLane||lockedFriends)&&!restart)await capture('main.png');
 const {createCooperationGraph,cooperationPlan}=await import(require('node:url').pathToFileURL(path.join(base,'src/core/cooperation.mjs'))),expectedCooperation=cooperationPlan(expectedMembers.map(([role,champion])=>({role,champion})),createCooperationGraph(JSON.parse(await fs.readFile(path.join(base,'data/game.json'))).champions));assert.ok(expectedCooperation);
 assert.equal(await js('document.querySelectorAll(".result-card .result-actions-summary")[0]?.querySelectorAll("p").length'),3,'Main card must show all three member actions');
 const initial=await state();assert.equal(initial.draft.slots.find(s=>s.role===anchorRole).champion,friend);assert.equal(initial.draft.slots.find(s=>s.role===anchorRole).manualPosition,true);
 let previewRuneId;
 if(!restart){
  await click('[data-action=companion-attach]');await until(()=>js('!!document.querySelector(".companion-candidate")'),'Preview candidates missing');
  for(const [role,id] of expectedMembers){
   await click('[data-action=companion-preview][data-result-index="0"][data-id="'+id+'"][data-role="'+role+'"]');
   const note=await js('document.querySelector(".companion-note")?.textContent');assert.ok(note?.includes(expectedCooperation.name),'Sidebar preview lost cooperation for '+id);
   if(role===previewRole){
    const option=await js('(()=>{const s=document.querySelector("[data-companion-field=rune]");return [...s.options].find(o=>o.value!==s.value)?.value;})()');assert.ok(option,'Fixture requires an alternate complete rune page');
    await js('(()=>{const s=document.querySelector("[data-companion-field=rune]");s.value='+JSON.stringify(option)+';s.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(120);previewRuneId=option;
    assert.ok((await js('document.querySelector(".companion-note")?.textContent'))?.includes(expectedCooperation.name),'Editing runes lost the chosen cooperation');
    await click('[data-action=companion-favorite]');const favorite=(await state()).favorites.find(f=>f.type==='build'&&f.champion===id);assert.equal(favorite.runeId,option);assert.equal(favorite.creativePlan?.archetype,'cooperation');
   }
   await click('[data-action=companion-tab][data-tab=recommend]');
  }
  assert.deepEqual((await state()).draft.slots,initial.draft.slots,'Preview must not accept the suggested lineup');assert.deepEqual((await state()).draft.creativePlan,initial.draft.creativePlan);
  await click('[data-action=companion-full]');await until(()=>js('!!document.querySelector(".result-card")'),'Main results missing after preview');
 }
 await click('[data-action=result-detail][data-index="0"]');const detail=await js('document.querySelector(".plan-drawer").textContent');
 for(const text of ['成立条件','失败处理',marker,crossLane||lockedFriends?'开局分工':'对应状态','兵线与资源','未经组合对局验证'])assert.ok(detail.includes(text),'Missing '+text);
 assert.ok(await js('document.querySelector(".cooperation-plan [data-action=link]").dataset.url.startsWith("https://ddragon.leagueoflegends.com/")'));
 let pairEvidence;if(adaptiveData){assert.match(detail,/OP.GG 同队参考/);assert.match(detail,/未提供三人组合或全队胜率/);const bootstrap=await js('window.buddy.bootstrap()'),{createPairStatisticsIndex}=await import(require('node:url').pathToFileURL(path.resolve('src/core/pair-statistics.mjs')));assert.ok(bootstrap.data.pairStatistics.snapshots.some(s=>s.region===bootstrap.data.buildSource.region&&s.tier===bootstrap.data.buildSource.tier&&s.patch===bootstrap.data.patch&&s.entries.length>0));assert.match(bootstrap.data.pairStatistics.revision,/^[a-f0-9]{64}$/);pairEvidence=createPairStatisticsIndex(bootstrap.data.pairStatistics,bootstrap.data.champions,{source:bootstrap.data.buildSource,patch:bootstrap.data.patch}).forMembers(expectedMembers.map(([role,champion])=>({role,champion})));assert.ok(pairEvidence.pairs.length>0);for(const p of pairEvidence.pairs){assert.ok(detail.includes(p.games.toLocaleString()+' 场'));assert.ok(detail.includes(p.winRate.toFixed(1)+'%'));}}
 await capture(restart?'cooperation-restart-detail.png':'cooperation-detail.png');await click('[data-action=copy-result][data-index="0"]');assert.ok(copies.at(-1).includes('成立条件')&&copies.at(-1).includes('失败处理'));
 if(adaptiveData)assert.ok(copies.at(-1).includes('OP.GG 同队参考')&&pairEvidence.pairs.every(p=>copies.at(-1).includes(p.winRate.toFixed(1)+'%')));
 if(!restart){await click('.plan-drawer [data-action=favorite-result][data-index="0"]');await until(async()=>(await state()).favorites.some(f=>f.type==='team'),'Favorite missing');assert.equal(await js('document.querySelector(".plan-drawer [data-action=favorite-result]").getAttribute("aria-pressed")'),'true');assert.ok(await js('document.querySelector(".plan-drawer [data-action=favorite-result]").textContent.includes("点击取消")'));await click('.plan-drawer [data-action=favorite-result][data-index="0"]');assert.equal((await state()).favorites.filter(f=>f.type==='team').length,0);assert.equal(await js('document.querySelector(".plan-drawer [data-action=favorite-result]").getAttribute("aria-pressed")'),'false');await click('.plan-drawer [data-action=favorite-result][data-index="0"]');await click('[data-action=use-result][data-index="0"]');await until(()=>js('!!document.querySelector(".result-card")'),'Accepted plan missing');}
 else await click('[data-action=close]');
 const accepted=await state();for(const [role,id]of expectedMembers)assert.ok(accepted.draft.slots.some(s=>s.role===role&&s.champion===id&&s.locked));
 assert.ok(accepted.draft.slots.find(s=>s.role===anchorRole).manualPosition);assert.equal(accepted.draft.slots.find(s=>s.role===anchorRole).clientCellId,2);
 const plan=accepted.draft.creativePlan;assert.equal(plan.archetype,'cooperation');const favorite=accepted.favorites.find(f=>f.type==='team');assert.deepEqual(favorite.creativePlan,plan);assert.equal(favorite.configurations.length,3);assert.ok(favorite.configurations.every(c=>c.creativePlan.id===plan.id));
 if(previewRuneId)assert.equal(favorite.configurations.find(c=>c.role===previewRole).runeId,previewRuneId,'Accepting the plan must preserve the rune page edited in its sidebar preview');
 const expectedEditable=shooters?['support']:farming?['mid']:lockedFriends?['jungle']:['jungle','mid'];assert.deepEqual(plan.editableTargets,expectedEditable);
 await click('[data-action=result-detail][data-index="0"]');
 const controls=await js('[...document.querySelectorAll(".plan-drawer [data-action=replace-member]")].map(b=>b.dataset.role)');
 assert.deepEqual(controls,expectedEditable,'Accept/restart must not add replacement controls for fixed friends');
 for(const member of plan.members){
  await click('[data-action=build][data-id="'+member.champion+'"][data-role="'+member.role+'"]');
  const configuration=await js('document.querySelector(".combo-config").textContent');assert.ok(configuration.includes(plan.window));assert.ok(configuration.includes('机制搭配说明'));
  if(crossLane&&member.champion==='Ahri'){
   const laterSelector='[data-action=build-later][data-id="3165"]';
   assert.ok(await js('!!document.querySelector('+JSON.stringify(laterSelector)+')'),'Morellonomicon source alternative missing');
   await js('(()=>{const b=document.querySelector('+JSON.stringify(laterSelector)+');let p=b.parentElement;while(p){if(p.tagName==="DETAILS")p.open=true;p=p.parentElement;}b.scrollIntoView({block:"center"});})()');
   await capture(restart?'morellonomicon-restart.png':'morellonomicon.png');
   if(!restart)await click('[data-action=build-later][data-id="3165"]');
  }
  assert.ok(await js('[...document.querySelectorAll("[data-action=build-partner]")].every(b=>b.textContent.length<40)'),'Partner controls must use champion names');
  await click('[data-action=open-guide]');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');
  const guideJs=code=>guide.webContents.executeJavaScript(code,true);await until(()=>guideJs('window.guide.bootstrap().then(b=>b.model?.selection.id==='+JSON.stringify(member.champion)+'&&b.model?.combo?.id==='+JSON.stringify(plan.id)+')'),'Member cooperation did not reach guide');
  const payload=await guideJs('window.guide.bootstrap()');assert.deepEqual(payload.model.combo.creativePlan,plan);assert.deepEqual(payload.model.combo.steps,plan.steps);assert.equal(payload.model.runes.length,9);assert.equal(payload.model.combo.window,plan.window);assert.equal(payload.model.combo.risk,plan.caution);
  if(lockedFriends){assert.deepEqual(payload.model.combo.creativePlan.cooperation.relaySteps,plan.cooperation.relaySteps);assert.ok(plan.cooperation.memberJobs.find(m=>m.champion===member.champion).job);}
  assert.equal(payload.model.combo.early,plan.cooperation.opening);assert.equal(payload.model.combo.economy,plan.cooperation.economy);
  if(crossLane&&member.champion==='Ahri')assert.ok(payload.model.selection.laterIds.includes(3165),'Selected late item did not reach guide or restart');
  await guideJs('document.querySelector("[data-tab=team]").click()');await until(()=>guideJs('!!document.querySelector(".team-steps")'),'Guide plan not rendered');
  assert.ok(await guideJs('(()=>{const a=document.querySelector(".team-steps"),b=[...document.querySelectorAll("summary")].find(s=>s.textContent==="英雄机制、对位与个人打法");return !!b&&!!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);})()'),'Chosen cooperation must precede generic personal coaching');
  const text=await guideJs('document.querySelector(".expanded main").textContent');for(const step of plan.steps)assert.ok(text.includes(step));assert.ok(text.includes(plan.window)&&text.includes(plan.caution)&&text.includes('成立条件')&&text.includes('失败处理'));
  await guideJs('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await delay(250);
  assert.ok(await guideJs('document.querySelector(".team-steps").getBoundingClientRect().height>0'),'Guide plan is not visible');
  await fs.writeFile(path.join(root,(restart?'restart-':'')+'guide-'+member.champion+'.png'),(await guide.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await click('[data-action=back-result]');
 }
 await click('[data-action=close]');
 await click('[data-action=companion-attach]');await until(()=>js('document.body.classList.contains("companion-mode")&&!!document.querySelector(".companion-candidate")'),'Sidebar missing');
 assert.equal(await js('document.querySelector(".companion-candidate .result-actions-summary")?.querySelectorAll("p").length'),3,'Sidebar must show all member actions before expanding details');
 const side=await js('document.querySelector(".companion-candidate").textContent');assert.ok(side.includes('成立条件')&&side.includes(marker)&&side.includes('未经组合对局验证'));
 for(const condition of plan.cooperation.conditions)assert.ok(side.includes(condition),'Sidebar omitted a member condition');assert.ok(side.includes(plan.cooperation.economy));
 await js('[...document.querySelectorAll("details[data-companion-disclosure^=cooperation]")].forEach(d=>d.open=true)');
 for(const width of [440,360,280]){main.setContentSize(width,850);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false,'Sidebar overflow '+width);}
 main.setContentSize(440,850);await capture(restart?'cooperation-restart-sidebar.png':'cooperation-sidebar.png');assert.equal(runeWrites,0);assert.ok(windows.every(w=>!w.isVisible()));
 const report={passed:true,archiveSha256:release.archiveSha256,lockedFriendPreserved:true,workerMechanismSeeds:true,explicitAcceptance:true,copyConditions:true,favorite:true,savedPlanId:plan.id,memberGuides:plan.members.map(m=>m.champion),originalConditionsAndSources:true,restart,sidebarWidths:[280,360,440],actualRuneWrites:0,realGame:'UNPROVEN'};
 await fs.writeFile(path.join(root,restart?'restart.json':'select.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'error.txt'),error.stack).catch(()=>{});for(const [i,w]of windows.entries())if(!w.isDestroyed())await fs.writeFile(path.join(root,'failure-'+i+'.png'),(await w.webContents.capturePage()).toPNG()).catch(()=>{});app.exit(1);});
