const {revealDraftAction}=require('./smoke-draft-ui.cjs');
const {app,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const windows=[],root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),delay=ms=>new Promise(r=>setTimeout(r,ms)),clientBroadcasts=[];
/** Record every client snapshot the main process pushes to a window. */
function recordClientBroadcast(channel,payload){if(channel==='client-update')clientBroadcasts.push(payload?.phase||'Offline');}
// One synthetic client for both the main process (loopback reads) and the
// renderer (IPC). A divergent main-side snapshot must not silently replace the
// fixture mid-flow: that is a harness inconsistency, not a product behavior.
let syntheticClient=null,syntheticReads=0;
https.request=(options,callback)=>{
 const request=new EventEmitter();request.write=body=>{options.body=body;};
 request.end=()=>queueMicrotask(()=>{try{
  if(!syntheticClient)throw Error('Synthetic client not connected');
  syntheticReads++;
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);assert.equal(options.auth,'riot:isolated-user-flow');
  const route=options.path,champion=syntheticClient.session.myTeam[0];
  const value=
   route==='/lol-gameflow/v1/gameflow-phase'?'ChampSelect':
   route==='/lol-gameflow/v1/session'?{map:{id:11,gameMode:'CLASSIC'},gameData:{gameId:Number(syntheticClient.session.gameId)||0,mapId:11,queue:{id:420,gameMode:'CLASSIC'}}}:
   route==='/lol-champ-select/v1/session'?{gameId:syntheticClient.session.gameId,localPlayerCellId:syntheticClient.session.localPlayerCellId,myTeam:syntheticClient.session.myTeam,theirTeam:[],bans:{myTeamBans:[],theirTeamBans:[]},actions:syntheticClient.session.actions,timer:{phase:'PLANNING',adjustedTimeLeftInPhase:45000},allowDuplicatePicks:false}:
   route==='/lol-summoner/v1/current-summoner'?{puuid:'isolated-user-flow-own',summonerId:1,gameName:'合成本人',tagLine:'TEST',summonerLevel:100}:
   route==='/lol-champ-select/v1/pickable-champion-ids'||route==='/lol-champ-select/v1/disabled-champion-ids'?[]:
   route==='/lol-lobby/v2/lobby'?{localMember:{puuid:'isolated-user-flow-own',gameName:'合成本人',tagLine:'TEST',isLeader:true},members:[]}:
   route==='/riotclient/region-locale'?{region:'TEST'}:null;
  const response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');request.emit('close');
 }catch(error){request.emit('error',error);}});
 request.destroy=error=>{if(error)request.emit('error',error);};
 return request;
};
cp.spawn=file=>{assert.ok(String(file).endsWith('.exe'),'Unexpected native subprocess');const child=new EventEmitter();child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};child.stderr=new EventEmitter();child.stderr.setEncoding=()=>{};child.exitCode=null;child.stdin={end(){child.exitCode=0;child.emit('exit',0);}};child.kill=()=>child.stdin.end();return child;};
cp.execFile=(file,args,options,callback)=>{queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
app.setPath('userData',root);
app.on('browser-window-created',(_e,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.webContents.setBackgroundThrottling(false);const send=w.webContents.send.bind(w.webContents);w.webContents.send=(channel,payload)=>{recordClientBroadcast(channel,payload);return send(channel,payload);};});
// Waits for an asynchronous write to land, so the budget only absorbs machine
// speed. Assertions and their expected values are unchanged.
async function until(check,label,tries=150){for(let n=0;n<tries;n++){const v=await check();if(v)return v;await delay(100);}throw Error(label);}
const WRITE_SETTLED=300;
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=JSON.parse(await fs.readFile('release/latest.json','utf8'));
 const register=ipcMain.handle.bind(ipcMain);
 const syncDelay=Number(process.env.RIFT_GUIDE_SYNC_DELAY??180);assert.ok([0,180,500].includes(syncDelay));
 ipcMain.handle=(channel,handler)=>register(channel,channel==='update-guide'?async(...args)=>{await delay(syncDelay);return handler(...args);}:handler);
 require(source?path.resolve('electron/main.cjs'):path.join(release.directory,'resources/app.asar/electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=c=>main.webContents.executeJavaScript(c,true).catch(error=>{throw Error('Renderer expression: '+c,{cause:error});});
 await until(()=>js('!!document.querySelector("[data-action=guide-current]")'),'UI missing');
 ipcMain.handle=register;
 const click=async sel=>{sel=await revealDraftAction(js,sel);if(sel==='[data-action=result-detail]')await until(()=>js('document.querySelector("[data-action=recommend],[data-action=reroll]")?.disabled===false'),'Recommendations still pending');assert.ok(await js(`!!document.querySelector(${JSON.stringify(sel)})`),sel);await js(`document.querySelector(${JSON.stringify(sel)}).click()`);};
 const active=()=>js('({loadout:document.querySelector(".loadout-option.active")?.dataset.id,rune:document.querySelector(".rune-option.active")?.dataset.id,conditions:[...document.querySelectorAll("[data-action=build-condition].active")].map(e=>e.dataset.condition)})');
 const capture=async(name,w=main)=>{
  await w.webContents.executeJavaScript('[...document.images].forEach(i=>i.loading="eager")');
  await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
  await until(()=>w.webContents.executeJavaScript('[...document.images].every(i=>i.complete&&i.naturalWidth>0)'),'Missing screenshot image: '+name);
  const captured=await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});assert.equal(captured.isEmpty(),false,'Empty screenshot: '+name);
  await fs.writeFile(path.join(root,name),captured.toPNG());
 };
 const state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 // A normal library visit after boot must recover saved non-default choices.
 await click('[data-action=navigate][data-route=builds]');await click('[data-action=library-role][data-role=bottom]');await click('[data-action=build][data-id=Seraphine]');
 assert.deepEqual(await active(),{loadout:'sera-team',rune:'curated-guardian',conditions:['heal']});
 await delay(250);assert.equal((await state()).guide.selection.runeId,'curated-guardian');
 await click('[data-action=build-partner]');await click('[data-action=build-partner]');assert.equal((await active()).rune,'curated-guardian');
 await click('[data-action=open-guide]');
 const guide=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html')),'Guide missing'),gjs=c=>guide.webContents.executeJavaScript(c,true);
 await until(()=>gjs('!!window.guide'),'Guide preload missing');await gjs('window.guide.control("layout","details")');await until(()=>gjs('!!document.querySelector(".next-item")'),'Guide not rendered');
 // The delayed update-guide handler above overlaps edits from both windows.
 await click('[data-action=build-rune][data-id=curated-aery]');
 await gjs('window.guide.control("condition","ap")');
 await click('[data-action=build-rune][data-id=curated-guardian]');
 await until(async()=>{const s=(await state()).guide.selection;return s.runeId==='curated-guardian'&&s.conditions.includes('ap');},'Interleaved guide edit lost');
 await until(()=>js('document.querySelector("[data-action=build-condition][data-condition=ap]").classList.contains("active")'),'Guide choice not returned to config');
 await delay(600);
 const accepted=await state();assert.ok(accepted.guide.selection.conditions.includes('ap'),'Accepted guide choice was overwritten by a later queued update');
 assert.ok(accepted.preparations.findLast(s=>s.id==='Seraphine'&&s.role==='bottom'&&s.comboId==='double-song').conditions.includes('ap'),'Saved preparation lost the accepted guide choice');
 assert.ok((await active()).conditions.includes('ap'),'Main window reverted the accepted guide choice');
 await capture('prepared-configuration.png');
 // A saved Hex context must survive ordinary equipment changes and reopening.
 await js('window.buddy.openGuide({id:"Ashe",role:"bottom",mode:"hex",augmentIds:[1048],compareIds:[1048,1002],ownedAugmentIds:[1047]})');
 await gjs('window.guide.control("main")');await until(()=>js('document.querySelector(".champ-summary")?.textContent.includes("艾希")'),'Hex return missing');
 await click('[data-action=build-condition][data-condition=heal]');
 await until(async()=>{const s=(await state()).guide.selection;return s.conditions.includes('heal')&&s.compareIds?.length===2;},'Hex context lost on sync');
 await click('[data-action=open-guide]');let h=(await state()).guide.selection;assert.deepEqual(h.augmentIds,[1048]);assert.deepEqual(h.compareIds,[1048,1002]);assert.deepEqual(h.ownedAugmentIds,[1047]);
 await gjs('window.guide.control("hide")');await click('[data-action=close]');await click('[data-action=navigate][data-route=draft]');
 await click('[data-action=example]');await click('[data-action=draft-scope][data-scope=party]');for(const role of ['top','jungle','mid','bottom','support']){const checked=await js('document.querySelector(".slot-toggle[data-role='+role+']")?.getAttribute("aria-pressed")==='+'"true"');if(checked!==['bottom','support'].includes(role))await click('.slot-toggle[data-role='+role+']');}await click('[data-action=recommend]');
 await until(()=>js('document.querySelectorAll(".result-card").length>=3&&document.querySelectorAll(".result-card").length<=6'),'No recommendations');await click('[data-action=result-detail]');
 const members=()=>js('[...document.querySelectorAll(".lineup-detail [data-action=build]")].map(e=>({role:e.dataset.role,id:e.dataset.id}))');
 let before=await members();await click('[data-action=replace-member][data-role=bottom]');
 await until(async()=>JSON.stringify(await members())!==JSON.stringify(before),'Bottom unchanged');let second=await members();
 assert.equal(second.find(s=>s.role==='support').id,before.find(s=>s.role==='support').id);
 assert.ok(await js('!!document.querySelector("[data-action=replace-member][data-role=support]")'));
 await click('[data-action=replace-member][data-role=support]');await until(async()=>JSON.stringify(await members())!==JSON.stringify(second),'Support unchanged');
 assert.equal((await members()).find(s=>s.role==='bottom').id,second.find(s=>s.role==='bottom').id);
 main.setSize(1080,720);await delay(150);
 assert.ok(await js('{const r=document.querySelector(".plan-actions").getBoundingClientRect();r.bottom<=innerHeight&&r.top>=0}'),'Confirmation footer clipped');
 await js('document.querySelector(".drawer-content").scrollTop=220');const scroll=await js('document.querySelector(".drawer-content").scrollTop');
 const id=(await members())[0].id;await click('.lineup-detail [data-action=build]');await click('[data-action=back-result]');
 assert.equal((await members())[0].id,id);assert.equal(await js('document.querySelector(".drawer-content").scrollTop'),scroll);
 await capture('replacement-and-confirmation.png');
 // A genuinely exhausted replacement pool must leave the existing scheme usable.
 await click('[data-action=close]');await click('[data-action=role-pools]');
 await click('[data-action=role-pool-edit][data-role=bottom]');await click('[data-action=pick-champion][data-id=Jhin]');await click('[data-action=close]');
 await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll(".result-card").length>0'),'Strict pool results missing');await click('[data-action=result-detail]');
 before=await members();await click('[data-action=replace-member][data-role=bottom]');
 await until(()=>js('document.querySelector("#toast").classList.contains("error")'),'Expected replacement failure missing');
 assert.deepEqual(await members(),before);await until(()=>js('document.querySelector("[data-action=recommend],[data-action=reroll]")?.disabled===false'),'Replacement failure left recommendation pending');assert.equal(await js('document.querySelector("[data-action=use-result]").disabled'),false);
 await click('[data-action=close]');
 await js('window.testOriginalWorker=window.Worker;window.Worker=class extends window.testOriginalWorker{postMessage(...args){setTimeout(()=>super.postMessage(...args),350);}};true');
 await click('[data-action=recommend]');assert.equal(await js('document.querySelector("[data-action=recommend],[data-action=reroll]").disabled'),true);
 await click('[data-action=exclusions]');await click('[data-action=pick-champion][data-id=Ashe]');await delay(700);
 await until(()=>js('document.querySelector("[data-action=recommend],[data-action=reroll]")?.disabled===false'),'Updated exclusions left recommendation pending');
 assert.equal(await js('document.querySelectorAll(".result-card").length'),0,'Preference change allowed obsolete results after the only available champion was excluded');
 await js('window.Worker=window.testOriginalWorker;delete window.testOriginalWorker');await click('[data-action=close]');
 const bootstrapData=(await js('window.buddy.bootstrap()')).data,champion=bootstrapData.champions.find(c=>c.id==='Garen');
 let publicFixture={connected:true,phase:'ChampSelect',message:'测试公开选人',mode:{id:'rift',label:'峡谷'},game:{gameId:'6601'},session:{gameId:'6601',localPlayerCellId:1,myTeam:[{cellId:1,championId:champion.key,assignedPosition:'TOP',championPickIntent:0}],theirTeam:[],bans:[],actions:[[{id:4,type:'pick',actorCellId:1,championId:champion.key,completed:false,isInProgress:true}]]}};
 const prepares=[];ipcMain.removeHandler('client-status');ipcMain.handle('client-status',()=>structuredClone(publicFixture));
 // From here the main process reads the same synthetic pick through the
 // isolated lockfile, so no stale offline snapshot can replace it.
 syntheticClient=publicFixture;
 ipcMain.removeHandler('prepare-selection');ipcMain.handle('prepare-selection',(_event,value)=>{prepares.push(value);const selected=bootstrapData.champions.find(hero=>hero.id===value.champion);publicFixture.session.myTeam[0].championId=0;publicFixture.session.myTeam[0].championPickIntent=selected.key;return {complete:true,steps:Object.fromEntries(['hover','runes','spells','items'].map(step=>[step,{status:'done',...(step==='runes'?{pageId:44}:{})}]))};});
  await click('[data-action=sync]');await until(()=>js('!!document.querySelector(".champ-pick[data-id=Garen]")'),'Mock public pick not read');
  assert.equal((await state()).preferences.autoSync,false,'Synthetic client-status fixture must not enable native background polling');
  assert.ok(clientBroadcasts.every(phase=>phase==='ChampSelect'),'The main process published a client snapshot that disagrees with the synthetic pick');
  await click('[data-action=navigate][data-route=builds]');await click('[data-action=library-role][data-role=bottom]');await click('[data-action=build][data-id=Seraphine]');
 try{await until(()=>prepares.length===1,'A different unlocked reference hero was not prepared');}catch(error){console.error('UNLOCKED_REFERENCE_CONTEXT',JSON.stringify({prepares:prepares.map(p=>({champion:p.champion,role:p.role})),publicPhase:publicFixture.phase,syntheticReads,ui:await js('({toast:document.querySelector("#toast")?.textContent,route:document.querySelector("main[data-page]")?.dataset.page,pending:document.querySelector("[data-action=sync]")?.disabled,drawer:!!document.querySelector(".drawer")})')}));throw error;}
 assert.equal(prepares[0].champion,'Seraphine');assert.equal(prepares[0].role,'bottom');assert.equal(prepares[0].page.selectedPerkIds.length,9);assert.ok(prepares[0].itemSet.blocks.length);
 await until(()=>js('!document.querySelector(".drawer")'),'Unconfirmed hero click must keep configuration closed');
 await click('[data-action=navigate][data-route=draft]');await until(()=>js('!!document.querySelector("[data-action=task-configuration]")'),'Prepared hero configuration entry missing');await click('[data-action=task-configuration]');
 await until(()=>js('!!document.querySelector(".configuration-current [data-action=configuration-switch]")'),'Explicit configuration navigation failed');
 assert.equal(prepares.length,1,'Opening the configuration repeated the client preparation');
 assert.equal(await js('document.querySelectorAll(".rune-target-warning").length'),0,'The reference lane must not block an explicit unlocked hero choice');
 // Changing the arranged partner must not leak a former combo's private build.
 // Return to manual planning and explicitly choose our own bottom role first.
 // A disconnected client is Offline, not None (the connected lobby phase).
 // Reporting None only to the renderer clears the offline arrangement again
 // on reload, while the main process correctly retains it as Offline.
 await click('[data-action=close]');ipcMain.removeHandler('client-status');ipcMain.handle('client-status',()=>({connected:false,phase:'Offline',message:'测试手动配置'}));
 // Keep the main process on the same fixture: it must report the same offline
 // client the renderer now sees, or its broadcast would resurrect the pick.
 syntheticClient=null;
 await click('[data-action=sync]');await until(()=>js('document.querySelector("[data-action=sync]")?.disabled===false'),'Manual planning sync missing');
 await click('[data-action=navigate][data-route=draft]');await click('[data-action=reset-draft]');await click('[data-action=close]');
 await js('{const role=document.querySelector("#solo-role");role.value="bottom";role.dispatchEvent(new Event("change",{bubbles:true}));}');
 // Simulate accepted offline teammate arrangements through isolated saved-state updates.
 // The display roster no longer offers manual hero insertion or configuration clicks.
 const arrange=async partner=>{const base=await state(),next=structuredClone(base);next.draft.slots=next.draft.slots.map(slot=>['bottom','support'].includes(slot.role)?{...slot,champion:slot.role==='bottom'?'Rengar':partner,locked:true}:slot);await js('window.buddy.saveState('+JSON.stringify(next)+','+JSON.stringify(base)+')');await until(async()=>(await state()).draft.slots.some(slot=>slot.role==='support'&&slot.champion===partner),'Partner fixture did not reach saved state');await new Promise(resolve=>{main.webContents.once('did-finish-load',resolve);main.reload();});await until(()=>js('!!document.querySelector("[data-action=navigate][data-route=builds]")'),'Reloaded fixture UI missing');};
 const openRengar=async()=>{await click('[data-action=navigate][data-route=builds]');await click('[data-action=library-role][data-role=all]');await js('{const input=document.querySelector("#library-search");input.value="Rengar";input.dispatchEvent(new Event("input",{bubbles:true}));}');await click('.hero-tile[data-id=Rengar]');await until(()=>js('!!document.querySelector("#configuration-role,#build-role")'),'Configuration role control missing');await js('{const role=document.querySelector("#configuration-role,#build-role");role.value="bottom";role.dispatchEvent(new Event("change",{bubbles:true}));}');};
 await arrange('Ivern');await openRengar();await click('[data-action=build-loadout][data-id=rengar-bush]');
 await until(()=>js('document.querySelector(".configuration-current header b,.loadout-option.active")?.textContent.includes("草丛")'),'Rengar Ivern private build missing');
 await click('[data-action=open-guide]');await until(async()=>(await state()).guide.selection.comboId==='rengar-ivern','Combo guide missing',WRITE_SETTLED);
 await click('[data-action=close]');await arrange('Nami');await openRengar();
 assert.equal(await js('!!document.querySelector(".combo-config")'),false,'Former partner combo leaked');assert.equal(await js('document.querySelector(".configuration-current header b,.loadout-option.active")?.textContent.includes("草丛")'),false);
 await until(async()=>!(await state()).guide.selection.comboId,'Former combo kept in guide',WRITE_SETTLED);
 await click('[data-action=close]');await arrange('Ivern');await openRengar();
 await until(()=>js('document.querySelector(".configuration-current header b,.loadout-option.active")?.textContent.includes("草丛")'),'Returning combo choice not restored');
 await until(async()=>(await state()).guide.selection.comboId==='rengar-ivern','Returning combo not sent to guide',WRITE_SETTLED);
 await capture('partner-context-isolation.png');
 // A full backend selection can remove fields. They must not be resurrected by
 // the already-open main-window configuration's next render/sync.
 await js('window.buddy.updateGuide({id:"Rengar",role:"bottom",mode:"rift",coreIndex:0,conditions:[],changedFields:["comboId","loadoutId","runeId"]})');
 await until(()=>js('!document.querySelector(".combo-config")'),'Backend combo removal did not reach configuration');await delay(600);assert.equal((await state()).guide.selection.comboId,undefined,'Main configuration restored a deleted backend combo');
 const result={passed:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,restartRestore:true,partnerRoundTrip:true,interleavedGuideEdits:true,hexContextPreserved:true,successiveReplacements:true,failedReplacementRecovery:true,fixedFooter720:true,returnToScheme:true,cancelOnPreferenceEdit:true,unlockedReferenceHeroPrepares:true,changedPartnerClearsCombo:true,returningComboRestoresChoices:true,backendDeletedFieldsStayDeleted:true,actualRuneWrites:false,screenshots:root};
 await fs.writeFile(path.join(root,'user-flow-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async e=>{console.error(e);await fs.writeFile(path.join(root,'user-flow-smoke-error.txt'),e.stack).catch(()=>{});app.exit(1);});
