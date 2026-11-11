// Real packaged main/preload/renderer and authenticated helper pipe. Only the
// Windows permission launcher, process observation and loopback replies are fake.
const {app,session,dialog,globalShortcut}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events'),{registerHooks}=require('node:module'),{promisify}=require('node:util');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),order=process.env.RIFT_BUDDY_STARTUP_ORDER,windows=[];
let detected=order==='client-first',phase='Lobby',observer,heartbeat,manager,helperServer,permissionRequests=0,loopbackReads=0,actualWrites=0,detectedAt=Date.now(),permissionAt=0;
const frames=[],sockets=[],partyKey='isolated-startup-party-20261109',own={summonerId:77,gameName:'隔离启动玩家',tagLine:'TEST'};
// A real room service handshake stays inside this process. No relay traffic.
global.WebSocket=class {
 constructor(url){assert.equal(new URL(url).hostname,'rift-buddy-room.3-27-9-233.sslip.io');this.url=url;this.readyState=0;this.bufferedAmount=0;sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}
 send(text){const frame=JSON.parse(text);frames.push(frame);if(frame.kind==='hello')queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({kind:'welcome',v:1,room:new URL(this.url).pathname.split('/').at(-1),members:[{nick:frame.nick,packedStates:2}],ballots:1,multiVotes:1,adoptions:1,packedStates:2,championUsage:1})}));if(frame.kind==='ping')queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({kind:'pong',v:1})}));}
 close(code=1000){this.readyState=3;this.onclose?.({code});}
};
app.setPath('userData',root);globalShortcut.register=()=>false;
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.__displayRequests=0;w.show=()=>{w.__displayRequests++;};w.showInactive=()=>{w.__displayRequests++;};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,done)=>done({cancel:true})));
global.fetch=async()=>{throw Error('External traffic forbidden in startup fixture');};
dialog.showErrorBox=(title,message)=>{throw Error(title+': '+message);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,message){for(let n=0;n<120;n++){if(await check())return;await pause(100);}throw Error(message);}
function observe(){observer?.stdout.emit('data',JSON.stringify({client:detected?{x:30,y:30,width:900,height:700,foreground:false,minimized:false}:null,game:null})+'\n');}
async function run(){
 assert(['client-first','app-first'].includes(order));const release=JSON.parse(await fs.readFile('release/latest.json')),base=path.join(release.directory,'resources/app.asar');
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;
 global.__startupManager=(factory,startHelper,options)=>{
  manager=factory({...options,readClient:async()=>detected?{connected:false,phase:'Offline',needsElevation:true,message:'隔离测试：需要 Windows 权限'}:{connected:false,phase:'Offline',message:'隔离测试：未发现客户端'},launch:async launch=>{
   permissionRequests++;permissionAt=Date.now();assert.equal(detected,true);assert.equal(permissionRequests,1,'Automatic startup must ask only once');
   helperServer=await startHelper(launch.sessionFile,{userData:launch.userData,bundleRoot:launch.bundleRoot,quit(){}});
   await fs.writeFile(launch.recordFile,JSON.stringify({phase:'launched',pid:process.pid,nativeCode:0}));launch.onExit(0);
  }});return manager;
 };
 let hooks=0;registerHooks({load(url,context,next){const result=next(url,context);if(url.replaceAll('\\','/').endsWith('/resources/app.asar/services/client-helper.mjs')){const source=Buffer.from(result.source).toString(),marker='export function createHelperManager(';assert(source.includes(marker));hooks++;return {...result,source:source.replace(marker,'function originalCreateHelperManager(')+'\nexport function createHelperManager(options){return globalThis.__startupManager(originalCreateHelperManager,startHelper,options);}\n'};}return result;}});
 https.request=(options,callback)=>{const request=new EventEmitter();request.destroy=error=>{if(error)request.emit('error',error);};request.write=()=>{actualWrites++;throw Error('Client mutation forbidden');};request.end=()=>queueMicrotask(()=>{try{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);assert.ok(options.auth==='riot:isolated-startup-only','Only the isolated fixture credential is allowed');assert.equal(options.method||'GET','GET');loopbackReads++;
  const values={'/lol-gameflow/v1/gameflow-phase':phase,'/lol-gameflow/v1/session':{gameData:{gameId:777,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}},'/lol-champ-select/v1/session':{gameId:777,localPlayerCellId:0,myTeam:[{...own,cellId:0,championId:0,championPickIntent:0,assignedPosition:'TOP'}],theirTeam:[],actions:[],bans:[]},'/lol-summoner/v1/current-summoner':own,'/lol-lobby/v2/lobby':{partyId:partyKey,members:[own],localMember:own},'/lol-champ-select/v1/pickable-champion-ids':[],'/lol-champ-select/v1/disabled-champion-ids':[],'/lol-game-data/assets/v1/champion-summary.json':[],'/lol-game-data/assets/v1/items.json':[]};
  const response=new EventEmitter();response.statusCode=Object.hasOwn(values,options.path)?200:404;callback(response);response.emit('data',Buffer.from(JSON.stringify(values[options.path]??{})));response.emit('end');request.emit('close');
 }catch(error){request.emit('error',error);}});return request;};
 const mockExec=(_file,_args,_options,callback)=>{if(callback)queueMicrotask(()=>callback(null,'',''));return new EventEmitter();};mockExec[promisify.custom]=async()=>({stdout:'',stderr:''});cp.execFile=mockExec;
 cp.spawn=file=>{assert(file.endsWith('window-observer.exe'),'No real authorization or game process may launch');observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){clearInterval(heartbeat);observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();queueMicrotask(observe);heartbeat=setInterval(observe,250);return observer;};
 require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Application failed to create its main window');
 const js=code=>main.webContents.executeJavaScript(code,true);await until(()=>js('!!window.buddy&&!!document.querySelector("[data-action=navigate]")'),'Application failed to render its main page');await until(()=>main.__displayRequests>0,'Application rendered but never requested showing its main window');await until(()=>observer,'Window observation did not start');
 if(order==='client-first')assert.equal(await js('window.buddy.bootstrap().then(b=>b.state.guide?.selection.id)'),'Ahri','Restored configuration must survive startup without a comparison list');
 if(order==='app-first'){
  await pause(1100);assert.equal(permissionRequests,0,'No client must not trigger a permission prompt');assert.equal(await js('window.buddy.bootstrap().then(b=>b.client.connected)'),false);
  assert.equal(await js('!!document.querySelector("[data-client-connection-status]")'),true,'The disconnected player needs a visible reminder');detected=true;detectedAt=Date.now();observe();
 }
 await until(()=>permissionRequests===1,'Detecting the client did not automatically request permission');await until(()=>js('window.buddy.bootstrap().then(b=>b.client.connected)'),"Permission did not lead to a connected renderer");
 assert.equal(await js('!!document.querySelector("[data-client-connection-status]")'),false,'The connected renderer retained its disconnected reminder');await pause(1200);assert.equal(permissionRequests,1,'Polling must not reopen the permission prompt');assert.equal(hooks,1);assert(loopbackReads>0);assert.equal(actualWrites,0);
 await until(()=>js('window.buddy.roomStatus().then(r=>r?.auto===true&&r.mode==="client"&&r.link==="connected")'),'The detected party did not automatically join a room without any click');
 if(order==='app-first'){
  // Public lobby evidence must be seen before anonymous champion select; do
  // not invent a party identifier for an app first opened halfway through it.
  phase='ChampSelect';observe();await until(()=>js('window.buddy.bootstrap().then(b=>b.client.phase==="ChampSelect")'),'Automatic polling did not observe champion select');
  assert.equal(await js('window.buddy.roomStatus().then(r=>r?.auto===true&&r.mode==="client"&&r.link==="connected")'),true,'Champion select lost the automatically joined room');
 }
 assert.equal(frames.filter(frame=>frame.kind==='hello').length,1);assert.equal(sockets.length,1);assert.equal(JSON.stringify(frames).includes(partyKey),false,'The private lobby key must not be transmitted');
 const result={passed:true,order,packaged:true,mainWindowRendered:true,mainWindowShowRequested:true,automaticPermissionRequests:permissionRequests,connectedWithoutClick:true,automaticRoomJoinWithoutClick:true,automaticRoomPhase:order==='app-first'?'ChampSelect':'Lobby',permissionDelayMs:permissionAt-detectedAt,authenticatedHelperPipe:true,realWindowsPermissionPrompts:false,realClientAccess:false,actualWrites};
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await manager.shutdown();clearInterval(heartbeat);if(helperServer?.listening)helperServer.close();app.quit();
}
run().catch(async error=>{console.error(error);clearInterval(heartbeat);await manager?.shutdown().catch(()=>{});if(helperServer?.listening)helperServer.close();await fs.writeFile(path.join(root,'error.txt'),error.stack).catch(()=>{});app.exit(1);});
