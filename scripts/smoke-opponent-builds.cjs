const {app,ipcMain,globalShortcut,clipboard,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),phase=process.env.RIFT_BUDDY_OPPONENT_PHASE,windows=[],copies=[];
let main,vendorCalls=0,runeWrites=0,vendorOffline=false,enemy='Ahri';
app.on('browser-window-created',(_e,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
globalShortcut.register=()=>false;clipboard.writeText=text=>copies.push(text);
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const realHandle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>realHandle(name,name==='companion-mode'?(_e,value)=>{windows[0].setMinimumSize(value?280:820,480);windows[0].setContentSize(value?440:1180,850);return {docked:!!value,overlap:false};}:handler);
const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
cp.execFile=(file,args,options,callback)=>{queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(80);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?{archiveSha256:null}:JSON.parse(await fs.readFile('release/latest.json')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),hero=id=>data.champions.find(c=>c.id===id),fixture=JSON.parse(await fs.readFile('tests/fixtures/opgg-galio-ahri.json'));
 for(const file of ['electron/main.cjs','electron/preload.cjs','src/app.mjs','src/core/builds.mjs','src/core/matchup-preparation.mjs','src/core/opponent-build-source.mjs','services/opponent-build-source.mjs','services/opponent-build-cache.mjs'])assert.ok((await fs.readFile(path.join(base,file))).equals(await fs.readFile(file)),'Source drift '+file);
 const flight=fragments=>`<script>self.__next_f.push([1,${JSON.stringify(fragments.map((n,i)=>i.toString(16)+':'+JSON.stringify(n)).join('\n'))}])</script>`;
 global.fetch=async url=>{
  const u=new URL(url);assert.ok(['op.gg','lol-api-champion.op.gg'].includes(u.hostname),'Real network prohibited');vendorCalls++;if(vendorOffline||phase==='restore')throw Error('Isolated source unavailable');
  const fragments=structuredClone(fixture.fragments);if(u.searchParams.get('target_champion')!=='ahri')delete fragments[1][3].href.query.target_champion;
  return u.hostname==='lol-api-champion.op.gg'?Response.json(fixture.raw):new Response(flight(fragments));
 };
 const response=options=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  if(options.method&&options.method!=='GET'){runeWrites++;throw Error('Real rune writes prohibited');}
  if(options.path==='/lol-gameflow/v1/gameflow-phase')return 'ChampSelect';
  if(options.path==='/lol-gameflow/v1/session')return {gameData:{gameId:'170035',mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  if(options.path==='/lol-champ-select/v1/session')return {localPlayerCellId:1,myTeam:[{cellId:1,championId:3,assignedPosition:'MIDDLE'},{cellId:2,championId:895,assignedPosition:'BOTTOM'},{cellId:3,championId:497,assignedPosition:'UTILITY'}],theirTeam:[{cellId:6,championId:hero(enemy).key},{cellId:7,championId:0,championPickIntent:hero('Zed').key}],actions:[],bans:{myTeamBans:[],theirTeamBans:[]},timer:{adjustedTimeLeftInPhase:65000}};
  if(options.path==='/lol-perks/v1/pages')return [];throw Error('Unexpected mock LCU read '+options.path);
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.write=()=>{runeWrites++;throw Error('Write prohibited');};req.end=()=>queueMicrotask(()=>{try{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(response(options))));res.emit('end');req.emit('close');}catch(error){req.emit('error',error);}});req.destroy=error=>{if(error)req.emit('error',error);};return req;};
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;require(path.join(base,'electron/main.cjs'));
 await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true),click=selector=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing control '+${JSON.stringify(selector)});el.click();})()`),change=(selector,value)=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing selector');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`),boot=()=>js('window.buddy.bootstrap()'),state=async()=>(await boot()).state;
 const sync=async()=>{await click('[data-action=sync]');await until(()=>js('document.querySelector(".status-dot.connected")||document.querySelector(".companion-shell")'),'Mock client did not connect');await delay(180);};
 const capture=async name=>{await js('[...document.images].forEach(i=>i.loading="eager")');await js('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');await fs.writeFile(path.join(root,name),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 const latestPreparation=async()=>(await state()).preparations.findLast(s=>s.id==='Galio'&&s.role==='mid');
 await until(()=>js('!!document.querySelector("[data-action=sync]")'),'UI missing');await sync();await sync();await click('[data-action=my-build]');
 await change('#overlay-root [data-matchup-target]','Ahri');await until(()=>js('!!document.querySelector("[data-matchup-build]")'),'Explicit opponent choices missing');
 if(phase==='prepare'){
  assert.equal(Object.keys((await boot()).data.opponentBuildSources).length,0);const generic=JSON.stringify((await boot()).data.builds);
  await click('[data-action=refresh-opponent-build]');await until(()=>js('document.querySelector("[data-matchup-build]").textContent.includes("对手条件统计 16.20")'),'Scoped source never reached renderer');assert.equal(vendorCalls,2);assert.equal(JSON.stringify((await boot()).data.builds),generic);
  assert.ok(!(await latestPreparation())?.sourceOpponent,'Fetching must not adopt a configuration');
  await click('[data-action=matchup-rune]:not(:disabled)');await until(async()=>(await latestPreparation())?.sourceOpponent==='Ahri','Source scope not saved');
  const rune=(await latestPreparation()).runeId;assert.ok(rune);assert.match(await js('document.querySelector(".source-opponent-scope").textContent'),/来源筛选 · 对 阿狸/);
  await click('[data-action=open-guide]');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');
  const guideModel=()=>guide.webContents.executeJavaScript('window.guide.bootstrap().then(b=>b.model)');await until(async()=>(await guideModel())?.selection.sourceOpponent==='Ahri','Guide lost scoped source');
  await click('[data-action=matchup-core]:not(:disabled)');await until(async()=>(await latestPreparation())?.coreId,'Scoped core missing');assert.equal((await latestPreparation()).runeId,rune);
  await click('[data-action=matchup-skill]:not(:disabled)');await until(async()=>(await latestPreparation())?.skillId,'Scoped skill missing');
  await click('[data-action=build-summoner][data-field=summoner-pair][data-id*=SummonerDot]');await click('[data-action=build-summoner][data-field=summoner-swap]');
  await until(async()=>JSON.stringify((await latestPreparation())?.summonerIds)===JSON.stringify(['SummonerDot','SummonerFlash']),'Source spell pair not saved');
  await until(async()=>JSON.stringify((await guideModel())?.summoners.map(s=>s.id))===JSON.stringify(['SummonerDot','SummonerFlash']),'Guide lost source spell pair');
  await click('[data-action=favorite-build]');await click('[data-action=copy-build]');assert.match(copies.at(-1),/对 阿狸/);assert.match(copies.at(-1),/D 引燃 \/ F 闪现/);
  await js('document.querySelector("[data-matchup-build]").scrollIntoView({block:"start"})');await capture('opponent-main.png');
  vendorOffline=true;const before=JSON.stringify((await boot()).data.opponentBuildSources);await click('[data-action=refresh-opponent-build]');await until(()=>js('document.querySelector(".matchup-source-controls").textContent.includes("已有配置保留")'),'Failure status missing');assert.equal(JSON.stringify((await boot()).data.opponentBuildSources),before);vendorOffline=false;
  await click('[data-action=close]');await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card")'),'Trio result missing');await click('[data-action=favorite-result][data-index="0"]');
  await until(async()=>(await state()).favorites.some(f=>f.type==='team'),'Trio favorite was not persisted');const team=(await state()).favorites.find(f=>f.type==='team');assert.equal(team.configurations.find(s=>s.id==='Galio').sourceOpponent,'Ahri','Trio favorite lost member source scope');
  assert.ok(team.configurations.filter(s=>s.id!=='Galio').every(s=>!s.sourceOpponent),'Member scopes leaked');
  await click('[data-action=companion-attach]');await click('[data-action=companion-tab][data-tab=plan]');
  for(const width of [280,360,440]){main.setContentSize(width,850);await delay(250);assert.equal(await js('document.documentElement.scrollWidth>innerWidth+1'),false,'Sidebar overflow '+width);assert.ok(await js('!!document.querySelector(".source-opponent-scope[data-source-opponent=Ahri]")'),'Sidebar lost source scope');await js('document.querySelector("[data-matchup-build]").scrollIntoView({block:"start"})');await capture('opponent-sidebar-'+width+'.png');}
  enemy='Lux';await sync();await sync();await change('.companion-shell [data-matchup-target]','Lux');await until(()=>js('document.querySelector("[data-matchup-build]").dataset.enemy==="Lux"'),'New public target missing');
  assert.ok(await js('document.querySelector("[data-matchup-build]").textContent.includes("暂无所选对手统计")'),'Ahri data borrowed for Lux');await click('[data-action=refresh-opponent-build]');await until(()=>js('document.querySelector(".matchup-source-controls").textContent.includes("已有配置保留")'),'Silently unscoped result accepted');assert.equal(Object.keys((await boot()).data.opponentBuildSources).length,1);
  await fs.writeFile(path.join(root,'expected.json'),JSON.stringify({selection:await latestPreparation(),team},null,2));
 }else{
  assert.equal(vendorCalls,0,'Restart fetched source implicitly');assert.equal(Object.keys((await boot()).data.opponentBuildSources).length,1);
  const expected=JSON.parse(await fs.readFile(path.join(root,'expected.json')));await click('[data-action=close]');await click('[data-action=navigate][data-route=favorites]');const favorites=(await state()).favorites,index=favorites.findIndex(f=>f.type==='build'&&f.sourceOpponent==='Ahri');assert.ok(index>=0);await click('[data-action=open-favorite][data-index="'+index+'"]');
  assert.ok(await js('!!document.querySelector("[data-source-opponent=Ahri]")'));assert.deepEqual(await js('["d","f"].map(k=>document.querySelector("[data-build-summoner="+k+"]").value)'),['SummonerDot','SummonerFlash']);
  assert.equal((await latestPreparation()).sourceOpponent,'Ahri');assert.equal((await state()).favorites.find(f=>f.type==='team').configurations.find(s=>s.id==='Galio').sourceOpponent,'Ahri');
  await click('[data-action=source-opponent-reset]');await until(async()=>(await latestPreparation())?.sourceOpponent===undefined,'Reset did not clear scoped source');assert.deepEqual((await latestPreparation()).summonerIds,['SummonerDot','SummonerFlash']);await capture('opponent-restored-reset.png');assert.equal(vendorCalls,0);
 }
 assert.equal(runeWrites,0);await fs.writeFile(path.join(root,phase+'.json'),JSON.stringify({passed:true,phase,source,archiveSha256:release.archiveSha256,vendorCalls,actualRuneWrites:0,sourceAndLCUMocked:true,realGame:'UNKNOWN'},null,2));console.log('Opponent source '+phase+' passed');app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,phase+'-error.txt'),error.stack);if(main)await fs.writeFile(path.join(root,phase+'-failure.png'),(await main.webContents.capturePage(undefined,{stayHidden:true})).toPNG()).catch(()=>{});app.exit(1);});
