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
 const index=await fs.readFile(path.join(base,'src/index.html'),'utf8'),styles=[...index.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi)].map(match=>match[0]);assert.ok(styles.length,'Use the renderer stylesheet order from index.html');
 const html=(content,bodyClass='')=>`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><base href="${pathToFileURL(path.join(base,'src/')).href}">${styles.join('')}</head><body class="${bodyClass}">${content}</body></html>`;
 const w=new BrowserWindow({width:440,height:800,show:false,useContentSize:true,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 // This harness loads rendered views only. It has no preload, app IPC or client transport.
 const metrics=[],failures=[];
 const check=(label,test)=>{try{test();}catch(error){failures.push({label,message:error.message});console.error(label+': '+error.message);}};
 const measure=(window,rowSelector,paneSelector)=>window.webContents.executeJavaScript(`(()=>{const pane=document.querySelector(${JSON.stringify(paneSelector)}),rows=[...document.querySelectorAll(${JSON.stringify(rowSelector)})],rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}},box=rect(pane),visible=r=>r.y>=box.y&&r.bottom<=Math.min(box.bottom,innerHeight),controls=[...pane.querySelectorAll('.candidate-row button,.candidate-details>summary,[data-action=more-candidates]')].filter(el=>el.checkVisibility({contentVisibilityAuto:true}));return {viewport:{width:innerWidth,height:innerHeight},pane:box,rows:rows.map(rect),indices:rows.map(el=>Number(el.dataset.resultIndex)),threeVisible:rows.length===3&&rows.map(rect).every(visible),lastVisible:!!rows.length&&visible(rect(rows.at(-1))),bodyWidth:document.documentElement.scrollWidth,paneWidth:pane.clientWidth,paneScrollWidth:pane.scrollWidth,overflow:controls.filter(el=>{const r=rect(el);return r.right>innerWidth||r.x<0}).length,controls:controls.map(rect),more:!!pane.querySelector('[data-action=more-candidates]')}})()`);
 const assertLayout=(label,state,defaultChoices=true)=>check(label,()=>{assert.equal(state.rows.length,defaultChoices?3:6,label+' candidate count');assert.equal(state.overflow,0,label+' controls cannot cross the window edge');assert.ok(state.bodyWidth<=state.viewport.width&&state.paneScrollWidth<=state.paneWidth,label+' cannot overflow horizontally');assert.ok(state.controls.length&&state.controls.every(r=>r.height>=30),label+' candidate controls remain at least 30px high');assert.ok(state.more,label+' keeps remaining candidates accessible');if(defaultChoices)assert.ok(state.threeVisible,label+' all three default candidates must fit without scrolling: '+JSON.stringify(state));else{assert.deepEqual(state.indices,[0,1,2,3,4,5],label+' exposes every remaining candidate');assert.ok(state.lastVisible,label+' sixth candidate can be scrolled into view');}});
 const key=(window,keyCode)=>{window.webContents.sendInputEvent({type:'keyDown',keyCode});window.webContents.sendInputEvent({type:'keyUp',keyCode});};
 const openDetail=async(window,label)=>{
  const js=code=>window.webContents.executeJavaScript(code,true);
  assert.equal(await js(`document.querySelector('.candidate-detail-content').checkVisibility({contentVisibilityAuto:true})`),false,label+' details start collapsed');
  await js(`document.querySelector('.candidate-row>.btn').focus()`);key(window,'Tab');await delay(50);
  assert.ok(await js(`document.activeElement.matches('.candidate-details>summary')`),label+' details summary is reachable by Tab');
  key(window,'Space');await delay(100);
  const open=await js(`(()=>{const detail=document.querySelector('.candidate-details'),content=detail.querySelector('.candidate-detail-content');return {open:detail.open,visible:content.checkVisibility({contentVisibilityAuto:true}),action:!!content.querySelector('[data-action=result-detail]')}})()`);
  assert.deepEqual(open,{open:true,visible:true,action:true},label+' keyboard opens candidate details');
  if(label==='party-440x800')assert.ok(await js(`!!document.querySelector('.candidate-detail-content [aria-label="成员行动分工"]')&&!!document.querySelector('.candidate-detail-content .pair-statistics')`),label+' keeps member jobs and pair evidence in the details');
  key(window,'Tab');await delay(50);assert.ok(await js(`document.activeElement.matches('[data-action=result-detail]')`),label+' full detail action is reachable by Tab');
 };
 for(const [label,width,height,fixtureProps,scale] of [
  ['party-440x800',440,800,props,1],
  ['unknown-440x900',440,900,{...props,client:{...client,eligibility:null}},1],
  ['solo-440x760',440,760,{...props,scope:'solo',soloRole:'mid',results:recommend({slots,champions:data.champions,scope:'solo',soloRole:'mid',limit:6})},1],
  ['large-text-440x900',440,900,props,1.25]
 ]){
  const load=async showAllCandidates=>{await fs.writeFile(path.join(root,'fixture.html'),html(companionView({...fixtureProps,showAllCandidates}),'companion-mode'));w.setContentSize(width,height);await w.loadFile(path.join(root,'fixture.html'));await w.webContents.executeJavaScript(`document.documentElement.style.setProperty('--text-scale','${scale}')`);await delay(100);};
  await load(false);
  const state=await measure(w,'.companion-candidate','.companion-content');
  await fs.writeFile(path.join(root,label+'-metrics.json'),JSON.stringify(state,null,2));
  await fs.writeFile(path.join(root,label+'.png'),(await w.webContents.capturePage()).toPNG());
  assertLayout(label,state);metrics.push({label,...state});
  if(label==='party-440x800'){
   await openDetail(w,label);
   await fs.writeFile(path.join(root,'party-detail-keyboard.png'),(await w.webContents.capturePage()).toPNG());
  }
  // The isolated sidebar view has no app listeners; render its expanded state.
  // The main renderer below exercises the real more-candidates click handler.
  await load(true);await w.webContents.executeJavaScript(`const pane=document.querySelector('.companion-content');pane.scrollTop=pane.scrollHeight`);await delay(100);
  const expanded=await measure(w,'.companion-candidate','.companion-content');assertLayout(label+'-more',expanded,false);metrics.push({label:label+'-more',...expanded});
  await fs.writeFile(path.join(root,label+'-more-metrics.json'),JSON.stringify(expanded,null,2));await fs.writeFile(path.join(root,label+'-more.png'),(await w.webContents.capturePage()).toPNG());
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
 main.setMinimumSize(640,600);main.setContentSize(1280,720);const js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=draft-scope]")'),'Main draft missing');
 await js(`document.querySelector('[data-action=draft-scope][data-scope=party]').click()`);await delay(200);
 await js(`document.querySelector('[data-action=recommend]').click()`);
 try{await until(()=>js('document.querySelectorAll(".compact-candidate").length===3'),'Three main candidates missing');}catch(error){await fs.writeFile(path.join(root,'main-missing.txt'),await js('document.body.innerText'));await fs.writeFile(path.join(root,'main-missing.png'),(await main.webContents.capturePage()).toPNG());throw error;}
 await delay(150);
 const mainState={...await measure(main,'.compact-candidate','.task-candidate-list'),slots:await js('document.querySelectorAll(".task-roster .slot").length')};
 await fs.writeFile(path.join(root,'main-1280x720-metrics.json'),JSON.stringify(mainState,null,2));
 await js('Promise.all([...document.images].map(image=>{image.loading="eager";return image.decode().catch(()=>{});})).then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');main.webContents.invalidate();await delay(150);
 await fs.writeFile(path.join(root,'main-1280x720.png'),(await main.webContents.capturePage()).toPNG());
 assert.equal(mainState.slots,5);assertLayout('main-1280x720',mainState);
 await js(`document.querySelector('[data-action=more-candidates]').focus()`);key(main,'Space');
 await until(()=>js('document.querySelectorAll(".compact-candidate").length===6'),'More candidates must expose all six main choices');
 await js(`const pane=document.querySelector('.task-candidate-list');pane.scrollTop=pane.scrollHeight`);await delay(100);
 const mainExpanded=await measure(main,'.compact-candidate','.task-candidate-list');assertLayout('main-1280x720-more',mainExpanded,false);
 await fs.writeFile(path.join(root,'main-1280x720-more-metrics.json'),JSON.stringify(mainExpanded,null,2));await fs.writeFile(path.join(root,'main-1280x720-more.png'),(await main.webContents.capturePage()).toPNG());
 await js(`document.querySelector('[data-action=more-candidates]').focus()`);key(main,'Space');
 await until(()=>js('document.querySelectorAll(".compact-candidate").length===3'),'Remaining main candidates can be collapsed again');
 await js(`document.querySelector('.task-candidate-list').scrollTop=0`);await openDetail(main,'main-1280x720');key(main,'Space');
 await until(()=>js('!!document.querySelector(".plan-drawer")'),'Full result detail remains accessible');
 await js(`document.querySelector('[data-action=close]').click();document.querySelector('.candidate-member').click();`);
 await until(()=>js('!!document.querySelector(".drawer")'),'Candidate configuration remains accessible');assert.equal(clientWrites,0);
 main.setContentSize(1050,640);await js(`document.querySelector('[data-action=close]').click()`);await delay(100);
 assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'),'Small main remains operable without horizontal overflow');
 await fs.writeFile(path.join(root,'main-1050x640.png'),(await main.webContents.capturePage()).toPNG());
 await fs.writeFile(path.join(root,'layout.json'),JSON.stringify({passed:!failures.length,source,archiveSha256:release?.archiveSha256||null,transport:'blocked',clientWrites,styles,metrics,mainState,mainExpanded,failures},null,2));console.log(JSON.stringify({passed:!failures.length,source,clientWrites,metrics:metrics.map(m=>({label:m.label,threeVisible:m.threeVisible,lastVisible:m.lastVisible,rowHeight:m.rows[0].height})),mainThreeVisible:mainState.threeVisible,failures,screenshots:root},null,2));assert.equal(failures.length,0,'Selection layout failures; see '+path.join(root,'layout.json'));w.destroy();main.destroy();app.quit();
}
run().catch(async error=>{console.error(error);await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'error.txt'),error.stack);app.exit(1);});


