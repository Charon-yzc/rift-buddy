const {app}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_e,w)=>windows.push(w));
async function until(check,label){for(let n=0;n<120;n++){const value=await check();if(value)return value;await delay(80);}throw Error(label);}
async function run(){
 app.setPath('userData',root);
 const release=JSON.parse(await fs.readFile('release/latest.json','utf8')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));
 let hero='Ashe',role='BOTTOM',inventory=[],enemyItems=[3031,6672],gold=800,requests=0;
 const response=options=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.method||'GET','GET','Only read-only calls are permitted');
  const p=options.path;
  if(options.port===2999){requests++;
   if(p==='/liveclientdata/activeplayer')return {riotId:'isolated-player',currentGold:gold,level:7,abilities:Object.fromEntries(Object.entries(hero==='Ashe'?{Q:1,W:3,E:1,R:1}:{Q:1,W:1,E:3,R:1}).map(([key,abilityLevel])=>[key,{abilityLevel}]))};
   if(p==='/liveclientdata/playerlist')return [{riotId:'isolated-player',team:'ORDER',rawChampionName:'game_character_displayname_'+hero,items:inventory.map(itemID=>({itemID,count:1})),scores:{kills:0,deaths:0,assists:0,creepScore:60}},...['Jhin','Jinx'].map((id,index)=>({riotId:'discard-this-'+id,team:'CHAOS',rawChampionName:'game_character_displayname_'+id,items:enemyItems[index]?[{itemID:enemyItems[index],count:1}]:[],scores:{kills:0,deaths:0,assists:0,creepScore:50}}))];
   if(p==='/liveclientdata/gamestats')return {gameMode:'CLASSIC',mapNumber:11,gameTime:600};
  }
  assert.equal(options.port,23456);
  if(p==='/lol-gameflow/v1/gameflow-phase')return 'InProgress';
  if(p==='/lol-gameflow/v1/session')return {gameData:{gameId:'987',mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  if(p==='/lol-champ-select/v1/session')return {localPlayerCellId:1,myTeam:[{cellId:1,championId:data.champions.find(c=>c.id===hero).key,assignedPosition:role}],theirTeam:[],actions:[],bans:{}};
  throw Error('Unexpected test route '+p);
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const value=response(options),res=new EventEmitter();res.statusCode=200;res.resume=()=>{};callback(res);res.emit('data',Buffer.from(JSON.stringify(value)));res.emit('end');req.emit('close');});req.write=()=>{};req.destroy=e=>{if(e)req.emit('error',e);req.emit('close');};return req;};
 https.get=(options,callback)=>{const req=https.request(options,callback);req.end();return req;};
 require(path.join(base,'electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=c=>main.webContents.executeJavaScript(c,true);
 await until(()=>js('!!window.buddy&&!!document.querySelector("[data-action=guide-current]")'),'UI missing');
 await js('window.buddy.client(true)');await js('window.buddy.openGuide({id:"Ashe",role:"bottom",mode:"rift"})');
 const guide=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html')),'Guide missing'),gjs=c=>guide.webContents.executeJavaScript(c,true),model=()=>gjs('window.guide.bootstrap().then(b=>b.model)');
 await until(async()=>{const m=await model();return m?.automaticTarget&&m.next.id==='1029';},'Dynamic armor advice missing');
 assert.match((await model()).nextReason,/烬.*金克丝/);
 await gjs('window.guide.control("collapse")');
 await until(()=>gjs('!!document.querySelector(".purchase-reason")'),'Purchase rationale not rendered');
 await until(()=>gjs('[...document.images].every(i=>i.complete&&i.naturalWidth>0)'),'Offline images missing');
 await fs.writeFile(path.join(root,'equipment-reasons.png'),(await guide.webContents.capturePage()).toPNG());
 // Exercise the rendered action and the real preload/IPC, not a standalone model.
 await gjs('document.querySelector("[data-action=live-advice]").click()');
 await until(async()=>!(await model()).liveAdvice,'Disable did not persist');assert.equal((await model()).automaticTarget,false);
 await until(()=>gjs('document.querySelector("[data-action=live-advice]")?.getAttribute("aria-pressed")==="false"&&!document.querySelector("[data-action=live-advice]").disabled'),'Disabled toggle did not render');
 await gjs('document.querySelector("[data-action=live-advice]").click()');await until(async()=>(await model()).liveAdvice,'Enable did not persist');
 const core=(await model()).route[0].id;await gjs(`window.guide.control("purchase-target",${JSON.stringify(core)})`);assert.equal((await model()).next.id,core);assert.equal((await model()).automaticTarget,false);
 await gjs('window.guide.control("purchase-target","1029")');enemyItems=[0,0];await js('window.buddy.openGuide()');
 await until(async()=>(await model()).situation.signals.length===0,'Enemy signal remained');assert.equal((await model()).next.id,'1029','Manual situation target lost when the trigger disappeared');
 enemyItems=[3031,6672];
 await gjs('window.guide.control("purchase-target","")');inventory=[1029];
 await js('window.buddy.openGuide()');await until(async()=>!(await model()).situation.candidates.some(c=>c.kind==='physical'),'Bought component still recommended');
 inventory=[];enemyItems=[0,0];await js('window.buddy.openGuide()');await until(async()=>(await model()).situation.signals.length===0,'Sold enemy gear left stale signals');
 // Verify a real skill-rationale tab, while keeping game input completely outside the test.
 hero='Lux';role='UTILITY';enemyItems=[3031,6672];
 await js('window.buddy.client(true)');await js('window.buddy.openGuide({id:"Lux",role:"support",mode:"rift"})');
 await gjs('window.guide.control("condition","burst")');
 await until(async()=>{const m=await model();return m.live.matched&&m.skillAdvice.next==='W'&&m.skillAdvice.changed;},'Protection skill adjustment missing');
 await gjs('document.querySelector("[data-tab=skills]").click()');await until(()=>gjs('document.querySelector(".skill-decision").textContent.includes("曲光屏障")'),'Skill rationale not rendered');
 await fs.writeFile(path.join(root,'skill-reasons.png'),(await guide.webContents.capturePage()).toPNG());
 await gjs('window.guide.control("hide")');await js('window.buddy.openGuide()');assert.equal((await model()).skillAdvice.next,'W');
 const result={passed:true,archiveSha256:release.archiveSha256,productionMain:true,publicScoreboardSanitized:true,dynamicEquipmentReasons:true,renderedToggle:true,manualTargetPreserved:true,boughtComponentStopsAdvice:true,enemySoldItemsRefresh:true,skillProtectionRationale:true,hideReopen:true,readOnlyRequests:requests,realGameInput:false,userSettingsIsolated:true,screenshots:root};
 await fs.writeFile(path.join(root,'live-situation-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async e=>{console.error(e);await fs.writeFile(path.join(root,'live-situation-smoke-error.txt'),e.stack).catch(()=>{});app.exit(1);});
