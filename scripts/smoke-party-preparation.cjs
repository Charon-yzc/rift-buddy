const {app,screen,globalShortcut,ipcMain,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),http=require('node:http'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],handlers=new Map(),attempts=[],results=[],hoverAttempts=[],hoverResults=[],writes=[],roomSockets=[];
let diagnosticMain,diagnosticSide;
const selectionLatency=process.env.RIFT_BUDDY_SELECTION_LATENCY==='1';
let measuringSelection=false,firstSelectionPatchAt=0;
app.setPath('userData',root);globalShortcut.register=()=>false;
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
global.fetch=async()=>{throw Error('External network disabled in isolated party fixture');};http.request=()=>{throw Error('Real sockets forbidden in isolated party fixture');};
// Synthetic relay: exercise the room UI without opening any socket.
global.WebSocket=class {
 constructor(url){this.url=url;this.readyState=0;this.bufferedAmount=0;roomSockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}
 send(text){const frame=JSON.parse(text);if(frame.kind==='hello'){queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({kind:'welcome',v:1,room:new URL(this.url).pathname.split('/').at(-1),members:[{nick:frame.nick}],ballots:1,multiVotes:1,adoptions:1,packedStates:2,championUsage:1})}));}if(frame.kind==='ping')queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({kind:'pong',v:1})}));}
 close(code=1000){this.readyState=3;this.onclose?.({code});}
};
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>{handlers.set(name,handler);handle(name,async(...args)=>{if(measuringSelection&&['client-status','save-state'].includes(name))await new Promise(resolve=>setTimeout(resolve,1500));if(name==='prepare-selection')(args[1].preselectOnly?hoverAttempts:attempts).push(structuredClone(args[1]));const result=await handler(...args);if(name==='prepare-selection')(args[1].preselectOnly?hoverResults:results).push(structuredClone(result));return result;});};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<180;n++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile('release/latest.json')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),hero=id=>data.champions.find(c=>c.id===id),initial=JSON.parse(await fs.readFile(path.join(root,'settings.json'))),originalPlan=initial.draft.creativePlan,fixture=JSON.parse(await fs.readFile(path.join(root,'party-fixture.json'))),unadopted=process.env.RIFT_BUDDY_UNADOPTED==='1';
 assert.equal(fixture.unadopted,unadopted,'Wrapper and renderer fixture variants differ');
 let observer,phase='Lobby',gameflowId=0,gameId=471001,intent=0,picked=0,friendIntent=0,friendPicked=0,completed=false,spell1Id=4,spell2Id=12,requests=0,holdRune=true,resumeRune=null;
 const customGame=process.env.RIFT_BUDDY_CUSTOM_GAME==='1',loadingTransition=process.env.RIFT_BUDDY_LOADING_TRANSITION==='1',loadingNewGame=process.env.RIFT_BUDDY_LOADING_NEW_GAME==='1',rename=fs.rename;
 if(loadingTransition)fs.rename=async(from,to)=>{const result=await rename(from,to);if(String(to).endsWith('rift-buddy-3-mid-rift.json')){assert.ok(path.resolve(to).startsWith(root+path.sep));picked=intent;intent=0;completed=true;if(loadingNewGame)gameId++;gameflowId=gameId;phase='GameStart';}return result;};
 let page={id:44,name:'Isolated editable page',isEditable:true,isActive:true,current:true};
 const rawSession=()=>({gameId,localPlayerCellId:2,myTeam:[{cellId:0,puuid:'fixture-camille-00000001',championId:unadopted?friendPicked:hero('Camille').key,championPickIntent:friendIntent,assignedPosition:'TOP'},{cellId:1,puuid:'fixture-vi-000000000001',championId:unadopted?0:hero('Vi').key,assignedPosition:'JUNGLE'},{cellId:2,puuid:'fixture-own-00000000001',championId:picked,championPickIntent:intent,assignedPosition:'MIDDLE'},{cellId:3,championId:0,assignedPosition:'BOTTOM'},{cellId:4,championId:0,assignedPosition:'UTILITY'}],theirTeam:[],actions:[[{id:0,type:'pick',actorCellId:0,championId:unadopted?friendPicked:hero('Camille').key,completed:!unadopted||!!friendPicked},{id:1,type:'pick',actorCellId:1,championId:unadopted?0:hero('Vi').key,completed:!unadopted},{id:2,type:'pick',actorCellId:2,championId:intent||picked,completed,isInProgress:!completed}]],timer:{phase:'PLANNING',remainingMs:90000},bans:{myTeamBans:[],theirTeamBans:[]},allowDuplicatePicks:false});
 const output=options=>{
  requests++;assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  const method=options.method||'GET',route=options.path,body=options.body===undefined?undefined:JSON.parse(options.body);
  if(method==='GET'){
   if(route==='/lol-summoner/v1/current-summoner')return {gameName:'隔离测试玩家',tagLine:'TEST'};
   if(route==='/lol-gameflow/v1/gameflow-phase')return phase;
   if(route==='/lol-gameflow/v1/session')return customGame?{gameData:{gameId:gameflowId,isCustomGame:true,queue:{id:0,gameMode:''}},map:{id:11,gameMode:'CLASSIC'}}:{gameData:{gameId:gameflowId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
   if(route==='/lol-champ-select/v1/session')return rawSession();
   if(route.endsWith('/pickable-champion-ids'))return data.champions.map(c=>c.key);
   if(route.endsWith('/disabled-champion-ids'))return [];
   if(route==='/lol-lobby/v2/lobby')return {localMember:{puuid:'fixture-own-00000000001'},members:[{puuid:'fixture-camille-00000001'},{puuid:'fixture-vi-000000000001'},{puuid:'fixture-own-00000000001',isLeader:true}]};
   if(route==='/lol-perks/v1/pages')return [page];
   if(route==='/lol-champ-select/v1/session/my-selection')return {spell1Id,spell2Id};
   if(route==='/data-store/v1/install-dir')return path.join(root,'client-fixture','LeagueClient');
   // Completion notices read conversations asynchronously after preparation.
   // A missing chat room is a valid read, never an application write.
   if(route==='/lol-chat/v1/conversations')return [];
   throw Error('Unsupported mocked read '+route);
  }
  writes.push({route,method,body});
  if(route==='/lol-champ-select/v1/session/actions/2'&&method==='PATCH'){if(measuringSelection&&!firstSelectionPatchAt)firstSelectionPatchAt=Date.now();assert.equal(body.completed,false,'Application must never lock a champion');intent=body.championId;return {};}
  if(route==='/lol-perks/v1/pages/44'&&method==='PUT'){page={...body,id:44,isEditable:true,isActive:true,current:true};return page;}
  if(route==='/lol-champ-select/v1/session/my-selection'&&method==='PATCH'){({spell1Id,spell2Id}=body);return {};}
  throw Error('Unsupported mocked route '+method+' '+route);
 };
 https.request=(options,callback)=>{const request=new EventEmitter();request.write=body=>{options.body=body;};request.end=()=>queueMicrotask(()=>{const send=()=>{try{const value=output(options),response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');request.emit('close');}catch(error){request.emit('error',error);}};if(holdRune&&options.method==='PUT'&&options.path==='/lol-perks/v1/pages/44')resumeRune=send;else if(measuringSelection)setTimeout(send,20);else send();});request.destroy=error=>{if(error)request.emit('error',error);};return request;};
 cp.spawn=file=>{assert.ok(file.endsWith('window-observer.exe'),'Unexpected native subprocess');observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
 cp.execFile=(file,args,options,callback)=>{assert.ok(file.endsWith('csc.exe'),'Unexpected native compilation');queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
 require(path.join(base,'electron/main.cjs'));
 let main,side;await until(()=>{main=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main window missing');diagnosticMain=main;
 const js=(window,code)=>window.webContents.executeJavaScript(code,true).catch(error=>{throw Error('Failed expression '+code,{cause:error});});
 const capture=async(window,name)=>{await window.webContents.capturePage();await delay(100);await fs.writeFile(path.join(root,name),(await window.webContents.capturePage()).toPNG());};
 const click=(window,selector)=>until(()=>js(window,'(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el||el.disabled)return false;el.click();return true;})()'),'Enabled control '+selector);
 const settled=()=>until(()=>js(side,'!document.querySelector(".companion-shell")?.textContent.includes("正在预选并配置")'),'Preparation renderer did not settle');
 const event=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
 const state=async()=>structuredClone((await handlers.get('bootstrap')(event(main))).state);
 const configurationState=value=>({preparations:value.preparations,flashSlot:value.preferences.flashSlot,guide:value.guide});
 const readonlyProbe=async(window,scope,before)=>{
  const controls=await js(window,'[...document.querySelectorAll('+JSON.stringify(scope+' button,'+scope+' select,'+scope+' input')+')].filter(el=>el.matches("select,input")||/^(?:configuration-switch|companion-(?:summoner|rune|core|condition|skill|later)|build-(?:summoner|rune|core|condition|skill|later)|matchup-(?:rune|core|skill)|source-opponent-reset)/.test(el.dataset.action||"")).map(el=>({action:el.dataset.action,disabled:el.disabled}))');
  assert.ok(controls.length>2,'Readonly fixture needs whole configuration controls');assert.ok(controls.every(control=>control.disabled),'Readonly configuration exposes an enabled editor');
  const prefix=scope.includes('drawer')?'build':'companion';
  for(const selector of ['[data-action=configuration-switch]','[data-action='+prefix+'-summoner][data-field=summoner-swap]','[data-rune-field]','[data-skill-index]','[data-action=matchup-rune]']){
   await js(window,'(()=>{document.querySelector("#toast").textContent="";const host=document.querySelector('+JSON.stringify(scope)+');let el=host.querySelector('+JSON.stringify(selector)+');if(!el){el=document.createElement("button");el.dataset.action="matchup-rune";host.append(el);}el.disabled=false;if(el.tagName==="SELECT"){el.value=[...el.options].find(o=>o.value!==el.value)?.value||el.value;el.dispatchEvent(new Event("change",{bubbles:true}));}else el.click();})()');
   await until(()=>js(window,'document.querySelector("#toast").textContent.includes("队友配置仅供查看")'),'Synthetic readonly editor event was not rejected');
   assert.deepEqual(configurationState(await state()),configurationState(before),'Readonly event changed saved configuration, Flash preference or guide');
  }
  await fs.writeFile(path.join(root,prefix+'-readonly.png'),(await window.webContents.capturePage()).toPNG());
 };
 await until(()=>js(main,'!!document.querySelector("[data-client-connect]")'),'Main UI missing');await until(()=>observer,'Native observer mock missing');
 const area=screen.getPrimaryDisplay().workArea,anchor={x:area.x+20,y:area.y+20,width:Math.max(600,area.width-500),height:Math.min(800,area.height-40)};
 observer.stdout.emit('data',JSON.stringify({client:{...screen.dipToScreenRect(null,anchor),foreground:false,minimized:false},game:null})+'\n');
 await click(main,'[data-client-connect]');await until(()=>js(main,'window.buddy.bootstrap().then(b=>b.client.phase==="Lobby"&&b.client.party?.status==="lobby")'),'Public lobby fixture missing');phase='ChampSelect';await handlers.get('client-status')(event(main),true);await until(()=>{side=windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('surface=companion'));return side;},'Independent sidebar missing');diagnosticSide=side;
 await until(()=>js(side,'!!document.querySelector(".companion-shell")'),'Sidebar UI missing');await click(side,'[data-action=sync]');
 if(customGame)assert.equal((await handlers.get('client-status')(event(side),false)).mode.id,'rift','Custom map was not recognized through the actual snapshot');
 // Reapply the adopted plan explicitly; a candidate click now selects that candidate's independent configuration.
 if(!unadopted)await click(side,'[data-action=companion-tab][data-tab=plan]');
 const heroButton=unadopted?'[data-action=companion-preview][data-id=Galio]':'[data-action=configuration-switch][data-config=current]';
 await until(()=>js(side,'!!document.querySelector('+JSON.stringify(heroButton)+')'),'Galio recommendation missing');
 assert.equal((await state()).preferences.clickPrepare,true);assert.equal(attempts.length,0);
 const itemIds=value=>value.itemSet.blocks.flatMap(block=>block.items.map(item=>Number(item.id)));
 const ownPlan=async()=>{await click(side,'[data-action=companion-tab][data-tab=plan]');await until(()=>js(side,'!!document.querySelector("[data-action=configuration-switch][data-config=current]")'),'My plan controls missing');return js(side,'JSON.parse(document.querySelector("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]');};
 const mockedRuneWrites=()=>writes.filter(w=>w.route.startsWith('/lol-perks/v1/pages/')).length;
 if(process.env.RIFT_BUDDY_STANDALONE_ITEMS==='1'){
  const prepared=await ownPlan();assert.equal(prepared.champion,'Galio');
  assert.equal(await js(side,'!!document.querySelector(".configuration-current")'),true,'Adopted own plan must be visible before hovering');
  intent=hero('Galio').key;await click(side,'[data-action=sync]');await until(()=>js(side,'!document.querySelector("[data-action=sync]")?.textContent.includes("连接中")'),'Public hover sync pending');await delay(250);
  assert.equal((await ownPlan()).champion,'Galio','Matching client hover replaced the adopted task');
  assert.equal(await js(side,'document.querySelector("[data-action=configuration-switch][data-config=current]").dataset.plan'),'Galio:mid:rift','Editor and task target split');
  await click(main,'[data-action=task-edit],[data-action=task-configuration]');await until(()=>js(main,'!!document.querySelector(".drawer [data-action=import-item-set]")'),'Own drawer missing');
  await click(main,'.drawer [data-action=import-item-set]');
  for(const win of [main,side]){
   await until(()=>js(win,'/已写入|已更新/.test(document.querySelector(".item-set-status")?.textContent||"")'),'Independent item field receipt missing');
   assert.equal(await js(win,'document.querySelectorAll("[data-preparation-step=runes][data-step-status=done],[data-preparation-step=spells][data-step-status=done],[data-preparation-step=hover][data-step-status=done]").length'),0,'Item-only write implied other steps completed');
   assert.match(await js(win,'document.querySelector(".item-set-status")?.textContent||""'),/已写入|已更新/);
  }
  assert.equal(attempts.length,0);assert.equal(writes.length,0,'Independent item import wrote to client selection or runes');
  const previousSide=side;previousSide.destroy();await click(main,'[data-action=close]');await click(main,'[data-action=companion-attach]');
  await until(()=>{side=windows.find(w=>w!==previousSide&&!w.isDestroyed()&&w.webContents.getURL().includes('surface=companion'));return side;},'Sidebar did not rebuild');diagnosticSide=side;
  await until(()=>js(side,'!!document.querySelector(".companion-shell")'),'Rebuilt sidebar UI missing');await ownPlan();await until(()=>js(side,'/已写入|已更新/.test(document.querySelector(".item-set-status")?.textContent||"")'),'Item-only receipt was lost on rebuild');
  assert.equal(await js(side,'document.querySelectorAll("[data-preparation-step=runes][data-step-status=done],[data-preparation-step=spells][data-step-status=done],[data-preparation-step=hover][data-step-status=done]").length'),0);
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
  const expected=fixture.candidateValue,assertConfiguration=(value,label)=>{assert.deepEqual(value.page,expected.page,label+' changed the full rune page');assert.deepEqual(value.summoners,expected.summoners,label+' changed D/F');assert.deepEqual(value.itemSet.blocks,expected.itemSet.blocks,label+' changed the full equipment plan');};
  const assertStoredSolo=async()=>{const current=await state();assert.equal(current.draft.creativePlan,undefined,'A candidate avatar prepares one hero without implicitly adopting the group');assert.deepEqual(current.preparations.find(p=>p.id==='Galio'&&p.role==='mid'&&p.mode==='rift'&&p.comboId===fixture.oldSolo.comboId),fixture.oldSolo,'Candidate flow overwrote the saved solo configuration');return current;};
  assert.equal(originalPlan,undefined);assert.deepEqual(initial.preparations,[fixture.oldSolo]);assert.ok(initial.draft.slots.every(s=>s.champion===null));
  assert.deepEqual(initial.draft.slots.filter(s=>s.party).map(s=>s.role),['top','jungle','mid']);
  assert.equal(fixture.oldSoloValue.page.selectedPerkIds[0],8439);assert.notDeepEqual(expected.page,fixture.oldSoloValue.page);
  assert.notDeepEqual(expected.page,fixture.oldSoloValue.page);assert.notDeepEqual(expected.summoners,fixture.oldSoloValue.summoners);assert.deepEqual(expected.itemSet.blocks,fixture.oldSoloValue.itemSet.blocks,'The same source gear stays independent of the saved other-route rune');
  assert.ok((await assertStoredSolo()).draft.slots.every(s=>s.champion===null),'Client sync filled unknown teammate picks');
  await until(()=>js(side,'!!document.querySelector(".companion-candidate")'),'Candidate capture missing');await delay(250);await capture(side,'selection-sidebar.png');
  assert.equal(await js(side,'!!document.querySelector(".preparation-task,.client-preparation-result")'),false,'Selection duplicates configuration');
  await click(side,'[data-action=companion-tab][data-tab=room]');
  assert.equal(await js(side,'!!document.querySelector("[data-action=room-reconnect]")&&!document.querySelector(".modal-backdrop,.companion-roster")'),true,'Room is not an independent page');
  assert.equal(await js(side,'document.querySelector("#room-nick").value'),'隔离测试玩家#TEST');
  await delay(250);await capture(side,'room-sidebar.png');
  await js(side,'(()=>{for(const [id,value] of [["room-relay-url","ws://127.0.0.1:18000"],["room-relay-room","123456"],["room-pin","654321"]]){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));}})()');
  await click(side,'[data-action=room-relay-join]');await until(()=>js(side,'!!document.querySelector("[data-action=room-leave]")'),'Synthetic room did not join');
  await click(side,'[data-action=companion-tab][data-tab=recommend]');
  await until(()=>js(side,'!!document.querySelector("[data-action=propose-result]")'),'Candidate proposal control missing');
  if(process.env.RIFT_BUDDY_USAGE_STABILITY==='1'){
   await js(side,'(()=>{window.__usageRequests=[];const post=Worker.prototype.postMessage;Worker.prototype.postMessage=function(value,...rest){window.__usageRequests.push(structuredClone(value.input));return post.call(this,value,...rest);};return true;})()');
   const own=n=>({revision:100000+n,status:n===500?'ready':'loading',session:'a'.repeat(32),usage:{sampled:n,counts:{Galio:n}}});
   const peer=(nick,n)=>({kind:'state',v:1,from:nick,at:100000+n,lineup:[],pick:null,mode:'rift',championUsage:{version:1,mass:.85,usage:{sampled:n,counts:{Lux:n}}}}),socket=roomSockets.at(-1);
   for(const nick of ['伙伴甲','伙伴乙'])socket.onmessage({data:JSON.stringify({kind:'join',v:1,from:nick})});
   for(const nick of ['伙伴甲','伙伴乙'])socket.onmessage({data:JSON.stringify(peer(nick,1))});
   side.webContents.send('champion-usage',own(1));await delay(200);
   await until(()=>js(side,'document.querySelector(".companion-candidates")?.getAttribute("aria-busy")==="false"'),'Initial pool busy');
   await click(side,'[data-action=reroll]');await until(()=>js(side,'document.querySelector(".companion-candidates")?.getAttribute("aria-busy")==="false"'),'Initial snapshot busy');
   await click(side,'.candidate-details>summary');await delay(100);
   const initialRequests=await js(side,'window.__usageRequests.length'),before=await js(side,'document.querySelector(".companion-candidates").textContent');
   const sampled=await js(side,'window.__usageRequests.at(-1).roomFamiliarity.map(m=>m.usage.sampled)');assert.deepEqual(sampled,[1,1,1]);
   await js(side,'document.querySelector(".companion-content").scrollTop=80');const scrollBefore=await js(side,'document.querySelector(".companion-content").scrollTop');assert.ok(scrollBefore>0,'Expanded candidate must provide real scroll coverage');await capture(side,'usage-before.png');
   for(let n=25;n<=500;n+=25){side.webContents.send('champion-usage',own(n));for(const nick of ['伙伴甲','伙伴乙'])socket.onmessage({data:JSON.stringify(peer(nick,n))});await delay(35);}
   await delay(400);assert.equal(await js(side,'window.__usageRequests.length'),initialRequests,'Progress restarted the actual worker');
   assert.equal(await js(side,'document.querySelector(".companion-candidates").textContent'),before,'Progress reordered visible candidates');assert.equal(await js(side,'document.querySelector(".companion-content").scrollTop'),scrollBefore,'Progress jumped scroll');await capture(side,'usage-after.png');
   await click(side,'[data-action=reroll]');await until(()=>js(side,'window.__usageRequests.length>'+initialRequests+'&&document.querySelector(".companion-candidates")?.getAttribute("aria-busy")==="false"'),'Explicit refresh busy');
   assert.deepEqual(await js(side,'window.__usageRequests.at(-1).roomFamiliarity.map(m=>m.usage.sampled)'),[500,500,500]);await capture(side,'usage-refreshed.png');
   const seeds=[await js(side,'window.__usageRequests.at(-1).randomSeed')];
   for(let batch=0;batch<3;batch++){
    const count=await js(side,'window.__usageRequests.length');await click(side,'[data-action=reroll]');await until(()=>js(side,'window.__usageRequests.length>'+count+'&&document.querySelector(".companion-candidates")?.getAttribute("aria-busy")==="false"'),'Repeated familiar refresh busy');
    seeds.push(await js(side,'window.__usageRequests.at(-1).randomSeed'));assert.equal(await js(side,'window.__usageRequests.at(-1).offset'),0);assert(await js(side,'!!document.querySelector(".candidate-member[data-id=Galio]")'),'Known hero disappeared on reroll');
   }
   assert.equal(new Set(seeds).size,4,'Each weighted reroll needs a fresh draw');
   assert.equal(writes.length,0);assert.equal(attempts.length,0);console.log(JSON.stringify({passed:true,progressBatches:20,roomMembers:3,progressWorkerRuns:0,scrollBefore,scrollAfter:scrollBefore,explicitRefreshSamples:[500,500,500],independentRerolls:3,clientWrites:0}));app.quit();return;
  }
  await click(side,'[data-action=propose-result]');await until(()=>js(side,'!!document.querySelector(".room-ballot-board .room-ballot-row")'),'Proposal is not visible above candidates');
  const layout=await js(side,'(()=>{const row=document.querySelector(".room-ballot-row"),candidate=document.querySelector(".companion-candidate"),box=selector=>row.querySelector(selector).getBoundingClientRect();return {boardY:row.getBoundingClientRect().top,candidateY:candidate.getBoundingClientRect().top,boardWidth:row.getBoundingClientRect().width,candidateWidth:candidate.getBoundingClientRect().width,adoptVisible:!!row.querySelector("[data-action=room-adopt-ballot]"),voteY:box("[data-action=room-vote]").top,detailsY:box("[data-action=room-ballot-details]").top,candidateDetails: getComputedStyle(candidate.querySelector(".candidate-details>summary")).position};})()');
  assert.ok(layout.boardY<layout.candidateY);assert.equal(layout.adoptVisible,false);assert.ok(Math.abs(layout.boardWidth-layout.candidateWidth)<=2,JSON.stringify(layout));assert.ok(layout.detailsY>layout.voteY);assert.equal(layout.candidateDetails,'static');
  const {proposalKey}=await import(require('node:url').pathToFileURL(path.join(base,'src/core/room.mjs')).href),other={lineup:[{role:'bottom',champion:'Jinx'},{role:'support',champion:'Lulu'}],mode:'rift'},otherKey=proposalKey(other);
  const socket=roomSockets.at(-1);socket.onmessage({data:JSON.stringify({kind:'join',v:1,from:'测试队友'})});
  // A legacy peer's automatic snapshot must not create another kind of list.
  socket.onmessage({data:JSON.stringify({kind:'state',v:1,from:'测试队友',at:Date.now(),lineup:other.lineup,pick:null,mode:'rift'})});
  await until(()=>js(side,'window.buddy.roomStatus().then(r=>r.members.some(m=>m.nick==="测试队友"&&m.share?.lineup.length===2))'),'Legacy peer snapshot missing');
  await delay(100);assert.equal(await js(side,'document.querySelectorAll(".room-ballot-row").length'),1,'Unproposed state created a proposal');
  assert.equal(await js(side,'!!document.querySelector(".companion-room-shares,[data-companion-disclosure=room-shares],[data-action=room-adopt-lineup]")'),false,'Legacy shared lineup appeared');
  await capture(side,'legacy-peer-sidebar.png');
  await click(side,'[data-action=companion-tab][data-tab=room]');
  await until(()=>js(side,'document.querySelectorAll(".room-member").length===2'),'Room member presence missing');
  assert.equal(await js(side,'!!document.querySelector(".room-champs,[data-action=room-publish],[data-action=room-build]")'),false,'Room tab still exposes legacy sharing');
  assert.equal(await js(side,'document.querySelectorAll(".room-ballot-row").length'),1);await capture(side,'proposal-room-sidebar.png');
  await click(main,'[data-action=navigate][data-route=room]');
  await until(()=>js(main,'document.querySelectorAll(".room-member").length===2'),'Main room member presence missing');
  assert.equal(await js(main,'!!document.querySelector(".room-champs,[data-action=room-publish],[data-action=room-build]")'),false);assert.equal(await js(main,'document.querySelectorAll(".room-ballot-row").length'),1);await capture(main,'proposal-room-main.png');
  await click(main,'[data-action=navigate][data-route=draft]');await click(side,'[data-action=companion-tab][data-tab=recommend]');
  socket.onmessage({data:JSON.stringify({kind:'state',v:1,from:'测试队友',at:Date.now(),lineup:other.lineup,pick:null,mode:'rift',ballot:{version:1,proposal:other,vote:null}})});
  await until(()=>js(side,'document.querySelectorAll(".room-ballot-row").length===2'),'Second proposal missing');
  const myVotes=()=>js(side,'window.buddy.roomStatus().then(r=>r.members.find(m=>m.self).share.ballot.votes)'),ownKey=(await myVotes())[0];
  await click(side,'[data-action=room-vote][data-key="'+otherKey+'"]');await until(async()=>(await myVotes()).length===2,'Second vote replaced the first');
  assert.deepEqual(new Set(await myVotes()),new Set([ownKey,otherKey]));
  await click(side,'[data-action=room-vote][data-key="'+ownKey+'"]');await until(async()=>(await myVotes()).length===1,'Own vote was not cancelled');assert.deepEqual(await myVotes(),[otherKey]);
  await click(side,'[data-action=room-vote][data-key="'+ownKey+'"]');await until(async()=>(await myVotes()).length===2,'Re-voting did not retain the other choice');
  assert.equal(await js(side,'[...document.querySelectorAll(".room-ballot-row [data-action=room-vote]")].filter(b=>b.getAttribute("aria-pressed")==="true").length'),2);
  await delay(250);await capture(side,'proposal-sidebar.png');
  const candidate=await js(side,'(()=>{const el=document.querySelector("[data-action=companion-preview][data-id=Galio]");return {combo:el.dataset.combo,members:[...el.closest(".companion-candidate").querySelectorAll("[data-action=companion-preview]")].map(member=>member.dataset.role+":"+member.dataset.id)};})()');
  assert.ok(candidate.combo,'A complete candidate exposes its recognized plan identity for review');assert.deepEqual(candidate.members,['top:Camille','jungle:Vi','mid:Galio']);
  // Use the real candidate button, renderer and preparation service. The
  // fixture does not inject a guide/party plan; the one hero click adopts it.
  if(selectionLatency){measuringSelection=true;await js(side,'document.addEventListener("click",()=>window.selectionClickAt=Date.now(),{once:true,capture:true})');}
  await click(side,'[data-action=companion-preview][data-id=Galio]');await until(()=>resumeRune,'Unadopted candidate click did not reach the mock rune write');
  if(selectionLatency){
   const clickedAt=await js(side,'window.selectionClickAt'),elapsedMs=firstSelectionPatchAt-clickedAt;measuringSelection=false;
   const latency={source,archiveSha256:release?.archiveSha256||null,clickedAt,firstSelectionPatchAt,elapsedMs,loopbackResponseDelayMs:20,unrelatedStatusAndSaveDelayMs:1500,actualRendererAndMain:true,realClientWrites:0};
   await fs.writeFile(path.join(root,'selection-latency.json'),JSON.stringify(latency,null,2));console.log('SELECTION LATENCY '+JSON.stringify(latency));
   assert.ok(firstSelectionPatchAt>0&&elapsedMs>=0&&elapsedMs<1000,'Actual candidate click waited '+elapsedMs+'ms before its selection PATCH');
  }
  assertConfiguration(attempts[0],'Initial candidate click');assert.equal(attempts[0].sessionGameId,String(gameId));assert.equal(attempts[0].context.gameId,String(gameId));
  resumeRune();holdRune=false;await until(()=>results.length===1,'Unadopted candidate did not prepare');if(!loadingTransition)assert.equal(results[0].complete,true);
  if(loadingTransition){
   await until(()=>side.isDestroyed(),'Loading did not release the selection sidebar');
   const current=JSON.parse(await fs.readFile(path.join(root,'settings.json'))),prepared=current.preparations.find(p=>p.id==='Galio'&&!p.comboId);
   if(current.draft.creativePlan)assert.ok(current.draft.creativePlan.members.some(m=>m.champion==='Galio'));assert.deepEqual(current.preparations.find(p=>p.id==='Galio'&&p.comboId===fixture.oldSolo.comboId),fixture.oldSolo);assert.equal(mockedRuneWrites(),1);
   assert.equal(results[0].complete,false,'A phase change during equipment import must not claim a complete preparation');
   for(const step of ['hover','runes','spells'])assert.equal(results[0].steps[step].status,'done');assert.equal(results[0].steps.items.status,'failed');assert.match(results[0].steps.items.message,/已写入.*已离开选人阶段/);
   assert.equal(prepared,undefined,'A partial operation must not install a new generic configuration');assert.equal(current.guide,null,'A partial operation must not install an accepted guide');
   const imported=JSON.parse(await fs.readFile(path.join(root,'client-fixture','Game','Config','Champions','Galio','Recommended','rift-buddy-3-mid-rift.json')));assert.deepEqual(imported.blocks,expected.itemSet.blocks);assert.ok(writes.filter(w=>w.route.includes('/session/actions/')).every(w=>w.body.completed===false));
   const report={passed:true,source,archiveSha256:release?.archiveSha256||null,variant:loadingNewGame?'loading-new-game':'loading-transition',realRuneWrites:0,mockedRuneWrites:mockedRuneWrites(),allNetworkMocked:true,complete:results[0].complete,sideDestroyed:side.isDestroyed(),candidateConfigurationSaved:!!prepared,partialWriteReported:true,currentGuide:current.guide,savedOtherRoutePreserved:true,newGameGuideRejected:loadingNewGame,requests};await fs.writeFile(path.join(root,'party-preparation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.quit();return;
  }
  await settled();
  assert.equal(picked,0);assert.equal(intent,hero('Galio').key);assert.equal(completed,false);assert.equal(mockedRuneWrites(),1);
  assertConfiguration(await ownPlan(),'Pending player hover');await delay(250);await capture(side,'configuration-sidebar.png');let clickedConfiguration;await until(async()=>{const current=await assertStoredSolo();clickedConfiguration=current.preparations.find(p=>p.id==='Galio'&&!p.comboId);return !!clickedConfiguration;},'Hero-first click lost the existing independent preference');
  // Returning from recommendations and a stale gameflow response cannot
  // manufacture a known lineup or silently switch to the old solo default.
  const afterClick=writes.length;await click(side,'[data-action=companion-tab][data-tab=recommend]');assertConfiguration(await ownPlan(),'Returned pending hover');
  gameflowId=470000;await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');assertConfiguration(await ownPlan(),'Hover after client sync');await assertStoredSolo();assert.equal(writes.length,afterClick,'Hover navigation or sync reapplied the configuration');
  // Only the simulated player confirms Galio. Both real renderers must
  // display the same full preparation even with every teammate pick unknown.
  picked=intent;intent=0;completed=true;await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');
  // Locking legitimately opens configuration; inspect that drawer before
  // returning to the selection page whose body must not duplicate receipts.
  await until(()=>js(main,'!!document.querySelector(".configuration-drawer [data-preparation-step=runes][data-step-status=done]")'),'Locking did not open the completed configuration');
  assertConfiguration(await js(main,'JSON.parse(document.querySelector(".configuration-drawer [data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]'),'Automatic configuration after player confirmation');
  await click(main,'.configuration-drawer [data-action=close]');await until(()=>js(main,'!document.querySelector(".configuration-drawer")'),'Automatic configuration did not close');
  assert.equal(await js(main,'!!document.querySelector(".preparation-task,.client-preparation-result")'),false,'Selection page duplicates configuration receipts');
  assertConfiguration(await ownPlan(),'Sidebar after player confirmation');await click(main,'[data-action=task-edit],[data-action=task-configuration]');
  await until(()=>js(main,'document.querySelector(".drawer [data-preparation-step=runes]")?.dataset.stepStatus==="done"'),'Configuration page lost the rune receipt');
  const confirmed=await js(main,'JSON.parse(document.querySelector("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]');assertConfiguration(confirmed,'Main drawer after player confirmation');await click(main,'[data-action=close]');
  const confirmedState=await assertStoredSolo();assert.ok(confirmedState.draft.slots.filter(s=>s.role!=='mid').every(s=>!Number.isInteger(s.clientCellId)),'Proposed teammate heroes must not become confirmed public picks');assert.ok(rawSession().myTeam.filter(p=>p.cellId!==2).every(p=>p.championId===0));assert.equal(writes.length,afterClick,'Player confirmation performed an application write');
  await click(main,'[data-action=navigate][data-route=favorites]');await click(main,'[data-action=navigate][data-route=draft]');await click(side,'[data-action=companion-tab][data-tab=recommend]');assertConfiguration(await ownPlan(),'Navigation after confirmation');assert.equal(writes.length,afterClick,'Navigation reapplied the unadopted configuration');await assertStoredSolo();
  const stale=structuredClone(attempts[0]);gameId++;picked=0;intent=0;completed=false;
  await assert.rejects(handlers.get('prepare-selection')(event(side),stale),/选人会话已变化/);assert.equal(writes.length,afterClick,'Previous-game unadopted click performed a write');
  await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');await until(async()=>String((await state()).draft.clientGameId)===String(gameId),'New selection did not replace unadopted draft context');await until(()=>js(main,'!(document.querySelector(":is(.preparation-task,.client-preparation-result) [data-preparation-step=runes]")?.dataset.stepStatus==="done")'),'Previous unadopted rune confirmation survived a new session');await assertStoredSolo();
  const imported=JSON.parse(await fs.readFile(path.join(root,'client-fixture','Game','Config','Champions','Galio','Recommended','rift-buddy-3-mid-rift.json')));assert.deepEqual(imported.blocks,expected.itemSet.blocks);
  assert.equal(attempts.length,1);assert.equal(results.length,1);assert.equal(mockedRuneWrites(),1);assert.ok(writes.filter(w=>w.route.includes('/session/actions/')).every(w=>w.body.completed===false));assert.ok(windows.every(w=>w.isDestroyed()||!w.isVisible()));
  const report={passed:true,source,archiveSha256:release?.archiveSha256||null,variant:'unadopted',acceptedPlanId:null,candidatePlanId:clickedConfiguration.comboId||null,candidateMembers:candidate.members,savedOtherRouteConfiguration:fixture.oldSoloValue,defaultHeroClickPrepares:true,candidateClickAdoptsPlan:!!confirmedState.draft.creativePlan,teammateChampionsRemainUnknown:true,hoverRemainsUnlocked:true,sessionIdOverridesZeroAndPreviousGameflow:true,sameFullConfigurationAfterHover:true,sameConfigurationAfterPlayerConfirm:true,savedOtherRoutePreserved:true,playerConfirmationDoesNotWrite:true,navigationDoesNotWrite:true,previousSessionRejectedBeforeWrites:true,realGame:'UNPROVEN',realRuneWrites:0,mockedRuneWrites:mockedRuneWrites(),allNetworkMocked:true,requests,attempts,results,writes};
  await fs.writeFile(path.join(root,'party-preparation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,attempts:attempts.map(value=>({gameId:value.sessionGameId,perks:value.page.selectedPerkIds,summoners:value.summoners,itemIds:itemIds(value)})),writes:undefined},null,2));app.quit();return;
 }
 // The actual recommendation click uses the production prepare service and
 // loopback mocks, including its 0 -> intent transition and disk item import.
 await click(main,'[data-action=pregame-hero]');await js(main,'{const input=document.querySelector("#picker-search");input.value="Galio";input.dispatchEvent(new Event("input",{bubbles:true}));}');await click(main,'.champ-option[data-id=Galio]');await until(()=>resumeRune,'Hero click did not reach the mock rune write');
 const prepareEditingDisabled=await js(side,'!document.querySelector("[data-action=companion-summoner][data-field=summoner-swap]")||document.querySelector("[data-action=companion-summoner][data-field=summoner-swap]")?.disabled');
 if(!prepareEditingDisabled){await click(side,'[data-action=companion-summoner][data-field=summoner-swap]');await until(async()=>{const s=await state();return s.preparations.some(p=>p.id==='Galio'&&JSON.stringify(p.summonerIds)===JSON.stringify([...attempts[0].summoners].reverse()));},'Explicit preparation-time edit did not save');}
 resumeRune();holdRune=false;await until(()=>results.length===1,'Hero click did not prepare by default');assert.equal(results[0].complete,true);await settled();
 await until(()=>js(side,'!document.querySelector(".configuration-current [data-action=configuration-switch]")?.disabled'),'First preparation did not become idle');
 assert.equal(picked,0);assert.equal(intent,hero('Galio').key);assert.equal(completed,false);
 const perks=fixture.primaryValue.page.selectedPerkIds;
 assert.deepEqual(attempts[0].page.selectedPerkIds,perks);assert.equal(attempts[0].sessionGameId,String(gameId));assert.equal(attempts[0].context.gameId,String(gameId));
 assert.deepEqual(attempts[0].itemSet.blocks,fixture.primaryValue.itemSet.blocks,'The accepted plan starts from its ordinary selected-source equipment');
 const firstMyPlan=await ownPlan();assert.deepEqual(firstMyPlan.page.selectedPerkIds,perks);assert.deepEqual(firstMyPlan.itemSet.blocks,attempts[0].itemSet.blocks);
 if(!prepareEditingDisabled){assert.deepEqual(firstMyPlan.summoners,[...attempts[0].summoners].reverse(),'Preparation completion overwrote a newer explicit D/F edit');await click(side,'[data-action=companion-summoner][data-field=summoner-swap]');await until(async()=>JSON.stringify((await ownPlan()).summoners)===JSON.stringify(attempts[0].summoners),'Could not restore the initial D/F choice');}
 // Gameflow is still the previous game. It cannot clear the accepted lineup
 // or the current click's configuration when the session ID is authoritative.
 gameflowId=470000;await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');assert.equal((await state()).draft.creativePlan.id,originalPlan.id);
 await ownPlan();await click(side,'[data-action=configuration-switch][data-config=current]');await until(()=>results.length===2,'Second preparation missing');assert.equal(results[1].complete,true);await settled();
 assert.deepEqual(attempts[1].page.selectedPerkIds,perks);assert.deepEqual(attempts[1].itemSet.blocks,attempts[0].itemSet.blocks);assert.deepEqual(attempts[1].summoners,attempts[0].summoners);
 // Use a complete explicit generic selection in both renderers. A blank
 // default guide can legitimately follow the accepted group instead.
 const beforeConfiguration=writes.length,{getBuild}=await import(require('node:url').pathToFileURL(path.join(base,'src/core/builds.mjs'))),currentData=(await js(main,'window.buddy.bootstrap()')).data;
 const sourceRunes=getBuild(hero('Galio'),'mid',currentData).runeOptions,originalRune=sourceRunes.find(option=>JSON.stringify(option.page.selectedPerkIds)===JSON.stringify(perks)),remoteRune=sourceRunes.find(option=>option.page.selectedPerkIds[0]===8439);assert.ok(originalRune&&remoteRune);
 const personalContext={...(await state()).preparations.findLast(value=>value.id==='Galio'&&!value.comboId),runeId:originalRune.id};assert.equal(personalContext.comboId,undefined);
 main.webContents.send('open-build',personalContext);await until(()=>js(main,'!!document.querySelector(".drawer [data-client-preparation-fingerprint]")'),'Personal main editor missing');await ownPlan();
 await js(main,'window.buddy.openGuide('+JSON.stringify(personalContext)+')');assert.equal((await state()).guide.selection.comboId,undefined,'The explicit generic guide must have the same identity as the editors');
 const swapped=[...attempts[0].summoners].reverse();assert.equal((await js(side,'window.buddy.updateGuide('+JSON.stringify({...personalContext,summonerIds:swapped,changedFields:['summonerIds']})+')')).updated,true);
 await until(async()=>JSON.stringify((await state()).preparations.find(p=>p.id==='Galio'&&!p.comboId)?.summonerIds)===JSON.stringify(swapped),'Explicit personal D/F choice not saved');
 const flashBase=await state(),flashNext=structuredClone(flashBase);flashNext.preferences.flashSlot=swapped[0]==='SummonerFlash'?'d':'f';await handlers.get('save-state')(event(main),flashNext,flashBase,undefined,undefined);
 await until(()=>js(main,'JSON.stringify(JSON.parse(document.querySelector(".drawer [data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0].summoners)==='+JSON.stringify(JSON.stringify(swapped))),'Open main editor did not accept the personal D/F choice');
 assert.equal((await js(side,'window.buddy.updateGuide('+JSON.stringify({...personalContext,runeId:remoteRune.id,changedFields:['runeId']})+')')).updated,true);
 await until(()=>js(main,'JSON.parse(document.querySelector(".drawer [data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0].page.selectedPerkIds[0]===8439'),'Open main editor lost the other window rune edit');
 assert.equal((await state()).preparations.find(p=>p.id==='Galio'&&!p.comboId).runeId,remoteRune.id);assert.equal(writes.length,beforeConfiguration,'Editing configuration must not write runes');
 const chosenCard='[data-action=configuration-switch][data-config=current]';assert.equal(await js(side,'JSON.parse(document.querySelector('+JSON.stringify(chosenCard)+').closest("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0].page.selectedPerkIds[0]'),8439,'The current personal configuration must contain the other window rune edit');await click(side,chosenCard);await until(()=>results.length===3,'Edited personal configuration was not applied');assert.equal(results[2].complete,true);await settled();
 assert.deepEqual(attempts[2].summoners,swapped);assert.deepEqual(attempts[2].page.selectedPerkIds,remoteRune.page.selectedPerkIds,'Explicit configuration reapply must not reset the selected rune to the avatar default');assert.deepEqual(attempts[2].itemSet.blocks,attempts[0].itemSet.blocks);if(await js(main,'!!document.querySelector(".drawer [data-action=close]")'))await click(main,'[data-action=close]');
 // The independent hero picker remains an explicit complete preparation click.
 await click(main,'[data-action=pregame-hero]');await js(main,'{const input=document.querySelector("#picker-search");input.value="Galio";input.dispatchEvent(new Event("input",{bubbles:true}));}');await click(main,'.champ-option[data-id=Galio]');await until(()=>results.length===4,'Main avatar click did not prepare by default');assert.equal(results[3].complete,true);await until(()=>js(main,'!document.querySelector("[data-action=pregame-hero]")?.disabled&&!document.querySelector(".drawer")'),'Main avatar hover did not remain on recommendations');await click(main,'[data-action=task-edit],[data-action=task-configuration]');await until(()=>js(main,'!!document.querySelector(".drawer [data-client-preparation-fingerprint]")'),'Explicit main configuration did not open');
 assert.deepEqual(attempts[3].summoners,swapped);assert.deepEqual(attempts[3].page.selectedPerkIds,perks);assert.deepEqual(attempts[3].itemSet.blocks,attempts[0].itemSet.blocks);assert.equal(picked,0);assert.equal(intent,hero('Galio').key);assert.equal(completed,false);assert.equal(await js(main,'!!document.querySelector(".drawer")'),true,'Explicit configuration navigation must show the clicked configuration');
 const clickedMainPlan=await js(main,'JSON.parse(document.querySelector(".drawer [data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]');assert.equal(clickedMainPlan.champion,'Galio');assert.deepEqual(clickedMainPlan.summoners,attempts[3].summoners);assert.deepEqual(clickedMainPlan.page.selectedPerkIds,attempts[3].page.selectedPerkIds);assert.deepEqual(clickedMainPlan.itemSet.blocks,attempts[3].itemSet.blocks);
 await until(async()=>{const value=await ownPlan();return JSON.stringify(value.page.selectedPerkIds)===JSON.stringify(perks)&&JSON.stringify(value.summoners)===JSON.stringify(swapped);},'Main avatar click changed the shared sidebar configuration');
 // Teammate detail remains read-only; rebuilding a native sidebar replays receipts.
 await click(main,'[data-action=close]');const beforeReadonly=writes.length,beforeReadonlyState=await state();assert.equal(await js(main,'document.querySelector(".champ-pick[data-id=Vi][data-role=jungle]").hasAttribute("data-action")'),false);await js(main,'document.querySelector(".champ-pick[data-id=Vi][data-role=jungle]").click()');assert.equal(await js(main,'!!document.querySelector(".drawer")'),false,'A displayed teammate still opens a configuration');assert.deepEqual(await state(),beforeReadonlyState);assert.equal(writes.length,beforeReadonly);
 const previousSide=side;previousSide.destroy();await click(main,'[data-action=companion-attach]');
 await until(()=>{side=windows.find(w=>w!==previousSide&&!w.isDestroyed()&&w.webContents.getURL().includes('surface=companion'));return side;},'Native sidebar did not rebuild');diagnosticSide=side;
 await ownPlan();await until(()=>js(side,'document.querySelectorAll(":is(.preparation-task,.client-preparation-result) [data-step-status=done]").length===4'),'Rebuilt sidebar lost current four-step receipts');
 assert.equal(writes.length,beforeReadonly,'Rebuilding a sidebar reapplied the configuration');
 // A different accepted route has its own configuration identity. It does
 // not overwrite the pending personal default; applying it is an explicit click.
 const save=handlers.get('save-state'),mainEvent=event(main),beforeRoute=writes.length,routeBase=await state(),alternate=structuredClone(routeBase);alternate.draft.creativePlan=fixture.alternativePlan;
 const personalBefore=structuredClone(routeBase.preparations.find(p=>p.id==='Galio'&&!p.comboId));
 const routeAccepted=await save(mainEvent,alternate,routeBase,undefined,undefined);main.webContents.send('state-update',routeAccepted);await js(main,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');assert.equal(writes.length,beforeRoute,'Accepting a route must not write runes');
 assert.deepEqual((await state()).preparations.find(p=>p.id==='Galio'&&!p.comboId),personalBefore,'A route identity must not overwrite the personal default');
 main.webContents.send('open-build',fixture.alternativeSelection);await until(()=>js(main,'!!document.querySelector(".drawer [data-action=client-prepare][data-preparation-view=build]")'),'Explicit alternate route editor missing');
 const alternateValue=await js(main,'JSON.parse(document.querySelector(".drawer [data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]');
 assert.deepEqual(alternateValue.page.selectedPerkIds,fixture.alternativeValue.page.selectedPerkIds);assert.deepEqual(alternateValue.summoners,swapped);assert.deepEqual(alternateValue.itemSet.blocks,fixture.alternativeValue.itemSet.blocks);
 await click(main,'.drawer [data-action=client-prepare][data-preparation-view=build]');await until(()=>results.length===5,'Explicit alternate route did not prepare');assert.equal(results[4].complete,true);assert.deepEqual(attempts[4].page.selectedPerkIds,fixture.alternativeValue.page.selectedPerkIds);if(await js(main,'!!document.querySelector(".drawer [data-action=close]")'))await click(main,'[data-action=close]');
 const restored=structuredClone((await state()));restored.draft.creativePlan=originalPlan;const restoreAccepted=await save(mainEvent,restored,await state(),undefined,undefined);main.webContents.send('state-update',restoreAccepted);await js(main,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 main.webContents.send('open-build',fixture.primarySelection);await until(()=>js(main,'!!document.querySelector(".drawer [data-action=client-prepare][data-preparation-view=build]")'),'Original route editor missing');
 await click(main,'.drawer [data-action=client-prepare][data-preparation-view=build]');await until(()=>results.length===6,'Explicit original route did not prepare');assert.equal(results[5].complete,true);assert.deepEqual(attempts[5].page.selectedPerkIds,perks);if(await js(main,'!!document.querySelector(".drawer [data-action=close]")'))await click(main,'[data-action=close]');
 assert.deepEqual((await state()).preparations.find(p=>p.id==='Galio'&&!p.comboId),personalBefore,'Applying another route must preserve the independent personal identity');
 // Only the fixture's simulated player confirms the selection.
 picked=intent;intent=0;completed=true;await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');
 await click(main,'[data-action=task-edit],[data-action=task-configuration]');await until(()=>js(main,'document.querySelector(":is(.preparation-task,.client-preparation-result) [data-preparation-step=runes]")?.dataset.stepStatus==="done"'),'Confirming the same hero lost the rune confirmation');
 await click(main,'[data-action=task-edit],[data-action=task-configuration]');const confirmedPlan=await js(main,'JSON.parse(document.querySelector("[data-client-preparation-fingerprint]").dataset.clientPreparationFingerprint)[0]');assert.deepEqual(confirmedPlan.summoners,swapped);assert.deepEqual(confirmedPlan.page.selectedPerkIds,perks);assert.deepEqual(confirmedPlan.itemSet.blocks,attempts[0].itemSet.blocks);await click(main,'[data-action=close]');
 const beforeNavigation=writes.length;await click(main,'[data-action=navigate][data-route=favorites]');await click(main,'[data-action=navigate][data-route=draft]');await ownPlan();assert.equal(writes.length,beforeNavigation,'Navigation must not reapply a preparation');
 const stale=structuredClone(attempts[2]),beforeNewGame=writes.length;gameId++;picked=0;intent=0;completed=false;
 await assert.rejects(handlers.get('prepare-selection')({sender:side.webContents,senderFrame:side.webContents.mainFrame},stale),/选人会话已变化/);assert.equal(writes.length,beforeNewGame,'Stale previous-game click performed a write');
 await click(main,'[data-action=sync]');await click(side,'[data-action=sync]');await until(async()=>String((await state()).draft.clientGameId)===String(gameId),'New selection did not replace draft game context');await until(()=>js(main,'!(document.querySelector(":is(.preparation-task,.client-preparation-result) [data-preparation-step=runes]")?.dataset.stepStatus==="done")'),'Previous-game rune confirmation survived a new session');
 const imported=JSON.parse(await fs.readFile(path.join(root,'client-fixture','Game','Config','Champions','Galio','Recommended','rift-buddy-3-mid-rift.json')));assert.deepEqual(imported.blocks,attempts[0].itemSet.blocks);
 assert.equal(mockedRuneWrites(),6);assert.ok(writes.filter(w=>w.route.includes('/session/actions/')).every(w=>w.body.completed===false));assert.ok(windows.every(w=>w.isDestroyed()||!w.isVisible()));
 const report={passed:true,source,archiveSha256:release?.archiveSha256||null,variant:'accepted',acceptedPlanId:originalPlan.id,defaultHeroClickPrepares:true,mainAvatarClickPrepares:true,configurationEditingDoesNotWrite:true,teammatePreviewReadOnly:true,nativeSidebarReplaysReceiptsWithoutWrites:true,prepareEditingDisabled,prepareTimeEditPreserved:!prepareEditingDisabled,personalIdentityPreserved:true,explicitOtherRouteApplications:2,hoverRemainsUnlocked:true,sessionIdOverridesZeroAndPreviousGameflow:true,sameFullConfigurationAfterHover:true,personalSummonerSwapAcrossWindows:true,openDrawerPreservesRemoteRuneAndLocalSummoners:true,pendingHoverAcceptsOtherWindowEdits:true,alternateRouteDoesNotReusePendingHover:true,returningRouteKeepsPersonalChoices:true,sameConfigurationAfterPlayerConfirm:true,navigationDoesNotWrite:true,previousSessionRejectedBeforeWrites:true,realGame:'UNPROVEN',realRuneWrites:0,mockedRuneWrites:mockedRuneWrites(),allNetworkMocked:true,requests,attempts,results,writes};
 await fs.writeFile(path.join(root,'party-preparation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,attempts:attempts.map(value=>({gameId:value.sessionGameId,perks:value.page.selectedPerkIds,summoners:value.summoners,itemIds:itemIds(value)})),writes:undefined},null,2));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'party-preparation-error.txt'),error.stack).catch(()=>{});await fs.writeFile(path.join(root,'party-preparation-failure.json'),JSON.stringify({attempts,results,writes},null,2));for(const [name,window] of [['main',diagnosticMain],['sidebar',diagnosticSide]])if(window&&!window.isDestroyed())await fs.writeFile(path.join(root,'failure-'+name+'.html'),await window.webContents.executeJavaScript('document.documentElement.outerHTML').catch(()=>''));app.exit(1);});


