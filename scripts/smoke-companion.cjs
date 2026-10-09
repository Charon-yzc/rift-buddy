const {app,BrowserWindow,screen}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[];app.on('browser-window-created',(_e,w)=>windows.push(w));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<150;n++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 app.setPath('userData',root);await app.whenReady();
 const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));
 let phase='ChampSelect',hero='Volibear',writes=0,observer;
 const output=options=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);assert.ok(!options.method||options.method==='GET','This smoke must never write runes');
  if(options.path==='/lol-gameflow/v1/gameflow-phase')return phase;
  if(options.path==='/lol-gameflow/v1/session')return {gameData:{gameId:'1301',mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  if(options.path==='/lol-champ-select/v1/session')return {localPlayerCellId:1,myTeam:[{cellId:1,championId:hero?data.champions.find(c=>c.id===hero).key:0,assignedPosition:''}],theirTeam:[],actions:[],bans:{}};
  throw Error('Unexpected fixture route '+options.path);
 };
 https.request=(options,callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(output(options))));res.emit('end');req.emit('close');});req.destroy=e=>{if(e)req.emit('error',e);};req.write=()=>{writes++;throw Error('No writes allowed');};return req;};
 const realSpawn=cp.spawn;cp.spawn=(file,...args)=>{
  if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);
  observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.exitCode=null;observer.kill=()=>observer.stdin.end();return observer;
 };
 require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true),click=sel=>js('document.querySelector('+JSON.stringify(sel)+').click()');
 await until(()=>js('!!document.querySelector("#solo-role")'),'Main not loaded');await until(()=>observer,'Observer missing');
 const normal=main.getBounds(),area=screen.getPrimaryDisplay().workArea;
 const anchor=new BrowserWindow({x:area.x+40,y:area.y+80,width:Math.min(1200,area.width-430),height:Math.min(800,area.height-120),show:true,title:'选人窗口测试',webPreferences:{sandbox:true}});
 await anchor.loadURL('data:text/html,<html lang="zh-CN"><body style="background:%2309141c;color:%23b2edcb;font:24px sans-serif;padding:40px">选人窗口测试</body></html>');anchor.focus();
 const snapshot=(client=anchor.getBounds(),game=null)=>observer.stdout.emit('data',JSON.stringify({client:client?{...screen.dipToScreenRect(null,client),foreground:true,minimized:false}:null,game:game?{...screen.dipToScreenRect(null,game),foreground:true,minimized:false}:null})+'\n');
 await until(()=>main.isVisible(),'Main not shown');await delay(500);anchor.focus();await delay(100);
 const anchorFocused=anchor.isFocused();let focusRequests=0;
 for(const method of ['focus','show']){const original=main[method].bind(main);main[method]=(...args)=>{focusRequests++;return original(...args);};}
 snapshot();await js('window.buddy.client(true)');await click('[data-action=sync]');
 await until(()=>js('document.body.classList.contains("companion-mode")'),'Sidebar missing');
 assert.ok(main.getBounds().width<=441);assert.ok(main.getBounds().x>=anchor.getBounds().x+anchor.getBounds().width);assert.equal(focusRequests,0,'Docking must not request focus');assert.equal(anchor.isFocused(),anchorFocused,'Docking changed the observed test anchor focus');
 await click('[data-action=companion-tab][data-tab=plan]');await until(()=>js('!!document.querySelector(".current-preparation")'),'Plan not prepared');
 assert.ok(await js('document.querySelector(".companion-ready").textContent.includes("方案已选好")'));assert.equal(writes,0);
 const overflow=await js('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert.ok(overflow.scroll<=overflow.width,'Sidebar overflows horizontally');
 try{await until(()=>js('[...document.querySelectorAll(".companion-items img,.current-preparation img")].every(i=>i.complete&&i.naturalWidth>0)'),'Bundled sidebar plan images missing');}catch(e){console.error(await js('[...document.querySelectorAll(".companion-items img,.current-preparation img")].map(i=>({src:i.src,complete:i.complete,width:i.naturalWidth,visibility:i.style.visibility}))'));throw e;}await delay(300);
 await fs.writeFile(path.join(root,'sidebar-plan.png'),(await main.webContents.capturePage()).toPNG());
 await click('[data-action=companion-full]');await click('[data-action=my-build]');await until(()=>js('!!document.querySelector(".drawer")'),'Build drawer missing');
 assert.ok(await js('document.querySelector(".modal").getBoundingClientRect().width<=innerWidth'));await click('[data-action=close]');await click('[data-action=companion-attach]');
 anchor.setPosition(area.x+100,area.y+120);snapshot();await delay(300);assert.ok(Math.abs(main.getBounds().x-(anchor.getBounds().x+anchor.getBounds().width+8))<=2);
 const unchanged=anchor.getBounds();snapshot(null);await delay(100);assert.equal(main.isVisible(),false);snapshot();await delay(100);assert.equal(main.isVisible(),true);assert.deepEqual(anchor.getBounds(),unchanged);
 const restored=()=>{for(const k of ['x','y','width','height'])assert.ok(Math.abs(main.getBounds()[k]-normal[k])<=3,'Full bounds drift: '+k);};
 await click('[data-action=companion-full]');await until(()=>js('!document.body.classList.contains("companion-mode")'),'Full view missing');restored();
 const expanded=main.getBounds();snapshot();assert.deepEqual(main.getBounds(),expanded,'Manual expansion must survive observer ticks');
 await click('[data-action=companion-attach]');await until(()=>js('document.body.classList.contains("companion-mode")'),'Manual reattach missing');
 hero='';await js('window.buddy.client(true)');await click('[data-action=sync]');await click('[data-action=companion-tab][data-tab=recommend]');
 await until(()=>js('document.querySelectorAll(".companion-candidate").length===6'),'Automatic recommendations missing');
 await until(()=>js('[...document.querySelectorAll(".companion-candidate img")].every(i=>i.complete&&i.naturalWidth>0)'),'Bundled recommendation images missing');await delay(300);
 await fs.writeFile(path.join(root,'sidebar-recommend.png'),(await main.webContents.capturePage()).toPNG());
 await js('window.buddy.bootstrap().then(b=>window.buddy.saveState({...b.state,preferences:{...b.state.preferences,clientCompanion:false}}))');
 await until(()=>js('!document.body.classList.contains("companion-mode")'),'Opt-out did not restore');snapshot();restored();
 await js('window.buddy.bootstrap().then(b=>window.buddy.saveState({...b.state,preferences:{...b.state.preferences,clientCompanion:true}}))');await until(()=>js('document.body.classList.contains("companion-mode")'),'Opt-in did not dock');
 phase='GameStart';await js('window.buddy.client(true)');assert.equal(main.isVisible(),false,'Loading must hide the selection sidebar');
 const game={...area,x:area.x+20,y:area.y+20,width:area.width-40,height:area.height-40};snapshot(null,game);
 await js('window.buddy.recoverGuide()');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');
 const gjs=code=>guide.webContents.executeJavaScript(code,true);await until(()=>gjs('!!window.guide'),'Guide not loaded');await delay(500);
 await gjs('window.guide.control("ball")');assert.ok(Math.abs(guide.getBounds().width-76)<=3);await gjs('window.guide.control("hide")');await js('window.buddy.recoverGuide()');
 assert.equal(guide.isVisible(),true);assert.equal(guide.isResizable(),true);const b=guide.getBounds();assert.ok(b.width>=360&&b.height>=480);assert.ok(b.x>=area.x&&b.y>=area.y&&b.x+b.width<=area.x+area.width+2&&b.y+b.height<=area.y+area.height+2);assert.equal(writes,0);
 const report={passed:true,archiveSha256:release.archiveSha256,displayScale:screen.getPrimaryDisplay().scaleFactor,adjacentSidebar:true,noDockingFocusRequests:true,testAnchorInitiallyFocused:anchorFocused,automaticRecommendations:true,preparedPlan:true,manualExpansionPreserved:true,clientMinimizeRestored:true,optOutPreserved:true,gameTransition:true,guideBallRecovered:true,anchorBoundsUnchanged:true,actualRuneWrites:false,loopbackSocketsMocked:true,windowGeometryMocked:true,screenshots:root};
 await fs.writeFile(path.join(root,'companion-smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));anchor.destroy();app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'companion-smoke-error.txt'),error.stack).catch(()=>{});app.exit(1);});
