// Actual packaged main, preload and two renderers. The test public key exists
// only in this process's loader; the ASAR, production pin and verifier stay intact.
const {app,screen}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),{promisify}=require('node:util'),{registerHooks}=require('node:module');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),phase=process.env.RIFT_BUDDY_GENERATION_PHASE,windows=[],delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.setPath('userData',root);app.on('browser-window-created',(_event,window)=>windows.push(window));
async function until(check,label){for(let i=0;i<180;i++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar'),rawFS=require('original-fs').promises,archive=await rawFS.readFile(base),archiveSha=crypto.createHash('sha256').update(archive).digest('hex'),fixture=JSON.parse(await fs.readFile(path.join(root,'fixtures.json')));assert.equal(archiveSha,release.archiveSha256);
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;
 let hooked=0,served=phase==='adopt'?0:1,tamper=phase==='adopt',clientPhase=phase==='adopt'?'Lobby':'ChampSelect',calls=0,writes=0,processReads=0,observer;
 registerHooks({load(url,context,next){const result=next(url,context);if(url.replaceAll('\\','/').endsWith('/resources/app.asar/services/data-feed.mjs')){const source=Buffer.from(result.source).toString(),pattern=/export const DATA_FEED_KEYS=Object\.freeze\(\{[\s\S]*?\}\);/;assert(pattern.test(source));hooked++;return {...result,source:source.replace(pattern,'export const DATA_FEED_KEYS=Object.freeze('+JSON.stringify(fixture.keys)+');')};}return result;}});
 global.fetch=async(url,options)=>{
  const value=new URL(url);assert.equal(value.origin,'https://data.riftbuddy.dpdns.org');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');calls++;
  const chosen=fixture.fixtures[served];let bytes;
  if(value.pathname==='/v2/latest.json'){const envelope=structuredClone(chosen.envelope);if(tamper)envelope.signature=Buffer.alloc(64).toString('base64');bytes=Buffer.from(JSON.stringify(envelope));}
  else{assert.match(value.pathname,/^\/v2\/assets\/[a-f0-9]{64}\.json\.gz$/);bytes=Buffer.from(chosen.assets[path.basename(value.pathname,'.json.gz')],'base64');}
  return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
 };
 https.request=(options,callback)=>{assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);assert.equal(options.method||'GET','GET');const request=new EventEmitter();request.destroy=error=>{if(error)request.emit('error',error);};request.write=()=>{writes++;throw Error('No client writes permitted');};request.end=()=>queueMicrotask(()=>{
  let value;if(options.path==='/lol-gameflow/v1/gameflow-phase')value=clientPhase;else if(options.path==='/lol-gameflow/v1/session')value={gameData:{gameId:101,mapId:11,queue:{id:420,gameMode:'CLASSIC'}}};else if(options.path==='/lol-champ-select/v1/session')value={gameId:101,localPlayerCellId:0,myTeam:[{cellId:0,championId:103,assignedPosition:'MIDDLE'}],theirTeam:[],actions:[[{id:1,type:'pick',actorCellId:0,championId:103,completed:true}]],bans:{myTeamBans:[],theirTeamBans:[]},timer:{phase:'BAN_PICK',adjustedTimeLeftInPhase:90000}};else if(options.path==='/lol-summoner/v1/current-summoner')value={summonerId:1,displayName:'隔离资料验收'};else if(options.path==='/lol-lobby/v2/lobby')value={members:[{summonerId:1,isLeader:true}],localMember:{summonerId:1}};else if(options.path==='/lol-perks/v1/pages')value=[];else if(options.path.endsWith('/pickable-champion-ids')||options.path.endsWith('/disabled-champion-ids'))value=[];else throw Error('Unexpected isolated route '+options.path);
  const response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');request.emit('close');
 });return request;};
 const execFile=(_file,_args,_options,callback)=>{processReads++;if(callback)queueMicrotask(()=>callback(null,'',''));return new EventEmitter();};execFile[promisify.custom]=async()=>({stdout:'',stderr:''});cp.execFile=execFile;
 cp.spawn=file=>{assert(file.endsWith('window-observer.exe'));observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.stderr=new EventEmitter();observer.stderr.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
 require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Packaged main missing');
 const js=(window,code)=>window.webContents.executeJavaScript(code,true).catch(error=>{console.error('Failed isolated renderer command:',code);throw error;}),bootstrap=window=>js(window,'window.buddy.bootstrap()'),click=(window,selector)=>js(window,`document.querySelector(${JSON.stringify(selector)}).click()`);
 await until(()=>js(main,'!!document.querySelector("[data-action=navigate][data-route=settings]")'),'Main renderer missing');await js(main,'window.buddy.client(true)');await click(main,'[data-action=navigate][data-route=settings]');
 await until(()=>observer,'Isolated window observer missing');const area=screen.getPrimaryDisplay().workArea;observer.stdout.emit('data',JSON.stringify({client:{...screen.dipToScreenRect(null,{x:area.x+20,y:area.y+30,width:Math.max(500,area.width-500),height:Math.min(900,area.height-60)}),foreground:false,minimized:false},game:null})+'\n');
 await js(main,'window.__generationEvents=[];window.buddy.onData(value=>{if(value.replace)window.__generationEvents.push(value)});window.buddy.companionMode(true)');
 let sidebar;await until(()=>{sidebar=windows.find(w=>w.webContents.getURL().includes('surface=companion'));return sidebar;},'Sidebar missing');await until(()=>js(sidebar,'!!document.querySelector(".companion-shell")'),'Sidebar renderer missing');await js(sidebar,'window.__generationEvents=[];window.buddy.onData(value=>{if(value.replace)window.__generationEvents.push(value)});true');
 const heroSource=async window=>(await bootstrap(window)).data.champions.find(c=>c.id==='Ahri').mechanicSource.character.sha256;
 const capture=async(window,name)=>{await js(window,'Promise.all([...document.images].map(image=>{image.loading="eager";return image.decode().catch(()=>{})}))');await delay(100);await fs.writeFile(path.join(root,name),(await window.webContents.capturePage()).toPNG());};
 const rendered=async(name)=>{
  await js(main,'window.buddy.openMainPage({route:"reference",id:"Ahri",tab:"skills"})');await until(()=>js(main,`document.querySelector(".reference-hero-heading h1")?.textContent===${JSON.stringify(name)}`),'Main renderer retained stale hero name');
  // The roster legitimately clears on returning to Lobby. Open the existing
  // hero-pool picker without selecting anything to inspect this renderer's data.
  await click(sidebar,'[data-action=companion-tab][data-tab=recommend]');await js(sidebar,'(()=>{let el=document.querySelector("[data-action=hero-pool]");while(el){if(el.tagName==="DETAILS")el.open=true;el=el.parentElement}})()');await click(sidebar,'[data-action=hero-pool]');
  await until(()=>js(sidebar,`document.querySelector("#picker-grid [data-id=Ahri] span")?.textContent===${JSON.stringify(name)}`),'Sidebar renderer retained stale hero name');await capture(sidebar,'generation-rendered-'+name+'.png');await click(sidebar,'.modal-backdrop [data-action=close]');await click(main,'[data-action=navigate][data-route=settings]');
 };
 if(phase==='adopt'){
  await rendered('阿狸·手动');assert.equal(await heroSource(main),'f'.repeat(64));await js(main,'window.buddy.checkDataFeed()');assert.equal(await heroSource(main),'f'.repeat(64));await rendered('阿狸·手动');assert.equal(await js(main,'window.__generationEvents.length'),0);tamper=false;
  await click(main,'[data-action=refresh-statistics]');await until(()=>js(main,'!!document.querySelector("[data-action=adopt-server-data]")'),'Manual adoption action missing');await capture(main,'generation-manual-conflict.png');await click(main,'[data-action=adopt-server-data]');
  await until(async()=>await heroSource(main)==='1'.repeat(64)&&await heroSource(sidebar)==='1'.repeat(64),'Two renderers did not adopt the same base');for(const window of [main,sidebar])assert.equal(await js(window,'window.__generationEvents.length'),1);
  await rendered('阿狸·资料1');await capture(sidebar,'generation-adopted-sidebar.png');
  const data=(await bootstrap(main)).data;assert.equal(data.abilityReference,null);assert.deepEqual(Object.keys(data.spellbook),[]);assert.equal(data.dataFeed.source,'server');assert.equal(await js(main,'!!document.querySelector("[data-action=adopt-server-data]")'),false);
  clientPhase='ChampSelect';await js(main,'window.buddy.client(true)');served=1;await js(main,'window.buddy.checkDataFeed()');assert.equal((await bootstrap(main)).data.dataFeed.phase,'pending');assert.equal(await heroSource(main),'1'.repeat(64));await rendered('阿狸·资料1');await capture(main,'generation-pending-busy.png');
 }else{
  assert.equal(await heroSource(main),'1'.repeat(64));assert.equal((await bootstrap(main)).data.dataFeed.phase,'pending');await rendered('阿狸·资料1');await js(main,'window.buddy.client(true)');assert.equal(await heroSource(main),'1'.repeat(64));clientPhase='Lobby';await js(main,'window.buddy.client(true)');
  await until(async()=>await heroSource(main)==='2'.repeat(64)&&await heroSource(sidebar)==='2'.repeat(64),'Restarted pending generation did not wait for idle then activate');for(const window of [main,sidebar])assert.equal(await js(window,'window.__generationEvents.length'),1);
  await rendered('阿狸·资料2');tamper=true;await js(main,'window.buddy.checkDataFeed()');assert.equal(await heroSource(main),'2'.repeat(64));assert.equal((await bootstrap(main)).data.dataFeed.phase,'offline');await rendered('阿狸·资料2');await capture(main,'generation-failed-check-keeps-current.png');await capture(sidebar,'generation-sidebar-current.png');
 }
 for(const window of [main,sidebar])assert.ok((await bootstrap(window)).data.catalog.duos.some(row=>row.id==='local-generation-preserved'));
 assert.equal(writes,0);assert.equal(hooked,1);assert.equal(crypto.createHash('sha256').update(await rawFS.readFile(base)).digest('hex'),archiveSha);
 const report={passed:true,phase,packaged:true,archiveSha256:archiveSha,testPinInMemoryOnly:true,signatureVerificationKept:true,independentRendererDOM:true,requests:calls,writes,actualClientAccess:false,actualRuneWrites:false,mockedProcessReads:processReads};await fs.writeFile(path.join(root,'generation-'+phase+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.quit();
}
run().catch(async error=>{console.error(error);await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'generation-error-'+phase+'.txt'),error.stack);app.exit(1);});
