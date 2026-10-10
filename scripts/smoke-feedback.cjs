const {app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[];app.on('browser-window-created',(_e,w)=>windows.push(w));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<120;n++){const result=await check();if(result)return result;await delay(100);}throw Error(label);}
async function run(){
 app.setPath('userData',root);
 const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));
 let phase='InProgress',hero='Yone',gameId='901',liveAvailable=false,writes=0,pages=[];
 const response=options=>{
  assert.equal(options.hostname,'127.0.0.1');const p=options.path;
  if(options.port===2999){
   if(!liveAvailable)return {status:503,value:{}};
   if(p==='/liveclientdata/activeplayer')return {value:{riotId:'fixture-own',currentGold:1000,level:6,abilities:Object.fromEntries(Object.entries({Q:3,W:1,E:1,R:1}).map(([key,abilityLevel])=>[key,{abilityLevel}])),championStats:{attackDamage:102,abilityPower:0,attackSpeed:0.9,critChance:0,armor:51,magicResist:40,currentHealth:900,maxHealth:1035}}};
   if(p==='/liveclientdata/playerlist')return {value:[{riotId:'fixture-own',rawChampionName:'game_character_displayname_'+hero,team:'ORDER',level:6,items:[{itemID:3153,count:1}]},{riotId:'fixture-foe',rawChampionName:'game_character_displayname_Ahri',team:'CHAOS',level:6,items:[]}]};
   if(p==='/liveclientdata/gamestats')return {value:{gameMode:'CLASSIC',mapNumber:11,gameTime:600}};
   if(p==='/liveclientdata/eventdata')return {value:{Events:[]}};
  }
  assert.equal(options.port,23456);
  if(options.method&&options.method!=='GET'){
   assert.equal(options.method,'POST');assert.equal(p,'/lol-perks/v1/pages');writes++;const page={...JSON.parse(options.body),id:777,isEditable:true};pages=[page];return {value:page};
  }
  if(p==='/lol-gameflow/v1/gameflow-phase')return {value:phase};
  if(p==='/lol-gameflow/v1/session')return {value:{gameData:{gameId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}}};
  if(p==='/lol-champ-select/v1/session')return {value:{localPlayerCellId:1,myTeam:[{cellId:1,championId:data.champions.find(c=>c.id===hero).key,assignedPosition:''}],theirTeam:[],actions:[],bans:{}}};
  if(['/lol-champ-select/v1/pickable-champion-ids','/lol-champ-select/v1/disabled-champion-ids'].includes(p))return {status:404,value:{message:'Optional selection scope unavailable in this fixture'}};
  if(p==='/lol-perks/v1/pages')return {value:pages};
  throw Error('Unexpected fixture route '+p);
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.write=body=>{options.body=body;};req.end=()=>queueMicrotask(()=>{const output=response(options),res=new EventEmitter();res.statusCode=output.status||200;callback(res);res.emit('data',Buffer.from(JSON.stringify(output.value)));res.emit('end');req.emit('close');});req.destroy=e=>{if(e)req.emit('error',e);};return req;};
 https.get=(options,callback)=>{const req=https.request(options,callback);req.end();return req;};
 require(path.join(base,'electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=c=>main.webContents.executeJavaScript(c,true);
 await until(()=>js('!!document.querySelector("#solo-role")'),'Default solo mode missing');
 const click=selector=>js(`document.querySelector(${JSON.stringify(selector)}).click()`),state=()=>js('window.buddy.bootstrap().then(b=>b.state)'),status=()=>js('window.buddy.client(true)');
 await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll(".result-card").length===3'),'Solo worker results missing');
 assert.equal(await js('document.querySelectorAll(".card-members .member").length'),3,'Solo must suggest one player per result');
 await click('[data-action=solo-role][data-role=top]');await delay(180);assert.equal((await state()).draft.soloRole,'top');
 await status();assert.equal((await state()).guide,null,'Unavailable live identity must wait');
 liveAvailable=true;await status();
 const guide=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html')),'In-game fresh installation did not auto-show'),gjs=c=>guide.webContents.executeJavaScript(c,true);
 await until(()=>gjs('window.guide.bootstrap().then(b=>b.model?.estimate?.mineSkillBasis==="yone-reviewed")'),'Yone model missing');
 assert.equal(guide.isVisible(),true);const model=(await gjs('window.guide.bootstrap()')).model;assert.ok(model.estimate.mineWindow.items>0);assert.ok(model.estimate.mineWindow.delayed>0);assert.ok(model.estimate.mineWindow.qCasts>=2);assert.equal(model.estimate.mineShort.delayed,0);
 const fonts=await js('({body:parseFloat(getComputedStyle(document.body).fontSize),family:getComputedStyle(document.body).fontFamily})');assert.equal(fonts.body,14);assert.match(fonts.family,/Microsoft YaHei/);
 await js('window.buddy.presentation({field:"textScale",value:1.25})');await until(()=>js('parseFloat(getComputedStyle(document.body).fontSize)===17.5'),'Large main font did not render');fonts.large=await js('parseFloat(getComputedStyle(document.body).fontSize)');
 await js('window.buddy.presentation({field:"textScale",value:1})');await until(()=>js('parseFloat(getComputedStyle(document.body).fontSize)===14'),'Default font did not restore');
 const capture=async(win,name)=>{await fs.writeFile(path.join(root,name),(await win.webContents.capturePage()).toPNG());};
 if((await state()).guide.collapsed)await gjs('window.guide.control("collapse")');
 await capture(guide,'yone-damage.png');
 await gjs('window.guide.control("hide")');await status();assert.equal(guide.isVisible(),false,'Manual hide must survive the next poll');
 phase='EndOfGame';await status();phase='ChampSelect';hero='Volibear';gameId='902';liveAvailable=false;
 await click('[data-action=sync]');await until(()=>js('document.querySelector(".current-preparation")?.textContent.includes("沃利贝尔")||document.querySelector(".current-preparation")?.textContent.includes("不灭狂雷")'),'Volibear preparation missing');
 const prepared=(await state()).guide;assert.equal(prepared.selection.id,'Volibear');assert.equal(prepared.selection.role,'top','Explicit solo role must prepare the same build in blind pick');
 assert.ok(await js('document.querySelector(".current-preparation p").textContent.includes("→")'));
 assert.ok(await js('document.querySelector(".unassigned")?.textContent.includes("你")'),'Unknown positions must remain unassigned');assert.equal(writes,0,'Preparation must not apply runes');
 await capture(main,'volibear-preparation.png');
 await js('{const role=document.querySelector("#solo-role");role.value="jungle";role.dispatchEvent(new Event("change",{bubbles:true}));}');await until(async()=>(await state()).draft.soloRole==='jungle','Manual jungle role not saved');await click('[data-action=guide-current]');await until(async()=>(await state()).guide.selection.role==='jungle','Manual jungle guide not saved');assert.equal((await state()).guide.selection.role,'jungle','Guide button must use the manually chosen role rather than the default reference');
 await click('[data-action=my-runes]');await until(()=>js('document.querySelector("[data-action=my-runes]")?.textContent.includes("重新应用")'),'Clicked rune application not confirmed');assert.equal(writes,1);assert.equal((await state()).ownedPageId,777);
 await status();assert.equal(writes,1,'Polling must not reapply runes');
 const result={passed:true,archiveSha256:release.archiveSha256,defaultSolo:true,oneCandidatePerResult:true,explicitSoloRole:true,freshInGameRecovery:true,manualHidePreserved:true,volibearAutoPreparation:true,blindPickUnassigned:true,yoneContinuousDamage:true,clickOnlyRuneApplication:true,actualRuneWrites:false,loopbackSocketsMocked:true,fonts,screenshots:root};
 await fs.writeFile(path.join(root,'feedback-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'feedback-smoke-error.txt'),error.stack).catch(()=>{});app.exit(1);});
