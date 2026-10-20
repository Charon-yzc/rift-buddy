// Actual main/preload/renderers with isolated files, synthetic loopback reads,
// and a fake client window. No real game process or player data is accessed.
const {app,BrowserWindow,screen}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),{promisify}=require('node:util'),{pathToFileURL}=require('node:url');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[];let observer,writes=0,gameId=700001,ownHero='Sona',phase='ChampSelect';
app.setPath('userData',root);app.on('browser-window-created',(_event,window)=>{windows.push(window);window.webContents.setBackgroundThrottling(false);});
let saveGate=null;const nativeRename=fs.rename.bind(fs);
fs.rename=async(from,to)=>{
 const gate=saveGate;
 if(gate&&path.resolve(to)===path.join(root,'settings.json')){
  const candidate=JSON.parse(await fs.readFile(from,'utf8'));(gate.seen??=[]).push(candidate.guide?.selection.coreIndex);
  if(candidate.guide?.selection.coreIndex===gate.coreIndex){gate.hit=true;await gate.ready;if(gate.fail)throw Object.assign(Error('Synthetic settings EACCES'),{code:'EACCES'});}
 }
 return nativeRename(from,to);
};
function holdSave(coreIndex,{fail=false}={}){let release;const ready=new Promise(r=>release=r);return saveGate={coreIndex,fail,hit:false,ready,release};}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<160;n++){const value=await check();if(value)return value;await delay(100);}throw Error(label);}
async function run(){
 await fs.mkdir(root,{recursive:true});const {defaultState}=await import(pathToFileURL(path.resolve('services/storage.mjs'))),state=defaultState(),install=path.join(root,'fake-client');
 await fs.mkdir(install,{recursive:true});await fs.writeFile(path.join(install,'lockfile'),'LeagueClient:0:23456:isolated-hex:https');
 Object.assign(state.preferences,{installPath:install,autoSync:false,autoCheck:false,appUpdateCheck:false,roomAuto:false,guideAutoShow:false,autoLive:false,chatNotice:false});await fs.writeFile(path.join(root,'settings.json'),JSON.stringify(state));
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile('release/latest.json')),base=source?path.resolve('.'):path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),key=id=>data.champions.find(c=>c.id===id).key;
 const session=()=>({gameId,localPlayerCellId:0,myTeam:[{cellId:0,championId:key(ownHero),assignedPosition:'',spell1Id:4,spell2Id:32}],theirTeam:[],actions:[[{id:1,type:'pick',actorCellId:0,championId:key(ownHero),completed:true}]],bans:{myTeamBans:[],theirTeamBans:[]},timer:{phase:'FINALIZATION',adjustedTimeLeftInPhase:28000}});
 https.request=(options,callback)=>{const request=new EventEmitter();request.write=()=>{writes++;throw Error('No client writes permitted');};request.end=()=>queueMicrotask(()=>{try{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);assert.equal(options.auth,'riot:isolated-hex');assert.equal(options.method||'GET','GET');
  const values={'/lol-gameflow/v1/gameflow-phase':phase,'/lol-gameflow/v1/session':{gameData:{gameId,mapId:12,queue:{id:2400,gameMode:'KIWI'}}},'/lol-champ-select/v1/session':session(),'/lol-champ-select/v1/pickable-champion-ids':data.champions.map(c=>c.key),'/lol-champ-select/v1/disabled-champion-ids':[],'/lol-summoner/v1/current-summoner':{summonerId:1,displayName:'隔离测试'},'/lol-lobby/v2/lobby':{members:[{summonerId:1,isLeader:true}],localMember:{summonerId:1}},'/lol-perks/v1/pages':[],'/lol-chat/v1/conversations':[]};
  assert.ok(Object.hasOwn(values,options.path),'Unexpected mock route '+options.path);const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(values[options.path])));res.emit('end');request.emit('close');
 }catch(error){request.emit('error',error);}});request.destroy=error=>{if(error)request.emit('error',error);};return request;};
 const execFile=(_file,_args,_options,callback)=>{if(callback)queueMicrotask(()=>callback(null,'--app-port=23456 --remoting-auth-token=isolated-hex',''));return new EventEmitter();};execFile[promisify.custom]=async()=>({stdout:'--app-port=23456 --remoting-auth-token=isolated-hex',stderr:''});cp.execFile=execFile;
 cp.spawn=file=>{assert.ok(file.endsWith('window-observer.exe'),'Unexpected process '+path.basename(file));observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.stderr=new EventEmitter();observer.stderr.setEncoding=()=>{};observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();observer.exitCode=null;return observer;};
 require(path.join(base,'electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing');main.setSize(1280,900);let surface=main;
 const js=code=>surface.webContents.executeJavaScript(code,true).catch(error=>{throw Error('Hex renderer: '+code,{cause:error});}),click=async selector=>{assert.ok(await js(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await js(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const capture=async(name,window=surface)=>{await window.webContents.executeJavaScript('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>{});})).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,name),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 await until(()=>js('!!document.querySelector("[data-route=hex]")'),'Navigation missing');await click('[data-route=hex]');await click('[data-action=pick-hex]');await click('[data-action=pick-champion][data-id=Sona]');await until(()=>js('!!document.querySelector("[data-action=build][data-mode=hex]")'),'Hex hero missing');
 if(process.env.RIFT_BUDDY_HEX_BASELINE==='1'){await capture('before-main.png');console.log(JSON.stringify({baseline:true,source,root}));app.quit();return;}
 await until(()=>js('!!document.querySelector(".hex-player-advice")'),'Advice missing');await capture('after-main.png');
 const select=async id=>{const a=data.augments.find(a=>a.id===id);await js(`{const el=document.querySelector('[data-hex-option-input]');el.value=${JSON.stringify(a.name+' · #'+id)};el.dispatchEvent(new Event('change',{bubbles:true}));}`);await until(()=>js(`window.buddy.hexRound().then(s=>(s.live||s.manual).options.includes(${id}))`),'Option not added');};
 await select(1141);await select(1205);await select(1004);assert.equal(await js('document.querySelectorAll(".hex-comparison .compare-card").length'),3);assert.ok(await js('document.querySelector("[data-hex-option-input]").disabled'));assert.ok(await js('document.querySelector(".hex-comparison").textContent.includes("优先看这项")'));await capture('three-choices-main.png');
 await click('.hex-comparison [data-action=own-augment][data-id="1141"]');await until(()=>js('window.buddy.hexRound().then(s=>s.manual.owned.includes(1141)&&!s.manual.options.length)'),'Owned missing');
 await js("window.buddy.openGuide({id:'Sona',role:'support',mode:'hex'})");const guide=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html')),'Guide missing');const gj=code=>guide.webContents.executeJavaScript(code,true).catch(error=>{throw Error('Hex guide: '+code,{cause:error});});await until(()=>gj('window.guide.bootstrap().then(s=>s.model?.ownedAugments.some(a=>a.id===1141))'),'Guide owned missing');
 // Removing an owned marker updates an already-open guide, and reopening keeps the current owner.
 await click('[data-action=remove-owned][data-id="1141"]');await until(()=>gj('window.guide.bootstrap().then(s=>!s.model.ownedAugments.length)'),'Open guide not updated');

 // Two queued manual previews must keep the last hero and that hero's notes.
 {const held=holdSave(1);await js("void (window.manualConfig=window.buddy.updateGuide({id:'Sona',role:'support',mode:'hex',coreIndex:1,changedFields:['coreIndex']}))");await until(()=>held.hit,'Manual open queue gate missing');
 await js("void (window.manualFirst=window.buddy.openGuide({id:'Brand',role:'mid',mode:'hex'}))");await until(()=>js("window.buddy.hexRound().then(s=>s.manual.hero==='Brand')"),'First manual hero missing');
 await js("void (window.manualLast=window.buddy.openGuide({id:'Ashe',role:'bottom',mode:'hex'}))");const last=await until(()=>js("window.buddy.hexRound().then(s=>s.manual.hero==='Ashe'?s.manual:null)"),'Last manual hero missing');
 await js(`void (window.manualNote=window.buddy.hexRound({...${JSON.stringify(last)},operation:'own',id:1047}))`);held.release();await js('Promise.all([window.manualConfig,window.manualFirst,window.manualLast,window.manualNote])');saveGate=null;
 assert.equal(await gj('window.guide.bootstrap().then(s=>s.model.champion.id)'),'Ashe');assert.deepEqual(await gj('window.guide.bootstrap().then(s=>s.model.ownedAugments.map(a=>a.id))'),[1047]);assert.equal(await js('window.buddy.hexRound().then(s=>s.manual.context)'),last.context);
 await js("window.buddy.openGuide({id:'Sona',role:'support',mode:'hex'})");}
 await js('window.buddy.client(true)');await until(()=>js('window.buddy.hexRound().then(s=>!!s.live)'),'Live owner missing');
 const live=await js('window.buddy.hexRound().then(s=>s.live)');assert.equal(live.hero,'Sona');
 await js(`window.buddy.hexRound({...${JSON.stringify(live)},operation:'own',id:1002})`);await until(()=>gj('window.guide.bootstrap().then(s=>s.model.ownedAugments.some(a=>a.id===1002))'),'Live guide not synchronized');

 // A core-index change must also clear its previous stable core ID, just as
 // the real configuration switch does; contradictory selectors resolve by ID.
 // Hold an actual settings rename while configuration and round changes race.
 // Round notes must project the eventual current guide, not an old snapshot.
 const queuedConfig=async(coreIndex)=>js(`void (window.hexConfig=window.buddy.bootstrap().then(b=>{const selection={...b.state.guide.selection,coreIndex:${coreIndex}};delete selection.coreId;return window.buddy.updateGuide({...selection,changedFields:['coreIndex','coreId']});}).then(()=>({ok:true}),e=>({ok:false,error:e.message})))`);
 const queuedOwn=async(id)=>{const row=await js('window.buddy.hexRound().then(s=>s.live)');await js(`void (window.hexNote=window.buddy.hexRound({...${JSON.stringify(row)},operation:'own',id:${id}}).then(()=>({ok:true}),e=>({ok:false,error:e.message})))`);};
 let gate=holdSave(1);await queuedConfig(1);await until(()=>gate.hit,'Configuration disk gate not reached').catch(async error=>{console.error('GATE_DEBUG',gate.seen,await js('window.hexConfig'));throw error;});await queuedOwn(2005);await until(()=>js('window.buddy.hexRound().then(s=>s.live.owned.includes(2005))'),'Note did not enter queue');gate.release();assert.equal((await js('window.hexConfig')).ok,true);assert.equal((await js('window.hexNote')).ok,true);saveGate=null;
 assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.guide.selection.coreIndex)'),1);assert.ok(await gj('window.guide.bootstrap().then(b=>b.model.ownedAugments.some(a=>a.id===2005))'));
 gate=holdSave(2);await queuedConfig(2);await until(()=>gate.hit,'Second disk gate not reached');await js("void (window.hexOpenB=window.buddy.openGuide({id:'Brand',role:'mid',mode:'hex'}))");await until(()=>js('window.buddy.hexRound().then(s=>s.manual.hero===\'Brand\')'),'Manual guide B not selected');await queuedOwn(1047);gate.release();await js('window.hexConfig');await js('window.hexOpenB');assert.equal((await js('window.hexNote')).ok,true);saveGate=null;assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.guide.selection.id)'),'Brand','Old live guide overwrote newly opened manual guide');
 await js("window.buddy.openGuide({id:'Sona',role:'support',mode:'hex'})");
 // A failed settings write must not turn an accepted note into a failed toggle.
 gate=holdSave(0,{fail:true});await queuedConfig(0);await until(()=>gate.hit,'Failure gate not reached');await queuedOwn(1205);gate.release();assert.equal((await js('window.hexConfig')).ok,false);assert.equal((await js('window.hexNote')).ok,true);saveGate=null;
 assert.ok(await gj('window.guide.bootstrap().then(b=>b.model.ownedAugments.some(a=>a.id===1205))'));assert.equal(await js('window.buddy.hexRound().then(s=>s.live.owned.filter(id=>id===1205).length)'),1);
 for(const id of [1047,1205,2005]){const row=await js('window.buddy.hexRound().then(s=>s.live)');await js(`window.buddy.hexRound({...${JSON.stringify(row)},operation:'remove',id:${id}})`);}
 await until(()=>observer,'Observer missing');const area=screen.getPrimaryDisplay().workArea,anchor=new BrowserWindow({x:area.x+20,y:area.y+40,width:Math.max(500,area.width-560),height:Math.min(900,area.height-80),show:true,title:'隔离海克斯客户端',webPreferences:{sandbox:true}});await anchor.loadURL('data:text/html,<body>Hex fixture</body>');observer.stdout.emit('data',JSON.stringify({client:{...screen.dipToScreenRect(null,anchor.getBounds()),foreground:true,minimized:false},game:null})+'\n');
 await js('window.buddy.companionMode(true)');const side=await until(()=>windows.find(w=>w.webContents.getURL().includes('/src/index.html?surface=companion')),'Sidebar missing');surface=side;await until(()=>js('!!document.querySelector(".hex-companion")'),'Hex sidebar missing');
 assert.ok(await js('document.querySelector(".hex-owned").textContent.includes("尖端发明家")'));await capture('after-sidebar.png');
 await select(1047);await click('.hex-comparison [data-action=own-augment][data-id="1047"]');await until(()=>gj('window.guide.bootstrap().then(s=>s.model.ownedAugments.some(a=>a.id===1047))'),'Sidebar confirmation not in guide');await until(()=>main.webContents.executeJavaScript('document.querySelector(".hex-owned").textContent.includes("关键暴击")'),'Sidebar confirmation not in main');
 const old=await js('window.buddy.hexRound().then(s=>s.live)');gameId++;await js('window.buddy.client(true)');await until(()=>js('window.buddy.hexRound().then(s=>s.live.context!=='+JSON.stringify(old.context)+')'),'New game context missing');assert.deepEqual(await js('window.buddy.hexRound().then(s=>s.live.owned)'),[]);await until(()=>gj('window.guide.bootstrap().then(s=>!s.model.ownedAugments.length&&!s.model.comparison.length)'),'Old game leaked into guide');
 assert.equal(await js(`window.buddy.hexRound({...${JSON.stringify(old)},operation:'own',id:1141}).then(()=>false,()=>true)`),true,'Stale action accepted');
 const overflow=await js('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert.ok(overflow.scroll<=overflow.width,'Horizontal sidebar overflow');assert.equal(writes,0);
 await capture('new-round-sidebar.png');await gj("window.guide.control('hide')");await main.webContents.executeJavaScript("window.buddy.openGuide({id:'Sona',role:'support',mode:'hex'})",true);assert.deepEqual(await gj('window.guide.bootstrap().then(s=>s.model.ownedAugments)'),[]);
 const result={passed:true,source,root,choiceInput:true,boundedThree:true,mainSidebarGuideSynchronized:true,queuedConfigPreserved:true,queuedHeroSwitchPreserved:true,queuedManualContextsPreserved:true,diskFailureDoesNotRejectNote:true,sameHeroNewGame:true,staleActionRejected:true,clientWrites:writes};await fs.writeFile(path.join(root,'hex-player-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));anchor.destroy();app.quit();
}
run().catch(async error=>{console.error(error,error.cause);await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'hex-player-error.txt'),error.stack);app.exit(1);});
