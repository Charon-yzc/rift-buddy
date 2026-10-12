// Fixture-only controller + real renderer. No game connection or game writes.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const output=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[];
app.on('browser-window-created',(_e,w)=>{windows.push(w);w.show=()=>{};w.showInactive=()=>{};w.webContents.on('console-message',event=>{if(event.level==='error')console.error('renderer',event.message);});});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<100;n++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 app.setPath('userData',output);await app.whenReady();
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,done)=>done({cancel:true}));
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=source?null:JSON.parse(await fs.readFile('release/latest.json','utf8'));
 const root=source?process.cwd():path.join(release.directory,'resources/app.asar'),load=name=>import(pathToFileURL(path.join(root,name)).href);
 const core=await load('src/core/guide.mjs'),{changePresentation}=await load('src/core/presentation.mjs');
 const data=JSON.parse(await fs.readFile(path.join(root,'data/game.json'),'utf8'));data.builds=JSON.parse(await fs.readFile(path.join(root,'data/builds.json'),'utf8')).entries;
 let state=core.selectGuide(null,{id:'Nocturne',role:'jungle',mode:'rift'}),preferences={guideAutoShow:false},writes=0;
 let live={available:true,champion:'Nocturne',mode:'rift',mapId:11,queueId:420,inventoryKnown:true,inventory:[],gold:800,level:9,skills:{Q:5,W:1,E:1,R:1},gameTime:600,teamSide:'blue',at:Date.now(),teamKnown:true,enemies:[],allies:[],roster:[],stats:{hp:800,maxHp:1000,resource:{type:'MANA',value:300,max:500}}};
 const guide=require(path.join(root,'electron/guide-window.cjs'))({root,getState:()=>state,setState:async next=>{state=next;writes++;},getModel:()=>core.createGuideModel(data,state,{...live,at:Date.now()}),isQuitting:()=>false,showMain:()=>{},diagnostic:()=>{},getPreferences:()=>preferences,setPresentation:async change=>{preferences.presentation=changePresentation(preferences.presentation,change);return preferences.presentation;}});
 await guide.phase('InProgress',true);guide.show();const win=guide.window(),js=async c=>{try{return await win.webContents.executeJavaScript(c,true);}catch(error){throw Error(c+'\n'+error.message);}};
 await until(()=>js('!!document.querySelector(".compact-alternatives button")'),'Compact equipment alternatives missing');
 const painted=async w=>{try{await w.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');}catch(error){throw Error('painted '+w.getTitle()+': '+error.message);}await delay(80);};
 await painted(win);
 const metrics=await js('(()=>{const p=document.querySelector("main"),r=document.querySelector(".compact-alternatives").getBoundingClientRect();return {width:innerWidth,height:innerHeight,scroll:p.scrollHeight-p.clientHeight,alternativesBottom:r.bottom,routeCount:document.querySelectorAll(".compact-slot").length,conditions:[...document.querySelectorAll(".compact-alternatives button small")].map(e=>e.textContent),reason:document.querySelector(".compact-reason").textContent,horizontal:document.documentElement.scrollWidth>innerWidth}})()');
 console.log('Default equipment metrics '+JSON.stringify(metrics));await fs.writeFile(path.join(output,'equipment-metrics.json'),JSON.stringify(metrics,null,2));
 await fs.writeFile(path.join(output,'equipment.png'),(await win.webContents.capturePage()).toPNG());
 assert.equal(metrics.routeCount,6);assert.equal(metrics.horizontal,false);assert(metrics.conditions.length>=2);assert(metrics.alternativesBottom<=metrics.height,'Default equipment conditions must be visible without scrolling');assert(metrics.reason.length>10);
 const before=core.createGuideModel(data,state,live),choice=before.completeGear.alternatives.find(a=>!a.blockedReason);assert(choice);
 await js(`document.querySelector('[data-action="purchase-target"][data-id="${choice.id}"]').click()`);
 await until(()=>Promise.resolve(state.purchaseTarget===choice.id),'Alternative click did not set an explicit return-to-shop goal');
 assert.deepEqual(core.createGuideModel(data,state,live).completeGear.route.map(i=>i.id),before.completeGear.route.map(i=>i.id));
 const jungle=windows.find(w=>w.getTitle().includes('野区规划'));assert(jungle);const j=async c=>{try{return await jungle.webContents.executeJavaScript(c,true);}catch(error){throw Error('jungle '+c+'\n'+error.message);}};
 await until(()=>j(`!!document.querySelector('[data-value="half:blue"]')`),'Later jungle rotation controls missing');
 assert.match(await j('document.querySelector(".route").textContent'),/锋喙鸟.*石甲虫/);
 await j(`document.querySelector('[data-value="half:blue"]').click()`);
 await until(()=>j('document.querySelector(".route").textContent.includes("三狼 → 魔沼蛙")'),'Blue-half rotation missing');
 assert.equal(state.jungleNotes.lane,undefined);assert.equal(state.jungleNotes.at,undefined);
 await painted(jungle);const jungleMetrics=await j('(()=>{const p=document.querySelector("main"),r=document.querySelector(".quick-notes").getBoundingClientRect();return {width:innerWidth,height:innerHeight,scroll:p.scrollHeight-p.clientHeight,controlsBottom:r.bottom,horizontal:document.documentElement.scrollWidth>innerWidth}})()');
 assert.equal(jungleMetrics.horizontal,false);assert(jungleMetrics.controlsBottom<=jungleMetrics.height,'Jungle route and controls must fit default widget');
 await fs.writeFile(path.join(output,'jungle-rotation.png'),(await jungle.webContents.capturePage()).toPNG());
 live={...live,gameTime:120};guide.publish();await until(()=>j('document.querySelector("header b").textContent.includes("首轮")'),'Opening route missing');assert.match(await j('document.querySelector(".route").textContent'),/红BUFF.*石甲虫.*锋喙鸟/);
 const newJungleCases=[];
 for(const champion of ['Elise','Lillia']){
  state=core.selectGuide(null,{id:champion,role:'jungle',mode:'rift'});live={...live,champion,level:3,gameTime:120,skills:{Q:1,W:1,E:1,R:champion==='Elise'?1:0}};guide.publish();
  await until(()=>j(`document.querySelector('main p').textContent.includes('${champion==='Elise'?'单体三营':'Q范围伤害'}')`),champion+' specific opening absent');
  const first=await j('document.querySelector(".route small").textContent');assert.match(first,champion==='Elise'?/红BUFF.*蓝BUFF.*魔沼蛙/:/红BUFF.*石甲虫.*锋喙鸟/);
  await painted(jungle);await fs.writeFile(path.join(output,champion.toLowerCase()+'-opening.png'),(await jungle.webContents.capturePage()).toPNG());
  await j(`document.querySelector('[data-value="situation:invaded"]').click()`);
  await until(()=>j('document.querySelector("header b").textContent.includes("恢复")'),'Early interruption kept the old opening view');
  assert.match(await j('document.querySelector(".route small").textContent'),/三狼.*魔沼蛙.*蓝BUFF/);
  assert.equal(state.jungleNotes.situation,'invaded');assert.equal(state.jungleNotes.lane,undefined);
  const size=await j('(()=>{const r=document.querySelector(".quick-notes").getBoundingClientRect();return {horizontal:document.documentElement.scrollWidth>innerWidth,controlsBottom:r.bottom,height:innerHeight}})()');
  assert.equal(size.horizontal,false);assert(size.controlsBottom<=size.height,champion+' recovery controls must remain visible');
  await fs.writeFile(path.join(output,champion.toLowerCase()+'-recovery.png'),(await jungle.webContents.capturePage()).toPNG());
  await j(`document.querySelector('[data-value="resume"]').click()`);
  await until(()=>j('!!document.querySelector("[data-value=\\"stage:rotation\\"]")'),'Manual next-route control missing');
  await j(`document.querySelector('[data-value="stage:rotation"]').click()`);
  await until(()=>j('document.querySelector("header b").textContent.includes("后续")'),'Player stage override ignored before 210 seconds');assert.equal(state.jungleNotes.stage,'rotation');
  live={...live,gameTime:600};guide.publish();await until(()=>j('!!document.querySelector("[data-value=\\"stage:opening\\"]")'),'Manual opening-route control missing');
  await j(`document.querySelector('[data-value="stage:opening"]').click()`);
  await until(()=>j('document.querySelector("header b").textContent.includes("首轮")'),'Player opening override ignored after 210 seconds');assert.equal(state.jungleNotes.stage,'opening');
  newJungleCases.push({champion,opening:first,recoveryVisible:true,manualStageOverridesTime:true,...size});
 }
 const result={passed:true,source,archiveSha256:release?.archiveSha256||null,metrics,jungleMetrics,newJungleCases,explicitLocalGuideChanges:writes,gameWrites:0,networkBlocked:true};await fs.writeFile(path.join(output,'useful-guide.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));guide.destroy();app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(output,'error.txt'),error.stack).catch(()=>{});app.exit(1);});
