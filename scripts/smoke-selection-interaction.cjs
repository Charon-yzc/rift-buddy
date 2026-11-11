// Load the actual app renderer with an isolated profile and mocked APIs.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const checks=[],blockedRequests=[],errors=[];let root,win;
app.disableHardwareAcceleration();
async function run(){
 await fs.mkdir(path.resolve('.local'),{recursive:true});root=await fs.mkdtemp(path.resolve('.local/selection-interaction-'));app.setPath('userData',path.join(root,'profile'));
 const source=path.resolve(process.env.RIFT_BUDDY_SMOKE_APP||'.'),url=file=>pathToFileURL(path.join(source,file)).href;
 const {defaultState}=await import(url('services/storage.mjs'));
 const {loadBuilds,loadHexBuilds}=await import(url('services/build-cache.mjs'));
 const state=defaultState();Object.assign(state.preferences,{autoSync:false,autoCheck:false,appUpdateCheck:false,autoLive:false,roomAuto:false,clientCompanion:false});
 const data=JSON.parse(await fs.readFile(path.join(source,'data/game.json'),'utf8'));data.builds=await loadBuilds([path.join(source,'data')],data);data.hexBuilds=await loadHexBuilds([path.join(source,'data')],data);
 await fs.writeFile(path.join(root,'boot.json'),JSON.stringify({data,state,client:{connected:false,phase:'Offline',game:{gameId:'101'}},hexRound:{revision:0,live:null,manual:null}}));
 await fs.writeFile(path.join(root,'preload.cjs'),`
 const fs=require('node:fs'),path=require('node:path');
 const boot=JSON.parse(fs.readFileSync(path.join(__dirname,'boot.json'),'utf8'));
 let revision=0,roundRevision=0,dataRevision=0,dataListener,clientListener,mainPageListener,openBuildListener;
 window.selectionFixture={pending:[],saved:null,
  redraw(){dataListener({revision:++dataRevision,changes:{rankings:boot.data.rankings||{}}});},
  changeGame(){boot.client={...boot.client,game:{gameId:'102'},receivedAt:new Date().toISOString()};clientListener(structuredClone(boot.client));},
  hexMode(){boot.client={...boot.client,mode:{id:'hex'},receivedAt:new Date().toISOString()};clientListener(structuredClone(boot.client));},
  source(id){mainPageListener({route:'hex-source',id});},configuration(){openBuildListener({id:'Jinx',role:'bottom',mode:'hex',readOnly:true});},
  finish(index){const pending=this.pending[index];pending.resolve({revision:++roundRevision,live:null,manual:{hero:pending.hero,context:'manual-'+roundRevision,revision:0,options:[],owned:[]}});}};
 window.buddy={
  bootstrap:async()=>structuredClone(boot),saveState:async state=>{selectionFixture.saved=structuredClone(state);return {state:structuredClone(state),revision:++revision};},
  onData:listener=>{dataListener=listener;},onClient:listener=>{clientListener=listener;},
  onMainPage:listener=>{mainPageListener=listener;},onOpenBuild:listener=>{openBuildListener=listener;},
  hexRound:input=>new Promise(resolve=>selectionFixture.pending.push({hero:input.hero,resolve})),client:async()=>structuredClone(boot.client),
  refreshBuild:async()=>{throw Error('Isolated smoke blocks build requests');},updateGuide:async()=>({updated:false}),presentation:async()=>boot.state.preferences.presentation,
 };
 window.fetch=async()=>{throw Error('Isolated smoke blocks fetch');};
 `);
 await app.whenReady();win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:false,nodeIntegration:false,sandbox:false}});
 win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{blockedRequests.push(details.url);callback({cancel:true});});
 win.webContents.on('console-message',event=>{if(/Uncaught|Failed to load module|Refused to/i.test(event.message))errors.push(event.message);});
 win.webContents.setBackgroundThrottling(false);await win.loadFile(path.join(source,'src/index.html'));
 const js=code=>win.webContents.executeJavaScript(code,true);
 const until=async(code,label)=>{for(let n=0;n<120;n++){if(await js(code))return;await delay(40);}throw Error(label);};
 const click=async selector=>{await js(`{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing control: '+${JSON.stringify(selector)});if(el.dataset.action==='pregame-hero')selectionFixture.originalOpener=el;el.focus();el.click();}`);await delay(50);};
 const focus=()=>js('({tag:document.activeElement?.tagName,action:document.activeElement?.dataset.action,inside:document.getElementById("overlay-root").contains(document.activeElement)})');
 const picker=async()=>{await click('[data-action=pregame-hero]');await until('document.activeElement?.id==="picker-search"','Picker search was not focused');};
 await until('!!document.querySelector("[data-action=pregame-hero]")','App failed to show the hero entry');
 const loadedModule=await js('document.querySelector("script[type=module]").src');assert.equal(loadedModule,url('src/app.mjs'),'The renderer must load app.mjs from the selected source or package');
 for(const method of ['escape','button','backdrop']){
  await picker();await js('selectionFixture.redraw()');
  await until('!selectionFixture.originalOpener.isConnected&&document.querySelector("[data-action=pregame-hero]")!==selectionFixture.originalOpener','Background data publication did not rebuild the opening button');
  if(method==='escape'){win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});}
  else if(method==='button')await click('#overlay-root [data-action=close]');
  else await js('{const el=document.querySelector("#overlay-root>[data-backdrop]");for(const name of ["pointerdown","pointerup"])el.dispatchEvent(new PointerEvent(name,{bubbles:true,pointerId:7,isPrimary:true,button:0}));el.click();}');
  await until('!document.getElementById("overlay-root").firstElementChild','Picker did not close');
  const sameLogicalNewDomFocused=await js('document.activeElement===document.querySelector("[data-action=pregame-hero]")&&document.activeElement!==selectionFixture.originalOpener');
  checks.push({method,backgroundRebuilt:true,sameLogicalNewDomFocused,focus:await focus()});
 }
 for(const change of ['role','game']){
  await picker();
  if(change==='role')await js('{const el=document.querySelector("#solo-role");el.value="jungle";el.dispatchEvent(new Event("change",{bubbles:true}));}');
  else await js('selectionFixture.changeGame();new Promise(resolve=>setTimeout(resolve,0))');
  await js('selectionFixture.redraw()');
  if(await js('!!document.querySelector("#overlay-root [data-action=close]")'))await click('#overlay-root [data-action=close]');
  checks.push({method:'changed-'+change,focus:await focus()});
 }
 await click('[data-action=navigate][data-route=hex]');await click('[data-action=pick-hex]');await click('#picker-grid [data-action=pick-champion][data-id=Ahri]');
 await until('selectionFixture.pending.length===1','Controlled hex selection did not wait');await click('#overlay-root [data-action=close]');
 await click('[data-action=navigate][data-route=settings]');await click('[data-action=theme-open]');
 await js('document.querySelector("#overlay-root .theme-settings").dataset.keep="new-dialog";selectionFixture.finish(0)');await delay(100);
 checks.push({method:'hex-return-after-replacement',preserved:await js('document.querySelector("#overlay-root .theme-settings")?.dataset.keep==="new-dialog"')});
 await click('#overlay-root [data-action=close]');await click('[data-action=navigate][data-route=hex]');await click('[data-action=pick-hex]');
 const sourcePending=await js('selectionFixture.pending.length');await click('#picker-grid [data-action=pick-champion][data-id=Ahri]');
 await js('selectionFixture.source("Jinx")');await until('document.querySelector(".hex-handbook-toolbar [data-action=build]")?.dataset.id==="Jinx"','Source navigation did not show Jinx');
 await js('selectionFixture.finish('+sourcePending+')');await delay(60);
 checks.push({method:'late-choice-after-source-navigation',preserved:await js('document.querySelector(".hex-handbook-toolbar [data-action=build]")?.dataset.id==="Jinx"')});
 await js('selectionFixture.hexMode();new Promise(resolve=>setTimeout(resolve,0))');
 for(const destination of ['theme','configuration','route']){
  await click('[data-action=navigate][data-route=draft]');await until('!!document.querySelector("[data-action=hex-local-pick][data-id=Ahri]")','The real hex draft entry did not render');
  const pending=await js('selectionFixture.pending.length');await click('[data-action=hex-local-pick][data-id=Ahri]');
  if(destination==='theme'){await click('.window-tools>summary');await click('[data-action=theme-open]');}
  else if(destination==='configuration')await js('selectionFixture.configuration()');
  else await click('[data-action=navigate][data-route=settings]');
  await js('selectionFixture.replacement=document.getElementById("overlay-root").firstElementChild;selectionFixture.finish('+pending+')');await delay(60);
  checks.push({method:'local-choice-after-'+destination,preserved:await js('document.getElementById("overlay-root").firstElementChild===selectionFixture.replacement')});
  if(await js('!!document.querySelector("#overlay-root [data-action=close]")'))await click('#overlay-root [data-action=close]');
 }
 const passed=checks.slice(0,3).every(check=>check.sameLogicalNewDomFocused&&check.focus.action==='pregame-hero')&&checks.slice(3,5).every(check=>check.focus.tag==='BODY')&&checks.slice(5).every(check=>check.preserved)&&errors.length===0;
 const result={passed,source,loadedModule,appSha256:crypto.createHash('sha256').update(await fs.readFile(path.join(source,'src/app.mjs'))).digest('hex'),checks,errors,actualClientAccess:false,actualRuneWrites:false,actualFeedbackUploads:false,allExternalRequestsBlocked:true,blockedRequests,root};
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));assert.equal(passed,true,'Selection interaction checks failed');app.quit();
}
run().catch(async error=>{console.error(error);if(root)await fs.writeFile(path.join(root,'error.txt'),error.stack).catch(()=>{});app.exit(1);});
