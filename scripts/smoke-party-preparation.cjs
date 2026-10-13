const {app,screen,globalShortcut,ipcMain,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),http=require('node:http'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],handlers=new Map(),attempts=[],results=[],writes=[];
let diagnosticMain,diagnosticSide;
app.setPath('userData',root);globalShortcut.register=()=>false;
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
global.fetch=async()=>{throw Error('External network disabled in isolated party fixture');};http.request=()=>{throw Error('Real sockets forbidden in isolated party fixture');};
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>{handlers.set(name,handler);handle(name,async(...args)=>{if(name==='prepare-selection')attempts.push(structuredClone(args[1]));const result=await handler(...args);if(name==='prepare-selection')results.push(structuredClone(result));return result;});};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<180;n++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile('release/latest.json')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),hero=id=>data.champions.find(c=>c.id===id),initial=JSON.parse(await fs.readFile(path.join(root,'settings.json'))),originalPlan=initial.draft.creativePlan,fixture=JSON.parse(await fs.readFile(path.join(root,'party-fixture.json'))),unadopted=process.env.RIFT_BUDDY_UNADOPTED==='1';
 assert.equal(fixture.unadopted,unadopted,'Wrapper and renderer fixture variants differ');
 let observer,phase='ChampSelect',gameflowId=0,gameId=471001,intent=0,picked=0,completed=false,spell1Id=4,spell2Id=12,requests=0,holdRune=true,resumeRune=null;
 const customGame=process.env.RIFT_BUDDY_CUSTOM_GAME==='1',loadingTransition=process.env.RIFT_BUDDY_LOADING_TRANSITION==='1',loadingNewGame=process.env.RIFT_BUDDY_LOADING_NEW_GAME==='1',rename=fs.rename;
 if(loadingTransition)fs.rename=async(from,to)=>{const result=await rename(from,to);if(String(to).endsWith('rift-buddy-3-mid-rift.json')){assert.ok(path.resolve(to).startsWith(root+path.sep));picked=intent;intent=0;completed=true;if(loadingNewGame)gameId++;gameflowId=gameId;phase='GameStart';}return result;};
 let page={id:44,name:'Isolated editable page',isEditable:true,isActive:true,current:true};
 const rawSession=()=>({gameId,localPlayerCellId:2,myTeam:[{cellId:0,championId:unadopted?0:hero('Camille').key,assignedPosition:'TOP'},{cellId:1,championId:unadopted?0:hero('Vi').key,assignedPosition:'JUNGLE'},{cellId:2,championId:picked,championPickIntent:intent,assignedPosition:'MIDDLE'},{cellId:3,championId:0,assignedPosition:'BOTTOM'},{cellId:4,championId:0,assignedPosition:'UTILITY'}],theirTeam:[],actions:[[{id:2,type:'pick',actorCellId:2,championId:intent||picked,completed,isInProgress:!completed}]],timer:{phase:'PLANNING',remainingMs:90000},bans:{myTeamBans:[],theirTeamBans:[]},allowDuplicatePicks:false});
 const output=options=>{
  requests++;assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  const method=options.method||'GET',route=options.path,body=options.body===undefined?undefined:JSON.parse(options.body);
  if(method==='GET'){
   if(route==='/lol-gameflow/v1/gameflow-phase')return phase;
   if(route==='/lol-gameflow/v1/session')return customGame?{gameData:{gameId:gameflowId,isCustomGame:true,queue:{id:0,gameMode:''}},map:{id:11,gameMode:'CLASSIC'}}:{gameData:{gameId:gameflowId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
   if(route==='/lol-champ-select/v1/session')return rawSession();
   if(route.endsWith('/pickable-champion-ids'))return data.champions.map(c=>c.key);
   if(route.endsWith('/disabled-champion-ids'))return [];
   if(route==='/lol-lobby/v2/lobby')return {members:[{puuid:'fixture-camille'},{puuid:'fixture-vi'},{puuid:'fixture-own',isLeader:true}]};
   if(route==='/lol-perks/v1/pages')return [page];
   if(route==='/lol-champ-select/v1/session/my-selection')return {spell1Id,spell2Id};
   if(route==='/data-store/v1/install-dir')return path.join(root,'client-fixture','LeagueClient');
  }
  writes.push({route,method,body});
  if(route==='/lol-champ-select/v1/session/actions/2'&&method==='PATCH'){assert.equal(body.completed,false,'Application must never lock a champion');intent=body.championId;return {};}
  if(route==='/lol-perks/v1/pages/44'&&method==='PUT'){page={...body,id:44,isEditable:true,isActive:true,current:true};return page;}
  if(route==='/lol-champ-select/v1/session/my-selection'&&method==='PATCH'){({spell1Id,spell2Id}=body);return {};}
  throw Error('Unsupported mocked route '+method+' '+route);
 };
 https.request=(options,callback)=>{const request=new EventEmitter();request.write=body=>{options.body=body;};request.end=()=>queueMicrotask(()=>{const send=()=>{try{const value=output(options),response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');request.emit('close');}catch(error){request.emit('error',error);}};if(holdRune&&options.method==='PUT'&&options.path==='/lol-perks/v1/pages/44')resumeRune=send;else send();});request.destroy=error=>{if(error)request.emit('error',error);};return request;};
 cp.spawn=file=>{assert.ok(file.endsWith('window-observer.exe'),'Unexpected native subprocess');observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
 cp.execFile=(file,args,options,callback)=>{assert.ok(file.endsWith('csc.exe'),'Unexpected native compilation');queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
 require(path.join(base,'electron/main.cjs'));
 let main,side;await until(()=>{main=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main window missing');diagnosticMain=main;
 const js=(window,code)=>window.webContents.executeJavaScript(code,true).catch(error=>{throw Error('Failed expression '+code,{cause:error});});
 const click=(window,selector)=>until(()=>js(window,'(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el||el.disabled)return false;el.click();return true;})()'),'Enabled control '+selector);
 const settled=()=>until(()=>js(side,'!document.querySelector(".companion-shell")?.textContent.includes("正在预选并配置")'),'Preparation renderer did not settle');
 const event=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
 const state=async()=>structuredClone((await handlers.get('bootstrap')(event(main))).state);
 const configurationState=value=>({preparations:value.preparations,flashSlot:value.preferences.flashSlot,guide:value.guide});
 const readonlyProbe=async(window,scope,before)=>{
  const controls=await js(window,'[...document.querySelectorAll('+JSON.stringify(scope+' button,'+scope+' select,'+scope+' input')+')].filter(el=>el.matches("select,input")||/^(?:companion-(?:summoner|rune|core|condition|skill|later)|build-(?:summoner|rune|core|condition|skill|later)|matchup-(?:rune|core|skill)|source-opponent-reset)/.test(el.dataset.action||"")).map(el=>({action:el.dataset.action,disabled:el.disabled}))');
  assert.ok(controls.length>5,'Readonly fixture needs complete configuration controls');assert.ok(controls.every(control=>control.disabled),'Readonly configuration exposes an enabled editor');
  const prefix=scope.includes('drawer')?'build':'companion';
  for(const selector of ['[data-action='+prefix+'-summoner][data-field=summoner-swap]','[data-rune-field]','[data-skill-index]','[data-action=matchup-rune]']){
   await js(window,'(()=>{document.querySelector("#toast").textContent="";const host=document.querySelector('+JSON.stringify(scope)+');let el=host.querySelector('+JSON.stringify(selector)+');if(!el){el=document.createElement("button");el.dataset.action="matchup-rune";host.append(el);}el.disabled=false;if(el.tagName==="SELECT"){el.value=[...el.options].find(o=>o.value!==el.value)?.value||el.value;el.dispatchEvent(new Event("change",{bubbles:true}));}else el.click();})()');
   await until(()=>js(window,'document.querySelector("#toast").textContent.includes("队友配置仅供查看")'),'Synthetic readonly editor event was not rejected');
   assert.deepEqual(configurationState(await state()),configurationState(before),'Readonly event changed saved configuration, Flash preference or guide');
  }
  await fs.writeFile(path.join(root,prefix+'-readonly.png'),(await window.webContents.capturePage()).toPNG());
 };
 await until(()=>js(main,'!!document.querySelector("[data-action=sync]")'),'Main UI missing');await until(()=>observer,'Native observer mock missing');
 const area=screen.getPrimaryDisplay().workArea,anchor={x:area.x+20,y:area.y+20,width:Math.max(600,area.width-500),height:Math.min(800,area.height-40)};
 observer.stdout.emit('data',JSON.stringify({client:{...screen.dipToScreenRect(null,anchor),foreground:false,minimized:false},game:null})+'\n');
 await click(main,'[data-action=sync]');await until(()=>{side=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('surface=companion'));return side;},'Independent sidebar missing');diagnosticSide=side;
 await until(()=>js(side,'!!document.querySelector(".companion-shell")'),'Sidebar UI missing');await click(side,'[data-action=sync]');
 if(customGame)assert.equal((await handlers.get('client-status')(event(side),false)).mode.id,'rift','Custom map was not recognized through the actual snapshot');
 const heroButton=unadopted?'[data-action=companion-preview][data-id=Galio]':'[data-action=active-hero-prepare][data-id=Galio]';
 await until(()=>js(side,'!!document.querySelector('+JSON.stringify(heroButton)+')'),'Galio recommendation missing');
 assert.equal((await state()).preferences.clickPrepare,true);assert.equal(attempts.length,0);
 const itemIds=value=>value.itemSet.blocks.flatMap(block=>block.items.map(item=>Number(item.id)));
 const ownPlan=async()=>{await click(side,'[data-action=companion-tab][data-tab=plan]');await until(()=>js(side,'!!document.querySelector("[data-action=client-prepare][data-preparation-view=companion]")'),'My plan controls missing');return js(side,'JSON.parse(document.querySelector("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]');};
 const mockedRuneWrites=()=>writes.filter(w=>w.route.startsWith('/lol-perks/v1/pages/')).length;
 if(process.env.RIFT_BUDDY_STANDALONE_ITEMS==='1'){
  const prepared=await ownPlan();assert.equal(prepared.champion,'Galio');
  assert.equal(await js(side,'!!document.querySelector(".companion-plan-summary")'),true,'Adopted own plan must be visible before hovering');
  intent=hero('Galio').key;await click(side,'[data-action=sync]');await until(()=>js(side,'!document.querySelector("[data-action=sync]")?.textContent.includes("连接中")'),'Public hover sync pending');await delay(250);
  assert.equal((await ownPlan()).champion,'Galio','Matching client hover replaced the adopted task');
  assert.equal(await js(side,'document.querySelector("[data-companion-field=loadout]").dataset.plan'),'Galio:mid:rift','Editor and task target split');
  await click(main,'.slot-config[data-id=Galio][data-role=mid]');await until(()=>js(main,'!!document.querySelector(".drawer [data-action=import-item-set]")'),'Own drawer missing');
  await click(main,'.drawer [data-action=import-item-set]');
  for(const win of [main,side]){
   await until(()=>js(win,'document.querySelector(":is(.preparation-task,.client-preparation-result) [data-preparation-step=items]")?.dataset.stepStatus==="done"'),'Independent item receipt missing');
   assert.equal(await js(win,'document.querySelectorAll(":is(.preparation-task,.client-preparation-result) [data-step-status=done]").length'),1,'Item-only write implied other steps completed');
   assert.match(await js(win,'document.querySelector(".item-set-status")?.textContent||""'),/已写入|已更新/);
  }
  assert.equal(attempts.length,0);assert.equal(writes.length,0,'Independent item import wrote to client selection or runes');
  const previousSide=side;previousSide.destroy();await click(main,'[data-action=close]');await click(main,'[data-action=companion-attach]');
  await until(()=>{side=windows.find(w=>w!==previousSide&&!w.isDestroyed()&&w.webContents.getURL().includes('surface=companion'));return side;},'Sidebar did not rebuild');diagnosticSide=side;
  await until(()=>js(side,'!!document.querySelector(".companion-shell")'),'Rebuilt sidebar UI missing');await ownPlan();await until(()=>js(side,'document.querySelector(":is(.preparation-task,.client-preparation-result) [data-preparation-step=items]")?.dataset.stepStatus==="done"'),'Item-only receipt was lost on rebuild');
  assert.equal(await js(side,'document.querySelectorAll(":is(.preparation-task,.client-preparation-result) [data-step-status=done]").length'),1);
  // A new manual client hover supersedes the accepted hero, without applying
  // anything or carrying the previous hero's equipment receipt forward.
  intent=hero('Ashe').key;await click(side,'[data-action=sync]');
  await until(async()=>(await ownPlan()).champion==='Ashe','New client hover did not update the current configuration');
  assert.equal(await js(side,'document.querySelectorAll(":is(.preparation-task,.client-preparation-result) [data-step-status=done]").length'),0,'New hover inherited the previous hero receipt');
  gameId++;intent=0;await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');
  await until(()=>js(side,'!document.querySelector(":is(.preparation-task,.client-preparation-result) [data-step-status=done]")'),'Item receipt leaked into next game');
  assert.equal(writes.length,0);console.log('PASS independent item import: both windows, matching-hover retention, new-hover configuration, snapshot replay, new-game reset; all client writes mocked and none issued');app.quit();return;
 }
 if(unadopted){
  const beforeReadonly=await state(),beforeReadonlyWrites=writes.length;
  await click(side,'[data-action=companion-preview][data-id=Camille]');
  await until(()=>js(side,'document.querySelector(".companion-preview")?.textContent.includes("队友配置 · 只读")'),'Teammate preview is not labeled readonly');
  await readonlyProbe(side,'.companion-content',beforeReadonly);assert.equal(writes.length,beforeReadonlyWrites,'Readonly preview wrote to the client');
  await click(side,'[data-action=companion-tab][data-tab=recommend]');
  const expected=fixture.candidateValue,assertConfiguration=(value,label)=>{assert.deepEqual(value.page,expected.page,label+' changed the full rune page');assert.deepEqual(value.summoners,expected.summoners,label+' changed D/F');assert.deepEqual(value.itemSet.blocks,expected.itemSet.blocks,label+' changed the full equipment plan');};
  const assertStoredSolo=async()=>{const current=await state();if(!attempts.length)assert.equal(current.draft.creativePlan,undefined);else if(current.draft.creativePlan)assert.ok(current.draft.creativePlan.members.some(m=>m.champion==='Galio'&&m.role==='mid'),'Candidate click adopts the same concrete party plan');assert.deepEqual(current.preparations.find(p=>p.id==='Galio'&&p.role==='mid'&&p.mode==='rift'&&!p.comboId),fixture.oldSolo,'Candidate flow overwrote the saved solo configuration');return current;};
  assert.equal(originalPlan,undefined);assert.deepEqual(initial.preparations,[fixture.oldSolo]);assert.ok(initial.draft.slots.every(s=>s.champion===null));
  assert.deepEqual(initial.draft.slots.filter(s=>s.party).map(s=>s.role),['top','jungle','mid']);
  assert.equal(fixture.oldSoloValue.page.selectedPerkIds[0],8230);assert.equal(expected.page.selectedPerkIds[0],8439);
  assert.notDeepEqual(expected.page,fixture.oldSoloValue.page);assert.notDeepEqual(expected.summoners,fixture.oldSoloValue.summoners);assert.notDeepEqual(expected.itemSet.blocks,fixture.oldSoloValue.itemSet.blocks);
  assert.ok((await assertStoredSolo()).draft.slots.every(s=>s.champion===null),'Client sync filled unknown teammate picks');
  const candidate=await js(side,'(()=>{const el=document.querySelector("[data-action=companion-preview][data-id=Galio]");return {combo:el.dataset.combo,members:[...el.closest(".companion-candidate").querySelectorAll("[data-action=companion-preview]")].map(member=>member.dataset.role+":"+member.dataset.id)};})()');
  assert.equal(candidate.combo,'camille-galio-vi');assert.deepEqual(candidate.members,['top:Camille','jungle:Vi','mid:Galio']);
  // Use the real candidate button, renderer and preparation service. The
  // fixture does not inject a guide/party plan; the one hero click adopts it.
  await click(side,'[data-action=companion-preview][data-id=Galio]');await until(()=>resumeRune,'Unadopted candidate click did not reach the mock rune write');
  assertConfiguration(attempts[0],'Initial candidate click');assert.equal(attempts[0].sessionGameId,String(gameId));assert.equal(attempts[0].context.gameId,String(gameId));
  resumeRune();holdRune=false;await until(()=>results.length===1,'Unadopted candidate did not prepare');assert.equal(results[0].complete,true);
  if(loadingTransition){
   await until(()=>side.isDestroyed(),'Loading did not release the selection sidebar');
   const current=JSON.parse(await fs.readFile(path.join(root,'settings.json'))),prepared=current.preparations.find(p=>p.id==='Galio'&&p.comboId&&p.creativePlan?.curated?.id===candidate.combo);
   if(current.draft.creativePlan)assert.ok(current.draft.creativePlan.members.some(m=>m.champion==='Galio'));assert.deepEqual(current.preparations.find(p=>p.id==='Galio'&&!p.comboId),fixture.oldSolo);assert.equal(mockedRuneWrites(),1);
   if(loadingNewGame){assert.equal(prepared,undefined);assert.ok(!current.guide||String(current.guide.match?.gameId)!==String(gameId),'A previous-game click installed a guide in the new game');}
   else{
    assert.ok(prepared,'Loading lost the completed candidate configuration');assert.ok(current.guide,'Loading lost the current guide');assert.equal(current.guide.selection.comboId,prepared.comboId);assert.equal(String(current.guide.match.gameId),String(gameId));
    const builds=JSON.parse(await fs.readFile(path.join(base,'data/builds.json'))).entries,build=require(path.join(base,'src/core/builds.mjs')).getBuild(hero('Galio'),'mid',{...data,builds},current.guide.selection);
    assert.deepEqual(build.runePage,expected.page);assert.deepEqual(build.summoners,expected.summoners);assert.equal(build.items.length,6);
   }
   const imported=JSON.parse(await fs.readFile(path.join(root,'client-fixture','Game','Config','Global','Recommended','rift-buddy-3-mid-rift.json')));assert.deepEqual(imported.blocks,expected.itemSet.blocks);assert.ok(writes.filter(w=>w.route.includes('/session/actions/')).every(w=>w.body.completed===false));
   const report={passed:true,source,archiveSha256:release?.archiveSha256||null,variant:loadingNewGame?'loading-new-game':'loading-transition',realRuneWrites:0,mockedRuneWrites:mockedRuneWrites(),allNetworkMocked:true,complete:results[0].complete,sideDestroyed:side.isDestroyed(),candidateConfigurationSaved:!!prepared,currentGuide:current.guide,oldSoloConfigurationPreserved:true,newGameGuideRejected:loadingNewGame,requests};await fs.writeFile(path.join(root,'party-preparation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.quit();return;
  }
  await settled();
  assert.equal(picked,0);assert.equal(intent,hero('Galio').key);assert.equal(completed,false);assert.equal(mockedRuneWrites(),1);
  assertConfiguration(await ownPlan(),'Pending player hover');let clickedConfiguration;await until(async()=>{const current=await assertStoredSolo();clickedConfiguration=current.preparations.find(p=>p.id==='Galio'&&p.comboId&&p.creativePlan?.curated?.id===candidate.combo);return !!clickedConfiguration;},'Candidate combination was not retained separately from the solo preference');
  // Returning from recommendations and a stale gameflow response cannot
  // manufacture a known lineup or silently switch to the old solo default.
  const afterClick=writes.length;await click(side,'[data-action=companion-tab][data-tab=recommend]');assertConfiguration(await ownPlan(),'Returned pending hover');
  gameflowId=470000;await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');assertConfiguration(await ownPlan(),'Hover after client sync');await assertStoredSolo();assert.equal(writes.length,afterClick,'Hover navigation or sync reapplied the configuration');
  // Only the simulated player confirms Galio. Both real renderers must
  // display the same full preparation even with every teammate pick unknown.
  picked=intent;intent=0;completed=true;await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');
  await until(()=>js(main,'document.querySelector(":is(.preparation-task,.client-preparation-result) [data-preparation-step=runes]")?.dataset.stepStatus==="done"'),'Confirming the unadopted hero lost the rune confirmation');
  assertConfiguration(await ownPlan(),'Sidebar after player confirmation');await click(main,'[data-action=task-edit]');
  const confirmed=await js(main,'JSON.parse(document.querySelector("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]');assertConfiguration(confirmed,'Main drawer after player confirmation');await click(main,'[data-action=close]');
  const confirmedState=await assertStoredSolo();assert.ok(confirmedState.draft.slots.filter(s=>s.role!=='mid').every(s=>!Number.isInteger(s.clientCellId)),'Proposed teammate heroes must not become confirmed public picks');assert.ok(rawSession().myTeam.filter(p=>p.cellId!==2).every(p=>p.championId===0));assert.equal(writes.length,afterClick,'Player confirmation performed an application write');
  await click(main,'[data-action=navigate][data-route=favorites]');await click(main,'[data-action=navigate][data-route=draft]');await click(side,'[data-action=companion-tab][data-tab=recommend]');assertConfiguration(await ownPlan(),'Navigation after confirmation');assert.equal(writes.length,afterClick,'Navigation reapplied the unadopted configuration');await assertStoredSolo();
  const stale=structuredClone(attempts[0]);gameId++;picked=0;intent=0;completed=false;
  await assert.rejects(handlers.get('prepare-selection')(event(side),stale),/选人会话已变化/);assert.equal(writes.length,afterClick,'Previous-game unadopted click performed a write');
  await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');await until(async()=>String((await state()).draft.clientGameId)===String(gameId),'New selection did not replace unadopted draft context');await until(()=>js(main,'!(document.querySelector(":is(.preparation-task,.client-preparation-result) [data-preparation-step=runes]")?.dataset.stepStatus==="done")'),'Previous unadopted rune confirmation survived a new session');await assertStoredSolo();
  const imported=JSON.parse(await fs.readFile(path.join(root,'client-fixture','Game','Config','Global','Recommended','rift-buddy-3-mid-rift.json')));assert.deepEqual(imported.blocks,expected.itemSet.blocks);
  assert.equal(attempts.length,1);assert.equal(results.length,1);assert.equal(mockedRuneWrites(),1);assert.ok(writes.filter(w=>w.route.includes('/session/actions/')).every(w=>w.body.completed===false));assert.ok(windows.every(w=>w.isDestroyed()||!w.isVisible()));
  const report={passed:true,source,archiveSha256:release?.archiveSha256||null,variant:'unadopted',acceptedPlanId:null,candidatePlanId:clickedConfiguration.comboId,candidateMembers:candidate.members,oldSoloConfiguration:fixture.oldSoloValue,defaultHeroClickPrepares:true,candidateClickDoesNotAdopt:true,teammateChampionsRemainUnknown:true,hoverRemainsUnlocked:true,sessionIdOverridesZeroAndPreviousGameflow:true,sameFullConfigurationAfterHover:true,sameConfigurationAfterPlayerConfirm:true,oldSoloConfigurationPreserved:true,playerConfirmationDoesNotWrite:true,navigationDoesNotWrite:true,previousSessionRejectedBeforeWrites:true,realGame:'UNPROVEN',realRuneWrites:0,mockedRuneWrites:mockedRuneWrites(),allNetworkMocked:true,requests,attempts,results,writes};
  await fs.writeFile(path.join(root,'party-preparation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,attempts:attempts.map(value=>({gameId:value.sessionGameId,perks:value.page.selectedPerkIds,summoners:value.summoners,itemIds:itemIds(value)})),writes:undefined},null,2));app.quit();return;
 }
 // The actual recommendation click uses the production prepare service and
 // loopback mocks, including its 0 -> intent transition and disk item import.
 await click(side,heroButton);await until(()=>resumeRune,'Hero click did not reach the mock rune write');
 const prepareEditingDisabled=await js(side,'!document.querySelector("[data-action=companion-summoner][data-field=summoner-swap]")||document.querySelector("[data-action=companion-summoner][data-field=summoner-swap]")?.disabled');
 if(!prepareEditingDisabled){await click(side,'[data-action=companion-summoner][data-field=summoner-swap]');await until(async()=>{const s=await state();return s.preparations.some(p=>p.id==='Galio'&&JSON.stringify(p.summonerIds)===JSON.stringify([...attempts[0].summoners].reverse()));},'Explicit preparation-time edit did not save');}
 resumeRune();holdRune=false;await until(()=>results.length===1,'Hero click did not prepare by default');assert.equal(results[0].complete,true);await settled();
 await until(()=>js(side,'!document.querySelector("[data-action=client-prepare]")?.disabled'),'First preparation did not become idle');
 assert.equal(picked,0);assert.equal(intent,hero('Galio').key);assert.equal(completed,false);
 const perks=[8439,8463,8473,8242,8306,8347,5007,5008,5001];
 assert.deepEqual(attempts[0].page.selectedPerkIds,perks);assert.equal(attempts[0].sessionGameId,String(gameId));assert.equal(attempts[0].context.gameId,String(gameId));
 assert.ok(itemIds(attempts[0]).includes(3152));assert.ok(itemIds(attempts[0]).includes(4005));
 const firstMyPlan=await ownPlan();assert.deepEqual(firstMyPlan.page.selectedPerkIds,perks);assert.deepEqual(firstMyPlan.itemSet.blocks,attempts[0].itemSet.blocks);
 if(!prepareEditingDisabled){assert.deepEqual(firstMyPlan.summoners,[...attempts[0].summoners].reverse(),'Preparation completion overwrote a newer explicit D/F edit');await click(side,'[data-action=companion-summoner][data-field=summoner-swap]');await until(async()=>JSON.stringify((await ownPlan()).summoners)===JSON.stringify(attempts[0].summoners),'Could not restore the initial D/F choice');}
 // Gameflow is still the previous game. It cannot clear the accepted lineup
 // or the current click's configuration when the session ID is authoritative.
 gameflowId=470000;await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');assert.equal((await state()).draft.creativePlan.id,originalPlan.id);
 await ownPlan();await click(side,'[data-action=client-prepare][data-preparation-view=companion]');await until(()=>results.length===2,'Second preparation missing');assert.equal(results[1].complete,true);await settled();
 assert.deepEqual(attempts[1].page.selectedPerkIds,perks);assert.deepEqual(attempts[1].itemSet.blocks,attempts[0].itemSet.blocks);assert.deepEqual(attempts[1].summoners,attempts[0].summoners);
 // Edit D/F in one renderer; the other renderer must retain the same combo
 // and its equipment while observing the explicit personal choice.
 const beforeConfiguration=writes.length;await click(main,'.slot-config[data-id=Galio][data-role=mid]');await until(()=>js(main,'!!document.querySelector("[data-client-preparation-fingerprint]")'),'Main Galio drawer missing');assert.equal(writes.length,beforeConfiguration,'Viewing slot configuration must not prepare');
 await ownPlan();await click(side,'[data-action=companion-summoner][data-field=summoner-swap]');
 const swapped=[...attempts[0].summoners].reverse();await until(async()=>{const s=await state();return s.preparations.some(p=>p.id==='Galio'&&p.comboId===originalPlan.id&&JSON.stringify(p.summonerIds)===JSON.stringify(swapped));},'D/F personal choice was not saved');
 await until(()=>js(main,'JSON.stringify(JSON.parse(document.querySelector("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0].summoners)==='+JSON.stringify(JSON.stringify(swapped))),'Already-open main drawer did not accept the other window D/F choice');
 const mainPlan=await js(main,'JSON.parse(document.querySelector("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]');assert.deepEqual(mainPlan.summoners,swapped);assert.deepEqual(mainPlan.page.selectedPerkIds,perks);assert.deepEqual(mainPlan.itemSet.blocks,attempts[0].itemSet.blocks);await click(main,'[data-action=close]');
 await click(main,'.slot-config[data-id=Galio][data-role=mid]');assert.equal(writes.length,beforeConfiguration,'Reopening slot configuration must not prepare');
 const remoteRune=await js(side,'document.querySelector("[data-action=companion-rune][data-id^=source-8230]")?.dataset.id');assert.ok(remoteRune);await click(side,'[data-action=companion-rune][data-id="'+remoteRune+'"]');
 await until(()=>js(main,'JSON.parse(document.querySelector("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0].page.selectedPerkIds[0]===8230'),'Open main drawer lost the remote rune choice');
 await click(main,'[data-action=build-summoner][data-field=summoner-swap]');await until(async()=>{const s=await state(),p=s.preparations.find(p=>p.id==='Galio'&&p.comboId===originalPlan.id);return p?.runeId===remoteRune&&JSON.stringify(p.summonerIds)===JSON.stringify(attempts[0].summoners);},'Main local D/F save rolled back the remote rune choice');
 await until(async()=>{const value=await ownPlan();return value.page.selectedPerkIds[0]===8230&&JSON.stringify(value.summoners)===JSON.stringify(attempts[0].summoners);},'Pending sidebar hover did not accept another window personal edit');await click(main,'[data-action=close]');
 await js(side,'(()=>{const el=document.querySelector("[data-companion-field=rune]");el.value="curated-aftershock";el.dispatchEvent(new Event("change",{bubbles:true}));})()');await click(side,'[data-action=companion-summoner][data-field=summoner-swap]');await until(async()=>{const value=await ownPlan();return value.page.selectedPerkIds[0]===8439&&JSON.stringify(value.summoners)===JSON.stringify(swapped);},'Could not restore the curated configuration with personal D/F');
 await ownPlan();await click(side,'[data-action=client-prepare][data-preparation-view=companion]');await until(()=>results.length===3,'Swapped preparation missing');assert.equal(results[2].complete,true);await settled();assert.deepEqual(attempts[2].summoners,swapped);assert.deepEqual(attempts[2].page.selectedPerkIds,perks);assert.deepEqual(attempts[2].itemSet.blocks,attempts[0].itemSet.blocks);
 // The main draft avatar is an explicit hero click too. Configuration buttons
 // remain read-only, while this click must prepare the shared personal plan.
 await click(main,'.champ-pick[data-id=Galio][data-role=mid][data-prepare-click=true]');await until(()=>results.length===4,'Main avatar click did not prepare by default');assert.equal(results[3].complete,true);await until(()=>js(main,'!!document.querySelector("[data-client-preparation-fingerprint]")&&!document.querySelector("[data-action=client-prepare][data-preparation-view=build]")?.disabled'),'Main avatar preparation did not become idle');
 assert.deepEqual(attempts[3].summoners,swapped);assert.deepEqual(attempts[3].page.selectedPerkIds,perks);assert.deepEqual(attempts[3].itemSet.blocks,attempts[0].itemSet.blocks);assert.equal(picked,0);assert.equal(intent,hero('Galio').key);assert.equal(completed,false);assert.equal(await js(main,'!!document.querySelector(".drawer")'),false,'Hero preparation keeps the current task instead of opening a long drawer');
 await until(async()=>{const value=await ownPlan();return value.page.selectedPerkIds[0]===8439&&JSON.stringify(value.summoners)===JSON.stringify(swapped);},'Main avatar click changed the shared sidebar configuration');
 // Teammate detail remains read-only; rebuilding a native sidebar replays receipts.
 const beforeReadonly=writes.length,beforeReadonlyState=await state();await click(main,'.slot-config[data-id=Vi][data-role=jungle]');
 await until(()=>js(main,'!!document.querySelector(".drawer")'),'Teammate drawer missing');
 assert.equal(await js(main,'[...document.querySelectorAll(".drawer [data-action=client-prepare],.drawer [data-action=apply-runes],.drawer [data-action=import-item-set]")].some(el=>!el.disabled)'),false,'Teammate preview offers a client write');
 await readonlyProbe(main,'.drawer',beforeReadonlyState);
 await click(main,'[data-action=close]');assert.equal(writes.length,beforeReadonly);
 const previousSide=side;previousSide.destroy();await click(main,'[data-action=companion-attach]');
 await until(()=>{side=windows.find(w=>w!==previousSide&&!w.isDestroyed()&&w.webContents.getURL().includes('surface=companion'));return side;},'Native sidebar did not rebuild');diagnosticSide=side;
 await until(()=>js(side,'document.querySelectorAll(":is(.preparation-task,.client-preparation-result) [data-step-status=done]").length===4'),'Rebuilt sidebar lost current four-step receipts');
 assert.equal(writes.length,beforeReadonly,'Rebuilding a sidebar reapplied the configuration');
 // Simulate an alternate route accepted in the other window. Its different
 // identity must replace the old pending hover configuration through onState.
 const save=handlers.get('save-state'),mainEvent=event(main),beforeRoute=writes.length,routeBase=await state(),alternate=structuredClone(routeBase);alternate.draft.creativePlan=fixture.alternativePlan;
 const routeAccepted=await save(mainEvent,alternate,routeBase);await until(async()=>{const value=await ownPlan();return value.page.selectedPerkIds[0]===fixture.alternativeValue.page.selectedPerkIds[0];},'Alternate route retained previous hover runes');
 const alternateValue=await ownPlan();assert.equal(alternateValue.page.selectedPerkIds[0],8230);assert.deepEqual(alternateValue.page.selectedPerkIds,fixture.alternativeValue.page.selectedPerkIds);assert.deepEqual(alternateValue.summoners,swapped,'New route must respect the saved player Flash key');assert.equal((await state()).preferences.flashSlot,swapped[0]==='SummonerFlash'?'d':'f');assert.deepEqual(alternateValue.itemSet.blocks,fixture.alternativeValue.itemSet.blocks);assert.equal(writes.length,beforeRoute,'Accepting a route must not reapply a preparation');
 const restored=structuredClone(routeAccepted.state);restored.draft.creativePlan=originalPlan;await save(mainEvent,restored,routeAccepted.state);await until(async()=>{const value=await ownPlan();return value.page.selectedPerkIds[0]===8439&&JSON.stringify(value.summoners)===JSON.stringify(swapped);},'Returning to the original route lost its personal choices');
 // Only the fixture's simulated player confirms the selection.
 picked=intent;intent=0;completed=true;await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');
 await until(()=>js(main,'document.querySelector(":is(.preparation-task,.client-preparation-result) [data-preparation-step=runes]")?.dataset.stepStatus==="done"'),'Confirming the same hero lost the rune confirmation');
 await click(main,'[data-action=task-edit]');const confirmedPlan=await js(main,'JSON.parse(document.querySelector("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]');assert.deepEqual(confirmedPlan.summoners,swapped);assert.deepEqual(confirmedPlan.page.selectedPerkIds,perks);assert.deepEqual(confirmedPlan.itemSet.blocks,attempts[0].itemSet.blocks);await click(main,'[data-action=close]');
 const beforeNavigation=writes.length;await click(main,'[data-action=navigate][data-route=favorites]');await click(main,'[data-action=navigate][data-route=draft]');await ownPlan();assert.equal(writes.length,beforeNavigation,'Navigation must not reapply a preparation');
 const stale=structuredClone(attempts[2]),beforeNewGame=writes.length;gameId++;picked=0;intent=0;completed=false;
 await assert.rejects(handlers.get('prepare-selection')({sender:side.webContents,senderFrame:side.webContents.mainFrame},stale),/选人会话已变化/);assert.equal(writes.length,beforeNewGame,'Stale previous-game click performed a write');
 await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');await until(async()=>String((await state()).draft.clientGameId)===String(gameId),'New selection did not replace draft game context');await until(()=>js(main,'!(document.querySelector(":is(.preparation-task,.client-preparation-result) [data-preparation-step=runes]")?.dataset.stepStatus==="done")'),'Previous-game rune confirmation survived a new session');
 const imported=JSON.parse(await fs.readFile(path.join(root,'client-fixture','Game','Config','Global','Recommended','rift-buddy-3-mid-rift.json')));assert.deepEqual(imported.blocks,attempts[0].itemSet.blocks);
 assert.equal(mockedRuneWrites(),4);assert.ok(writes.filter(w=>w.route.includes('/session/actions/')).every(w=>w.body.completed===false));assert.ok(windows.every(w=>w.isDestroyed()||!w.isVisible()));
 const report={passed:true,source,archiveSha256:release?.archiveSha256||null,variant:'accepted',acceptedPlanId:originalPlan.id,defaultHeroClickPrepares:true,mainAvatarClickPrepares:true,configurationButtonsDoNotWrite:true,teammatePreviewReadOnly:true,nativeSidebarReplaysReceiptsWithoutWrites:true,prepareEditingDisabled,prepareTimeEditPreserved:!prepareEditingDisabled,hoverRemainsUnlocked:true,sessionIdOverridesZeroAndPreviousGameflow:true,sameFullConfigurationAfterHover:true,personalSummonerSwapAcrossWindows:true,openDrawerPreservesRemoteRuneAndLocalSummoners:true,pendingHoverAcceptsOtherWindowEdits:true,alternateRouteDoesNotReusePendingHover:true,returningRouteKeepsPersonalChoices:true,sameConfigurationAfterPlayerConfirm:true,navigationDoesNotWrite:true,previousSessionRejectedBeforeWrites:true,realGame:'UNPROVEN',realRuneWrites:0,mockedRuneWrites:mockedRuneWrites(),allNetworkMocked:true,requests,attempts,results,writes};
 await fs.writeFile(path.join(root,'party-preparation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,attempts:attempts.map(value=>({gameId:value.sessionGameId,perks:value.page.selectedPerkIds,summoners:value.summoners,itemIds:itemIds(value)})),writes:undefined},null,2));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'party-preparation-error.txt'),error.stack).catch(()=>{});await fs.writeFile(path.join(root,'party-preparation-failure.json'),JSON.stringify({attempts,results,writes},null,2));for(const [name,window] of [['main',diagnosticMain],['sidebar',diagnosticSide]])if(window&&!window.isDestroyed())await fs.writeFile(path.join(root,'failure-'+name+'.html'),await window.webContents.executeJavaScript('document.documentElement.outerHTML').catch(()=>''));app.exit(1);});


