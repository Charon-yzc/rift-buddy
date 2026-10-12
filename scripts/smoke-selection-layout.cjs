const {app,BrowserWindow,globalShortcut}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const workspace=process.cwd(),root=path.resolve(process.env.RIFT_BUDDY_USER_DATA||path.join(workspace,'.local','selection-layout-'+Date.now()));
process.env.RIFT_BUDDY_USER_DATA=root;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.setPath('userData',path.join(root,'user-data'));
async function run(){
 await app.whenReady();await fs.mkdir(root,{recursive:true});
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile(path.join(workspace,'release/latest.json'))),base=source?workspace:path.join(release.directory,'resources/app.asar');
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));
 const {createSlots,recommend}=await import(pathToFileURL(path.join(base,'src/core/recommend.mjs')));
 const {companionView}=await import(pathToFileURL(path.join(base,'src/companion-view.mjs')));
 const {pickEligibilityContext}=await import(pathToFileURL(path.join(base,'src/core/pick-eligibility.mjs')));
 const slots=createSlots(),client={connected:true,phase:'ChampSelect',mode:{id:'rift',label:'召唤师峡谷'},session:{localPlayerCellId:0,myTeam:[{cellId:0,championId:0,assignedPosition:'MIDDLE'}],theirTeam:[],bans:[],actions:[],allowDuplicatePicks:false}};
 client.eligibility={receivedAt:new Date().toISOString(),context:pickEligibilityContext(client.session),localPlayerCellId:0,pickable:data.champions.map(c=>c.key),disabled:[]};
 const results=recommend({slots,champions:data.champions,scope:'party',limit:6});assert.equal(results.length,6);
 const props={data,client,slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results};
 const html=(content,bodyClass='')=>`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><base href="${pathToFileURL(path.join(base,'src/')).href}">${['styles.css','draft.css','database-upgrade.css','companion.css','presentation.css','room-workspace.css'].map(name=>`<link rel="stylesheet" href="${name}">`).join('')}</head><body class="${bodyClass}">${content}</body></html>`;
 const w=new BrowserWindow({width:440,height:800,show:false,useContentSize:true,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 // This harness loads rendered views only. It has no preload, app IPC or client transport.
 const metrics=[];
 for(const [label,width,height,fixture,scale] of [
  ['party-440x800',440,800,companionView(props),1],
  ['unknown-440x900',440,900,companionView({...props,client:{...client,eligibility:null}}),1],
  ['solo-440x760',440,760,companionView({...props,scope:'solo',soloRole:'mid',results:recommend({slots,champions:data.champions,scope:'solo',soloRole:'mid',limit:6})}),1],
  ['large-text-440x900',440,900,companionView(props),1.25]
 ]){
  await fs.writeFile(path.join(root,'fixture.html'),html(fixture,'companion-mode'));w.setContentSize(width,height);await w.loadFile(path.join(root,'fixture.html'));await delay(100);
  await w.webContents.executeJavaScript(`document.documentElement.style.setProperty('--text-scale','${scale}')`);
  const state=await w.webContents.executeJavaScript(`(()=>{const pane=document.querySelector('.companion-content'),box=pane.getBoundingClientRect(),rows=[...document.querySelectorAll('.companion-candidate')],rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};return {viewport:{width:innerWidth,height:innerHeight},pane:rect(pane),rows:rows.map(rect),sixVisible:rows[5].getBoundingClientRect().bottom<=box.bottom,roster:rect(document.querySelector('.companion-team-now')),overflow:[...document.querySelectorAll('.candidate-row button,.candidate-details>summary')].filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth||r.left<0}).length,controls:[...document.querySelectorAll('.candidate-row>.btn,.candidate-details>summary')].map(rect)}})()`);
  await fs.writeFile(path.join(root,label+'-metrics.json'),JSON.stringify(state,null,2));
  await fs.writeFile(path.join(root,label+'.png'),(await w.webContents.capturePage()).toPNG());
  assert.equal(state.rows.length,6);assert.equal(state.overflow,0,label+' controls cannot cross the window edge');
  assert.ok(state.controls.every(r=>r.height>=30),label+' controls remain at least 30px high');
  if(scale===1)assert.ok(state.sixVisible,label+' sixth candidate and roster should fit without scrolling');
  await fs.writeFile(path.join(root,label+'.png'),(await w.webContents.capturePage()).toPNG());metrics.push({label,...state});
  if(label==='party-440x800'){
   const before=await w.webContents.executeJavaScript(`document.querySelector('.candidate-detail-content').checkVisibility({contentVisibilityAuto:true})`);assert.equal(before,false);
   await w.webContents.executeJavaScript(`document.querySelector('.candidate-details>summary').focus()`);
   w.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await delay(100);
   const open=await w.webContents.executeJavaScript(`(()=>{const detail=document.querySelector('.candidate-details'),content=detail.querySelector('.candidate-detail-content');return {open:detail.open,visible:content.getBoundingClientRect().height>0,action:!!content.querySelector('[data-action=result-detail]'),jobs:!!content.querySelector('[aria-label="成员行动分工"]'),samples:!!content.querySelector('.pair-statistics')}})()`);
   assert.deepEqual(open,{open:true,visible:true,action:true,jobs:true,samples:true});
   await fs.writeFile(path.join(root,'party-detail-keyboard.png'),(await w.webContents.capturePage()).toPNG());
  }
 }
 const {defaultState,saveState}=await import(pathToFileURL(path.join(base,'services/storage.mjs'))),saved=defaultState();
 for(const field of ['autoSync','autoCheck','appUpdateCheck','autoLive','clientCompanion'])saved.preferences[field]=false;
 await saveState(root,saved);
 // The actual main renderer uses an isolated state and an unreachable client.
 // A future accidental request must fail here, never reach LCU or rune pages.
 const https=require('node:https');let clientWrites=0;
 https.request=options=>{if(options.method&&!['GET','HEAD'].includes(options.method))clientWrites++;throw Error('No transport is allowed in the selection layout smoke');};
 global.fetch=async()=>new Response('{}',{status:503});globalShortcut.register=()=>false;
 const windows=[];app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.webContents.setBackgroundThrottling(false);});
 const {EventEmitter}=require('node:events'),cp=require('node:child_process'),originalSpawn=cp.spawn;
 cp.spawn=(file,...args)=>{if(!String(file).endsWith('window-observer.exe'))return originalSpawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;
 require(path.join(base,'electron/main.cjs'));
 const until=async(check,label)=>{for(let i=0;i<150;i++){if(await check())return;await delay(100);}throw Error(label);};
 let main;await until(()=>{main=windows.find(window=>window.webContents.getURL().endsWith('/src/index.html'));return main;},'Main renderer missing');
 main.setMinimumSize(640,600);main.setContentSize(1366,768);const js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=example]")'),'Main draft missing');
 await js(`document.querySelector('[data-action=example]').click()`);await delay(200);
 await js(`document.querySelector('.draft-context [data-action=recommend]').click()`);
 try{await until(()=>js('document.querySelectorAll(".compact-candidate").length===6'),'Six main candidates missing');}catch(error){await fs.writeFile(path.join(root,'main-missing.txt'),await js('document.body.innerText'));await fs.writeFile(path.join(root,'main-missing.png'),(await main.webContents.capturePage()).toPNG());throw error;}
 await delay(150);
 const mainState=await js(`(()=>{const rows=[...document.querySelectorAll('.compact-candidate')],pane=document.querySelector('.draft-candidates'),rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};return {rows:rows.map(rect),pane:rect(pane),context:rect(document.querySelector('.draft-context')),slots:document.querySelectorAll('.draft-context .slot').length,bodyWidth:document.documentElement.scrollWidth,width:innerWidth,height:innerHeight}})()`);
 await fs.writeFile(path.join(root,'main-1366x768-metrics.json'),JSON.stringify(mainState,null,2));
 await js('Promise.all([...document.images].map(image=>{image.loading="eager";return image.decode().catch(()=>{});})).then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');main.webContents.invalidate();await delay(150);
 await fs.writeFile(path.join(root,'main-1366x768.png'),(await main.webContents.capturePage()).toPNG());
 assert.equal(mainState.slots,5);assert.equal(mainState.rows.length,6);assert.ok(mainState.rows[5].bottom<=Math.min(mainState.pane.bottom,mainState.height),'Six main candidates fit beside the roster');assert.ok(mainState.bodyWidth<=mainState.width,'Main cannot overflow horizontally');
 await js(`document.querySelector('.candidate-details>summary').click();document.querySelector('.candidate-details [data-action=result-detail]').click();`);
 await until(()=>js('!!document.querySelector(".plan-drawer")'),'Full result detail remains accessible');
 await js(`document.querySelector('[data-action=close]').click();document.querySelector('.candidate-member').click();`);
 await until(()=>js('!!document.querySelector(".drawer")'),'Candidate configuration remains accessible');assert.equal(clientWrites,0);
 main.setContentSize(1050,640);await js(`document.querySelector('[data-action=close]').click()`);await delay(100);
 assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'),'Small main remains operable without horizontal overflow');
 await fs.writeFile(path.join(root,'main-1050x640.png'),(await main.webContents.capturePage()).toPNG());
 await fs.writeFile(path.join(root,'layout.json'),JSON.stringify({passed:true,source,archiveSha256:release?.archiveSha256||null,transport:'blocked',clientWrites,metrics,mainState},null,2));console.log(JSON.stringify({passed:true,source,clientWrites,metrics:metrics.map(m=>({label:m.label,sixVisible:m.sixVisible,rowHeight:m.rows[0].height})),mainSixVisible:true,screenshots:root},null,2));w.destroy();main.destroy();app.quit();
}
run().catch(async error=>{console.error(error);await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'error.txt'),error.stack);app.exit(1);});
