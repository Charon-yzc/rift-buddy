const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),restart=process.env.RIFT_BUDDY_COUNTERPLAY_RESTART==='1',windows=[];
let copies=[],runeWrites=0,publicSession=null;
globalShortcut.register=()=>false;
global.fetch=async()=>{throw Error('Isolated counterplay smoke: network disabled');};
https.request=()=>{throw Error('Isolated counterplay smoke: game sockets disabled');};
app.on('browser-window-created',(_event,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>handle(name,name==='client-status'?()=>publicSession?{connected:true,phase:'ChampSelect',message:'测试公开选人',mode:{id:'rift',label:'峡谷'},session:publicSession}:{connected:false,phase:'Offline',message:'Isolated fixture'}:name==='apply-runes'?()=>{runeWrites++;throw Error('Rune writes prohibited');}:name==='copy'?(_event,text)=>{copies.push(text);return true;}:name==='companion-mode'?(_event,value)=>{const w=windows[0];w.setMinimumSize(value?280:820,480);w.setContentSize(value?440:1080,value?850:720);return {docked:!!value,overlap:false};}:handler);
const realSpawn=cp.spawn;
cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return realSpawn(file,...args);const observer=new EventEmitter();observer.stdout=new EventEmitter();observer.stdout.setEncoding=()=>{};observer.exitCode=null;observer.stdin={end(){observer.exitCode=0;observer.emit('exit',0);}};observer.kill=()=>observer.stdin.end();return observer;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<180;n++){if(await check())return;await delay(70);}throw Error(label);}
async function run(){
 app.setPath('userData',root);
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?{archiveSha256:null}:JSON.parse(await fs.readFile('release/latest.json')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 for(const file of ['src/core/party-counterplay.mjs','src/core/creative-plan.mjs','src/core/plan-stages.mjs','src/core/recommend.mjs','src/core/builds.mjs','src/cooperation-view.mjs','src/party-counterplay-view.mjs','src/duo-play-view.mjs','src/result-text.mjs','src/app.mjs','src/styles.css','src/companion.css'])assert.ok((await fs.readFile(path.join(base,file))).equals(await fs.readFile(file)),'Packaged source drift: '+file);
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),initial=JSON.parse(await fs.readFile(path.join(root,'settings.json'))),members=initial.draft.slots.filter(s=>s.party).map(({role,champion})=>({role,champion})),key=id=>data.champions.find(c=>c.id===id).key;
 if(!restart)publicSession={gameId:9001,localPlayerCellId:1,allowDuplicatePicks:true,myTeam:members.map((m,i)=>({cellId:m.role==='jungle'?1:i+2,championId:key(m.champion),assignedPosition:m.role==='bottom'?'bottom':m.role})),theirTeam:['Poppy','Janna','Morgana'].map((id,i)=>({cellId:6+i,championId:key(id)})),bans:[]};
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'),'utf8')).version;
 require(path.join(base,'electron/main.cjs'));
 let main;await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main;},'Main missing');
 const js=async code=>{try{return await main.webContents.executeJavaScript(code,true);}catch(error){throw Error('Renderer probe failed: '+code,{cause:error});}},click=async selector=>{await js('document.querySelector('+JSON.stringify(selector)+').click()');await delay(150);},state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 const capture=async(name,w=main)=>{await w.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,(restart?'restart-':'')+name),(await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'UI missing');
 if(!restart)await click('[data-action=sync]');
 main.setContentSize(1080,720);await js('window.scrollTo(0,0)');await capture('draft.png');
 const draftLayout=await js('(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {width:innerWidth,height:innerHeight,topbar:rect(".topbar"),slots:rect(".slots"),scope:rect(".draft-scope"),panelHead:rect(".builder-grid .panel-head"),action:rect(".builder-foot [data-action=recommend]"),overflow:document.documentElement.scrollWidth>innerWidth};})()');
 console.log(JSON.stringify({draftLayout}));
 assert.ok(draftLayout.topbar.height<=76,'Routine window tools should not occupy two header rows');assert.equal(draftLayout.overflow,false);assert.ok(draftLayout.action.bottom<=draftLayout.height,'Lineup and its recommendation action must fit in the short main window');
 await js('document.querySelector(".window-tools").open=true');
 assert.ok(await js('[...document.querySelectorAll(".window-tools-content .btn")].every(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.top>=0&&r.right<=innerWidth;})'));
 await js('document.querySelector(".window-tools").open=false');
 await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card .party-counterplay")'),'Concrete common conditions missing');
 main.setContentSize(1080,720);await capture('main.png');
 const mainText=await js('document.querySelector(".result-card").textContent');
 for(const phrase of ['波比','风女','莫甘娜','W 领域','黑盾'])assert.ok(mainText.includes(phrase),'Main omitted '+phrase);
 await click('[data-action=result-detail][data-index="0"]');
 const detail=await js('document.querySelector(".plan-drawer").textContent');
 assert.ok(await js('!!document.querySelector('+JSON.stringify('.plan-drawer [aria-label="共同进场与反制条件"]')+')'));
 for(const phrase of ['R 把成员或目标推离','黑盾阻止原定控制','若本局仍有'])assert.ok(detail.includes(phrase),'Detail omitted '+phrase);
 await click('[data-action=copy-result][data-index="0"]');
 assert.match(copies.at(-1),/采用时公开对手.*本局仍有/);assert.match(copies.at(-1),/黑盾阻止原定控制/);
 if(!restart){await click('.plan-drawer [data-action=favorite-result][data-index="0"]');await click('[data-action=use-result][data-index="0"]');await until(async()=>!!(await state()).draft.creativePlan,'Acceptance missing');}
 else await click('[data-action=close]');
 const accepted=await state(),plan=accepted.draft.creativePlan;
 assert.deepEqual(plan.counterplay.enemies,['Poppy','Janna','Morgana']);
 assert.deepEqual(accepted.favorites.find(f=>f.type==='team').creativePlan,plan,'Favorite lost accepted conditions');
 if(restart){assert.deepEqual(plan,initial.draft.creativePlan);assert.equal(publicSession,null,'Restart must not supply a new enemy session');}
 await click('[data-action=result-detail][data-index="0"]');
 for(const member of members){
  await click('[data-action=build][data-id="'+member.champion+'"][data-role="'+member.role+'"]');
  assert.ok((await js('document.querySelector(".combo-config").textContent')).includes('若本局仍有'));
  await click('[data-action=open-guide]');
  let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Guide missing');
  const guideJs=code=>guide.webContents.executeJavaScript(code,true);
  await until(()=>guideJs('window.guide.bootstrap().then(b=>b.model?.selection.id==='+JSON.stringify(member.champion)+'&&b.model?.combo?.id==='+JSON.stringify(plan.id)+')'),'Member plan missing in guide');
  await guideJs('document.querySelector("[data-tab=team]").click()');
  for(const stage of ['key','later']){
   await guideJs('(()=>{const s=document.querySelector("#guide-stage");s.value='+JSON.stringify(stage)+';s.dispatchEvent(new Event("change",{bubbles:true}));})()');
   await until(()=>guideJs('window.guide.bootstrap().then(b=>b.model.stage==='+JSON.stringify(stage)+')'),'Guide stage did not change');
   const payload=await guideJs('window.guide.bootstrap()');assert.deepEqual(payload.model.combo.creativePlan,plan);
   assert.match(payload.model.combo.play.stages[stage].ownAction,/若本局仍有/);
   const text=await guideJs('document.querySelector(".expanded main").textContent');
   for(const phrase of ['W 领域','黑盾阻止原定控制','R 把成员或目标推离'])assert.ok(text.includes(phrase),'Guide omitted '+phrase+' for '+member.champion+' '+stage);
  }
  await capture('guide-'+member.champion+'.png',guide);
  await click('[data-action=back-result]');
 }
 await click('[data-action=close]');await click('[data-action=companion-attach]');
 await until(()=>js('!!document.querySelector("[data-action=companion-tab][data-tab=recommend]")'),'Sidebar tabs missing');
 await click('[data-action=companion-tab][data-tab=recommend]');
 await until(()=>js('document.body.classList.contains("companion-mode")&&!!document.querySelector(".companion-candidate .party-counterplay")'),'Sidebar common gates missing');
 const sidebar=[];
 for(const width of [440,360,280]){
  main.setContentSize(width,850);await delay(100);
  assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false,'Sidebar overflow '+width);
  const text=await js('document.querySelector(".companion-candidate").textContent');
  for(const phrase of ['若本局仍有','黑盾阻止原定控制','R 把成员或目标推离'])assert.ok(text.includes(phrase),'Sidebar omitted '+phrase);
  await capture('sidebar-'+width+'.png');sidebar.push(width);
 }
 assert.equal(runeWrites,0);assert.ok(windows.every(w=>!w.isVisible()));
 const report={passed:true,restart,archiveSha256:release.archiveSha256,members,draftLayout,publicContext:restart?'saved conditional context only':'mock public picks',commonGates:plan.counterplay.rules.map(r=>r.opponent),copy:true,favorite:true,stages:['key','later'],sidebarWidths:sidebar,actualRuneWrites:runeWrites,realGame:'UNKNOWN'};
 await fs.writeFile(path.join(root,restart?'restart.json':'select.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'error.txt'),error.stack).catch(()=>{});for(const w of windows)w.destroy();app.exit(1);});
