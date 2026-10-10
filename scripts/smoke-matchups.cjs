const {app,ipcMain,globalShortcut,session,clipboard}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),{pathToFileURL}=require('node:url');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),phase=process.env.RIFT_BUDDY_MATCHUP_PHASE,windows=[];
let runeWrites=0,fixture;
const copiedTexts=[];clipboard.writeText=text=>copiedTexts.push(text);
globalShortcut.register=()=>false;
global.fetch=async()=>{throw Error('Isolated matchup smoke: source network disabled');};
https.request=()=>{throw Error('Isolated matchup smoke: all game sockets disabled');};
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const originalHandle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>originalHandle(name,name==='client-status'?()=>structuredClone(fixture):name==='apply-runes'?()=>{runeWrites++;throw Error('Rune writes are prohibited in this smoke');}:name==='companion-mode'?(_event,value)=>{const main=windows[0];main.setMinimumSize(value?360:820,480);main.setContentSize(value?440:1180,value?729:820);return {docked:!!value,overlap:false};}:handler);
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{
 if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);
 const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;
 observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;
};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(70);}throw Error(label);}
async function run(){
 app.setPath('userData',root);
 const release=JSON.parse(await fs.readFile('release/latest.json','utf8')),base=path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'),'utf8'));data.builds=JSON.parse(await fs.readFile(path.join(base,'data/builds.json'),'utf8')).entries;
 const hero=id=>data.champions.find(c=>c.id===id);
 const actions=w=>({js:code=>w.webContents.executeJavaScript(code,true),click:async selector=>{await w.webContents.executeJavaScript('document.querySelector('+JSON.stringify(selector)+').click()',true);await delay(80);},change:async(selector,value)=>{await w.webContents.executeJavaScript('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');el.value='+JSON.stringify(value)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()',true);await delay(100);}});
 const capture=async(w,name)=>{await w.webContents.executeJavaScript('[...document.images].forEach(i=>i.loading="eager")');await w.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');await w.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(root,name),(await w.webContents.capturePage()).toPNG());};
 let report;
 if(phase==='side'){
  fixture={connected:true,phase:'ChampSelect',receivedAt:Date.now(),mode:{id:'rift',label:'召唤师峡谷'},game:{gameId:'2101',mapId:11},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:hero('Nautilus').key,assignedPosition:'UTILITY',pickState:'locked'},{cellId:2,championId:hero('Samira').key,assignedPosition:'BOTTOM',pickState:'locked'}],theirTeam:['Morgana','Janna','Yuumi'].map((id,i)=>({cellId:6+i,championId:hero(id).key})),bans:[],timer:{adjustedTimeLeftInPhase:65000}}};
  require(path.join(base,'electron/main.cjs'));
  let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main window missing');
  const {js,click,change}=actions(main);
  await until(()=>js('!!document.querySelector("[data-action=sync]")'),'Main not loaded');await click('[data-action=sync]');
  await until(()=>js('document.querySelector(".current-preparation")?.textContent.includes("诺提勒斯")'),'Public pick not synchronized');
  await click('[data-action=companion-attach]');await until(()=>js('document.body.classList.contains("companion-mode")'),'Sidebar not entered');
  await click('[data-action=companion-tab][data-tab=plan]');
  const geometry=await js('(()=>{const panel=document.querySelector(".companion-content").getBoundingClientRect(),summary=document.querySelector(".companion-plan-summary").getBoundingClientRect();return {width:innerWidth,height:innerHeight,panel:{top:panel.top,bottom:panel.bottom},summary:{top:summary.top,bottom:summary.bottom},overflow:document.documentElement.scrollWidth>innerWidth};})()');
  // Windows display scaling can round requested DIP content bounds by one pixel.
  assert.ok(Math.abs(geometry.width-440)<=1);assert.ok(Math.abs(geometry.height-729)<=1);assert.equal(geometry.overflow,false);assert.ok(geometry.summary.top>=geometry.panel.top&&geometry.summary.bottom<=geometry.panel.bottom,'Current core/rune/skill summary must fit the first screen');
  await capture(main,'side-first-screen.png');
  assert.equal(await js('!!document.querySelector("[data-duo-play=naut-samira]")'),true,'Prepared side plan omitted the actual duo stage tasks');
  assert.equal(await js('document.querySelectorAll("[data-matchup-enemy]").length'),0,'No enemy should be selected automatically');
  const selectedRune=await js('document.querySelector("[data-companion-field=rune]").value');
  const plans={};
  for(const id of ['Morgana','Janna','Yuumi']){
   await change('[data-matchup-target]',id);await until(()=>js('document.querySelector("[data-matchup-enemy]")?.dataset.matchupEnemy==='+JSON.stringify(id)),id+' condition plan missing');
   plans[id]=await js('document.querySelector(".hero-coach-compact").textContent');assert.equal(await js('document.querySelector("[data-companion-field=rune]").value'),selectedRune);
  }
  assert.equal(new Set(Object.values(plans)).size,3);assert.ok(plans.Morgana.includes('黑盾'));assert.ok(plans.Janna.includes('W 不能阻止风女 R'));assert.ok(plans.Yuumi.includes('同一宿主'));
  await click('[data-action=companion-jump][data-section=opponent]');await capture(main,'side-yuumi-plan.png');
  console.log('Side: three distinct plans and first-screen summary verified');
  await js('(()=>{const b=document.createElement("button");b.dataset.action="auto-sync";document.body.append(b);b.click();b.remove();})()');
  await js('window.openMatchupSelect=document.querySelector("[data-matchup-target]");openMatchupSelect.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));void 0');
  fixture.session.theirTeam=fixture.session.theirTeam.slice(0,2);main.webContents.send('client-update',structuredClone(fixture));
  console.log('Side: removed public target synchronized');
  await until(()=>js('document.querySelectorAll("[data-matchup-enemy]").length===0'),'Vanished public target leaked a plan');
  assert.equal(await js('openMatchupSelect.isConnected'),false,'Invalid public target menu remained open');
  assert.equal(await js('document.querySelector("[data-matchup-target]").value'),'');
  console.log('Side: vanished public target hidden');
  await change('[data-matchup-target]','Janna');
  console.log('Side: selected Janna before new game');
  fixture.game.gameId='2102';await click('[data-action=sync]');await until(()=>js('document.querySelector("[data-matchup-target]").value===""'),'New draft retained previous-game target');
  console.log('Side: new-game target cleared');
  await change('[data-matchup-target]','Morgana');await click('[data-action=companion-full]');await until(()=>js('!document.body.classList.contains("companion-mode")'),'Full assistant missing');
  console.log('Side: expanded assistant');
  await click('[data-action=my-build]');await until(()=>js('document.querySelector("#overlay-root [data-matchup-enemy]")?.dataset.matchupEnemy==="Morgana"'),'Full configuration did not share the same manual target');
  assert.equal(await js('document.querySelectorAll("#overlay-root [data-duo-play=naut-samira] [data-duo-stage]").length'),3);
  await click('[data-action=copy-build]');assert.ok(copiedTexts.at(-1).includes('经济分工'));assert.ok(copiedTexts.at(-1).includes('后期团战'));assert.ok(copiedTexts.at(-1).includes('莎弥拉'));
  console.log('Side: full configuration shares the selected target');
  await change('#overlay-root [data-matchup-target]','Janna');assert.equal(await js('document.querySelector("#overlay-root [data-matchup-enemy]").dataset.matchupEnemy'),'Janna');
  await click('[data-action=build-jump][data-section=opponent]');await capture(main,'full-janna-plan.png');
  await js('window.openDrawerMatchupSelect=document.querySelector("#overlay-root [data-matchup-target]");openDrawerMatchupSelect.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));void 0');
  fixture.session.theirTeam=[];main.webContents.send('client-update',structuredClone(fixture));await until(()=>js('document.querySelectorAll("#overlay-root [data-matchup-enemy]").length===0'),'Open drawer retained vanished target');
  assert.equal(await js('openDrawerMatchupSelect.isConnected'),false,'Invalid full configuration target menu remained open');
  await click('#overlay-root [data-action=close]');await click('[data-action=combination-library]');await click('[data-action=combo-kind][data-kind=duos]');
  await js('(()=>{const el=document.querySelector("#combo-search");el.value="Samira";el.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await until(()=>js('!!document.querySelector(".combo-row [data-duo-play=naut-samira]")'),'Combo library omitted pair steps');
  await js('document.querySelector(".combo-row [data-duo-play=naut-samira]").closest(".combo-row").querySelector("details>summary").click();void 0');
  assert.equal(await js('document.querySelectorAll(".combo-row [data-duo-play=naut-samira] [data-duo-stage]").length'),3);
  const expandedWidth=await js('(()=>{const row=document.querySelector(".combo-row [data-duo-play=naut-samira]").closest(".combo-row"),list=row.parentElement;return {row:row.getBoundingClientRect().width,list:list.getBoundingClientRect().width,available:list.clientWidth-parseFloat(getComputedStyle(list).paddingLeft)-parseFloat(getComputedStyle(list).paddingRight),column:getComputedStyle(row).gridColumn,layout:getComputedStyle(list).display,open:row.querySelector(":scope>details").open};})()');assert.ok(Math.abs(expandedWidth.row-expandedWidth.available)<=2&&expandedWidth.column==='1 / -1','Expanded pair explanation should use the available list width: '+JSON.stringify(expandedWidth));
  await js('document.querySelector(".combo-row [data-duo-play=naut-samira]").closest(".combo-row").scrollIntoView({block:"start"});void 0');await capture(main,'library-naut-samira.png');
  report={passed:true,archiveSha256:release.archiveSha256,geometry,ownPlans:plans,explicitPublicTargetOnly:true,vanishedTargetCleared:true,activeTargetMenuInvalidated:true,newDraftCleared:true,fullDrawerSharesTarget:true,loadoutUnchanged:true,duoSideFullAndLibrary:true,duoCopy:true,clipboardMocked:true,runeWrites};
 }else if(phase.startsWith('team-order')){
  await app.whenReady();
  const core=await import(pathToFileURL(path.join(base,'src/core/guide.mjs')).href);
  const {createSlots}=await import(pathToFileURL(path.join(base,'src/core/recommend.mjs')).href);
  const {createCooperationGraph,cooperationPlan}=await import(pathToFileURL(path.join(base,'src/core/cooperation.mjs')).href);
  const {captureCreativePlan}=await import(pathToFileURL(path.join(base,'src/core/creative-plan.mjs')).href);
  const graph=createCooperationGraph(data.champions),restored=phase.endsWith('restart'),saveFile=path.join(root,'../team-order/guide-state.json');
  const groups=[[['jungle','JarvanIV'],['mid','Syndra']],[['top','Kayle'],['jungle','Kindred'],['mid','Vladimir']]];
  const plans=groups.map(members=>captureCreativePlan({adaptive:cooperationPlan(members.map(([role,champion])=>({role,champion})),graph),slots:createSlots().map(s=>{const m=members.find(([role])=>role===s.role);return {...s,...(m?{champion:m[1],party:true,locked:true}:{})};})},data));
  let state=restored?core.validateGuideState(JSON.parse(await fs.readFile(saveFile))):core.selectGuide(null,{id:'Syndra',role:'mid',mode:'rift',comboId:plans[0].id,creativePlan:plans[0]});
  const liveFor=(id,role)=>({available:true,champion:id,position:role,mode:'rift',mapId:11,queueId:420,level:7,gold:800,gameTime:900,inventory:[],skills:{Q:3,W:1,E:1,R:id==='Syndra'?0:1},enemies:['Morgana','Janna','Soraka'].map(enemy=>({id:enemy,name:hero(enemy).name,level:7,items:[],itemsKnown:true})),allies:[],teamKnown:true,roster:['Morgana','Janna','Soraka'].map(champion=>({champion,side:'enemy',self:false,inventory:[],itemsKnown:true,level:7}))});
  let live=liveFor(state.selection.id,state.selection.role);
  const factory=require(path.join(base,'electron/guide-window.cjs'));
  const guide=factory({root:base,getState:()=>state,setState:async next=>{state=core.validateGuideState(next);await fs.writeFile(saveFile,JSON.stringify(state,null,2));},getModel:()=>core.createGuideModel(data,state,{...live,at:Date.now()}),currentSelection:()=>null,prepareCurrent:async()=>true,getPreferences:()=>({guideAutoShow:false}),isQuitting:()=>true,showMain:()=>{},diagnostic:()=>{}});
  guide.show();const w=guide.window(),{js,click,change}=actions(w);
  await until(()=>js('!!document.querySelector("[data-tab=team]")'),'Team guide not loaded');await click('[data-tab=team]');
  if(restored){const initial=await js('window.guide.bootstrap()');assert.equal(initial.model.selection.id,'Vladimir');assert.equal(initial.model.selection.threatId,'Janna');assert.equal(initial.model.coach.sequenceSource,'team');for(const step of plans[1].steps)assert.ok(initial.model.coach.sequence.includes(step));}
  const verified=[];
  for(const plan of plans)for(const member of plan.members){
   state=core.selectGuide(state,{id:member.champion,role:member.role,mode:'rift',comboId:plan.id,creativePlan:plan});live=liveFor(member.champion,member.role);guide.publish();
   await until(()=>js('window.guide.bootstrap().then(b=>b.model?.selection.id==='+JSON.stringify(member.champion)+')'),'Member plan missing');
   await change('#guide-stage','key');
   for(const enemyId of ['Morgana','Janna','Soraka']){
    await change('#guide-threat',enemyId);
    const payload=await js('window.guide.bootstrap()');assert.equal(payload.model.coach.matchup.enemy.id,enemyId);assert.equal(payload.model.coach.sequenceSource,'team');assert.deepEqual(payload.model.coach.unlearned,[]);
    for(const step of plan.steps)assert.ok(payload.model.coach.sequence.includes(step));
    assert.ok(await js('document.querySelector(".hero-coach .coach-sequence").textContent.endsWith('+JSON.stringify(plan.steps.join(' → '))+')'),'Rendered enemy plan replaced the accepted team order');
   }
   if(member.champion==='Syndra'){
    live.skills.E=0;guide.publish();await until(()=>js('!!document.querySelector("[data-guide-section=coach-future-sequence]")'),'Own missing spell did not gate the team action');
    const missing=await js('window.guide.bootstrap()');assert.deepEqual(missing.model.coach.unlearned,['E']);for(const step of plan.steps)assert.ok(missing.model.coach.futureSequence.includes(step));
    live.skills.E=1;guide.publish();
   }
   live.enemies=[];live.roster=[];guide.publish();await until(()=>js('document.querySelectorAll("[data-matchup-enemy]").length===0'),'Withdrawn enemy leaked into team coaching');
   const withdrawn=await js('window.guide.bootstrap()');for(const step of plan.steps)assert.ok(withdrawn.model.coach.sequence.includes(step));
   live=liveFor(member.champion,member.role);guide.publish();await change('#guide-threat','Janna');
   await js('window.guide.control("copy")');for(const step of plan.steps)assert.ok(copiedTexts.at(-1).includes(step));
   await js('[...document.querySelectorAll("details")].forEach(d=>d.open=true)');await capture(w,member.champion+'-team-order.png');verified.push(member.champion);
  }
  assert.deepEqual(state.selection.creativePlan,plans[1]);assert.equal(state.selection.threatId,'Janna');
  report={passed:true,archiveSha256:release.archiveSha256,memberGuides:verified,enemyConditionsKeepTeamOrder:true,ownSkillGate:true,withdrawnEnemyKeepsTeam:true,copyKeepsTeam:true,restart:restored,runeWrites,realGame:'UNPROVEN'};
 }else{
  await app.whenReady();
  const core=await import(pathToFileURL(path.join(base,'src/core/guide.mjs')).href);
  let state=core.selectGuide(null,{id:'Nautilus',role:'support',mode:'rift',comboId:'naut-samira'});
  let live={available:true,champion:'Nautilus',mode:'rift',mapId:11,queueId:420,level:7,gold:800,gameTime:900,inventory:[],skills:{Q:1,W:1,E:3,R:1},enemies:['Morgana','Janna','Yuumi'].map(id=>({id,name:hero(id).name,level:7,items:[],itemsKnown:true})),allies:[{id:'Samira',name:hero('Samira').name,level:7,items:[]}]};
  // The real reader exposes both combat projections and the public roster;
  // target controls deliberately use the latter, rather than infer opponents.
  live.teamKnown=true;live.roster=[...live.enemies.map(e=>({champion:e.id,side:'enemy',self:false,inventory:[],itemsKnown:true,level:7})),{champion:'Samira',side:'ally',self:false,inventory:[],itemsKnown:true,level:7}];
  let current={id:'Nautilus',role:'support',mode:'rift',positionKnown:true,comboId:'naut-samira',comboKnown:true};
  const factory=require(path.join(base,'electron/guide-window.cjs'));
  const guide=factory({root:base,getState:()=>state,setState:async next=>{state=core.validateGuideState(next);},getModel:()=>core.createGuideModel(data,state,{...live,at:Date.now()},current),currentSelection:()=>current,prepareCurrent:async()=>true,getPreferences:()=>({guideAutoShow:false}),isQuitting:()=>true,showMain:()=>{},diagnostic:()=>{}});
  guide.show();const w=guide.window(),{js,click,change}=actions(w);await until(()=>js('!!document.querySelector("[data-tab=team]")'),'Guide not loaded');await click('[data-tab=team]');
  const plans={};for(const id of ['Morgana','Janna','Yuumi']){
   await change('#guide-threat',id);await until(()=>js('document.querySelector("[data-matchup-enemy]")?.dataset.matchupEnemy==='+JSON.stringify(id)),id+' guide plan missing');
   plans[id]=await js('document.querySelector(".hero-coach .coach-action").textContent');
  }
  assert.equal(new Set(Object.values(plans)).size,3);await capture(w,'guide-yuumi-plan.png');assert.equal(await js('document.querySelector("[data-matchup-enemy]").dataset.matchupEnemy'),'Yuumi');
  await change('#guide-threat','Janna');await change('#guide-stage','opening');const opening=await js('document.querySelector(".hero-coach .coach-action").textContent');
  await change('#guide-stage','later');assert.notEqual(await js('document.querySelector(".hero-coach .coach-action").textContent'),opening);
  const duoActions={};for(const stage of ['opening','key','later']){
   await change('#guide-stage',stage);await until(()=>js('document.querySelector("[data-duo-stage]")?.dataset.duoStage==='+JSON.stringify(stage)),'Duo phase did not follow guide stage');
   duoActions[stage]=await js('document.querySelector(".hero-coach .coach-action").textContent');
  }
  assert.equal(new Set(Object.values(duoActions)).size,3);
  const actionGeometry=await js('(()=>{const action=document.querySelector(".expanded main .coach-action").getBoundingClientRect(),main=document.querySelector("main").getBoundingClientRect();return {top:action.top,bottom:action.bottom,height:action.height,mainTop:main.top,mainBottom:main.bottom};})()');
  assert.ok(actionGeometry.height>0&&actionGeometry.top>=actionGeometry.mainTop&&actionGeometry.bottom<=actionGeometry.mainBottom,'Own actionable guidance must be visible and fit the first team screen');
  await capture(w,'guide-own-first-screen.png');
  live.enemies=live.enemies.filter(e=>e.id!=='Janna');live.roster=live.roster.filter(p=>p.champion!=='Janna');guide.publish();await until(()=>js('document.querySelectorAll("[data-matchup-enemy]").length===0'),'Guide leaked a disappeared opponent');
  await change('#guide-threat','Morgana');await js('window.guide.control("new-game")');await until(()=>js('document.querySelectorAll("[data-matchup-enemy]").length===0'),'Guide retained previous-game opponent');
  assert.equal(state.selection.threatId,undefined);assert.equal(state.selection.comboId,'naut-samira');
  state=core.selectGuide(state,{id:'Samira',role:'bottom',mode:'rift',comboId:'naut-samira'});current={...current,id:'Samira',role:'bottom'};live={...live,champion:'Samira'};live.roster=[...live.roster.filter(p=>p.side==='enemy'),{champion:'Nautilus',side:'ally',self:false,inventory:[],itemsKnown:true,level:7}];guide.publish();
  await until(()=>js('document.querySelector(".hero-coach h3")?.textContent.includes("莎弥拉")'),'Guide kept previous partner role');await change('#guide-stage','key');
  assert.ok((await js('document.querySelector(".hero-coach .coach-action").textContent')).includes('S 和安全近身'));assert.equal(state.selection.role,'bottom');await capture(w,'guide-samira-key.png');
  const soloRoleActions={},rolePlans=await import(pathToFileURL(path.join(base,'src/core/role-plays.mjs')).href);
  for(const [id,role]of [['Garen','top'],['Ahri','mid'],['LeeSin','jungle'],['Sejuani','jungle']]){
   state=core.selectGuide(null,{id,role,mode:'rift'});current={id,role,mode:'rift',positionKnown:true,comboKnown:true};
   live={...live,champion:id,level:12,gameTime:1600,enemies:[],allies:[],roster:[]};guide.publish();
   await until(()=>js('document.querySelector(".hero-coach h3")?.textContent.includes('+JSON.stringify(hero(id).name)+')'),'Solo role plan missing: '+id);
   const actions={};for(const stage of ['opening','key','later']){
    await change('#guide-stage',stage);
    actions[stage]=await js('document.querySelector(".hero-coach .coach-action").textContent');
    assert.equal(actions[stage],rolePlans.rolePlay(id,role,stage).action,id+':'+stage);
   }
   assert.equal(new Set(Object.values(actions)).size,3);soloRoleActions[id+':'+role]=actions;await capture(w,'guide-'+id+'-'+role+'-later.png');
  }
  report={passed:true,archiveSha256:release.archiveSha256,distinctOwnPlans:true,manualStageAffectsAction:true,publicTargetOnly:true,vanishedTargetCleared:true,newGameCleared:true,comboKept:true,threeDuoPhases:true,duoActions,actionGeometry,partnerRoleSwap:true,soloRoleActions,runeWrites};
 }
 assert.equal(runeWrites,0);await fs.writeFile(path.join(root,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'error.txt'),error.stack).catch(()=>{});for(const [i,w]of windows.entries())if(!w.isDestroyed())await fs.writeFile(path.join(root,'failure-'+i+'.png'),(await w.webContents.capturePage()).toPNG()).catch(()=>{});app.exit(1);});
