const {app,screen,globalShortcut,ipcMain,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),http=require('node:http'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],handlers=new Map(),attempts=[],results=[],writes=[],checks=[];
let main,side,report,suppressPreparationSnapshot=false,heldSideClient=null;
app.setPath('userData',root);globalShortcut.register=()=>false;
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
global.fetch=async()=>{throw Error('External network disabled in isolated startup fixture');};
http.request=()=>{throw Error('Real sockets forbidden in isolated startup fixture');};
global.WebSocket=class{constructor(){throw Error('Real relay connections forbidden in isolated startup fixture');}};
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>{handlers.set(name,handler);handle(name,async(...args)=>{if(heldSideClient&&name==='client-status'&&args[0].sender===side?.webContents)return structuredClone(heldSideClient);if(name==='prepare-selection')attempts.push(structuredClone(args[1]));const result=await handler(...args);if(name==='prepare-selection')results.push(structuredClone(result));return suppressPreparationSnapshot&&['bootstrap','main-ready'].includes(name)?{...result,preparationSnapshot:{revision:result.preparationSnapshot?.revision||0,events:[]}}:result;});};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=18000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await delay(100);}throw Error(label);}
async function checkpoint(name,run){try{await run();checks.push({name,passed:true});}catch(error){
 const ui=await Promise.all(windows.filter(window=>!window.isDestroyed()).map(async window=>({url:window.webContents.getURL(),details:await window.webContents.executeJavaScript('({toast:document.querySelector("#toast")?.textContent,activeTab:document.querySelector(".companion-tabs .active")?.textContent})').catch(()=>null)})));
 checks.push({name,passed:false,message:error.message,ui});console.error('FAIL '+name+': '+error.message+' '+JSON.stringify(ui));
}}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile('release/latest.json')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),hero=id=>data.champions.find(champion=>champion.id===id),initial=JSON.parse(await fs.readFile(path.join(root,'settings.json')));
 assert.equal(initial.preferences.autoSync,true);assert.equal(initial.preferences.clickPrepare,true);assert.equal(initial.draft.playerPosition,undefined);assert.equal(initial.draft.soloRole,'');assert.equal(initial.draft.slots.filter(slot=>slot.champion).length,5,'Startup fixture needs a saved local lineup on every lane');
 let observer,phase='Offline',queueId=430,gameId=530001,intent=0,picked=0,friendIntent=0,friendPicked=0,outsidePicked=0,ownAssigned='',friendAssigned='',completed=false,requests=0,spell1Id=12,spell2Id=4,soloParty=false,unknownAllyRoles=false;
 let page={id:44,name:'Synthetic editable page',isEditable:true,isActive:true,current:true};
 const ownIdentity={puuid:'startup-synthetic-own-identity',summonerId:530001,gameName:'合成测试本人',tagLine:'TEST'},friendIdentity={puuid:'startup-synthetic-friend-identity',summonerId:530002,gameName:'合成测试队友',tagLine:'TEST'};
 const rawSession=()=>({gameId,localPlayerCellId:2,myTeam:[{cellId:0,championId:friendPicked,championPickIntent:friendIntent,assignedPosition:friendAssigned,...friendIdentity},{cellId:1,championId:0,championPickIntent:0,assignedPosition:''},{cellId:2,championId:picked,championPickIntent:intent,assignedPosition:ownAssigned,spell1Id,spell2Id,...ownIdentity},{cellId:3,championId:outsidePicked,championPickIntent:0,assignedPosition:outsidePicked?'TOP':''},{cellId:4,championId:0,championPickIntent:0,assignedPosition:''}],theirTeam:[],actions:[[{id:21,type:'pick',actorCellId:0,championId:friendPicked||friendIntent,completed:!!friendPicked},{id:22,type:'pick',actorCellId:2,championId:intent||picked,completed,isInProgress:!completed}]],timer:{phase:'PLANNING',adjustedTimeLeftInPhase:90000},bans:{myTeamBans:[],theirTeamBans:[]},allowDuplicatePicks:false});
 const output=options=>{
  requests++;assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  const method=options.method||'GET',route=options.path,body=options.body===undefined?undefined:JSON.parse(options.body);
  if(phase==='Offline')throw Error('Synthetic client not running yet');
  if(method==='GET'){
   if(route==='/lol-summoner/v1/current-summoner')return ownIdentity;
   if(route==='/lol-gameflow/v1/gameflow-phase')return phase;
   if(route==='/lol-gameflow/v1/session')return {gameData:{gameId:phase==='ChampSelect'?gameId:0,mapId:11,isCustomGame:queueId===0,queue:{id:queueId,gameMode:queueId===0?'':'CLASSIC'}},map:{id:11,gameMode:'CLASSIC'}};
   if(route==='/lol-lobby/v2/lobby')return {localMember:{...ownIdentity,isLeader:true},members:[{...ownIdentity,isLeader:true},...(!soloParty?[friendIdentity]:[])]};
   if(route==='/lol-champ-select/v1/session'){
    const snapshot=rawSession();
    if(soloParty)for(const player of snapshot.myTeam){const ally={0:['Braum','UTILITY'],1:['Garen','TOP'],3:['Vi','JUNGLE'],4:['Ahri','MIDDLE']}[player.cellId];if(ally){player.championId=hero(ally[0]).key;player.assignedPosition=unknownAllyRoles?'':ally[1];snapshot.actions[0]=snapshot.actions[0].filter(action=>action.actorCellId!==player.cellId);snapshot.actions[0].push({id:30+player.cellId,type:'pick',actorCellId:player.cellId,championId:player.championId,completed:true});}}
    return snapshot;
   }
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
 const capture=async(window,name)=>{await js(window,'Promise.race([Promise.all([...document.images].filter(image=>{const r=image.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;}).map(image=>image.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,2000))])');await js(window,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(root,name),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());report.screenshots=[...(report.screenshots||[]),name];};
 const fresh=async predicate=>until(async()=>predicate(await client()),'Automatic client snapshot did not follow the synthetic phase/selection');
 await until(()=>js(main,'!!window.buddy&&!!document.querySelector("#solo-role")'),'Main draft UI missing');await until(()=>observer,'Observer mock missing');
 assert.equal(await js(main,'!!document.querySelector("#overlay-root>*")'),false,'Startup must not automatically open a hero picker or configuration dialog');
 const area=screen.getPrimaryDisplay().workArea,anchor={x:area.x+20,y:area.y+20,width:Math.max(600,area.width-500),height:Math.min(800,area.height-40)};
 observer.stdout.emit('data',JSON.stringify({client:{...screen.dipToScreenRect(null,anchor),foreground:false,minimized:false},game:null})+'\n');
 await fresh(snapshot=>requests>0&&snapshot.connected===false&&snapshot.phase==='Offline');
 if(!process.env.RIFT_BUDDY_INTENT_ONLY){
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
 const candidateIdentity=()=>js(side,'[...document.querySelectorAll(".companion-candidate .candidate-members")].map(el=>[...el.querySelectorAll("[data-id]")].map(h=>[h.dataset.id,h.dataset.role]))');
 const previewBaseline=await candidateIdentity();
 friendIntent=hero('Nami').key;await fresh(snapshot=>snapshot.session.myTeam.find(player=>player.cellId===0)?.championPickIntent===friendIntent);
 await checkpoint('preview-visible-but-only-client-lock-constrains-recommendations',async()=>{
  await until(()=>js(side,'!!document.querySelector(".companion-team-now [data-id=Nami]")'),'The teammate preview did not display');
  assert.deepEqual(await candidateIdentity(),previewBaseline,'A preview changed recommendation members');
  assert.equal(await js(side,'document.querySelectorAll(".companion-team-now .companion-roster-row.in-scope").length'),2);
  await capture(side,'preview-without-recommendation-constraint.png');
  friendPicked=friendIntent;friendIntent=0;await fresh(snapshot=>snapshot.session.myTeam.find(p=>p.cellId===0)?.pickState==='locked');
  await until(()=>js(side,'document.querySelector(".companion-team-now [data-id=Nami] [data-pick-state=锁定]")&&document.querySelectorAll(".companion-candidate .candidate-members").length>0&&[...document.querySelectorAll(".companion-candidate .candidate-members")].every(el=>el.querySelector("[data-id=Nami]"))'),'A confirmed lock did not constrain candidates');
  await capture(side,'locked-hero-constrains-recommendation.png');
 });
 const resetRound=async nextQueue=>{phase='Lobby';queueId=nextQueue;intent=0;picked=0;friendIntent=0;friendPicked=0;completed=false;await fresh(snapshot=>snapshot.phase==='Lobby');gameId++;phase='ChampSelect';await fresh(snapshot=>snapshot.phase==='ChampSelect'&&String(snapshot.session.gameId)===String(gameId)&&Number(snapshot.game.queueId)===queueId);await until(()=>{side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));return side;},'Automatic sidebar missing after new round');await until(()=>js(side,'!!document.querySelector(".companion-shell")'),'New-round sidebar did not load');await until(()=>js(side,'(()=>{const scope=document.querySelector(".companion-content")?.dataset.focusScope;return !!scope&&String(JSON.parse(scope)[2])==='+JSON.stringify(String(gameId))+';})()'),'Sidebar did not observe the new game before the next click');await click(side,'[data-action=companion-tab][data-tab=recommend]');await until(()=>js(side,'!!document.querySelector("#solo-role")'),'Role picker missing after new round');};
 for(const surface of ['candidate','picker']){
  await resetRound(430);friendIntent=hero('Nami').key;
  await fresh(snapshot=>snapshot.session.myTeam.find(player=>player.cellId===0)?.championPickIntent===friendIntent);
  await checkpoint('teammate-hover-first-click-prepares-'+surface,async()=>{
   const before=attempts.length,resultBefore=results.length;let target='Nami';
   if(surface==='candidate'){
    await until(()=>js(side,'!!document.querySelector(".companion-candidate [data-action=companion-preview]")'),'Independent candidate missing');
    target=await js(side,'document.querySelector(".companion-candidate [data-action=companion-preview]").dataset.id');
    await click(side,'.companion-candidate [data-action=companion-preview]');
   }else{
    await click(side,'[data-action=pregame-hero]');
    await until(()=>js(side,'!!document.querySelector("#picker-search")'),'Picker search missing');
    await js(side,'(()=>{const input=document.querySelector("#picker-search");input.value="Nami";input.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await click(side,'#overlay-root [data-action=pick-champion][data-id=Nami]');
   }
   await until(()=>results.length===resultBefore+1,'The first hover hero click did not complete configuration');
   assert.equal(attempts.length-before,1);assert.equal(attempts.at(-1).champion,target);assert.notEqual(attempts.at(-1).preselectOnly,true);
   for(const step of ['hover','runes','spells','items'])assert.equal(results.at(-1).steps[step].status,'done');
   assert.equal(spell2Id,4);assert.equal(friendIntent,hero('Nami').key,'The teammate hover must stay untouched');
   await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")'),'The completed click did not open configuration');
   await delay(250);assert.equal(attempts.length-before,1,'A hero click dispatched a duplicate');
  });
 }
 await resetRound(430);
 await checkpoint('one-click-claims-unknown-own-role-and-prepares',async()=>{
  assert.equal((await state()).draft.playerPosition,undefined,'Public teammate hover invented an own position');
  await until(()=>js(side,'[...document.querySelectorAll(".companion-candidate [data-action=companion-preview]")].some(button=>button.dataset.id!=="Nami")'),'Fresh unassigned-player candidates missing');
  const candidate=await js(side,'(()=>{const el=[...document.querySelectorAll(".companion-candidate [data-action=companion-preview]")].find(button=>button.dataset.id!=="Nami");return el?{id:el.dataset.id,role:el.dataset.role,index:el.dataset.resultIndex}:null;})()');assert.ok(candidate,'An available candidate for the unassigned local player is required');
  const before=attempts.length,resultBefore=results.length;await click(side,'[data-action=companion-preview][data-id='+candidate.id+'][data-role='+candidate.role+'][data-result-index="'+candidate.index+'"]');
  await until(()=>results.length===resultBefore+1,'One candidate click did not complete a preparation API call',10000);
  assert.equal(attempts.length-before,1,'One hero click dispatched more than one preparation API call');assert.notEqual(attempts.at(-1).preselectOnly,true,'The candidate click only hovered instead of preparing the complete plan');assert.equal(attempts.at(-1).champion,candidate.id);assert.equal(attempts.at(-1).role,candidate.role);assert.equal(results.at(-1).complete,true);
  for(const step of ['hover','runes','spells','items'])assert.equal(results.at(-1).steps[step].status,'done','Missing complete '+step+' preparation');
  await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")'),'The single candidate click did not open the configuration tab');
  await until(async()=>(await state()).preparations.some(value=>value.id===candidate.id&&value.role===candidate.role),'The clicked configuration was not saved');
  const saved=await state();assert.equal(saved.draft.playerPosition?.role,candidate.role);assert.equal(saved.draft.playerPosition?.cellId,2);
  assert.equal(spell2Id,4,'The original Flash F key was moved');assert.equal(results.at(-1).steps.spells.summoners[1],'SummonerFlash','The receipt lost the original Flash key');
  assert.ok(['current','f'].includes(saved.preferences.flashSlot),'Preparation saved the wrong Flash preference');
  const remembered=saved.preparations.find(value=>value.id===candidate.id&&value.role===candidate.role);assert.ok(remembered,'The clicked configuration was not saved');if(remembered.summonerIds)assert.equal(remembered.summonerIds[1],'SummonerFlash');
  await delay(250);assert.equal(attempts.length-before,1,'The completed candidate click dispatched a delayed duplicate API call');
  await capture(side,'candidate-configuration.png');
  report.singleClick={candidate,apiCalls:attempts.length-before,steps:Object.fromEntries(Object.entries(results.at(-1).steps).map(([name,value])=>[name,value.status])),flashKey:'F'};
 });
 if(report.singleClick)await checkpoint('same-hero-lock-opens-configuration-tab',async()=>{
  await click(side,'[data-action=companion-tab][data-tab=recommend]');await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=recommend]")?.classList.contains("active")'),'Could not return to recommendations before locking');
  const before=attempts.length;assert.equal(intent,hero(report.singleClick.candidate.id).key);picked=intent;intent=0;completed=true;
  await fresh(snapshot=>snapshot.session.myTeam.find(player=>player.cellId===2)?.championId===picked&&snapshot.session.actions.flat().some(action=>action.actorCellId===2&&action.completed));
  await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")'),'Locking the same hovered champion did not reopen configuration');assert.equal(attempts.length,before,'A player locking their champion caused another automatic configuration write');
 });

 for(const nextQueue of [430,0]){
  await resetRound(nextQueue);
  await checkpoint('explicit-lane-preselection-queue-'+nextQueue,async()=>{
   for(const [role,id]of [['top','Gnar'],['mid','Ahri'],['jungle','Hecarim']]){
    if(role==='jungle'){picked=hero('Ahri').key;intent=0;await fresh(snapshot=>snapshot.session.myTeam.find(player=>player.cellId===2)?.championId===picked&&!snapshot.session.actions.flat().find(action=>action.actorCellId===2)?.completed);}
    const before=attempts.length,writeBefore=writes.length;await change(role==='mid'?main:side,'#solo-role',role);
    await until(()=>intent===hero(id).key,'Explicit '+role+' lane did not replace the unlocked hover in queue '+nextQueue,7000);
    await until(()=>results.length===attempts.length,'Lane preselection did not settle');assert.equal(attempts.length-before,1,'Changing one lane must make one explicit preselection API call');assert.equal(attempts.at(-1).preselectOnly,true);assert.equal(attempts.at(-1).role,role);assert.equal(results.at(-1).steps.hover.status,'done','Lane replacement was not confirmed by the client');
    await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=recommend]")?.classList.contains("active")'),'Lane preselection left recommendations');
    await until(()=>js(main,'!!document.querySelector(".draft-compare-workspace")'),'The other window treated a lane claim as a complete configuration');
    await delay(450);assert.equal(await js(side,'document.querySelector("[data-action=companion-tab][data-tab=recommend]")?.classList.contains("active")'),true,'A later client/receipt event reopened configuration for a lane claim');
    assert.equal(await js(side,'!!document.querySelector(".companion-persistent .preparation-task")'),false,'A lane placeholder must not push candidates down with a configuration card');
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
  await resetRound(430);const pickerWindow=choice.surface==='main'?main:side,roleBefore=attempts.length;await change(pickerWindow,'#solo-role',choice.role);await until(()=>attempts.length>roleBefore&&results.length===attempts.length,'Role placeholder remained pending');
  await checkpoint('single-picker-click-complete-preparation-'+choice.surface,async()=>{
   const window=choice.surface==='main'?main:side,before=attempts.length,resultBefore=results.length,writeBefore=writes.length;
   await click(window,'[data-action=pregame-hero]');await until(()=>js(window,'!!document.querySelector("#overlay-root [data-action=pick-champion][data-id='+choice.id+']")'),'Champion picker missing on '+choice.surface);assert.equal(attempts.length,before,'Opening the picker unexpectedly wrote to the client');
   await click(window,'#overlay-root [data-action=pick-champion][data-id='+choice.id+']');await until(()=>results.length===resultBefore+1,'One picker hero click did not complete a preparation API call on '+choice.surface,10000);
   assert.equal(attempts.length-before,1,'The picker hero click dispatched multiple preparation API calls');assert.equal(attempts.at(-1).champion,choice.id);assert.equal(attempts.at(-1).role,choice.role);assert.notEqual(attempts.at(-1).preselectOnly,true);assert.equal(results.at(-1).complete,true);
   for(const step of ['hover','runes','spells','items'])assert.equal(results.at(-1).steps[step].status,'done');
   await until(async()=>(await state()).preparations.some(value=>value.id===choice.id&&value.role===choice.role),'Picker configuration was not saved');assert.equal(spell2Id,4,'Picker preparation moved the original Flash F key');
   const changed=writes.slice(writeBefore);assert.equal(changed.filter(write=>write.route==='/lol-champ-select/v1/session/actions/22').length,1);assert.equal(changed.find(write=>write.route==='/lol-champ-select/v1/session/actions/22').body.completed,false);
   if(choice.surface==='sidebar')await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")'),'Picker preparation did not open sidebar configuration');
   await delay(250);assert.equal(attempts.length-before,1,'The picker produced a delayed duplicate preparation call');
  });
 }
 ownAssigned='BOTTOM';friendAssigned='MIDDLE';await resetRound(430);
 await checkpoint('main-reference-lane-click-prepares-without-requiring-whole-lineup',async()=>{
  await click(main,'[data-action=draft-filters]');await click(main,'[data-action=reset-draft]');await click(main,'[data-action=close]');
  await until(async()=>(await state()).draft.slots.every(slot=>!slot.champion),'Explicit reset did not clear the previous local plan');
  await until(()=>js(main,'!!document.querySelector(".result-card .candidate-member[data-role=mid]")'),'Known middle/bottom party candidates missing');
  const candidate=await js(main,'(()=>{const card=[...document.querySelectorAll(".result-card")].find(card=>card.querySelector(".candidate-member[data-role=mid]"));const el=card.querySelector(".candidate-member[data-role=mid]");return {id:el.dataset.id,role:el.dataset.role,index:el.dataset.resultIndex,members:[...card.querySelectorAll(".candidate-member")].map(member=>({id:member.dataset.id,role:member.dataset.role}))};})()');
  const before=attempts.length,resultBefore=results.length;
  await click(main,'.result-card [data-action=build][data-id='+candidate.id+'][data-role='+candidate.role+'][data-result-index="'+candidate.index+'"]');
  await until(()=>results.length===resultBefore+1,'Claiming another unpicked plan lane cancelled the same explicit click');
  assert.equal(attempts.length-before,1);assert.equal(results.at(-1).complete,true);
  for(const step of ['hover','runes','spells','items'])assert.equal(results.at(-1).steps[step].status,'done');
  await fresh(snapshot=>snapshot.session.myTeam.find(player=>player.cellId===2)?.championPickIntent===hero(candidate.id).key);
  await delay(1200); // The next automatic public-hover sync must preserve this plan, too.
  const saved=await state();assert.ok(saved.preparations.some(value=>value.id===candidate.id&&value.role===candidate.role),'The reference configuration was not retained');
  assert.equal(spell2Id,4);assert.equal(friendAssigned,'MIDDLE','Applying a reference build changed a teammate position');
 });
 soloParty=true;ownAssigned='BOTTOM';await resetRound(430);
 await checkpoint('solo-party-composition-recommendations-after-lane-claim',async()=>{
  await until(async()=>(await state()).draft.slots.filter(slot=>slot.party).length===1,'Solo queue kept a multi-person recommendation range');
  await change(side,'#solo-role','bottom');await until(()=>intent===hero('Jinx').key&&results.length===attempts.length,'Solo lane claim did not settle');
  await until(()=>js(side,'(()=>{const toast=document.querySelector("#toast");return /已预选.*占位/.test(toast?.textContent)&&!toast.classList.contains("error");})()'),'Successful lane claim reported a save error instead of completion');
  picked=intent;intent=0;await fresh(snapshot=>snapshot.session.myTeam.find(p=>p.cellId===2)?.championId===picked);
  await click(side,'[data-action=draft-scope][data-scope=context]');
  await until(async()=>(await state()).draft.scope==='context','Whole-team reference choice did not persist');
  assert.equal((await state()).draft.partyCount,1,'Reference range must not change the captured recommendation quantity');
  await until(()=>js(side,'document.querySelectorAll(".companion-candidate").length>=2'),'Whole-team reference treated an unlocked public championId as a completed pick');
  assert.ok((await js(side,'[...document.querySelectorAll(".companion-candidate .candidate-members [data-role]")].map(el=>el.dataset.role)')).every(role=>role==='bottom'));
  await click(side,'[data-action=draft-scope][data-scope=party]');
  await until(async()=>(await state()).draft.scope==='party','Explicit party scope did not persist');
  await until(()=>js(side,'document.querySelectorAll(".companion-candidate").length>=2'),'Solo composition recommendations are missing');
  await until(()=>js(main,'document.querySelectorAll(".result-card").length>=2'),'Main solo composition recommendations are missing');
  for(const [window,selector] of [[side,'.companion-candidate'],[main,'.result-card']]){
   const candidates=await js(window,'[...document.querySelectorAll('+JSON.stringify(selector)+')].map(card=>({members:[...card.querySelectorAll(".candidate-members [data-role]")].map(el=>({id:el.dataset.id,role:el.dataset.role})),fit:card.querySelector(".lineup-fit summary")?.textContent}))');
   assert.ok(candidates.every(row=>row.members.length===1&&row.members[0].role==='bottom'),'Only the local lane may change');
   assert.ok(new Set(candidates.flatMap(row=>row.members.map(m=>m.id))).size>=2,'Solo candidates all repeat the placeholder');
   assert.ok(candidates.every(row=>/契合 \d+/.test(row.fit)&&!/冲突/.test(row.fit)),'Known allies should produce a composition fit, not a hover conflict');
  }
  const before=attempts.length,candidate=await js(side,'(()=>{const el=[...document.querySelectorAll(".companion-candidate [data-action=companion-preview]")].find(el=>el.dataset.id!=="Jinx");return {id:el.dataset.id,role:el.dataset.role,index:el.dataset.resultIndex};})()');
  assert.equal(await js(side,'!!document.querySelector(".companion-persistent .preparation-task")'),false);
  await capture(side,'solo-composition-candidates.png');
  await click(side,'.companion-candidate [data-id='+candidate.id+'][data-role='+candidate.role+'][data-result-index="'+candidate.index+'"]');
  await until(()=>results.length===before+1,'Selecting a solo candidate did not apply it');assert.equal(results.at(-1).complete,true);assert.notEqual(attempts.at(-1).preselectOnly,true);
  await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")'),'Selecting an actual candidate did not open configuration');
  const allies=(await state()).draft.slots.filter(slot=>slot.role!=='bottom').map(slot=>slot.champion).sort();assert.deepEqual(allies,['Ahri','Braum','Garen','Vi']);assert.equal(spell2Id,4);
 });
 await checkpoint('solo-team-fit-retains-public-allies-with-automatic-placement-disabled',async()=>{
  await click(side,'[data-action=player-flow-settings]');await click(side,'[data-action=player-flow-toggle][data-field=autoArrange]');
  await until(async()=>(await state()).preferences.autoArrange===false,'Disabling automatic placement did not persist');await click(side,'[data-action=close]');
  unknownAllyRoles=true;await resetRound(430);
  await until(()=>js(side,'document.querySelectorAll(".companion-candidate").length>=2'),'Solo candidates missing without inferred ally lanes');
  await until(()=>js(side,'[...document.querySelectorAll(".companion-candidate .lineup-fit")].every(el=>/契合 [0-9]+/.test(el.querySelector("summary")?.textContent)&&/4 位公开队友分路未知/.test(el.textContent))'),'Public unplaced allies did not contribute to visible team fit');
  await until(async()=>(await state()).draft.slots.filter(s=>s.role!=='bottom').every(s=>!s.champion),'Unknown public ally lanes were invented');
  await capture(side,'solo-public-allies-unplaced.png');
  const before=attempts.length;await click(side,'.companion-candidate [data-action=companion-preview]');
  await until(()=>results.length===before+1&&results.at(-1).complete,'The public unplaced ally candidate did not complete preparation');
  await until(()=>js(side,'document.querySelector("[data-action=companion-tab][data-tab=plan]")?.classList.contains("active")'),'The actual candidate did not open configuration');
 });
 await checkpoint('default-client-flash-key-persists-in-guide-through-loading',async()=>{
  completed=true;picked=intent||picked;intent=0;await fresh(snapshot=>snapshot.session.actions.flat().find(a=>a.actorCellId===2)?.completed);
  const ownId=data.champions.find(c=>c.key===picked).id;
  await js(side,'window.buddy.openGuide({id:'+JSON.stringify(ownId)+',role:"bottom",mode:"rift"})');
  let guide;await until(()=>{guide=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide window missing');
  await until(()=>js(guide,'!!window.guide'),'Guide preload missing');
  for(const nextPhase of ['ChampSelect','GameStart']){
   if(nextPhase==='GameStart'){phase=nextPhase;await fresh(snapshot=>snapshot.phase==='GameStart');}
   const snapshot=await js(guide,'window.guide.bootstrap()');
   assert.equal(snapshot.model.summoners[1].id,'SummonerFlash','The guide moved default Flash F in '+nextPhase);
   assert.equal(snapshot.model.selection.summonerIds,undefined,'The current client key must remain a per-game observation');
  }
 });
 }
 if(handlers.has('stage-selection')){
  const lobby=async()=>{phase='Lobby';soloParty=false;unknownAllyRoles=false;intent=0;picked=0;completed=false;ownAssigned='';friendAssigned='';friendIntent=0;friendPicked=0;await fresh(snapshot=>snapshot.phase==='Lobby');await until(()=>js(main,'!!document.querySelector("#solo-role")&&/组队大厅/.test(document.querySelector(".draft-compare-status")?.textContent||"")'),'Main lobby UI did not observe the new phase');};
  await checkpoint('lobby-role-choice-defers-one-hover-without-configuration',async()=>{
   await lobby();assert.equal(await js(main,'document.querySelector("#solo-role").value'),'','A new lobby must not inherit last round\'s role');
   const before=writes.length;await change(main,'#solo-role','bottom');
   await until(async()=>(await state()).draft.preselection?.role==='bottom','Explicit lobby role was not saved');
   await capture(main,'lobby-preselection.png');
   assert.equal(writes.length,before,'Lobby preselection must not write to champ select');
   gameId++;phase='ChampSelect';await fresh(snapshot=>snapshot.phase==='ChampSelect'&&String(snapshot.session.gameId)===String(gameId));
   await until(()=>intent>0,'Staged lobby role did not hover on entering selection');
   await until(async()=>(await state()).draft.preselection?.attemptedGameId===String(gameId),'Deferred hover was not consumed');
   await delay(2800);assert.equal(writes.length,before+1,'Deferred role intent must hover exactly once without runes/spells/items');
   assert.match(writes.at(-1).route,/\/lol-champ-select\/v1\/session\/actions\//);
   side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));
   await until(()=>js(side,'!!document.querySelector(".companion-shell[data-tab=recommend]")'),'Role-only preselection incorrectly opened configuration');
   const draft=(await state()).draft;assert.equal(draft.partyCount,2);assert.equal(draft.slots.filter(slot=>slot.party).length,2);
  });
  await checkpoint('two-windows-manual-scope-and-zero-survive-sync-until-next-draft',async()=>{
   await click(main,'[data-action=toggle-party][data-role=support]');
   await until(async()=>(await state()).draft.partyCount===3,'Main checkbox did not resize the captured count');
   await until(()=>js(side,'document.querySelectorAll(".companion-team-now .in-scope").length===3'),'Sidebar did not receive main range edit');
   const previousHover=intent;await change(side,'#solo-role','mid');await until(()=>intent>0&&intent!==previousHover,'Manual role claim did not settle');
   await until(async()=>(await state()).draft.partyCount===3&&(await state()).draft.slots.filter(slot=>slot.party).length===3,'Role claim resized the range');
   const selectedRoles=await js(side,'[...document.querySelectorAll(".companion-team-now .in-scope")].map(row=>row.dataset.dropRole)');
   for(const role of selectedRoles)await click(side,'[data-action=toggle-party][data-role='+role+']');
   await until(async()=>(await state()).draft.partyCount===0,'Checkboxes did not permit an empty manual range');await delay(2800);
   const empty=(await state()).draft;assert.equal(empty.partyCount,0);assert.equal(empty.slots.filter(slot=>slot.party).length,0);
   assert.equal(await js(main,'document.querySelectorAll(".task-roster .slot.party").length'),0,'Main window revived unchecked lanes');
   await lobby();gameId++;phase='ChampSelect';await fresh(snapshot=>snapshot.phase==='ChampSelect'&&String(snapshot.session.gameId)===String(gameId));
   await until(async()=>(await state()).draft.partyCount===2,'Next draft did not recapture the actual two-person lobby');
  });
  if(handlers.has('party-range'))await checkpoint('checkbox-survives-a-public-pick-before-sidebar-notification',async()=>{
   side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));
   await until(()=>js(side,'document.querySelectorAll(".companion-team-now .in-scope").length===2'),'Sidebar range must settle before delaying notifications');
   const oldRole=await js(side,'document.querySelector(".companion-team-now .in-scope").dataset.dropRole');assert.equal(oldRole,'top');
   const send=side.webContents.send.bind(side.webContents),held=new Map(),writeCount=writes.length;heldSideClient=structuredClone(await client());
   side.webContents.send=(channel,...args)=>{if(['state-update','client-update','guide-selection','preparation-update'].includes(channel)){held.set(channel,args);return;}return send(channel,...args);};
   try{
    outsidePicked=hero('Garen').key;
    await fresh(snapshot=>snapshot.session?.myTeam.find(player=>player.cellId===3)?.championId===outsidePicked);
    await until(async()=>(await state()).draft.slots.some(slot=>slot.champion==='Garen'&&slot.clientCellId===3),'Main did not import the new public ally before the sidebar click');
    await click(side,'[data-action=toggle-party][data-role='+oldRole+']');
    await until(async()=>(await state()).draft.partyCount===1,'The old visible checkbox did not decrease the frozen count');
    const draft=(await state()).draft;assert.equal(draft.slots.filter(slot=>slot.party).length,1);assert.ok(draft.slots.some(slot=>slot.champion==='Garen'&&slot.clientCellId===3),'A checkbox replaced a newer public hero');
    assert.equal(writes.length,writeCount,'Changing recommendation range wrote to the client');
   }finally{heldSideClient=null;side.webContents.send=send;for(const [channel,args]of held)send(channel,...args);}
   await js(main,'window.buddy.partyRange('+JSON.stringify({role:'jungle',checked:true,gameId:String(gameId),cellId:2})+')');
   outsidePicked=0;await fresh(snapshot=>snapshot.session?.myTeam.find(player=>player.cellId===3)?.championId===0);
   await until(async()=>(await state()).draft.partyCount===2,'Restoring the test range did not finish');
  });
  await checkpoint('confirmed-role-placeholder-restores-without-ledger-or-repeated-writes',async()=>{
   await until(()=>{side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));return side;},'New draft sidebar missing');
   await change(side,'#solo-role','support');
   await until(async()=>(await state()).draft.preselection?.hoveredCellId===2,'Confirmed placeholder was not persisted');
   const before=writes.length,disk=JSON.parse(await fs.readFile(path.join(root,'settings.json'),'utf8'));
   assert.equal(disk.draft.preselection.attemptedGameId,String(gameId));assert.equal(disk.draft.preselection.hoveredCellId,2);
   suppressPreparationSnapshot=true;
   try{
    const loaded=new Promise(resolve=>side.webContents.once('did-finish-load',resolve));side.webContents.reload();await loaded;
    await until(()=>js(side,'!!document.querySelector(".companion-shell[data-tab=recommend]")&&document.querySelector("#solo-role")?.value==="support"'),'Reload without runtime receipts misclassified the role placeholder as a completed choice');
   }finally{suppressPreparationSnapshot=false;}
   phase='Offline';await fresh(snapshot=>!snapshot.connected);phase='ChampSelect';await fresh(snapshot=>snapshot.connected&&String(snapshot.session?.gameId)===String(gameId));
   await until(()=>{side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));return side;},'Same-game reconnect sidebar missing');await delay(2400);
   assert.equal(await js(side,'document.querySelector(".companion-shell")?.dataset.tab'),'recommend','Same-game reconnect incorrectly opened configuration');
   assert.equal(writes.length,before,'Restoring display state repeated the client hover or configuration');
   assert.equal((await state()).draft.partyCount,2);
  });
  await checkpoint('lobby-hero-choice-and-dodge-reset-never-repeat-old-intent',async()=>{
   await lobby();const before=writes.length,originalDraft=structuredClone((await state()).draft);
   assert.equal(await js(main,'!!document.querySelector("[data-action=pick-slot],.task-roster .champ-pick[data-action],.companion-roster-hero[data-action]")'),false,'The roster still offers manual hero selection');
   await click(main,'[data-action=pregame-hero]');
   const bounds=main.getBounds(),minimum=main.getMinimumSize();main.setMinimumSize(240,400);
   try{for(const width of [760,400,280]){
    main.setSize(width,720);await delay(200);
    const layout=await js(main,'(()=>{const input=document.querySelector("#picker-search"),search=input.closest(".search-wrap"),cancel=document.querySelector(".preselection-actions [data-action=close]"),panel=document.querySelector(".preselection-picker");input.focus();return {outline:getComputedStyle(input).outlineStyle,searchHeight:search.getBoundingClientRect().height,cancel:cancel.getBoundingClientRect().toJSON(),panel:panel.getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,overflow:panel.scrollWidth>panel.clientWidth};})()');
    assert.equal(layout.outline,'none','Search painted a second focus rectangle');assert.ok(layout.searchHeight<=38);assert.ok(!layout.overflow&&layout.panel.left>=0&&layout.panel.right<=layout.width+1);assert.ok(layout.cancel.bottom<=layout.height&&layout.cancel.top>=0,'Cancel was outside the viewport');
    await capture(main,'lobby-hero-picker-'+width+'.png');
   }}finally{main.setMinimumSize(...minimum);main.setBounds(bounds);}
   await click(main,'.preselection-actions [data-action=close]');assert.deepEqual((await state()).draft,originalDraft);assert.equal(writes.length,before);
   await click(main,'[data-action=pregame-hero]');await click(main,'.champ-option[data-id=Ahri]');
   await until(async()=>(await state()).draft.preselection?.champion==='Ahri','Hero picker did not save the lobby intent');
   if(await js(main,'!!document.querySelector("#overlay-root [data-action=close]")'))await click(main,'#overlay-root [data-action=close]');
   const marked=(await state()).draft.slots.filter(slot=>slot.party).length,role=(await state()).draft.preselection.role;
   await capture(main,'lobby-selected-hero-cancel.png');await click(main,'.pregame-hero-choice [data-action=pregame-clear]');
   await until(async()=>!(await state()).draft.preselection?.champion,'Corner cancel did not clear the hero intent');assert.equal((await state()).draft.preselection?.role||'',role);assert.equal((await state()).draft.slots.filter(slot=>slot.party).length,marked);assert.equal(writes.length,before,'Cancelling a lobby hero wrote to the client');
   await click(main,'[data-action=pregame-hero]');await click(main,'.champ-option[data-id=Ahri]');await until(async()=>(await state()).draft.preselection?.champion==='Ahri','Hero choice did not save after cancellation');
   gameId++;phase='ChampSelect';await fresh(snapshot=>snapshot.phase==='ChampSelect'&&String(snapshot.session.gameId)===String(gameId));
   await until(()=>intent===hero('Ahri').key,'Explicit lobby hero did not hover on entry');await delay(2600);
   assert.equal(writes.length,before+3,'Explicit lobby hero must prepare hover, runes and spells exactly once');
   assert.equal(page.selectedPerkIds.length,9);
   side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));
   await until(()=>js(side,'!!document.querySelector(".companion-shell[data-tab=plan] .configuration-current")'),'Explicit hero choice did not open configuration');
   side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));
   const configurationWrites=writes.length;
   await click(side,'.configuration-choice:not(.configuration-current) [data-action=configuration-switch]');
   await until(()=>writes.length===configurationWrites+3,'Whole configuration switch did not prepare all client settings');
   await until(()=>results.length===attempts.length,'Whole configuration switch did not finish');
   assert.equal(intent,hero('Ahri').key,'Switching configuration changed the hero');
   assert.equal(results.at(-1).complete,true);assert.notEqual(attempts.at(-1).preselectOnly,true);
   const stale=structuredClone(await state());
   await lobby();await until(async()=>!(await state()).draft.preselection,'Dodge did not clear the consumed intent');
   // A delayed renderer can rebase on the accepted lobby state before its
   // old whole-draft snapshot reaches main. The current phase still wins.
   const lobbyBase=structuredClone(await state());
   await js(main,'window.buddy.saveState('+JSON.stringify(stale)+','+JSON.stringify(lobbyBase)+')');
   const afterLateSave=(await state()).draft;
   assert.equal(afterLateSave.preselection,undefined);assert.equal(afterLateSave.partyCount,undefined);assert.equal(afterLateSave.clientGameId,undefined);
   assert.equal(afterLateSave.slots.some(slot=>slot.champion||Number.isInteger(slot.clientCellId)),false,'Delayed old draft restored picks in the lobby');
   gameId++;phase='ChampSelect';await fresh(snapshot=>snapshot.phase==='ChampSelect'&&String(snapshot.session.gameId)===String(gameId));await delay(2800);
   assert.equal(intent,0);assert.equal(writes.length,configurationWrites+3,'A new draft repeated the previous round\'s preselection');
  });
 }
 if(handlers.has('stage-selection'))await checkpoint('recommendation-popup-menus-dismiss-without-changing-the-draft',async()=>{
  const before=structuredClone((await state()).draft),writeCount=writes.length;
  side=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().includes('surface=companion'));
  await click(side,'[data-action=companion-tab][data-tab=recommend]');
  for(const [window,menu,other] of [[main,'.window-tools','.pregame-more'],[side,'.companion-navigation-more','.pregame-more']]){
   await js(window,`document.querySelector('${menu}>summary').click()`);await delay(60);
   await js(window,`document.querySelector('${other}>summary').click()`);await delay(60);
   assert.equal(await js(window,`document.querySelector('${menu}').open`),false,'Opening a second menu left the previous popup open');
   assert.equal(await js(window,`document.querySelector('${other}').open`),true);
   await js(window,`document.querySelector('${other}>div button').focus()`);
   window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await delay(60);
   assert.equal(await js(window,`document.querySelector('${other}').open`),false);
   assert.equal(await js(window,`document.activeElement===document.querySelector('${other}>summary')`),true,'Escape did not return focus to the opener');
   await js(window,`document.querySelector('${menu}>summary').click();document.querySelector('${menu}>div button').focus()`);await delay(60);
   window.webContents.send('room-update',{mode:'idle',members:[],ballots:false});await delay(120);
   assert.equal(await js(window,`document.querySelector('${menu}').open`),true,'Background refresh closed a popup in use');
   assert.equal(await js(window,`document.activeElement.closest('${menu}')!==null`),true);
   const point=await js(window,'(()=>{const r=document.querySelector(".companion-section-head h3,.draft-compare-header h1").getBoundingClientRect();return {x:Math.round(r.x+3),y:Math.round(r.y+3)}})()');
   window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await delay(60);
   assert.equal(await js(window,`document.querySelector('${menu}').open`),false,'Clicking the workspace did not close the popup');
  }
  assert.equal(writes.length,writeCount,'Popup navigation dispatched a client write');assert.deepEqual((await state()).draft,before,'Popup navigation changed the selection');
 });
 await checkpoint('closing-main-stays-closed-until-explicit-open',async()=>{
  const before=windows.length,writeCount=writes.length;
  main.close();await until(()=>main.isDestroyed(),'Main close did not finish');
  for(let n=0;n<3;n++)await js(side,'window.buddy.client(true)');
  assert.equal(windows.length,before,'Background polling recreated an explicitly closed main');
  await js(side,'window.buddy.openMainPage({route:"settings"})');
  await until(()=>{const reopened=windows.find(window=>!window.isDestroyed()&&window.webContents.getURL().endsWith('/src/index.html'));if(reopened){main=reopened;return true;}},'Explicit open did not restore main');
  assert.equal(writes.length,writeCount,'Window operations wrote client state');
 });
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
