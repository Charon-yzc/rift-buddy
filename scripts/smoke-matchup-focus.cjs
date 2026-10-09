const {app,globalShortcut}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),step=process.env.RIFT_MATCHUP_FOCUS_PHASE,windows=[];let main,writes=0;
app.on('browser-window-created',(_e,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.webContents.setBackgroundThrottling(false);});globalShortcut.register=()=>false;
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),hero=id=>data.champions.find(c=>c.id===id);
 for(const file of ['electron/main.cjs','src/app.mjs','src/companion-view.mjs','src/matchup-plan-view.mjs','src/core/opponent-focus.mjs'])assert.ok((await fs.readFile(path.join(base,file))).equals(await fs.readFile(file)),'Packaged source drift: '+file);
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;global.fetch=async()=>{throw Error('External fetch prohibited');};
 const waiting=step.startsWith('waiting');let phase=['restart','waiting-restart'].includes(step)?'InProgress':'ChampSelect',gameId=waiting&&step!=='waiting-restart'?null:'1560',picked='Nautilus',enemies=['Caitlyn','Morgana'],connected=true;
 const player=(id,team,self=false)=>({riotId:'isolated-'+id,rawChampionName:'game_character_displayname_'+id,team,position:self?'UTILITY':'',level:6,items:[],scores:{kills:0,deaths:0,assists:0,creepScore:30}});
 const output=options=>{
  assert.equal(options.hostname,'127.0.0.1');if(options.method&&options.method!=='GET'){writes++;throw Error('Client writes prohibited');}
  if(options.path.startsWith('/liveclientdata/')){
   assert.equal(options.port,2999);
   if(options.path==='/liveclientdata/activeplayer')return {riotId:'isolated-'+picked,level:6,currentGold:1200,abilities:Object.fromEntries(Object.entries({Q:1,W:1,E:3,R:1}).map(([k,abilityLevel])=>[k,{abilityLevel}])),championStats:{attackDamage:80,abilityPower:0,armor:50,magicResist:40,attackSpeed:0.8,critChance:0,moveSpeed:330,currentHealth:1200,maxHealth:1200}};
   if(options.path==='/liveclientdata/playerlist')return [player(picked,'ORDER',true),player('Ashe','ORDER'),...enemies.map(id=>player(id,'CHAOS'))];
   if(options.path==='/liveclientdata/gamestats')return {mapNumber:11,gameMode:'CLASSIC',gameTime:620};
   if(options.path==='/liveclientdata/eventdata')return {Events:[]};
  }
  assert.equal(options.port,23456);
  if(!connected)throw Error('Isolated connection interruption');
  if(options.path==='/lol-gameflow/v1/gameflow-phase')return phase;
  if(options.path==='/lol-gameflow/v1/session')return {gameData:{gameId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  if(options.path==='/lol-champ-select/v1/session')return {localPlayerCellId:1,myTeam:[{cellId:1,championId:hero(picked).key,assignedPosition:'UTILITY'}],theirTeam:[...enemies.map((id,i)=>({cellId:6+i,championId:hero(id).key})),{cellId:8,championId:0,championPickIntent:hero('Janna').key}],actions:[],bans:{myTeamBans:[],theirTeamBans:[]},timer:{adjustedTimeLeftInPhase:65000}};
  if(options.path==='/lol-perks/v1/pages')return [];throw Error('Unexpected request '+options.path);
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.write=()=>{writes++;throw Error('Writes prohibited');};req.end=()=>queueMicrotask(()=>{try{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(output(options))));res.emit('end');req.emit('close');}catch(error){req.emit('error',error);}});req.destroy=error=>{if(error)req.emit('error',error);};return req;};
 https.get=(options,callback)=>{const req=https.request(options,callback);req.end();return req;};
 cp.spawn=file=>{assert.ok(file.endsWith('window-observer.exe'));const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};cp.execFile=(file,args,options,callback)=>{queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
 require(path.join(base,'electron/main.cjs'));await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true),state=async()=>(await js('window.buddy.bootstrap()')).state;
 const click=selector=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');e.click();})()`);
 const change=(selector,value)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing select');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const sync=async()=>{await js('window.buddy.client(true)');await click('[data-action=sync]');await delay(200);};
 const selectOpponent=async()=>{await click('[data-action=my-build]');await change('#overlay-root [data-matchup-target]','Morgana');await until(async()=>gameId?(await state()).guide?.selection.threatId==='Morgana':(await js('window.buddy.bootstrap()')).client.opponentFocus?.status==='waiting','Public opponent not recorded');await click('[data-action=close]');};
 const reject=async context=>{context={selectionContext:(await js('window.buddy.bootstrap()')).client.selectionContext,...context};assert.equal(await js(`window.buddy.matchupFocus(${JSON.stringify(context)}).then(()=>false,()=>true)`),true,'Invalid focus was accepted');};
 await until(()=>js('!!document.querySelector("[data-action=sync]")'),'UI missing');await sync();await sync();
 if(waiting){
  const finish=async report=>{assert.equal(writes,0);assert.ok(windows.every(w=>!w.isVisible()));const result={passed:true,phase:step,archiveSha256:release.archiveSha256,actualRuneWrites:0,realGame:'UNPROVEN',...report};await fs.writeFile(path.join(root,'matchup-focus-'+step+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();};
  if(step==='waiting-restart'){
   assert.equal((await state()).guide?.selection.threatId,undefined);assert.equal((await js('window.buddy.bootstrap()')).client.opponentFocus,null);await finish({pendingChoiceNotRestored:true,wholeProcessRestart:true});return;
  }
  assert.equal((await state()).guide?.selection.threatId,undefined);await selectOpponent();
  const currentContext=async()=>({...{id:'Nautilus',role:'support',mode:'rift',gameId,opponentId:'Morgana'},selectionContext:(await js('window.buddy.bootstrap()')).client.selectionContext});
  await click('[data-action=my-build]');await until(()=>js('document.querySelector("#overlay-root .matchup-focus-status")?.textContent.includes("等待客户端确认本局")'),'Missing honest waiting status');
  await js('document.querySelector("#overlay-root .matchup-target").scrollIntoView({block:"center"});document.querySelectorAll("img").forEach(i=>i.loading="eager");Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>document.fonts.ready).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await delay(150);await fs.writeFile(path.join(root,'waiting-'+step+'.png'),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  assert.equal((await state()).guide.selection.matchupGameId,undefined);assert.ok((await state()).preparations.every(p=>!p.threatId&&!p.matchupGameId));await click('[data-action=close]');
  if(step==='waiting-save'){await finish({explicitPublicChoice:true,waitingStatus:true,noInventedGameId:true});return;}
  if(step==='waiting-guards'){
   // Cancellation must also work before a real ID exists.
   await click('[data-action=my-build]');await change('#overlay-root [data-matchup-target]','');await until(async()=>!(await js('window.buddy.bootstrap()')).client.opponentFocus,'Waiting cancellation failed');await click('[data-action=close]');await selectOpponent();
   const withdrawn=await currentContext();enemies=['Caitlyn'];await sync();enemies=['Caitlyn','Morgana'];await sync();assert.equal((await js('window.buddy.bootstrap()')).client.opponentFocus,null);await reject(withdrawn);await selectOpponent();
   const previousRole=await currentContext();await change('#solo-role','jungle');await sync();await sync();assert.equal((await js('window.buddy.bootstrap()')).client.opponentFocus,null);await reject(previousRole);await change('#solo-role','support');await sync();await selectOpponent();
   picked='Leona';await sync();await sync();assert.equal((await js('window.buddy.bootstrap()')).client.opponentFocus,null);picked='Nautilus';await sync();await sync();await selectOpponent();
   const interrupted=await currentContext();connected=false;await sync();connected=true;await sync();await sync();assert.equal((await js('window.buddy.bootstrap()')).client.opponentFocus,null);await reject(interrupted);
   await click('[data-action=my-build]');assert.equal(await js('document.querySelector("#overlay-root [data-matchup-target]").value'),'','Renderer silently restored a choice after interrupted observation');assert.match(await js('document.querySelector("#overlay-root .matchup-focus-status").textContent'),/连接中断/);await click('[data-action=close]');await selectOpponent();
   phase='Lobby';await sync();phase='ChampSelect';await sync();await sync();assert.equal((await js('window.buddy.bootstrap()')).client.opponentFocus,null);await selectOpponent();
  }
  if(step==='waiting-selection'){gameId='1560';await sync();await click('[data-action=my-build]');await until(()=>js('document.querySelector("#overlay-root .matchup-focus-status")?.textContent.includes("已与本局绑定")'),'Confirmation status did not reach the actual preparation UI');await click('[data-action=close]');}
  phase='GameStart';if(step!=='waiting-live')gameId='1560';await sync();phase='InProgress';await sync();
  if(step==='waiting-live'){assert.equal((await state()).guide.selection.threatId,undefined);gameId='1560';await sync();await sync();}
 }
 if(step==='select'){
  assert.equal((await state()).guide?.selection.threatId,undefined);assert.equal(windows.some(w=>w.webContents.getURL().endsWith('/src/guide.html')),false,'Guide should not open just because opponents are visible');
  const context={id:'Nautilus',role:'support',mode:'rift',gameId,opponentId:'Morgana'};
  for(const invalid of [{...context,opponentId:'Janna'},{...context,gameId:'1559'},{...context,id:'Ashe'},{...context,role:'top'}])await reject(invalid);
  await selectOpponent();assert.equal((await state()).guide.selection.matchupGameId,gameId);
  assert.ok((await state()).preparations.every(p=>!p.threatId&&!p.matchupGameId));
  phase='GameStart';await sync();phase='InProgress';await sync();
 }
 let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Automatic in-game guide missing');
 const gjs=code=>guide.webContents.executeJavaScript(code,true);
 await until(()=>gjs('window.guide.bootstrap().then(b=>b.model?.coach?.enemy?.id==="Morgana")'),'Actual coaching did not use the chosen opponent');
 assert.equal((await state()).guide.selection.threatId,'Morgana');assert.equal((await state()).guide.selection.matchupGameId,gameId);
 await gjs('document.querySelector("[data-tab=team]").click()');await until(()=>gjs('document.body.textContent.includes("已选对手")&&document.body.textContent.includes("莫甘娜")'),'Chosen opponent not rendered in the actual coaching tab');
 await gjs('document.querySelector(".coach-enemy").open=true;document.querySelector(".coach-enemy").scrollIntoView({block:"start"});void 0');await gjs('document.querySelectorAll("img").forEach(i=>i.loading="eager");Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
 await fs.writeFile(path.join(root,'morgana-coaching-'+step+'.png'),(await guide.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 if(step==='select'||waiting){
  for(const next of ['Reconnect','GameStart','InProgress']){phase=next;await sync();assert.equal((await state()).guide.selection.threatId,'Morgana');}
 }else{
  // Same hero and same public opponents in a new game must still start clear.
  phase='ChampSelect';gameId='1561';await sync();await sync();assert.equal((await state()).guide.selection.threatId,undefined);
  await reject({id:'Nautilus',role:'support',mode:'rift',gameId:'1560',opponentId:'Morgana'});
  await selectOpponent();enemies=['Caitlyn'];await sync();await sync();assert.equal((await state()).guide.selection.threatId,undefined);
  enemies=['Caitlyn','Morgana'];await sync();await sync();assert.equal((await state()).guide.selection.threatId,undefined,'A returned public pick must not silently restore the target');
  await click('[data-action=my-build]');assert.equal(await js('document.querySelector("#overlay-root [data-matchup-target]").value'),'','The renderer restored a withdrawn target from its old guide snapshot');assert.equal(await js('document.querySelectorAll("#overlay-root [data-matchup-build]").length'),0);await click('[data-action=close]');
  await selectOpponent();await change('#solo-role','jungle');await sync();await sync();assert.equal((await state()).guide.selection.threatId,undefined,'Lane change retained the opponent');
  picked='Leona';await sync();await sync();assert.equal((await state()).guide.selection.threatId,undefined,'Hero swap retained the opponent');
 }
 assert.equal(writes,0);assert.ok(windows.every(w=>!w.isVisible()));
 const report={passed:true,phase:step,archiveSha256:release.archiveSha256,explicitPublicChoice:true,invalidContextRejected:!waiting||step==='waiting-guards',automaticGuide:step==='select'||waiting,actualCoachEnemy:'Morgana',sameGameReconnect:true,wholeProcessRestart:step==='restart',newGameAndWithdrawnChoiceCleared:step==='restart'||step==='waiting-guards',heroAndLaneChangeCleared:step==='restart'||step==='waiting-guards',waitingStatus:waiting,delayedConfirmation:waiting,arrivedAfterEntry:step==='waiting-live',pendingCancellationAndDisconnect:step==='waiting-guards',actualRuneWrites:0,realGame:'UNPROVEN'};
 await fs.writeFile(path.join(root,'matchup-focus-'+step+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.quit();
}
run().catch(async error=>{console.error(error);if(main&&!main.isDestroyed())await fs.writeFile(path.join(root,'failure-'+step+'.json'),JSON.stringify(await main.webContents.executeJavaScript('window.buddy.bootstrap()').catch(()=>null),null,2));app.exit(1);});
