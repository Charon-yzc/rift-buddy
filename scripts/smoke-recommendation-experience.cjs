const {app,ipcMain,globalShortcut,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),http=require('node:http'),cp=require('node:child_process'),{EventEmitter}=require('node:events');
app.commandLine.appendSwitch('force-device-scale-factor','1');app.disableHardwareAcceleration();
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[],attempts=[],shots=[],geometry=[];
let fixture,room,main,data;const registered=new Map();
app.setPath('userData',root);globalShortcut.register=()=>false;
global.fetch=async()=>{throw Error('Fixture blocks external requests');};https.request=http.request=()=>{throw Error('Fixture blocks real game sockets');};global.WebSocket=class{constructor(){throw Error('Fixture blocks room sockets');}};
app.on('browser-window-created',(_event,window)=>{windows.push(window);window.show=()=>{};window.showInactive=()=>{};window.focus=()=>{};window.webContents.setBackgroundThrottling(false);});
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true})));
const original=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>{registered.set(name,handler);return original(name,async(event,...args)=>{
 if(name==='party-range'){const boot=await registered.get('bootstrap')(event),next=structuredClone(boot.state);next.draft.slots=next.draft.slots.map(slot=>slot.role===args[0].role?{...slot,party:args[0].checked,partyManual:true}:slot);next.draft.partyCount=next.draft.slots.filter(slot=>slot.party).length;return registered.get('save-state')(event,next,boot.state);}
 if(name==='client-status')return structuredClone(fixture);
 if(name==='room-status')return structuredClone(room);
 if(name==='room-addresses')return [];
 if(name==='room-publish'||name==='room-share'){room.members[0].share={...args[0],...(room.members[0].share?.ballot?{ballot:room.members[0].share.ballot}:{})};return structuredClone(room);}
 if(name==='room-ballot'){
  const value=args[0],own=room.members[0];own.share||={};own.share.ballot={...own.share.ballot,...value};
  if(value.proposal){for(const member of room.members)member.share={...member.share,ballot:{version:1,proposal:structuredClone(value.proposal),votes:[value.addVote]}};}
  return structuredClone(room);
 }
 if(name==='prepare-selection'){
  const value=args[0],own=fixture.session.myTeam[0];assert.ok(value.page?.selectedPerkIds?.length===9);assert.equal(value.summoners.length,2);assert.ok(value.itemSet);assert.ok(!value.preselectOnly,'Position claims must apply a complete configuration');
  if(own.pickState==='locked')assert.equal(data.champions.find(c=>c.id===value.champion).key,own.championId,'A locked hero was replaced');
  attempts.push(structuredClone(value));if(own.pickState!=='locked'){own.championId=0;own.championPickIntent=data.champions.find(c=>c.id===value.champion).key;}
  return {complete:true,steps:Object.fromEntries(['hover','runes','spells','items'].map(key=>[key,{status:'done'}]))};
 }
 if(name==='apply-runes')throw Error('All real rune writes prohibited');
 if(name==='companion-mode'){
  main.setMinimumSize(args[0]?360:820,480);main.setContentSize(args[0]?440:1180,820);const layout={docked:!!args[0],overlap:false};main.webContents.send('window-layout',layout);return layout;
 }
 const result=await handler(event,...args);if(name==='bootstrap'||name==='main-ready')return {...result,client:structuredClone(fixture)};return result;
});};
const spawn=cp.spawn;cp.spawn=(file,...args)=>{if(!file.endsWith('window-observer.exe'))return spawn(file,...args);const process=new EventEmitter();process.stdout=new EventEmitter();process.stdout.setEncoding=()=>{};process.exitCode=null;process.stdin={end(){process.exitCode=0;process.emit('exit',0)}};process.kill=()=>process.stdin.end();return process;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<240;n++){if(await check())return;await sleep(80);}throw Error(label);}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile('release/latest.json')),base=source?process.cwd():path.join(release.directory,'resources/app.asar');
 data=JSON.parse(await fs.readFile(path.join(base,'data/game.json')));const hero=id=>data.champions.find(c=>c.id===id);
 fixture={connected:true,phase:'ChampSelect',mode:{id:'rift',label:'召唤师峡谷'},receivedAt:new Date().toISOString(),game:{gameId:660001,mapId:11,queueId:430},party:{status:'known',lobbyCount:3,members:[{cellId:0,local:true,firstPosition:'BOTTOM'},{cellId:1,firstPosition:'MIDDLE'},{cellId:2,firstPosition:'UTILITY'}]},session:{gameId:660001,localPlayerCellId:0,myTeam:[{cellId:0,championId:0,championPickIntent:0,assignedPosition:'BOTTOM'},{cellId:1,championId:0,championPickIntent:0,assignedPosition:'MIDDLE'},{cellId:2,championId:0,championPickIntent:hero('Nami').key,assignedPosition:'UTILITY'},{cellId:3,championId:hero('Garen').key,assignedPosition:'TOP',pickState:'locked'}],theirTeam:[],actions:[[{actorCellId:0,type:'pick',completed:false}]],bans:[],allowDuplicatePicks:false},eligibility:{status:'checked',receivedAt:new Date().toISOString(),pickable:data.champions.map(c=>c.key),disabled:[]}};
 room={mode:'host',room:'884369',ballots:true,link:'connected',members:[{self:true,nick:'本人很长的昵称',online:true},{nick:'阿青的完整昵称',online:true},{nick:'第三位开黑朋友',online:true}],transport:'relay'};
 app.getVersion=()=>JSON.parse(require('node:fs').readFileSync(path.join(base,'package.json'))).version;
 require(path.join(base,'electron/main.cjs'));await until(()=>{main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html'));return main},'Main missing');main.webContents.on('console-message',(_event,level,message)=>console.log('RENDERER '+level+' '+message));
 const js=code=>main.webContents.executeJavaScript(code,true);
 const click=async selector=>{await until(()=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;e.click();return true})()`),'Missing '+selector);await sleep(130);};
 const sync=async()=>{await click('[data-action=sync]');await until(()=>js('!document.querySelector("[data-action=sync]")?.disabled'),'Sync incomplete')};
 const capture=async name=>{await js('Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,1500))])');await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await sleep(350);await fs.writeFile(path.join(root,name),(await main.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());shots.push(name);await fs.writeFile(path.join(root,name+'.json'),JSON.stringify(await js('({tab:document.querySelector(".companion-tabs .active")?.dataset.tab,preselected:document.querySelector("#include-preselected")?.checked,heroes:[...document.querySelectorAll(".companion-candidate .candidate-member")].map(e=>e.dataset.id),body:document.body.innerText})'),null,2));};
 const generate=async()=>{await click('[data-action=recommend],[data-action=reroll]');await until(()=>js('document.querySelectorAll(".result-card,.companion-candidate").length>0&&!document.querySelector(".recommendation-loading")&&![...document.querySelectorAll("[data-action=recommend],[data-action=reroll]")].some(e=>e.disabled)'),'Candidates missing');};
 await until(()=>js('!!document.querySelector("#include-preselected")'),'Draft missing');await sync();await js('window.__workers=[];window.__Worker=window.Worker;window.Worker=class extends window.__Worker{constructor(...args){super(...args);const info={at:Date.now()};window.__workers.push(info);this.addEventListener("message",event=>{info.done=Date.now();info.error=event.data.error;info.count=event.data.results?.length});this.addEventListener("error",event=>info.error=event.message)}};true');await generate();
 assert.equal(await js('document.querySelector("#include-preselected").checked'),false);
 await click('[data-action=companion-attach]');await until(()=>js('!!document.querySelector(".companion-shell")'),'Sidebar missing');
 await click('[data-action=pregame-hero]');await until(()=>js('!!document.querySelector("#picker-search")'),'Picker missing');await capture('preselection-picker.png');
 await click('[data-action=pick-champion][data-id=Ashe]');await until(()=>attempts.length===1,'Hero click did not configure');
 assert.equal(await js('document.querySelector(".companion-tabs .active").dataset.tab'),'recommend','Hover navigated to configuration');assert.equal(await js('!!document.querySelector("#overlay-root>*")'),false);
 assert.equal(attempts[0].champion,'Ashe');assert.ok(attempts[0].page);await sync();
 await click('#include-preselected');await until(()=>js('document.querySelectorAll(".companion-candidate").length>0&&[...document.querySelectorAll(".companion-candidate")].every(r=>r.querySelector("[data-id=Ashe]"))'),'Opt-in did not anchor hover');
 const state=JSON.parse(await fs.readFile(path.join(root,'settings.json')));assert.equal(state.preferences.includePreselected,true);assert.equal(state.draft.slots.filter(s=>s.party).length,3);
 await capture('sidebar-preselected-on.png');
 // Blind pick may omit lanes and report the local choice only as an intent.
 // The same opt-in must keep both that hero and an unbound ally in candidates.
 fixture.session.myTeam[0].assignedPosition='';fixture.session.myTeam[2].assignedPosition='';
 await sync();await generate();
 assert.ok(await js('document.querySelectorAll(".companion-candidate").length>0&&[...document.querySelectorAll(".companion-candidate")].every(r=>r.querySelector("[data-id=Ashe]")&&r.querySelector("[data-id=Nami]"))'),'Blind-pick hovers were omitted from the recommendation');
 assert.equal(fixture.session.myTeam[0].championId,0);assert.ok(fixture.session.myTeam[0].championPickIntent>0);
 await capture('sidebar-blind-preselected-on.png');
 fixture.session.myTeam[0].assignedPosition='BOTTOM';fixture.session.myTeam[2].assignedPosition='UTILITY';await sync();
 await click('#include-preselected');await until(()=>js('document.querySelectorAll(".companion-candidate").length>0&&[...document.querySelectorAll(".companion-candidate")].some(r=>!r.querySelector("[data-id=Ashe]"))'),'Opt-out retained hover anchor');
 fixture.session.myTeam[0].championId=hero('Ashe').key;fixture.session.myTeam[0].championPickIntent=0;fixture.session.myTeam[0].pickState='locked';fixture.session.actions[0][0]={actorCellId:0,type:'pick',championId:hero('Ashe').key,completed:true};await sync();
 await until(()=>js('document.querySelector(".companion-tabs .active")?.dataset.tab==="plan"'),'Lock did not navigate');await capture('sidebar-locked-configuration.png');
 await click('[data-action=companion-tab][data-tab=recommend]');await generate();
 assert.ok(await js('[...document.querySelectorAll(".companion-candidate")].every(r=>r.querySelector("[data-id=Ashe]"))'));
 const written=attempts.length;await click('.companion-candidate [data-action=companion-preview][data-role=mid]');assert.equal(attempts.length,written);assert.match(await js('document.querySelector("#toast").textContent'),/锁定|不能/);
 await click('.companion-candidate [data-action=propose-result]');await until(()=>js('document.querySelectorAll(".room-ballot-row").length>0'),'Proposal missing');
 assert.equal(await js('document.querySelectorAll(".room-ballot-row .ballot-member").length'),3,'Unreferenced outside teammate was proposed');
 assert.deepEqual(new Set((await js('document.querySelector(".ballot-proposers").title')).split('、')),new Set(room.members.map(m=>m.nick)));
 const hoverPoint=await js('(()=>{const r=document.querySelector(".room-ballot-row .lineup-fit-number").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');main.webContents.sendInputEvent({type:'mouseMove',...hoverPoint});await until(()=>js('getComputedStyle(document.querySelector(".room-ballot-row .lineup-fit-hover")).display==="grid"'),'Score hover missing');const fit=await js('(()=>{const e=document.querySelector(".room-ballot-row .lineup-fit-number");return {tip:e.querySelector(".lineup-fit-hover").textContent,visible:getComputedStyle(e.querySelector(".lineup-fit-hover")).display};})()');assert.match(fit.tip,/成员衔接|共同战术/);assert.equal(fit.visible,'grid');assert.ok(await js('(()=>{const r=document.querySelector(".room-ballot-row .lineup-fit-hover").getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight})()'));await capture('sidebar-proposal-score-hover.png');main.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});
 await js('document.activeElement.blur()');await click('[data-action=room-vote]');assert.equal(attempts.length,written,'Voting wrote a client configuration');
 for(const width of [440,520]){main.setContentSize(width,820);for(const tab of ['recommend','plan','rankings','room']){
  await click(`[data-action=companion-tab][data-tab=${tab}]`);
  if(tab==='rankings'){
   assert.ok(await js('(()=>{const d=document.querySelector(".companion-ranking-context");return !d.open&&d.getBoundingClientRect().height<50&&document.querySelector(".companion-content").getBoundingClientRect().top<125&&!d.querySelector(".companion-roster").checkVisibility()})()'),'Ranking context must start compact and keep the table near the top');
   await js('document.querySelector(".companion-ranking-context>summary").focus()');main.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});main.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
   await until(()=>js('document.querySelector(".companion-ranking-context").open'),'Ranking context cannot open by keyboard');assert(await js('document.querySelector(".companion-ranking-context .companion-roster").checkVisibility()'),'Expanded ranking context lost the lineup');
   await capture(`sidebar-rankings-expanded-${width}.png`);
   main.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});main.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await until(()=>js('!document.querySelector(".companion-ranking-context").open'),'Ranking context cannot close by keyboard');
  }
  await capture(`sidebar-${tab}-${width}.png`);geometry.push({surface:'sidebar',tab,width,...await js('({viewport:innerWidth,scroll:document.documentElement.scrollWidth})')});
 }}
 room.members.push({nick:'第四位完整昵称',online:true},{nick:'第五位完整昵称',online:true});await click('[data-action=companion-tab][data-tab=recommend]');await click('[data-action=toggle-party][data-role=top]');await click('[data-action=toggle-party][data-role=jungle]');await generate();
 await click('.companion-candidate [data-action=propose-result]');await until(()=>js('[...document.querySelectorAll(".ballot-heroes")].some(e=>e.dataset.memberCount==="5")'),'Five-player proposal missing');
 for(const width of [360,440]){main.setContentSize(width,820);assert.ok(await js('[...document.querySelectorAll(".room-ballot-row")].every(r=>r.querySelector(".ballot-proposers").getBoundingClientRect().height<=r.querySelector(".ballot-member").getBoundingClientRect().height)'), 'Nickname summaries increased the roster row height');await capture('sidebar-five-'+width+'.png');geometry.push({surface:'sidebar-five',width,...await js('({viewport:innerWidth,scroll:document.documentElement.scrollWidth})')});}
 main.setMinimumSize(280,480);await click('[data-action=companion-tab][data-tab=room]');
 for(const scale of [1,1.25]){
  await js('window.buddy.presentation({field:"textScale",value:'+scale+'})');await sleep(180);
  for(const width of [280,360,440]){
   main.setContentSize(width,820);await sleep(100);
   const layout=await js('(()=>{const pane=document.querySelector(".companion-content").getBoundingClientRect();return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,top:pane.top,bottom:Math.min(pane.bottom,document.querySelector(".companion-footer").getBoundingClientRect().top),members:[...document.querySelectorAll(".room-member")].map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height,nick:e.querySelector("header>b").title}))}})()');
   assert.equal(layout.members.length,5);assert.ok(layout.members.every(row=>row.top>=layout.top-1&&row.bottom<=layout.bottom+1),'Five-member room is clipped '+JSON.stringify({width,scale,...layout}));
   await js('document.querySelector(".room-actions-menu>summary").focus()');main.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});main.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
   await until(()=>js('document.querySelector(".room-actions-menu").open'),'Room actions cannot open by keyboard');
   assert.ok(await js('[...document.querySelectorAll(".room-actions-menu .btn")].every(e=>{const r=e.getBoundingClientRect();return e.checkVisibility()&&r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight})'),'Room maintenance actions are clipped');
   if(width===360&&scale===1)await capture('sidebar-room-menu.png');
   main.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});main.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await until(()=>js('!document.querySelector(".room-actions-menu").open'),'Room actions cannot close by keyboard');assert.ok(await js('document.activeElement===document.querySelector(".room-actions-menu>summary")'),'Escape must restore the room menu focus');
   await capture('sidebar-room-five-'+width+'-'+scale+'.png');geometry.push({surface:'sidebar-room-five',width,scale,...layout});
  }
 }
 await js('window.buddy.presentation({field:"textScale",value:1})');await sleep(180);
 await js('window.buddy.companionMode(false)');await until(()=>js('!document.querySelector(".companion-shell")'),'Main did not expand');
 for(const width of [1180,900]){main.setContentSize(width,820);for(const route of ['draft','room','builds','reference','rankings','patches','hex','favorites','settings']){await click(`[data-action=navigate][data-route=${route}]`);await until(()=>js(`document.querySelector("#main")?.dataset.page===${JSON.stringify(route)}`),'Wrong main route');await capture(`main-${route}-${width}.png`);geometry.push({surface:'main',route,width,...await js('({viewport:innerWidth,scroll:document.documentElement.scrollWidth})')});}}
 assert.ok(geometry.every(row=>row.scroll<=row.viewport+1),'Page overflow: '+JSON.stringify(geometry.filter(row=>row.scroll>row.viewport+1)));
 await fs.writeFile(path.join(root,'report.json'),JSON.stringify({passed:true,source,archiveSha256:release?.archiveSha256||null,attempts:attempts.length,realLcuWrites:0,shots,geometry},null,2));console.log('RECOMMENDATION EXPERIENCE PASS '+root);app.quit();
}
run().catch(async error=>{console.error(error);if(main){await fs.writeFile(path.join(root,'failure.png'),(await main.webContents.capturePage()).toPNG());await fs.writeFile(path.join(root,'failure-state.json'),JSON.stringify(await main.webContents.executeJavaScript('({workers:window.__workers,toast:document.querySelector("#toast")?.textContent,body:document.body.innerText})'),null,2));}await fs.writeFile(path.join(root,'failure.txt'),error.stack);app.exit(1);});
