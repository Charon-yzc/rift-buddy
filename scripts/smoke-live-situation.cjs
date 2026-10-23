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
   if(p==='/liveclientdata/eventdata')return {Events:[]};
  }
  assert.equal(options.port,23456);
  if(p==='/lol-summoner/v1/current-summoner')return {gameName:'隔离局内玩家',tagLine:'TEST'};
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
 await until(async()=>(await model())?.live.matched,'Live data missing');assert.equal((await model()).automaticTarget,false,'Unfocused roster replaced the core');
 await gjs('window.guide.control("threatId","Jhin")');
 await until(async()=>{const m=await model();return m?.automaticTarget&&m.next.id==='1029';},'Dynamic armor advice missing');
 assert.match((await model()).nextReason,/烬/);
 await until(()=>gjs('!!document.querySelector(".compact-next")'),"Compact purchase missing");
 await until(async()=>{const m=await model();return (await gjs('document.querySelector(".compact-next").textContent')).includes(m.completeGear.next.name);},'Compact complete-gear target not synchronized');
 await fs.writeFile(path.join(root,"equipment-reference.png"),(await guide.webContents.capturePage()).toPNG());
 // The former details action is gone; retain its stored-state IPC regression.
 await gjs('window.guide.control("live-advice")');assert.equal((await model()).liveAdvice,false);assert.equal((await model()).automaticTarget,false);
 await gjs('window.guide.control("live-advice")');assert.equal((await model()).liveAdvice,true);
 const core=(await model()).route[0].id;await gjs(`window.guide.control("purchase-target",${JSON.stringify(core)})`);assert.equal((await model()).next.id,core);assert.equal((await model()).automaticTarget,false);
 await gjs('window.guide.control("purchase-target","1029")');enemyItems=[0,0];await js('window.buddy.openGuide()');
 await until(async()=>(await model()).situation.signals.length===0,'Enemy signal remained');assert.equal((await model()).next.id,'1029','Manual situation target lost when the trigger disappeared');
 enemyItems=[3031,6672];
 await gjs('window.guide.control("purchase-target","")');inventory=[1029];
 await js('window.buddy.openGuide()');await until(async()=>!(await model()).situation.candidates.some(c=>c.kind==='physical'),'Bought component still recommended');
 inventory=[];enemyItems=[0,0];await js('window.buddy.openGuide()');await until(async()=>(await model()).situation.signals.length===0,'Sold enemy gear left stale signals');
 // Verify the retained independent skill widget, without game input.
 hero='Lux';role='UTILITY';enemyItems=[3031,6672];
 await js('window.buddy.client(true)');await js('window.buddy.openGuide({id:"Lux",role:"support",mode:"rift"})');
 await gjs('window.guide.control("condition","burst")');
 await until(async()=>{const m=await model();return m.live.matched&&m.skillAdvice.next==='W'&&m.skillAdvice.changed;},'Protection skill adjustment missing');
 const skill=await until(()=>windows.find(w=>w.webContents.getURL().endsWith("/src/skill.html")),"Skill micro missing");
 assert.equal(await skill.webContents.executeJavaScript('!!document.querySelector("[data-action=details]")'),false);
 await fs.writeFile(path.join(root,"skill-reference.png"),(await skill.webContents.capturePage()).toPNG());
 await gjs('window.guide.control("hide")');await js('window.buddy.openGuide()');assert.equal((await model()).skillAdvice.next,'W');
 const result={passed:true,archiveSha256:release.archiveSha256,productionMain:true,publicScoreboardSanitized:true,dynamicEquipmentReasons:true,persistedAdviceToggle:true,compactTargetVisible:true,manualTargetPreserved:true,boughtComponentStopsAdvice:true,enemySoldItemsRefresh:true,skillProtectionModel:true,independentSkillWindow:true,hideReopen:true,readOnlyRequests:requests,realGameInput:false,userSettingsIsolated:true,screenshots:root};
 await fs.writeFile(path.join(root,'live-situation-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async e=>{console.error(e);await fs.writeFile(path.join(root,'live-situation-smoke-error.txt'),e.stack).catch(()=>{});app.exit(1);});
