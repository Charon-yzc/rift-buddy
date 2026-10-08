const {app}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<100;n++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 app.setPath('userData',path.resolve(process.env.RIFT_BUDDY_USER_DATA));
 await app.whenReady();
 const release=JSON.parse(await fs.readFile('release/latest.json','utf8')),source=process.env.RIFT_BUDDY_SOURCE==='1',base=source?path.resolve('.'):path.join(release.directory,'resources/app.asar');
 const core=await import(pathToFileURL(path.join(base,'src/core/guide.mjs'))),{TRIOS}=await import(pathToFileURL(path.join(base,'src/core/rules.mjs')));
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'),'utf8'));data.builds=JSON.parse(await fs.readFile(path.join(base,'data/builds.json'),'utf8')).entries;
 const spellbook=JSON.parse(await fs.readFile(path.join(base,'data/spells.json'),'utf8'));data.spellbook=spellbook.version===data.version?spellbook.champions:{};
 const trio=TRIOS.find(t=>t.members.some(m=>m.champion==='Ashe'&&m.role==='bottom'));
 let state={...core.selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift',comboId:trio?.id,conditions:[]}),collapsed:true};
 let live={available:true,at:Date.now(),champion:'Ashe',mode:'rift',mapId:11,gold:1200,inventory:[],level:8,gameTime:750,skills:{Q:4,W:1,E:1,R:1}};
 const factory=require(path.join(base,'electron/guide-window.cjs')),root=path.resolve(process.env.RIFT_BUDDY_USER_DATA);
 let current={id:'Ashe',role:'bottom',mode:'rift',positionKnown:true},preferences={guideAfterGame:'hide',guideAutoShow:true};
 const guide=factory({root:base,getState:()=>state,setState:async next=>{state=core.validateGuideState(next);},getModel:()=>core.createGuideModel(data,state,live,current),currentSelection:()=>current,prepareCurrent:async()=>{if(!current)return false;if(core.guideIdentity(state.selection)!==core.guideIdentity(current))state=core.selectGuide(state,current);return true;},getPreferences:()=>preferences,isQuitting:()=>true,showMain:()=>{},diagnostic:()=>{}});
 guide.setInteractionHotkey(true);guide.show();const w=guide.window(),js=c=>w.webContents.executeJavaScript(c,true);
 await until(()=>js('!!document.querySelector(".quick-reminders")'),'Guide UI missing');
 let ignored=null;const original=w.setIgnoreMouseEvents.bind(w);w.setIgnoreMouseEvents=(pass,options)=>{ignored=pass;return original(pass,options);};
 await guide.phase('Offline',false);assert.equal(ignored,true,'Fresh matching live data must release input without client authorization');
 live={...live,at:Date.now()-13000};guide.publish();assert.equal(ignored,false,'Stale live data cannot confirm the input fallback');
 live={...live,at:Date.now()};guide.publish();assert.equal(ignored,true,'A fresh real-game reading must refresh input mode');
 guide.phase('InProgress',true);assert.equal(ignored,true);assert.equal(w.isFocusable(),false);assert.equal((await js('window.guide.bootstrap()')).mousePassThrough,true);
 await js('window.guide.control("interaction")');assert.equal(ignored,false);assert.equal(w.isFocusable(),true);
 await js('window.guide.control("interaction")');assert.equal(ignored,true);
 guide.setInteractionHotkey(false);assert.equal(ignored,false);assert.equal(w.isFocusable(),true);
 guide.setInteractionHotkey(true);guide.phase('Lobby',true);assert.equal(ignored,false);guide.phase('InProgress',true);
 const snapshot=await js('window.guide.bootstrap()');assert.ok(snapshot.model.action);assert.equal(snapshot.model.live.matched,true);assert.ok(snapshot.model.combo?.steps.length);
 assert.ok(await js('{const r=document.querySelector(".input-hint").getBoundingClientRect();r.bottom<=innerHeight}'),'Compact controls clipped');
 const capture=async name=>{await js('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');await fs.writeFile(path.join(root,name),(await w.webContents.capturePage()).toPNG());};
 await capture('guide-live-compact.png');await js('window.guide.control("collapse")');await js('document.querySelector("[data-tab=team]").click()');
 assert.ok(await js('document.querySelectorAll(".team-steps li").length>=2'));await capture('guide-team-expanded.png');
 // Ball mode must preserve the full panel's width and release keyboard focus.
 await delay(400);const expandedWidth=w.getSize()[0];
 await js('window.guide.control("ball")');await until(()=>js('!!document.querySelector(".ball-btn")'),'Floating ball missing');
 // Windows can enforce a slightly larger native minimum at display scaling.
 assert.ok(w.getSize().every(n=>n>=76&&n<=96),'Floating ball must remain compact');assert.equal(w.isResizable(),false);assert.equal(w.isFocusable(),false);
 await js('document.dispatchEvent(new MouseEvent("mousedown",{screenX:10,screenY:10}));document.dispatchEvent(new MouseEvent("mousemove",{buttons:1,screenX:30,screenY:10}));document.querySelector(".ball-btn").click()');
 assert.equal((await js('window.guide.bootstrap()')).ball,true,'A renderer drag became an expand click');
 await js('document.dispatchEvent(new MouseEvent("mouseup"))');await delay(50);
 await js('document.querySelector(".ball-btn").click()');await until(()=>js('!!document.querySelector(".quick-reminders")'),'Ball did not expand');
 assert.ok(Math.abs(w.getSize()[0]-expandedWidth)<=6,'Expanding must restore the full panel width within native border rounding');assert.equal(w.isResizable(),true);
 // Choose a shoe before the first core item, using real-semantic inventory snapshots.
 await js('document.querySelector("[data-tab=items]").click()');
 const shoe=snapshot.model.shoppingTargets.find(i=>i.kind==='鞋子');assert.ok(shoe);
 await js(`window.guide.control('purchase-target',${JSON.stringify(shoe.id)})`);assert.equal((await js('window.guide.bootstrap()')).model.next.id,shoe.id);
 assert.ok(await js('document.querySelector(".next-item").textContent.includes('+JSON.stringify(shoe.name)+')'));await capture('guide-shoe-goal.png');
 const first=snapshot.model.route[0].id;state.completedItems=[first];state.purchaseTarget=undefined;guide.publish();
 assert.equal((await js('window.guide.bootstrap()')).model.next.id,first);await assert.rejects(js(`window.guide.control('item',${JSON.stringify(first)})`),/背包/);
 live={...live,inventory:[{id:first,count:1}],at:Date.now()};guide.publish();assert.notEqual((await js('window.guide.bootstrap()')).model.next.id,first);
 live={...live,inventory:[],at:Date.now()};guide.publish();assert.equal((await js('window.guide.bootstrap()')).model.next.id,first);
 // Exercise estimates from the packaged core and renderer, with public fixtures only.
 const priorLive=live,estimateLive={...live,level:9,skills:{Q:4,W:2,E:2,R:1},stats:{ad:120,ap:0,armor:50,mr:40,atkSpeed:1,crit:0,hp:650,maxHp:1700},
  enemies:[{id:'Soraka',name:'索拉卡',level:9,items:[]},{id:'Zed',name:'劫',level:9,items:[{id:'6692',count:1}]}]};
 const initialDuels=core.createGuideModel(data,state,estimateLive,current).estimate.duels;
 estimateLive.stats.hp=Math.floor((initialDuels[0].killTheirs+initialDuels[1].killTheirs)/2);
 state.selection.threatId='Zed';live={...estimateLive,at:Date.now()};guide.publish();await js('document.querySelector("[data-tab=combat]").click()');await until(()=>js('!!document.querySelector(".combat-summary")'),'Selected comparison missing');
 const estimateBefore=(await js('window.guide.bootstrap()')).model.estimate;assert.equal(estimateBefore.enemy.id,'Zed');assert.equal(estimateBefore.danger,false);
 assert.ok(await js('document.querySelector(".combat-summary").textContent.includes("劫")'),'Comparison target unnamed');
 assert.ok(await js('document.querySelector("footer").getBoundingClientRect().bottom<=innerHeight+1'),'Estimates clipped the expanded footer');
 await js('document.querySelector("[data-guide-section=estimate-assumptions]").open=true');await capture('guide-estimate-expanded.png');
 live={...live,enemies:[...live.enemies].reverse(),at:Date.now()};guide.publish();
 const reordered=(await js('window.guide.bootstrap()')).model.estimate;
 assert.equal(reordered.enemy.id,estimateBefore.enemy.id);assert.equal(reordered.theirKill,estimateBefore.theirKill);assert.equal(reordered.danger,estimateBefore.danger);
 assert.equal(await js('document.querySelector("[data-guide-section=estimate-assumptions]").open'),true,'Refresh closed model assumptions');
 await js('window.guide.control("collapse")');assert.ok(await js('document.querySelector(".input-hint").getBoundingClientRect().bottom<=innerHeight+1'),'Warning clipped compact controls');
 assert.equal(await js('!!document.querySelector(".estimate-row.danger")'),false,'Compact guide fabricated danger');
 await capture('guide-estimate-compact.png');await js('window.guide.control("collapse")');
 live={...live,stats:{...live.stats,armor:500,mr:500},enemies:live.enemies.map(p=>p.id==='Zed'?{...p,items:[...p.items,{id:'1029',count:1}]}:p),at:Date.now()};guide.publish();
 const resisted=(await js('window.guide.bootstrap()')).model.estimate;
 assert.ok(resisted.duels.find(d=>d.enemy.id==='Zed').killTheirs<estimateBefore.theirKill,'Own panel resists ignored');
 assert.ok(resisted.duels.find(d=>d.enemy.id==='Zed').killMine<estimateBefore.killThreshold,'Enemy armor purchase ignored');
 assert.equal(Object.hasOwn(resisted,'liveBuy'),false);assert.equal(await js('document.body.textContent.includes("实时出装")'),false);
 live={...priorLive,at:Date.now()};guide.publish();
 await js('window.guide.control("stage","opening")');await js('document.querySelector("[data-tab=team]").click()');assert.ok(await js('document.querySelector(".stage-controls").textContent.includes("开局")'));await capture('guide-stage-opening.png');
 current={...current,role:'support'};guide.publish();await until(()=>js('!!document.querySelector(".guide-mismatch")'),'Same-hero role guard missing');assert.equal((await js('window.guide.bootstrap()')).model.action,null);assert.equal(await js('!!document.querySelector(".next-item")'),false);
 current={...current,role:'bottom'};live={...live,mode:null,mapId:null};guide.publish();await until(()=>js('document.querySelector(".guide-status").textContent.includes("尚未确认")'),'Unknown mode claimed synced');assert.equal((await js('window.guide.bootstrap()')).model.live.matched,false);
 // Mode mismatch with no LCU selection must hide old actionable reminders.
 live={...live,mode:'aram'};guide.publish();await until(()=>js('!!document.querySelector(".guide-mismatch")'),'Mode mismatch not shown');assert.equal(await js('document.querySelector(".quick-reminders")'),null);assert.equal(await js('document.querySelector(".next-item")'),null);
 live={...live,mode:'rift',mapId:11};guide.publish();await guide.phase('InProgress',true);await guide.phase('EndOfGame',true);assert.equal(w.isVisible(),false);guide.show();assert.equal(w.isVisible(),true);await guide.phase('EndOfGame',true);assert.equal(w.isVisible(),true);
 preferences.guideAfterGame='collapse';await guide.phase('Lobby',true);await guide.phase('InProgress',true);await guide.phase('WaitingForStats',true);assert.equal(state.collapsed,true);assert.equal(w.isVisible(),true);
 state={...state,clickThrough:false,purchaseTarget:shoe.id,stage:'later',match:{phase:'EndOfGame',gameId:'1'}};state=core.reconcileGuide(state,{phase:'ChampSelect',gameId:'2'}).guide;await guide.phase('ChampSelect',true);await guide.phase('InProgress',true);assert.equal(ignored,true);assert.equal(w.isFocusable(),false);assert.equal(state.purchaseTarget,undefined);assert.equal(state.stage,undefined);
 await js('window.guide.control("hide")');await guide.phase('Offline',false);await guide.phase('InProgress',true);assert.equal(w.isVisible(),false,'Same-match reconnect reopened a hidden guide');
 await guide.phase('EndOfGame',true);current={id:'Jhin',role:'bottom',mode:'rift',positionKnown:true};live={...live,champion:'Jhin'};state=core.reconcileGuide(state,{phase:'ChampSelect',gameId:'3'}).guide;await guide.phase('ChampSelect',true);await guide.phase('InProgress',true);assert.equal(w.isVisible(),true);assert.equal(state.selection.id,'Jhin');assert.equal((await js('window.guide.bootstrap()')).model.champion.id,'Jhin');
 await js('window.guide.control("hide")');state=core.reconcileGuide(state,{phase:'GameStart',gameId:'4'}).guide;await guide.phase('GameStart',true);assert.equal(w.isVisible(),false,'A new loading game must wait before showing');
 state=core.reconcileGuide(state,{phase:'InProgress',gameId:'4'}).guide;await guide.phase('InProgress',true);assert.equal(w.isVisible(),true,'A changed id learned during loading must re-arm auto-show');
 const result={passed:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,mousePassThrough:true,liveInputWithoutClientAuthorization:true,staleLiveInputFallback:true,keyboardFocusReleased:true,interactionToggle:true,shortcutUnavailableFallback:true,lobbyInteractive:true,compact220:true,livePurchase:true,trioInstructions:true,modeMismatchGuard:true,sameHeroRoleGuard:true,unknownModeGuard:true,shoeGoal:true,manualMarksNotInventory:true,inventorySale:true,stageSelection:true,endGameHideAndManualReopen:true,endGameCollapse:true,nextGameRestoresPassThrough:true,hiddenReconnectStaysHidden:true,autoShowPreparesNewHero:true,realGameInputs:false,screenshots:root};
 Object.assign(result,{estimateResistance:true,estimateOrderIndependent:true,estimateTargetNamed:true,estimateCompactVisible:true,noCompetingGearAdvice:true,ballWidthRestored:true,ballKeyboardFocusReleased:true,ballRendererDragGuard:true});
 await fs.writeFile(path.join(root,'guide-input-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));guide.destroy();app.quit();
}
run().catch(e=>{console.error(e);app.exit(1);});
