const {app,screen,globalShortcut,ipcMain,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),http=require('node:http'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],handlers=new Map(),attempts=[],results=[],writes=[],checks=[];
let main,side,report;
app.setPath('userData',root);globalShortcut.register=()=>false;
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
global.fetch=async()=>{throw Error('External network disabled in isolated startup fixture');};
http.request=()=>{throw Error('Real sockets forbidden in isolated startup fixture');};
global.WebSocket=class{constructor(){throw Error('Real relay connections forbidden in isolated startup fixture');}};
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>{handlers.set(name,handler);handle(name,async(...args)=>{if(name==='prepare-selection')attempts.push(structuredClone(args[1]));const result=await handler(...args);if(name==='prepare-selection')results.push(structuredClone(result));return result;});};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=18000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await delay(100);}throw Error(label);}
async function checkpoint(name,run){try{await run();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,message:error.message});console.error('FAIL '+name+': '+error.message);}}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile('release/latest.json')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),hero=id=>data.champions.find(champion=>champion.id===id),initial=JSON.parse(await fs.readFile(path.join(root,'settings.json')));
 assert.equal(initial.preferences.autoSync,true);assert.equal(initial.preferences.clickPrepare,true);assert.equal(initial.draft.playerPosition,undefined);assert.equal(initial.draft.soloRole,'');assert.equal(initial.draft.slots.filter(slot=>slot.champion).length,5,'Startup fixture needs a saved local lineup on every lane');
 let observer,phase='Offline',queueId=430,gameId=530001,intent=0,picked=0,friendIntent=0,completed=false,requests=0,spell1Id=12,spell2Id=4;
 let page={id:44,name:'Synthetic editable page',isEditable:true,isActive:true,current:true};
 const ownIdentity={puuid:'startup-synthetic-own-identity',summonerId:530001,gameName:'合成测试本人',tagLine:'TEST'},friendIdentity={puuid:'startup-synthetic-friend-identity',summonerId:530002,gameName:'合成测试队友',tagLine:'TEST'};
 const rawSession=()=>({gameId,localPlayerCellId:2,myTeam:[{cellId:0,championId:0,championPickIntent:friendIntent,assignedPosition:'',...friendIdentity},{cellId:1,championId:0,championPickIntent:0,assignedPosition:''},{cellId:2,championId:picked,championPickIntent:intent,assignedPosition:'',spell1Id,spell2Id,...ownIdentity},{cellId:3,championId:0,championPickIntent:0,assignedPosition:''},{cellId:4,championId:0,championPickIntent:0,assignedPosition:''}],theirTeam:[],actions:[[{id:22,type:'pick',actorCellId:2,championId:intent||picked,completed,isInProgress:!completed}]],timer:{phase:'PLANNING',adjustedTimeLeftInPhase:90000},bans:{myTeamBans:[],theirTeamBans:[]},allowDuplicatePicks:false});
 const output=options=>{
  requests++;assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  const method=options.method||'GET',route=options.path,body=options.body===undefined?undefined:JSON.parse(options.body);
  if(phase==='Offline')throw Error('Synthetic client not running yet');
  if(method==='GET'){
   if(route==='/lol-gameflow/v1/gameflow-phase')return phase;
   if(route==='/lol-gameflow/v1/session')return {gameData:{gameId:phase==='ChampSelect'?gameId:0,mapId:11,isCustomGame:queueId===0,queue:{id:queueId,gameMode:queueId===0?'':'CLASSIC'}},map:{id:11,gameMode:'CLASSIC'}};
   if(route==='/lol-lobby/v2/lobby')return {localMember:{...ownIdentity,isLeader:true},members:[{...ownIdentity,isLeader:true},friendIdentity]};
   if(route==='/lol-champ-select/v1/session')return rawSession();
   if(route.endsWith('/pickable-champion-ids'))return data.champions.map(champion=>champion.key);
   if(route.endsWith('/disabled-champion-ids'))return [];
   if(route==='/lol-perks/v1/pages')return [page];
   if(route==='/lol-champ-select/v1/session/my-selection')return {spell1Id,spell2Id};
   if(route==='/data-store/v1/install-dir')return path.join(root,'client-fixture','LeagueClient');
  }
  writes.push({route,method,body});
  if(route==='/lol-champ-select/v1/session/actions/22'&&method==='PATCH'){assert.equal(completed,false,'Locked champion must never be replaced');assert.equal(body.completed,false,'The helper must never lock a champion');picked=0;intent=body.championId;return {};}
  if(route==='/lol-perks/v1/pages/44'&&method==='PUT'){page={...body,id:44,isEditable:true,isActive:true,current:true};return page;}
  if(route==='/lol-champ-select/v1/session/my-selection'&&method==='PATCH'){({spell1Id,spell2Id}=body);return {};}
  throw Error('Unsupported synthetic route '+method+' '+route);
 };
 https.request=(options,callback)=>{const request=new EventEmitter();request.write=body=>{options.body=body;};request.end=()=>queueMicrotask(()=>{try{const value=output(options),response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');request.emit('close');}catch(error){request.emit('error',error);}});request.destroy=error=>{if(error)request.emit('error',error);};return request;};
 cp.spawn=file=>{assert.ok(file.endsWith('window-observer.exe'),'Unexpected native subprocess');observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
 cp.execFile=(file,args,options,callback)=>{assert.ok(file.endsWith('csc.exe'),'Unexpected native compilation');queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
 require(path.join(base,'electron/main.cjs'));
 await until(()=>{main=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().endsWith('/src/index.html'));return main;},'Main window missing');
 const js=(window,code)=>window.webContents.executeJavaScript(code,true),event=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
 const bootstrap=()=>handlers.get('bootstrap')(event(main)),state=async()=>(await bootstrap()).state,client=async()=>(await bootstrap()).client;
 const click=async(window,selector)=>{assert.ok(!selector.includes('data-action=sync'),'This regression may not click manual sync');await until(()=>js(window,'(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el||el.disabled)return false;el.click();return true;})()'),'Enabled control missing: '+selector);};
 const change=async(window,selector,value)=>{await until(()=>js(window,'(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el&&'+JSON.stringify(selector)+'==="#solo-role")document.querySelector("[data-action=companion-tab][data-tab=recommend]")?.click();return !!el&&!el.disabled;})()'),'Enabled role control missing: '+selector);return js(window,'(()=>{const el=document.querySelector('+JSON.stringify(selector)+');el.value='+JSON.stringify(value)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');};
 const capture=async(window,name)=>{await js(window,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(root,name),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());report.screenshots=[...(report.screenshots||[]),name];};
 const fresh=async predicate=>until(async()=>predicate(await client()),'Automatic client snapshot did not follow the synthetic phase/selection');
 await until(()=>js(main,'!!window.buddy&&!!document.querySelector("#solo-role")'),'Main draft UI missing');await until(()=>observer,'Observer mock missing');
 const area=screen.getPrimaryDisplay().workArea,anchor={x:area.x+20,y:area.y+20,width:Math.max(600,area.width-500),height:Math.min(800,area.height-40)};
 observer.stdout.emit('data',JSON.stringify({client:{...screen.dipToScreenRect(null,anchor),foreground:false,minimized:false},game:null})+'\n');
 await fresh(snapshot=>requests>0&&snapshot.connected===false&&snapshot.phase==='Offline');
 await checkpoint('visible-disconnected-notice',async()=>{
  await capture(main,'offline-reminder.png');
  const notice=await js(main,'(()=>{const el=document.querySelector("[data-client-connection-status]");if(!el)return null;const rect=el.getBoundingClientRect(),style=getComputedStyle(el);return {text:el.textContent,visible:rect.width>0&&rect.height>0&&rect.top<innerHeight&&rect.bottom>0&&style.visibility!=="hidden"&&style.display!=="none"};})()');
  assert.ok(notice?.visible,'A visible connection reminder must appear before a client exists');assert.match(notice.text,/未连接|未发现|等待|查找|连接客户端|检查客户端/);
 });
 assert.equal(writes.length,0,'Automatic startup must not write selections or runes');
 phase='Lobby';await fresh(snapshot=>snapshot.connected&&snapshot.phase==='Lobby'&&snapshot.party?.lobbyCount===2);
 checks.push({name:'offline-to-lobby-without-manual-sync',passed:true});
 await checkpoint('lobby-party-range-without-checking-positions',async()=>{
  await until(async()=>(await state()).draft.slots.filter(slot=>slot.party).length===2,'Two lobby members did not automatically select two recommendation positions');
 });
 phase='ChampSelect';await fresh(snapshot=>snapshot.connected&&snapshot.phase==='ChampSelect'&&snapshot.party?.status==='known'&&snapshot.party.lobbyCount===2);
 await until(()=>{side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));return side;},'Automatic sidebar missing');
 await until(()=>js(side,'!!document.querySelector(".companion-shell")'),'Sidebar shell missing');
 await checkpoint('saved-five-lane-lineup-keeps-two-person-range',async()=>{
  await until(async()=>(await state()).draft.slots.filter(slot=>slot.party).length===2,'Saved local heroes removed the known two-person recommendation range');
  const selected=(await state()).draft.slots;
  assert.deepEqual(selected.map(({party,...slot})=>slot),initial.draft.slots.map(({party,...slot})=>slot),'Automatic party detection changed the saved local lineup');
  assert.ok(selected.every(slot=>!Number.isInteger(slot.clientCellId)&&!slot.manualPosition),'Saved local heroes invented client player positions');
 });
 // Clear the saved local proposal through the real UI before testing a fresh
 // unknown-lane recommendation. Automatic startup itself must not clear it.
 await click(main,'[data-action=draft-filters]');await click(main,'[data-action=reset-draft]');await click(main,'[data-action=close]');
 await until(async()=>(await state()).draft.slots.every(slot=>!slot.champion),'The explicit local reset did not clear the saved proposal');assert.equal(writes.length,0,'Resetting the local proposal wrote to the client');
 await until(()=>js(side,'!!document.querySelector(".companion-shell")&&!!document.querySelector("#solo-role")'),'Sidebar UI missing');
 await checkpoint('two-unassigned-party-members',async()=>{
  await until(()=>js(side,'document.querySelectorAll(".companion-candidate").length>0'),'Automatic initial candidates missing');
  assert.equal(await js(side,'document.querySelector("#solo-role").value'),'','A client with no lane must start with no own lane');
  assert.equal(await js(side,'document.querySelectorAll(".companion-team-now .companion-roster-row.in-scope").length'),2,'Known two-person party became three fallback lanes');
  const counts=await js(side,'[...document.querySelectorAll(".companion-candidate .candidate-members")].map(el=>Number(el.dataset.memberCount))');assert.ok(counts.length);assert.ok(counts.every(count=>count===2),'The initial candidates must contain two party members');
  await capture(side,'candidates-fit-collapsed.png');
  await click(side,'.companion-candidate .lineup-fit > summary');await until(()=>js(side,'document.querySelector(".companion-candidate .lineup-fit")?.open'),'Candidate fit explanation did not expand');await capture(side,'candidate-fit-expanded.png');await click(side,'.companion-candidate .lineup-fit > summary');
 });
 friendIntent=hero('Nami').key;await fresh(snapshot=>snapshot.session.myTeam.find(player=>player.cellId===0)?.championPickIntent===friendIntent);
 await checkpoint('public-hover-follows-party-scope',async()=>{
  await until(()=>js(side,'!!document.querySelector(".companion-team-now .in-scope [data-id=Nami]")'),'The public teammate hover did not enter the party scope');
  assert.equal(await js(side,'document.querySelectorAll(".companion-team-now .companion-roster-row.in-scope").length'),2);
  await until(()=>js(side,'[...document.querySelectorAll(".companion-candidate .candidate-members")].some(el=>el.querySelector("[data-id=Nami]"))'),'New candidates did not preserve the public teammate hover');
 });
 await checkpoint('public-teammate-hover-click-is-readonly',async()=>{
  const before=attempts.length,writeBefore=writes.length;
  await click(side,'.companion-candidate [data-action=companion-preview][data-id=Nami]');
  try{
   await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")&&document.querySelector(".companion-preview")?.textContent.includes("队友配置 · 只读")'),'Public teammate hover did not open a readonly configuration');
   assert.equal((await state()).draft.playerPosition,undefined,'A teammate hover click claimed the local player position');
   assert.equal(await js(side,'[...document.querySelectorAll(".companion-content [data-action=client-prepare],.companion-content [data-action=my-runes],.companion-content [data-action=import-item-set]")].some(el=>!el.disabled)'),false,'A teammate hover exposes a client write');
   await delay(250);assert.equal(attempts.length,before,'A teammate hover click dispatched preparation');assert.equal(writes.length,writeBefore,'A teammate hover click wrote to the client');
  }finally{await click(side,'[data-action=companion-tab][data-tab=recommend]');}
 });
 await checkpoint('one-click-claims-unknown-own-role-and-prepares',async()=>{
  assert.equal((await state()).draft.playerPosition,undefined,'Public teammate hover invented an own position');
  const candidate=await js(side,'(()=>{const el=[...document.querySelectorAll(".companion-candidate [data-action=companion-preview]")].find(button=>button.dataset.id!=="Nami");return el?{id:el.dataset.id,role:el.dataset.role,index:el.dataset.resultIndex}:null;})()');assert.ok(candidate,'An available candidate for the unassigned local player is required');
  const before=attempts.length;assert.equal(before,0);await click(side,'[data-action=companion-preview][data-id='+candidate.id+'][data-role='+candidate.role+'][data-result-index="'+candidate.index+'"]');
  await until(()=>results.length===1,'One candidate click did not complete a preparation API call',10000);
  assert.equal(attempts.length-before,1,'One hero click dispatched more than one preparation API call');assert.notEqual(attempts[0].preselectOnly,true,'The candidate click only hovered instead of preparing the complete plan');assert.equal(attempts[0].champion,candidate.id);assert.equal(attempts[0].role,candidate.role);assert.equal(results[0].complete,true);
  for(const step of ['hover','runes','spells','items'])assert.equal(results[0].steps[step].status,'done','Missing complete '+step+' preparation');
  await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")'),'The single candidate click did not open the configuration tab');
  await until(async()=>(await state()).preparations.some(value=>value.id===candidate.id&&value.role===candidate.role),'The clicked configuration was not saved');
  const saved=await state();assert.equal(saved.draft.playerPosition?.role,candidate.role);assert.equal(saved.draft.playerPosition?.cellId,2);
  assert.equal(spell2Id,4,'The original Flash F key was moved');assert.equal(results[0].steps.spells.summoners[1],'SummonerFlash','The receipt lost the original Flash key');
  assert.ok(['current','f'].includes(saved.preferences.flashSlot),'Preparation saved the wrong Flash preference');
  const remembered=saved.preparations.find(value=>value.id===candidate.id&&value.role===candidate.role);assert.ok(remembered,'The clicked configuration was not saved');if(remembered.summonerIds)assert.equal(remembered.summonerIds[1],'SummonerFlash');
  await delay(250);assert.equal(attempts.length-before,1,'The completed candidate click dispatched a delayed duplicate API call');
  await capture(side,'candidate-configuration.png');
  report.singleClick={candidate,apiCalls:attempts.length-before,steps:Object.fromEntries(Object.entries(results[0].steps).map(([name,value])=>[name,value.status])),flashKey:'F'};
 });
 if(report.singleClick)await checkpoint('same-hero-lock-opens-configuration-tab',async()=>{
  await click(side,'[data-action=companion-tab][data-tab=recommend]');await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=recommend]")?.classList.contains("active")'),'Could not return to recommendations before locking');
  const before=attempts.length;assert.equal(intent,hero(report.singleClick.candidate.id).key);picked=intent;intent=0;completed=true;
  await fresh(snapshot=>snapshot.session.myTeam.find(player=>player.cellId===2)?.championId===picked&&snapshot.session.actions.flat().some(action=>action.actorCellId===2&&action.completed));
  await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")'),'Locking the same hovered champion did not reopen configuration');assert.equal(attempts.length,before,'A player locking their champion caused another automatic configuration write');
 });
 const resetRound=async nextQueue=>{phase='Lobby';queueId=nextQueue;intent=0;picked=0;friendIntent=0;completed=false;await fresh(snapshot=>snapshot.phase==='Lobby');gameId++;phase='ChampSelect';await fresh(snapshot=>snapshot.phase==='ChampSelect'&&String(snapshot.session.gameId)===String(gameId)&&Number(snapshot.game.queueId)===queueId);await until(()=>{side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));return side;},'Automatic sidebar missing after new round');await until(()=>js(side,'!!document.querySelector(".companion-shell")'),'New-round sidebar did not load');await click(side,'[data-action=companion-tab][data-tab=recommend]');await until(()=>js(side,'!!document.querySelector("#solo-role")'),'Role picker missing after new round');};
 for(const nextQueue of [430,0]){
  await resetRound(nextQueue);
  await checkpoint('explicit-lane-preselection-queue-'+nextQueue,async()=>{
   for(const [role,id]of [['top','Garen'],['mid','Ahri'],['jungle','LeeSin']]){
    if(role==='jungle'){picked=hero('Ahri').key;intent=0;await fresh(snapshot=>snapshot.session.myTeam.find(player=>player.cellId===2)?.championId===picked&&!snapshot.session.actions.flat().find(action=>action.actorCellId===2)?.completed);}
    const before=attempts.length,writeBefore=writes.length;await change(side,'#solo-role',role);
    await until(()=>intent===hero(id).key,'Explicit '+role+' lane did not replace the unlocked hover in queue '+nextQueue,7000);
    await until(()=>results.length===attempts.length,'Lane preselection did not settle');assert.equal(attempts.length-before,1,'Changing one lane must make one explicit preselection API call');assert.equal(attempts.at(-1).preselectOnly,true);assert.equal(attempts.at(-1).role,role);assert.equal(results.at(-1).steps.hover.status,'done','Lane replacement was not confirmed by the client');
    await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")'),'Successful lane preselection did not open configuration');
    await until(()=>js(side,'JSON.parse(document.querySelector("[data-client-preparation-fingerprint]")?.dataset.clientPreparationFingerprint||"[{}]")[0].champion==='+JSON.stringify(id)),'Lane preselection opened a different hero configuration');
    const changed=writes.slice(writeBefore);assert.equal(changed.length,1,'Lane claim unexpectedly applied a full configuration');assert.equal(changed[0].route,'/lol-champ-select/v1/session/actions/22');assert.equal(changed[0].body.completed,false);
    await fresh(snapshot=>snapshot.session.myTeam.find(player=>player.cellId===2)?.championPickIntent===intent);
   }
  });
  picked=hero('Ahri').key;intent=0;completed=true;await fresh(snapshot=>snapshot.session.actions.flat().some(action=>action.actorCellId===2&&action.completed));
  await checkpoint('locked-selection-not-replaced-queue-'+nextQueue,async()=>{
   const before=attempts.length,writeBefore=writes.length;await change(side,'#solo-role','support');await delay(800);
   assert.equal(picked,hero('Ahri').key);assert.equal(intent,0);assert.equal(attempts.length,before,'A lane change attempted to replace the locked hero');assert.equal(writes.length,writeBefore,'A lane change wrote while a different hero was locked');
  });
 }
 for(const choice of [{surface:'main',id:'Darius',role:'top'},{surface:'sidebar',id:'Ashe',role:'bottom'}]){
  await resetRound(430);
  await checkpoint('single-picker-click-complete-preparation-'+choice.surface,async()=>{
   const window=choice.surface==='main'?main:side,before=attempts.length,resultBefore=results.length,writeBefore=writes.length;
   await click(window,'[data-action=pick-slot][data-role='+choice.role+']');await until(()=>js(window,'!!document.querySelector("#overlay-root [data-action=pick-champion][data-id='+choice.id+']")'),'Champion picker missing on '+choice.surface);assert.equal(attempts.length,before,'Opening the picker unexpectedly wrote to the client');
   await click(window,'#overlay-root [data-action=pick-champion][data-id='+choice.id+']');await until(()=>results.length===resultBefore+1,'One picker hero click did not complete a preparation API call on '+choice.surface,10000);
   assert.equal(attempts.length-before,1,'The picker hero click dispatched multiple preparation API calls');assert.equal(attempts.at(-1).champion,choice.id);assert.equal(attempts.at(-1).role,choice.role);assert.notEqual(attempts.at(-1).preselectOnly,true);assert.equal(results.at(-1).complete,true);
   for(const step of ['hover','runes','spells','items'])assert.equal(results.at(-1).steps[step].status,'done');
   await until(async()=>(await state()).preparations.some(value=>value.id===choice.id&&value.role===choice.role),'Picker configuration was not saved');assert.equal(spell2Id,4,'Picker preparation moved the original Flash F key');
   const changed=writes.slice(writeBefore);assert.equal(changed.filter(write=>write.route==='/lol-champ-select/v1/session/actions/22').length,1);assert.equal(changed.find(write=>write.route==='/lol-champ-select/v1/session/actions/22').body.completed,false);
   if(choice.surface==='sidebar')await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")'),'Picker preparation did not open sidebar configuration');
   await delay(250);assert.equal(attempts.length-before,1,'The picker produced a delayed duplicate preparation call');
  });
 }
 assert.ok(windows.every(window=>window.isDestroyed()||!window.isVisible()),'Smoke windows must stay hidden');
 report={...report,checks,passed:checks.every(check=>check.passed),source,archiveSha256:release?.archiveSha256||null,autoSync:true,manualSyncClicks:0,syntheticLcuOnly:true,observerMocked:true,actualRuneWrites:0,mockedWrites:writes.map(write=>({route:write.route,method:write.method})),preparationApiCalls:attempts.length};
 await fs.writeFile(path.join(root,'pregame-startup.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 assert.equal(report.passed,true,'Pregame startup regression failures: '+checks.filter(check=>!check.passed).map(check=>check.name).join(', '));app.quit();
}
report={startedAt:new Date().toISOString()};
run().catch(async error=>{
 console.error(error);await fs.writeFile(path.join(root,'pregame-startup-error.txt'),error.stack).catch(()=>{});
 if(!report?.checks)await fs.writeFile(path.join(root,'pregame-startup.json'),JSON.stringify({...report,passed:false,checks,error:error.message,actualRuneWrites:0,syntheticLcuOnly:true},null,2)).catch(()=>{});
 for(const window of [main,side].filter(window=>window&&!window.isDestroyed()))await fs.writeFile(path.join(root,'failure-'+window.webContents.id+'.html'),await window.webContents.executeJavaScript('document.documentElement.outerHTML').catch(()=>''));
 app.exit(1);
});
