const {app,ipcMain,globalShortcut,clipboard}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),restart=false,windows=[];let diagnosticMain,writes=0;
app.on('browser-window-created',(_e,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.webContents.setBackgroundThrottling(false);});globalShortcut.register=()=>false;clipboard.writeText=()=>{};
const handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,handler)=>handle(name,name==='companion-mode'?(_e,value)=>{const main=windows[0];main.setMinimumSize(value?280:820,480);main.setContentSize(value?440:1180,value?850:850);return {docked:!!value,overlap:false};}:handler);
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(check,label){for(let n=0;n<160;n++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),hero=id=>data.champions.find(c=>c.id===id);
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;global.fetch=async()=>{throw Error('Isolated matchup smoke: external network disabled');};
 let picked='Chogath',assigned='UTILITY',enemy='Nautilus',gameId='1530';
 const output=options=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);if(options.method&&options.method!=='GET'){writes++;throw Error('Rune writes prohibited in matchup selection smoke');}
  if(options.path==='/lol-gameflow/v1/gameflow-phase')return 'ChampSelect';
  if(options.path==='/lol-gameflow/v1/session')return {gameData:{gameId,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  if(options.path==='/lol-champ-select/v1/session')return {localPlayerCellId:1,myTeam:[{cellId:1,championId:hero(picked).key,assignedPosition:assigned}],theirTeam:[...(enemy?[{cellId:6,championId:hero(enemy).key}]:[]),{cellId:7,championId:0,championPickIntent:hero('Janna').key}],actions:[],bans:{myTeamBans:[],theirTeamBans:[]},timer:{adjustedTimeLeftInPhase:65000}};
  if(options.path==='/lol-perks/v1/pages')return [];throw Error('Unexpected fixture request '+options.path);
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.write=body=>{options.body=body;};req.end=()=>queueMicrotask(()=>{try{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(output(options))));res.emit('end');req.emit('close');}catch(error){req.emit('error',error);}});req.destroy=error=>{if(error)req.emit('error',error);};return req;};
 cp.spawn=file=>{assert.ok(file.endsWith('window-observer.exe'));const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};cp.execFile=(file,args,options,callback)=>{queueMicrotask(()=>(typeof options==='function'?options:callback)?.(null,'',''));return new EventEmitter();};
 require(path.join(base,'electron/main.cjs'));let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');diagnosticMain=main;
 const js=code=>main.webContents.executeJavaScript(code,true),click=selector=>js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el)throw Error("Control missing");el.click();})()'),change=(selector,value)=>js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');el.value='+JSON.stringify(value)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');
 const sync=async()=>{await js('window.buddy.client(true)');await click('[data-action=sync]');await delay(250);},state=async()=>(await js('window.buddy.bootstrap()')).state;
 const capture=async name=>{await js('document.querySelector("#toast").classList.remove("show")');await js('[...document.images].forEach(i=>i.loading="eager")');await js('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,name),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 await until(()=>js('!!document.querySelector("[data-action=sync]")'),'UI missing');await sync();await sync();await click('[data-action=my-build]');
 await change('#overlay-root [data-matchup-target]','Nautilus');
 const drawerText=await js('document.querySelector("#overlay-root .hero-coach").textContent');
 assert.match(drawerText,/E 普攻避免贯穿拿掉搭档兵线/);assert.doesNotMatch(drawerText,/刷野|覆盖营地/);
 await js('document.querySelector("#overlay-root [data-guide-section=coach-stages]").open=true;document.querySelector("#overlay-root .hero-coach").scrollIntoView({block:"start"});void 0');await capture('chogath-support-drawer.png');
 await click('[data-action=close]');await click('[data-action=companion-attach]');await until(()=>js('document.body.classList.contains("companion-mode")'),'Sidebar missing');await click('[data-action=companion-tab][data-tab=plan]');
 await js('document.querySelector("[data-companion-disclosure=coach]").open=true;document.querySelector("[data-companion-disclosure=coach-stages]").open=true;document.querySelector("[data-companion-disclosure=coach]").scrollIntoView({block:"start"});void 0');
 assert.match(await js('document.querySelector("[data-companion-disclosure=coach-stages]").textContent'),/不为叠层抢搭档安全发育/);await capture('chogath-support-sidebar.png');
 assigned='JUNGLE';await sync();await change('#solo-role','jungle');await sync();
 await until(()=>js('document.querySelector("#solo-role").value==="jungle"'),'Explicit jungle position was lost');
 await change('.companion-shell [data-matchup-target]','Nautilus');
 const jungleText=await js('document.querySelector(".companion-coach").textContent');assert.match(jungleText,/刷野 E 普攻尖刺覆盖营地/);assert.match(jungleText,/丛刃.*安全连续普攻/);assert.match(jungleText,/R、惩戒/);
 await click('[data-action=guide-current]');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');
 await until(()=>guide.webContents.executeJavaScript('window.guide.bootstrap().then(b=>b.model?.selection.id==="Chogath"&&b.model.selection.role==="jungle")'),'Role selection did not reach guide');
 const gjs=code=>guide.webContents.executeJavaScript(code,true);
 await gjs('document.querySelector("[data-tab=team]").click();void 0');
 await gjs('(()=>{const el=document.querySelector("#guide-stage");el.value="later";el.dispatchEvent(new Event("change",{bubbles:true}));})()');
 await until(()=>gjs('document.querySelector(".hero-coach .coach-phase")?.textContent.includes("后期团战")'),'The visible guide still shows a different phase');
 const laterGuide=await gjs('window.guide.bootstrap().then(b=>({stage:b.model?.coach?.stage,action:b.model?.coach?.action}))');assert.equal(laterGuide.stage,'later');assert.match(laterGuide.action,/资源入口 Q\/W 限制敌方进场/);
 await gjs('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await fs.writeFile(path.join(root,'chogath-jungle-guide.png'),(await guide.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 const cases=[['Volibear','JUNGLE','jungle',/W 重复同一营地目标续航/],['Yunara','BOTTOM','bottom',/普通 E 是移速与穿单位/],['Hwei','UTILITY','support',/WE 回蓝后不能同时保证立即 WW/],['Kled','TOP','top',/斯嘎尔|骑乘/],['Khazix','JUNGLE','jungle',/孤立/],['Anivia','MIDDLE','mid',/冰冻|Q/]];
 for(const [id,position,role,expected]of cases){
  picked=id;assigned=position;await sync();await change('#solo-role',role);await sync();
  await until(()=>js('!!document.querySelector(\'.companion-shell [data-plan="'+id+':'+role+':rift"]\')'),'Changed hero did not reach the sidebar');
  await change('.companion-shell [data-matchup-target]','Nautilus');await until(async()=>expected.test(await js('document.querySelector(".companion-coach").textContent')),'Changed role advice missing for '+id);
  assert.match(await js('document.querySelector(".companion-coach").textContent'),expected);await click('[data-action=guide-current]');await until(()=>gjs('window.guide.bootstrap().then(b=>b.model?.selection.id==='+JSON.stringify(id)+'&&b.model.selection.role==='+JSON.stringify(role)+')'),'Changed role did not reach guide');
 }
 const {rolePlay}=await import(require('node:url').pathToFileURL(path.resolve('src/core/role-plays.mjs')));
 for(const [id,position,role]of cases.slice(-3)){
  picked=id;assigned=position;await sync();await change('#solo-role',role);await sync();await click('[data-action=guide-current]');await until(()=>gjs('window.guide.bootstrap().then(b=>b.model?.selection.id==='+JSON.stringify(id)+')'),'Personal guide missing');
  await gjs('document.querySelector("[data-tab=team]").click();void 0');
  for(const stage of ['opening','key','later']){
   await gjs('(()=>{const el=document.querySelector("#guide-stage");el.value='+JSON.stringify(stage)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');
   await until(()=>gjs('window.guide.bootstrap().then(b=>b.model?.coach?.stage==='+JSON.stringify(stage)+')'),'Personal stage missing');
   const expected=rolePlay(id,role,stage),coach=await gjs('window.guide.bootstrap().then(b=>b.model.coach)');assert.ok(expected);assert.equal(coach.roleTask.generic,undefined);assert.ok(coach.action.includes(expected.action));
   assert.ok((await gjs('document.querySelector(".hero-coach").textContent')).includes(expected.action));
  }
 }
 const saved=(await state()).preparations;assert.ok(saved.some(p=>p.id==='Chogath'&&p.role==='support'));assert.ok(saved.some(p=>p.id==='Chogath'&&p.role==='jungle'));
 assert.equal(writes,0);assert.ok(windows.every(w=>!w.isVisible()));
 const report={passed:true,archiveSha256:release.archiveSha256,mainAndSidebarRoles:true,explicitPositionPreserved:true,guideRoleAndStage:true,distinctSavedRolePreparations:true,actualRuneWrites:0,realGame:'UNPROVEN'};await fs.writeFile(path.join(root,'role-workflow.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.quit();
}
run().catch(async error=>{console.error(error);if(diagnosticMain&&!diagnosticMain.isDestroyed())await fs.writeFile(path.join(root,'failure-state.json'),JSON.stringify(await diagnosticMain.webContents.executeJavaScript('window.buddy.bootstrap()').catch(()=>null),null,2));app.exit(1);});
