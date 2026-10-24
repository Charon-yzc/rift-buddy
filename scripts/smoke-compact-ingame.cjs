global.fetch=async()=>{throw Error('External network disabled for compact-window smoke');};
// Actual main/preload/renderers with isolated files, synthetic loopback reads,
// and a fake client window. No real game process or player data is accessed.
const {app,BrowserWindow,screen}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),{promisify}=require('node:util'),{pathToFileURL}=require('node:url');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[];let observer,writes=0,gameId=700001,ownHero='Sona',phase='Lobby',mode='hex';
const external=[];require('electron').shell.openExternal=async url=>{external.push(url);};
app.setPath('userData',root);app.on('browser-window-created',(_event,window)=>{windows.push(window);window.webContents.setBackgroundThrottling(false);window.webContents.on('console-message',(_event,details)=>{if(details.level==='error')console.error(details.message);});window.setFocusable(false);const ignore=window.setIgnoreMouseEvents.bind(window);window.setIgnoreMouseEvents=(value,options)=>{window.__ignoring=value;return ignore(value,options);};});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<160;n++){const value=await check();if(value)return value;await delay(100);}throw Error(label);}
async function run(){
 await fs.mkdir(root,{recursive:true});const {defaultState}=await import(pathToFileURL(path.resolve('services/storage.mjs'))),state=defaultState(),install=path.join(root,'fake-client');
 await fs.mkdir(install,{recursive:true});await fs.writeFile(path.join(install,'lockfile'),'LeagueClient:0:23456:isolated-hex:https');
 Object.assign(state.preferences,{installPath:install,autoSync:false,autoCheck:false,appUpdateCheck:false,roomAuto:false,guideAutoShow:false,autoLive:false,chatNotice:false});await fs.writeFile(path.join(root,'settings.json'),JSON.stringify(state));
 const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),key=id=>data.champions.find(c=>c.id===id).key;
 const session=()=>({gameId,localPlayerCellId:0,myTeam:[ownHero,'Ashe','Seraphine','Lux','Hecarim'].map((id,cellId)=>({cellId,championId:key(id),summonerId:cellId+1,assignedPosition:mode==='rift'&&cellId===0?'jungle':'',spell1Id:4,spell2Id:32})),theirTeam:[],benchEnabled:true,benchChampions:['Yasuo','Malphite','Xerath','Teemo','Karma'].map(id=>({championId:key(id)})),actions:[[{id:1,type:'pick',actorCellId:0,championId:key(ownHero),completed:true}]],bans:{myTeamBans:[],theirTeamBans:[]},timer:{phase:'FINALIZATION',adjustedTimeLeftInPhase:28000}});
 https.request=(options,callback)=>{const request=new EventEmitter();request.write=()=>{writes++;throw Error('No client writes permitted');};request.end=()=>queueMicrotask(()=>{try{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);assert.equal(options.auth,'riot:isolated-hex');assert.equal(options.method||'GET','GET');
  const values={'/lol-gameflow/v1/gameflow-phase':phase,'/lol-gameflow/v1/session':{gameData:{gameId,mapId:mode==='rift'?11:12,queue:{id:mode==='rift'?400:2400,gameMode:mode==='rift'?'CLASSIC':'KIWI'}}},'/lol-champ-select/v1/session':session(),'/lol-champ-select/v1/pickable-champion-ids':data.champions.map(c=>c.key),'/lol-champ-select/v1/disabled-champion-ids':[],'/lol-summoner/v1/current-summoner':{summonerId:1,displayName:'隔离测试'},'/lol-lobby/v2/lobby':{members:[{summonerId:1,isLeader:true},{summonerId:3}],localMember:{summonerId:1}},'/lol-perks/v1/pages':[],'/lol-chat/v1/conversations':[]};
  assert.ok(Object.hasOwn(values,options.path),'Unexpected mock route '+options.path);const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(values[options.path])));res.emit('end');request.emit('close');
 }catch(error){request.emit('error',error);}});request.destroy=error=>{if(error)request.emit('error',error);};return request;};
 const execFile=(_file,_args,_options,callback)=>{if(callback)queueMicrotask(()=>callback(null,'--app-port=23456 --remoting-auth-token=isolated-hex',''));return new EventEmitter();};execFile[promisify.custom]=async()=>({stdout:'--app-port=23456 --remoting-auth-token=isolated-hex',stderr:''});cp.execFile=execFile;
 cp.spawn=file=>{assert.ok(file.endsWith('window-observer.exe'),'Unexpected process '+path.basename(file));observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.stderr=new EventEmitter();observer.stderr.setEncoding=()=>{};observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();observer.exitCode=null;return observer;};
 await app.whenReady();
 const fixtureImages=new Map(),imageEntries=require(path.join(base,'services/image-cache.mjs')).imageEntries(data);let badImageRequests=0,handledImages=0;
 for(const [key,url]of imageEntries){if(fixtureImages.has(url))continue;try{fixtureImages.set(url,await fs.readFile(path.join(base,'data/images',key+'.png')));}catch{}}
 const png=fixtureImages.values().next().value;assert(png?.length);
 for(const scheme of ['https','http'])require('electron').session.defaultSession.protocol.handle(scheme,request=>{const u=new URL(request.url);if(!['ddragon.leagueoflegends.com','raw.communitydragon.org','game.gtimg.cn'].includes(u.hostname)||u.protocol!=='https:')badImageRequests++;handledImages++;return new Response(fixtureImages.get(request.url)||png,{headers:{'Content-Type':'image/png'}});});

 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;require(path.join(base,'electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing');main.setSize(1280,900);let surface=main;
 const js=code=>surface.webContents.executeJavaScript(code,true).catch(error=>{throw Error('Hex renderer: '+code,{cause:error});}),click=async selector=>{assert.ok(await js(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await js(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const capture=async(name,window=surface)=>{window.showInactive();window.moveTop();await delay(180);await window.webContents.executeJavaScript('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>{});})).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,name),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};

 const j=(w,s)=>w.webContents.executeJavaScript(s,true).catch(error=>{throw Error(s,{cause:error});});
 await until(()=>j(main,'!!window.buddy&&!!document.querySelector("[data-action=navigate][data-route=favorites]")'),'Main ready');
 await click('[data-action=navigate][data-route=hex]');
 await click('[data-action=pick-hex]');await until(()=>j(main,'!!document.querySelector("#picker-grid [data-id=Camille]")'),'Hero picker absent');await click('#picker-grid [data-id=Camille]');
 await until(()=>j(main,'!document.querySelector(".hero-picker")'),'Picker remains');await click('.augment-card[data-id="1336"]');await until(()=>j(main,'!!document.querySelector(".augment-modal [data-action=own-augment]")'),'Owned action missing');await click('.augment-modal [data-action=own-augment]');await until(()=>j(main,'!document.querySelector(".augment-modal")'),'Owned action did not close');
 await j(main,'window.buddy.openGuide({id:"Camille",role:"top",mode:"hex"})');
 const micros=await until(async()=>{const found=windows.filter(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/hex-micro.html'));return found.length===2?found:null;},'Hex micro pair missing');
 const values=await Promise.all(micros.map(w=>j(w,'window.hexMicro.bootstrap()'))),routes=micros[values.findIndex(v=>v.kind==='routes')],economy=micros[values.findIndex(v=>v.kind==='economy')];
 await until(()=>j(routes,'document.querySelectorAll(".hex-micro-route").length===3'),'Three cards missing');
 const original=await j(routes,'window.hexMicro.bootstrap()');assert(original.routes.length>3);const ordered=original.routes.map(r=>r.id);
 assert.equal(await j(routes,'document.querySelectorAll(".hex-micro-pin").length'),0);assert.equal(await j(routes,'document.body.textContent.includes("主Q副E")'),true);
 await capture('micro-three.png',routes);
 let cursor={x:-1000,y:-1000};screen.getCursorScreenPoint=()=>cursor;
 const nativeClick=async selector=>{
  await j(routes,'document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"nearest"})');await delay(120);
  const point=await j(routes,'(()=>{const e=document.querySelector('+JSON.stringify(selector)+'),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:e.contains(document.elementFromPoint(x,y))};})()');assert(point.hit,'Control is not hit-testable: '+selector);
  const bounds=routes.getBounds();cursor={x:Math.round(bounds.x+point.x),y:Math.round(bounds.y+point.y)};await until(()=>routes.__ignoring===false,'Control region still passes clicks: '+selector);
  const zoom=routes.webContents.getZoomFactor(),x=Math.round(point.x*zoom),y=Math.round(point.y*zoom);routes.webContents.sendInputEvent({type:'mouseMove',x,y});routes.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});routes.webContents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});await delay(120);cursor={x:-1000,y:-1000};
 };
 await nativeClick('[data-action=expand]');await until(()=>j(routes,'document.querySelectorAll(".hex-micro-route").length>3'),'Expand missing');
 assert.equal(await j(routes,'!!document.querySelector(".hex-micro-pin")'),true);await capture('micro-expanded.png',routes);
 const fourth=ordered[3];await nativeClick('[data-action=pin][data-id="'+fourth+'"]');
 await until(async()=>(await j(routes,'window.hexMicro.bootstrap()')).routes[0].id===fourth,'Pin failed');
 assert.deepEqual((await j(routes,'window.hexMicro.bootstrap()')).routes.map(r=>r.id),[fourth,...ordered.filter(id=>id!==fourth)]);
 await capture('micro-pinned.png',routes);await nativeClick('[data-action=expand]');await until(()=>j(routes,'document.querySelectorAll(".hex-micro-route").length===3'),'Collapse missing');
 assert.equal(await j(routes,'document.querySelectorAll(".hex-micro-pin").length'),0);assert.equal(await j(routes,'document.querySelector(".hex-micro-route").dataset.microRoute'),fourth);

 for(const kind of ['augment','item']){
  const rect=await j(routes,`(()=>{const r=document.querySelector('[data-micro-kind="${kind}"]').getBoundingClientRect();return {x:r.x,y:r.y};})()`),b=routes.getBounds();cursor={x:Math.ceil(b.x+rect.x+4),y:Math.ceil(b.y+rect.y+4)};
  const tip=await until(()=>windows.find(w=>!w.isDestroyed()&&w.isVisible()&&w.webContents.getURL().startsWith('data:text/html;charset=utf-8,')),'Native hover absent');assert(tip.getBounds().width<=192,'190 DIP tooltip plus native fractional-scale rounding');await capture('hover-'+kind+'.png',tip);cursor={x:-1000,y:-1000};await until(()=>!tip.isVisible(),'Hover did not hide');
 }

 // A short work area clips even the default three cards. Its narrow scrollbar
 // must remain interactive while the rest of the overlay passes game clicks.
 const displayMatching=screen.getDisplayMatching.bind(screen);
 screen.getDisplayMatching=rect=>{const display=displayMatching(rect);return {...display,workArea:{...display.workArea,height:220}};};
 await j(main,'window.buddy.openGuide({id:"Camille",role:"top",mode:"hex"})');
 await until(()=>j(routes,'document.querySelector(".hex-micro-route-list").scrollHeight>document.querySelector(".hex-micro-route-list").clientHeight'),'Short layout did not overflow');
 assert(routes.getBounds().height<=145,'Short work area exceeded its cap');
 const short=await j(routes,'(()=>{const e=document.querySelector(".hex-micro-route-list"),r=e.getBoundingClientRect();return {right:r.right,y:r.y+Math.min(30,r.height/2),height:r.height};})()'),shortBounds=routes.getBounds();
 cursor={x:Math.floor(shortBounds.x+short.right-3),y:Math.floor(shortBounds.y+short.y)};
 await until(()=>routes.__ignoring===false,'Collapsed scrollbar swallowed clicks');
 routes.webContents.sendInputEvent({type:'mouseWheel',x:Math.floor(short.right-3),y:Math.floor(short.y),deltaY:-400,canScroll:true,hasPreciseScrollingDeltas:true});
 await until(()=>j(routes,'document.querySelector(".hex-micro-route-list").scrollTop>0'),'Short overlay would not scroll');
 await capture('micro-short-scrolled.png',routes);
 cursor={x:shortBounds.x+80,y:shortBounds.y+30};await until(()=>routes.__ignoring===true,'Icon body blocked game input');
 screen.getDisplayMatching=displayMatching;cursor={x:-1000,y:-1000};await j(main,'window.buddy.openGuide({id:"Camille",role:"top",mode:"hex"})');

 surface=main;await j(main,'window.buddy.openGuide({id:"Camille",role:"top",mode:"hex"})');
 phase='ChampSelect';ownHero='Yasuo';await j(main,'window.buddy.client(true)');
 const area=screen.getPrimaryDisplay().workArea,anchor=new BrowserWindow({x:area.x+20,y:area.y+30,width:Math.max(500,area.width-580),height:Math.min(850,area.height-80),show:false,focusable:false,webPreferences:{sandbox:true}});await anchor.loadURL('data:text/html,<body>Isolated client</body>');anchor.showInactive();await until(()=>observer,'Observer missing');observer.stdout.emit('data',JSON.stringify({client:{...screen.dipToScreenRect(null,anchor.getBounds()),foreground:true,minimized:false},game:null})+'\n');
 await j(main,'window.buddy.companionMode(true)');const side=await until(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('surface=companion')),'Sidebar missing');surface=side;await until(()=>j(side,'!!document.querySelector("[data-action=companion-tab][data-tab=plan]")'),'Sidebar ready');await click('[data-action=companion-tab][data-tab=plan]');await until(()=>j(side,'!!document.querySelector(".hex-config-pools")'),'Sidebar pool missing');
 for(const zoom of [1,1.25]){side.webContents.setZoomFactor(zoom);await delay(150);await capture('sidebar-'+zoom+'.png',side);assert.equal(await j(side,'document.documentElement.scrollWidth>innerWidth'),false);}
 await j(side,'document.querySelector(".hex-config-pool-tabs input[value=\\"2\\"]").click()');await capture('pool-stage.png',side);assert.equal(await j(side,'getComputedStyle(document.querySelector(".hex-config-pool-total")).display'), 'none');
 assert.equal(await j(side,'document.querySelector("[data-stage=\\"2\\"]").querySelectorAll("img").length'),0);
 side.webContents.setZoomFactor(1);mode='rift';ownHero='LeeSin';gameId++;phase='InProgress';await j(main,'window.buddy.client(true)');await j(main,'window.buddy.openGuide({id:"LeeSin",role:"jungle",mode:"rift"})');
 const gear=await until(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/guide.html')),'Rift card missing');await until(()=>j(gear,'!!document.querySelector(".compact-guide-main")'),'Compact not rendered');
 for(const [action,value]of [['layout','details'],['ball'],['strip'],['collapse']])assert.equal(await j(gear,`window.guide.control(${JSON.stringify(action)},${JSON.stringify(value)}).then(()=>false,()=>true)`),true);
 assert.equal(await j(gear,'!!document.querySelector("[data-tab],[data-action=layout]")'),false);assert(gear.getBounds().width<=500&&gear.getBounds().height<=400);await capture('rift-gear.png',gear);

 await j(gear,'document.querySelector("[data-action=interaction]").focus()');
 assert.equal(await j(gear,'document.activeElement.dataset.action'),'interaction');
 await j(gear,'window.guide.control("live-advice")');await delay(120);
 assert.equal(await j(gear,'document.activeElement.dataset.action'),'interaction','Same-context repaint dropped keyboard focus');
 await j(main,'window.buddy.openGuide({id:"Ahri",role:"mid",mode:"rift"})');
 await until(()=>j(gear,'window.guide.bootstrap().then(p=>p.model.champion.id==="Ahri")'),'New hero not selected');await delay(120);
 assert.notEqual(await j(gear,'document.activeElement.dataset.action'),'interaction','New context retained an unrelated control focus');
 await j(main,'window.buddy.openGuide({id:"LeeSin",role:"jungle",mode:"rift"})');

 for(const kind of ['skill','jungle']){const w=await until(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/'+kind+'.html')),'Retained '+kind+' widget');await until(()=>j(w,'!!document.querySelector("header")'),'Widget ready');assert.equal(await j(w,'!!document.querySelector("[data-action=details]")'),false);await capture('rift-'+kind+'.png',w);}
 assert.equal(writes,0);assert.equal(badImageRequests,0);assert.deepEqual(external,[]);
 const proof={passed:true,archiveSha256:release.archiveSha256,routeCount:original.routes.length,defaultCards:3,pinMovesFirst:true,nativeExpandPinCollapse:true,sourceAndSkills:true,nativeHovers:2,shortAreaScrollbar:true,iconBodyClickThrough:true,sameContextKeyboardFocus:true,crossHeroFocusReset:true,fourStagesNoInventedIcons:true,noLargeWindow:true,riftSkillJungleRetained:true,zeroRealClientWrites:writes,externalNetwork:0};
 await fs.writeFile(path.join(root,'proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({...proof,root}));anchor.destroy();app.quit();

}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,"native-error.txt"),error.stack).catch(()=>{});app.exit(1);});
