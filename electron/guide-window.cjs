const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {fitWindow,guidePlacement}=require('../src/core/window-placement.mjs');
const {compactGuidePlacement,guideWindowLimits}=require('../src/core/guide-placement.mjs');
const createSkillWindow=require('./skill-window.cjs');
const createJungleWindow=require('./jungle-window.cjs');
const createHexMicroWindows=require('./hex-micro-windows.cjs');

// Pure pass-through decision, extracted for testability: hovering the header
// (drag bar + window buttons) always wins so the panel stays movable and
// clickable even while the content area passes clicks through to the game.
function resolveGuideIgnoreMouse(passThrough,hoverHeader){return !!passThrough&&!hoverHeader;}

// Bounds check for the cursor-poll fallback, extracted for testability:
// forwarded DOM mousemove can be flaky, so the main process double-checks
// with the OS cursor position while pass-through is active.
function cursorInBounds(cursor,bounds,margin=2){
 if(!cursor||!bounds)return false;
 const m=Math.max(0,Number(margin)||0);
 return cursor.x>=bounds.x-m&&cursor.x<=bounds.x+bounds.width+m
     &&cursor.y>=bounds.y-m&&cursor.y<=bounds.y+bounds.height+m;
}

module.exports=function createGuideWindow({root,getState,setState,getModel,isQuitting,showMain,showHexSource=()=>{},getReference=()=>null,referenceRevision=()=>0,diagnostic,resetHexRound=()=>undefined,currentSelection=()=>null,prepareCurrent=async()=>false,getPreferences=()=>({}),setPresentation=async()=>{throw Error('界面设置暂不可用');},adjustPlan=()=>{throw Error('方案调整暂不可用');}}){
 const {BrowserWindow,ipcMain,screen,clipboard}=require('electron');
 let win=null,phase='Offline',lastConnectedPhase='Offline',lastGameId=null,connected=false,hotkeyAvailable=false,interactionHotkeyAvailable=false,lastPublished='',boundsTimer,adjusting=false,visibilityRequested=false,autoShowUntil=0,hoverHeader=false;
 const BALL_SIZE=76;
 let gameBounds=null,openTab=null,displayEpoch=0,activeFamily=null,passiveDisplay=false,autoShowGame=null,equipmentRequested=false;
 const isHex=()=>getState()?.selection?.mode==='hex';
 const inGame=value=>['GameStart','InProgress','Reconnect'].includes(value);
 // Manual Hex previews keep their editable guide. Only a real game switches
 // to micro windows; a transient client disconnect retains that game family.
 const usesHexMicro=()=>isHex()&&currentSelection()?.mode==='hex'&&(inGame(phase)||!connected&&inGame(lastConnectedPhase));
 const usesEconomy=()=>!isHex()&&currentSelection()?.mode==='rift'&&currentSelection()?.id===getState()?.selection?.id&&(inGame(phase)||!connected&&inGame(lastConnectedPhase));
 const ended=()=>['WaitingForStats','PreEndOfGame','EndOfGame'].includes(phase);
 const workArea=()=>screen.getDisplayMatching(gameBounds||win?.getBounds()||getState()?.bounds||screen.getPrimaryDisplay().bounds).workArea;
 const peek=require('./window-peek.cjs')({root,getWindow:()=>win,getArea:workArea,title:'本局指引',onRestore:()=>{if(usesHexMicro()||getPreferences().guideEquipment===false)return;displayEpoch++;visibilityRequested=true;equipmentRequested=true;win?.showInactive();inputMode();publish();}});
 const resize=require('./window-resize.cjs')({getWindow:()=>win,getArea:workArea,getLimits:area=>guideWindowLimits(isCompact()?'compact':isStrip()?'strip':'details',area,stripScale()),onStart:()=>{clearTimeout(boundsTimer);boundsTimer=null;hoverHeader=true;inputMode();},onEnd:rememberBounds});
 async function rememberBounds(){clearTimeout(boundsTimer);boundsTimer=null;if(!win||win.isDestroyed()||!getState()||isBall())return;const b=win.getBounds(),current=getState();if(isCompact()){await save({...current,compactBounds:b});return;}if(isStrip()){await save({...current,stripBounds:b});return;}await save({...current,bounds:{...b,height:current.collapsed?current.bounds?.height||680:Math.max(480,b.height)}});}
 function fit(recover=false){if(!win||win.isDestroyed()||resize.active()||boundsTimer)return;const area=workArea(),current=win.getBounds();
  if(isCompact()){const b=compactGuidePlacement(recover?(getState()?.compactBounds?{width:getState().compactBounds.width,height:getState().compactBounds.height}:null):getState()?.compactBounds||current,area,gameBounds,stripScale());adjusting=true;const l=guideWindowLimits('compact',area,stripScale());win.setMinimumSize(l.minWidth,l.minHeight);if(['x','y','width','height'].some(k=>Math.abs(current[k]-b[k])>2))win.setBounds(b);adjusting=false;return;}
  if(isStrip()){const b=fitWindow(getState()?.stripBounds||{...current,width:stripWidth(),height:stripHeight()},area,guideWindowLimits('strip',area,stripScale()));if(['x','y','width','height'].some(k=>Math.abs(current[k]-b[k])>3)){adjusting=true;const l=guideWindowLimits('strip',area,stripScale());win.setMinimumSize(l.minWidth,l.minHeight);win.setBounds(b);adjusting=false;}return;}
  const b=guidePlacement(recover?null:current,area,gameBounds,{ball:isBall(),collapsed:!!getState()?.collapsed,recover});adjusting=true;win.setMinimumSize(Math.min(isBall()?76:360,area.width),Math.min(isBall()?76:getState()?.collapsed?280:480,area.height));if(['x','y','width','height'].some(k=>Math.abs(current[k]-b[k])>3))win.setBounds(b);adjusting=false;}
 const isBall=()=>!!getState()?.ball;
 const isStrip=()=>!!getState()?.strip;
 const isCompact=()=>!isBall()&&!isStrip()&&getState()?.compact!==false;
 const stripScale=()=>[1,1.1,1.25].includes(getPreferences().presentation?.textScale)?getPreferences().presentation.textScale:1;
 const stripWidth=()=>Math.ceil(340*stripScale()),stripHeight=()=>Math.ceil(160*stripScale());
 const needsAutoShow=()=>autoShowUntil>Date.now()&&getPreferences().guideAutoShow!==false;
const mousePassThrough=()=>!!(getState()?.clickThrough&&(['InProgress','Reconnect'].includes(phase)||!connected&&getModel()?.live.matched)&&interactionHotkeyAvailable);
const shouldIgnore=()=>resolveGuideIgnoreMouse(mousePassThrough(),hoverHeader);
const inputMode=()=>{if(win&&!win.isDestroyed()){const ball=isBall(),strip=isStrip(),ignore=strip||ball?false:shouldIgnore(),pass=strip||ball?true:mousePassThrough(),focusable=!pass&&!passiveDisplay;win.setIgnoreMouseEvents(ignore,{forward:true});if(win.isFocusable?.()!==focusable)win.setFocusable(focusable);if(ignore&&win.isFocused())win.blur();}};
const payload=()=>{let model=null;try{model=getModel();}catch(error){diagnostic(`guide model failed ${error.message}`);}return {model,referenceRevision:referenceRevision(),openTab,phase,connected,hotkeyAvailable,interactionHotkeyAvailable,mousePassThrough:mousePassThrough(),ball:isBall(),strip:isStrip(),presentation:getPreferences().presentation,current:currentSelection()};};
const skill=createSkillWindow({isActive:()=>getState()?.selection?.mode==='rift'&&!usesHexMicro()&&getPreferences().guideSkills!==false,root,getState,setState,getPayload:payload,getArea:workArea,getGameBounds:()=>gameBounds,getScale:stripScale,isQuitting,diagnostic,onChange:()=>publish(),showDetails:async()=>{if(usesHexMicro())return;const epoch=displayEpoch,current=getState();if(current)await save({...current,compact:false,ball:false,strip:false,collapsed:false});if(epoch!==displayEpoch||usesHexMicro())return;openTab={tab:'skills',serial:Date.now()};show();applyMode();}});
const jungle=createJungleWindow({isActive:()=>getState()?.selection?.mode==='rift'&&!usesHexMicro()&&getPreferences().guideJungle!==false,root,getState,setState,getPayload:payload,getArea:workArea,getGameBounds:()=>gameBounds,getScale:stripScale,isQuitting,diagnostic,onChange:()=>publish(),showDetails:async()=>{if(usesHexMicro())return;const epoch=displayEpoch,current=getState();if(current)await save({...current,compact:false,ball:false,strip:false,collapsed:false});if(epoch!==displayEpoch||usesHexMicro())return;openTab={tab:'rhythm',serial:Date.now()};show();applyMode();}});
const micro=createHexMicroWindows({root,getState,setState,getPayload:payload,getArea:workArea,getGameBounds:()=>gameBounds,getScale:stripScale,getPreferences,isActive:()=>visibilityRequested&&(usesHexMicro()||usesEconomy())&&!ended(),isQuitting,diagnostic,showMain,onChange:()=>publish(),onHide:()=>{displayEpoch++;autoShowUntil=0;if(!micro.requested())visibilityRequested=false;}});
 let previousFeatures={...getPreferences()};
 function suppressLegacy(){peek.unfold();resize.cancel();hoverHeader=false;win?.hide();skill.hide();jungle.hide();}
 function publish(){
  const value=payload(),family=usesHexMicro()?'hex':'rift';
  const preferences={...getPreferences()},restored=key=>previousFeatures[key]===false&&preferences[key]!==false;
  const changes={economy:restored('guideEconomy'),gear:restored('guideEquipment'),skills:restored('guideSkills'),jungle:restored('guideJungle')};previousFeatures=preferences;
  // A preference opt-out suppresses an existing display intent; enabling it
  // restores that intent once. Polling never overrides a player's close.
  if(visibilityRequested){
   if((changes.economy||changes.gear)&&(usesHexMicro()||usesEconomy()))micro.resume(value);
   if(family==='rift'){if(changes.skills)skill.show();if(changes.jungle)jungle.show();if(changes.gear&&equipmentRequested)showEquipment(true);}
  }
  // The game tracker may clear its identity before phase() receives the exit.
  // Losing a real Hex context must not turn a visible micro guide into a large
  // editable preview. Opening that preview again requires an explicit show().
  if(activeFamily==='hex'&&family!=='hex'&&isHex())hide();
  // A refresh changes content only. Migrate an existing display intent once
  // when switching families; never reopen a player-closed window on a poll.
  if(activeFamily!==family){if(activeFamily!==null)displayEpoch++;activeFamily=family;if(family==='hex'){suppressLegacy();if(visibilityRequested&&!ended()){if(micro.requested())micro.resume(value);else micro.show(value);}}else{if(visibilityRequested)showLegacy(true);else micro.suspend();}}
  micro.publish(value);
  if(getPreferences().guideEquipment===false){peek.unfold();win?.hide();}
  if(family==='hex'){suppressLegacy();return;}
  if(peek.active())peek.sync(visibilityRequested);
  if(getState()?.skillWidget?.enabled===false)skill.hide();skill.publish(value);jungle.publish(value);
  if(win&&!win.isDestroyed()){inputMode();if(isStrip()||isCompact())fit();const key=JSON.stringify(value);if(key!==lastPublished){lastPublished=key;win.webContents.send('guide-update',value);}}
 }
 async function save(next,hexContext){await setState(next,getState(),hexContext);publish();return payload();}
 function adjustHeight(){if(win&&!isBall()&&!isStrip()&&!isCompact()){adjusting=true;const collapsed=getState()?.collapsed,[width]=win.getSize(),area=workArea(),height=Math.min(collapsed?280:getState()?.bounds?.height||740,area.height);win.setMinimumSize(Math.min(360,area.width),Math.min(collapsed?280:480,area.height));win.setSize(Math.min(width,area.width),height);fit();adjusting=false;}}
 function applyMode(){
  if(usesHexMicro()){suppressLegacy();return;}
  if(!win||win.isDestroyed())return;
  clearTimeout(boundsTimer);boundsTimer=null;resize.cancel();
  adjusting=true;
  // On Windows changing resizability can change the native frame bounds.
  // Apply it before the desired size, not after restoring the full window.
  win.setResizable(!isBall()&&!isStrip()&&!isCompact());
  if(isCompact()){const area=workArea(),b=compactGuidePlacement(getState()?.compactBounds,area,gameBounds,stripScale());const l=guideWindowLimits('compact',area,stripScale());win.setMinimumSize(l.minWidth,l.minHeight);win.setBounds(b);
  }else if(isStrip()){
   const area=workArea(),l=guideWindowLimits('strip',area,stripScale()),b=fitWindow(getState()?.stripBounds||{...win.getBounds(),width:stripWidth(),height:stripHeight()},area,l);win.setMinimumSize(l.minWidth,l.minHeight);win.setBounds(b);
  }else if(isBall()){
   win.setMinimumSize(BALL_SIZE,BALL_SIZE);win.setSize(BALL_SIZE,BALL_SIZE);
   const area=screen.getDisplayMatching(win.getBounds()).workArea,b=win.getBounds();
   win.setPosition(Math.max(area.x,Math.min(b.x,area.x+area.width-BALL_SIZE)),Math.max(area.y,Math.min(b.y,area.y+area.height-BALL_SIZE)));
  }else{
   const saved=getState()?.bounds,area=screen.getDisplayMatching(win.getBounds()).workArea,current=win.getBounds(),collapsed=!!getState()?.collapsed;
   const desired=guidePlacement({...current,width:saved?.width||400,height:collapsed?280:saved?.height||740},area,gameBounds,{collapsed});
   win.setMinimumSize(Math.min(360,area.width),Math.min(collapsed?280:480,area.height));win.setBounds(desired);
  }
  adjusting=false;
  inputMode();publish();
 }
 function create(){
  const saved=isCompact()?getState()?.compactBounds:isStrip()?getState()?.stripBounds:getState()?.bounds,area=workArea();
  const compact=isCompact(),placed=compactGuidePlacement(saved,area,gameBounds,stripScale());
  const ball=isBall(),strip=isStrip();
  const width=compact?placed.width:ball?BALL_SIZE:strip?saved?.width||stripWidth():Math.min(saved?.width||400,area.width),height=compact?placed.height:ball?BALL_SIZE:Math.min(strip?saved?.height||stripHeight():getState()?.collapsed?280:saved?.height||740,area.height);
  win=new BrowserWindow({width,height,minWidth:compact?guideWindowLimits('compact',area,stripScale()).minWidth:ball?BALL_SIZE:strip?280:360,minHeight:compact?guideWindowLimits('compact',area,stripScale()).minHeight:ball?BALL_SIZE:strip?160:getState()?.collapsed?280:480,maxWidth:1000,maxHeight:1200,
   x:Math.max(area.x,Math.min(saved?.x??area.x+area.width-440,area.x+area.width-width)),y:Math.max(area.y,Math.min(saved?.y??area.y+40,area.y+area.height-height)),frame:false,show:false,focusable:false,alwaysOnTop:true,skipTaskbar:true,transparent:true,
   backgroundColor:'#00000000',title:'开黑搭子 · 本局指引',icon:path.join(root,'assets/icon.png'),resizable:!ball&&!strip&&!compact,
   webPreferences:{preload:path.join(root,'electron/guide-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setAlwaysOnTop(true,'screen-saver');win.setOpacity(getState()?.opacity||1);inputMode();
  fit();
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(root,'src/guide.html')).href)event.preventDefault();});
  win.webContents.on('render-process-gone',(_e,detail)=>diagnostic(`guide renderer gone ${detail.reason}`));
  win.webContents.on('did-fail-load',(_e,code)=>diagnostic(`guide load failed ${code}`));
  const created=win;win.once('ready-to-show',()=>{if(created!==win||created.isDestroyed())return;if(visibilityRequested&&equipmentRequested&&!usesHexMicro()&&getPreferences().guideEquipment!==false)created.showInactive();diagnostic(`guide-ready visible=${created.isVisible()}`);});
  win.webContents.on('did-finish-load',()=>{
   diagnostic('guide loaded');
   if(process.env.RIFT_BUDDY_GUIDE_SCREENSHOT)setTimeout(async()=>{try{await fs.writeFile(process.env.RIFT_BUDDY_GUIDE_SCREENSHOT,(await win.webContents.capturePage()).toPNG());diagnostic('guide screenshot saved');}catch(e){diagnostic(`guide capture failed ${e.message}`);}},1500);
  });
  win.on('close',event=>{if(!isQuitting()){event.preventDefault();hide();}});
  const remember=()=>{if(adjusting||isBall()||resize.active())return;clearTimeout(boundsTimer);boundsTimer=setTimeout(()=>rememberBounds().catch(error=>diagnostic('guide placement not saved '+error.message)),350);};
  win.on('move',remember);win.on('resize',remember);
  // Fallback for flaky forwarded mousemove: while pass-through is active,
  // poll the OS cursor so hovering the drag strip still lifts ignore for
  // dragging. The poll owns the strip fully: lift inside it, release fully
  // outside the window (self-recovers even if DOM mouseleave never fires),
  // and leave the content area to the DOM path so game clicks still pass
  // through there.
  const STRIP_H=44;
  const hoverPoll=setInterval(()=>{
   try{
    if(!win||win.isDestroyed()||!win.isVisible()||isBall()||isStrip()||!mousePassThrough())return;
    const b=win.getBounds(),p=screen.getCursorScreenPoint();
    if(cursorInBounds(p,{...b,height:Math.min(STRIP_H,b.height)})||cursorInBounds(p,{x:b.x+b.width-20,y:b.y+b.height-20,width:20,height:20})){
     if(shouldIgnore()){hoverHeader=true;inputMode();}
    }else if(!cursorInBounds(p,b)){
     if(hoverHeader){hoverHeader=false;inputMode();}
    }
   }catch{}
  },120);
  if(hoverPoll.unref)hoverPoll.unref();
  win.on('closed',()=>{peek.destroy();clearTimeout(boundsTimer);clearInterval(hoverPoll);win=null;lastPublished='';});win.loadFile(path.join(root,'src/guide.html'));
 }
 function hideGear(){displayEpoch++;peek.unfold();resize.cancel();autoShowUntil=0;equipmentRequested=false;hoverHeader=false;win?.hide();}
 function hide(){hideGear();visibilityRequested=false;skill.hide();jungle.hide();micro.hide();}
 function showEquipment(automatic=false){if(automatic)passiveDisplay=true;if(getPreferences().guideEquipment===false){win?.hide();return;}if(!win)create();else{inputMode();if(!automatic&&win.isMinimized())win.restore();fit();win.showInactive();}}
 function showLegacy(automatic=false){equipmentRequested=true;if(usesEconomy())micro.show(payload());else micro.suspend();skill.show();jungle.show();showEquipment(automatic);}
 function show(automatic=false){displayEpoch++;peek.unfold();autoShowUntil=0;visibilityRequested=true;hoverHeader=false;passiveDisplay=automatic;activeFamily=usesHexMicro()?'hex':'rift';if(usesHexMicro()){suppressLegacy();micro.show(payload());}else{showLegacy(automatic);}publish();return payload();}
 async function recover(reset=false){const epoch=++displayEpoch,identity=getState()?.selection?.mode,gameId=getState()?.match?.gameId;peek.unfold();resize.cancel();clearTimeout(boundsTimer);boundsTimer=null;const current=getState();
  if(usesHexMicro()){
   await micro.reset(async()=>{if(epoch!==displayEpoch||!usesHexMicro()||gameId!==getState()?.match?.gameId)return;const latest=getState();if(latest)await save({...latest,hexWindows:undefined});});
   if(epoch!==displayEpoch||!usesHexMicro()||gameId!==getState()?.match?.gameId)return payload();
   show();micro.fit();return payload();
  }
  if(current)await save({...current,ball:false,strip:false,collapsed:false,compact:true,compactBounds:undefined,stripBounds:undefined,bounds:undefined,jungleWidget:{...current.jungleWidget,...(reset?{enabled:true}:{}),offset:undefined,size:undefined},skillWidget:{...current.skillWidget,...(reset?{enabled:true}:{}),offset:undefined,size:undefined}});
  if(epoch!==displayEpoch||identity!==getState()?.selection?.mode||gameId!==getState()?.match?.gameId)return payload();
  show();applyMode();fit(true);skill.reset();jungle.reset();return payload();
 }
 // Observation can position overlays, never restore or raise a window over a
 // foreground game. Exclusive fullscreen must not trigger a focus tug-of-war.
 function setGameBounds(next){const old=gameBounds,changed=next&&(!old||screen.getDisplayMatching(next).id!==screen.getDisplayMatching(old).id);gameBounds=next;micro.fit();skill.fit();jungle.fit();if(win&&changed)fit(true);}
 const displayChanged=()=>{fit();skill.fit();jungle.fit();micro.fit();};
 for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,displayChanged);
 function toggle(){if(usesHexMicro()){if(micro.visible())hide();else show();return;}if(isStrip()){if(win?.isVisible()||micro.visible())hide();else show();return;}if(isBall()||getState()?.collapsed){recover().catch(error=>diagnostic(`guide recovery failed ${error.message}`));return;}if(win?.isVisible()||micro.visible()||skill.visible()||jungle.visible())hide();else show();}
 async function interact(){const current=getState();if(!current)return;passiveDisplay=false;await save({...current,clickThrough:!current.clickThrough});inputMode();publish();}
 function guard(name,handler){ipcMain.handle(name,(event,...args)=>{
  if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('不允许此操作');
  return handler(...args);
 });}
 guard('guide-bootstrap',payload);
 guard('guide-reference',value=>{const current=getState();if(!current||!value||value.revision!==referenceRevision()||!['hex','rift'].includes(value.mode)||value.mode!==current.selection.mode)return null;return getReference(value.kind,value.id,value.mode);});
 guard('guide-hover',value=>{const next=!!value;if(next!==hoverHeader){hoverHeader=next;inputMode();}return hoverHeader;});
 guard('guide-control',async(action,value)=>{
  if(usesHexMicro())throw Error('海克斯局内使用两个精简窗口，请从主界面调整');
  if(action==='presentation'){await setPresentation(value);publish();return payload();}
  if(['resize-start','resize','resize-end','resize-key'].includes(action)){if(isBall())throw Error('请先展开指引');return resize.control(action,value);}
  if(action==='fold'){resize.cancel();peek.fold();return true;}
  if(action==='reset-layout')return recover(true);
  if(action==='recover')return recover();
  if(action==='hide'){hideGear();return true;}
  if(action==='main'){showMain(getState()?.selection);return true;}
  if(action==='current'){if(!await prepareCurrent())throw Error('尚未确认当前英雄与模式，请在完整助手中选择');inputMode();publish();return payload();}
  const current=getState();if(!current)throw Error('先在配置页选择“本局指引”');
  if(action==='hex-source'){const route=current.selection.mode==='hex'&&getModel()?.hexRoutes?.find(row=>row.id===value);if(!route)throw Error('强化路线已变化，请按当前页面重试');showHexSource(route.hero,route.id);return true;}
  if(action==='layout'){if(!['compact','details'].includes(value))throw Error('指引布局不正确');await save({...current,compact:value==='compact',ball:false,strip:false,collapsed:false});applyMode();return payload();}
  if(action==='jungle-widget'){await save({...current,jungleWidget:{...current.jungleWidget,enabled:current.jungleWidget?.enabled===false}});if(getState()?.jungleWidget?.enabled===false)jungle.hide();else jungle.show();return payload();}
  if(action==='skill-widget'){await save({...current,skillWidget:{...current.skillWidget,enabled:current.skillWidget?.enabled===false}});if(getState()?.skillWidget?.enabled===false)skill.hide();else skill.show();return payload();}
  if(action==='collapse'){const result=await save({...current,collapsed:!current.collapsed});adjustHeight();return result;}
  const fullBounds=()=>{
   if(current.ball||current.strip||isCompact()||!win)return current.bounds;
   const bounds=win.getBounds(),saved=current.bounds;
   // Fractional Windows scaling rounds native bounds by a few DIPs. Reusing
   // that rounding as a new requested size would grow every compact cycle.
   for(const key of ['width','height'])if(saved&&Math.abs(bounds[key]-saved[key])<=3)bounds[key]=saved[key];
   if(current.collapsed)bounds.height=saved?.height||740;
   return bounds;
  };
  if(action==='ball'){const ball=!current.ball;const result=await save({...current,bounds:fullBounds(),ball,strip:ball?false:current.strip});applyMode();return result;}
  if(action==='strip'){const strip=!current.strip;const result=await save({...current,bounds:fullBounds(),strip,ball:strip?false:current.ball});applyMode();return result;}
  if(action==='opacity'){if(![0.65,0.85,1].includes(value))throw Error('透明度格式不正确');const result=await save({...current,opacity:value});win.setOpacity(value);return result;}
  if(action==='interaction'){await interact();return payload();}
  if(action==='live-advice')return save({...current,liveAdvice:current.liveAdvice===false});
  if(action==='jungle'){
   const m=getModel();if(!m.jungle)throw Error('当前不是峡谷打野指引');
   if(typeof value!=='string'||value.length>100)throw Error('野区标记不正确');
   const [field,choice]=value.split(':'),{changeJungleNotes}=require(path.join(root,'src/core/jungle-guidance.mjs'));
   return save({...current,jungleNotes:changeJungleNotes(current.jungleNotes,field,choice,m.live?.matched?m.live.gameTime:null,m.jungle.route)});
  }
  if(['threatId','protectId','combatFocus'].includes(action)){
   const m=getModel();if(m.mode!=='rift')throw Error('当前模式不使用峡谷关注目标');
   if(action==='combatFocus'){if(!['lane','teamfight'].includes(value))throw Error('局势关注格式不正确');}
   else if(value!==''&&!(action==='threatId'?m.duelOptions?.foe||m.situation.enemies:m.situation.allies).some(p=>p.id===value))throw Error('公开英雄列表已变化，请重新选择');
   const selection={...current.selection,[action]:value||undefined};if(action==='threatId')delete selection.matchupGameId;
   return save({...current,selection});
  }
  if(action==='later'){const m=getModel(),choice=m.laterChoices.find(i=>i.id===value),unavailable=m.unavailableLaterOptions.some(i=>String(i.id)===value);if(!choice&&!unavailable)throw Error('后期备选已变化，请重新选择');if(choice?.blockedReason&&!choice.selected)throw Error(choice.blockedReason);return save({...current,selection:adjustPlan(current.selection,'later',value)});}
  if(action==='condition'){if(!['ad','ap','control','heal','burst'].includes(value))throw Error('局势选项不正确');const conditions=current.selection.conditions.includes(value)?current.selection.conditions.filter(c=>c!==value):[...current.selection.conditions,value];return save({...current,selection:{...current.selection,conditions}});}
  if(action==='bottom-quest'){if(!current.selection.bottomQuestPlan)throw Error('当前不是下路任务后装备计划');const quest=getModel().bottomQuest;if(!current.bottomQuestConfirmed&&quest?.eligible===false)throw Error(quest.reason);return save({...current,bottomQuestConfirmed:!current.bottomQuestConfirmed,completedItems:current.completedItems.filter(id=>id!==quest?.itemId)});}
  if(action==='reset')return save({...current,completedItems:[]});
  if(action==='new-game'){const hexContext=resetHexRound(current,value),result=await save({...current,jungleNotes:undefined,completedItems:[],bottomQuestConfirmed:false,clickThrough:true,purchaseTarget:undefined,purchaseTargetKind:undefined,stage:undefined,duelPick:undefined,selection:{...current.selection,compareIds:[],ownedAugmentIds:[],threatId:undefined,matchupGameId:undefined,protectId:undefined,combatFocus:undefined}},hexContext);inputMode();return result;}
  if(action==='purchase-target'){const target=getModel().shoppingTargets.find(i=>i.id===value&&!i.owned&&!i.blockedReason);if(value!==''&&!target)throw Error('目标已变化，请重新选择');return save({...current,purchaseTarget:value||undefined,purchaseTargetKind:target?.kind==='局势备选'?'situation':undefined});}
  if(action==='stage'){if(!['auto','opening','key','later'].includes(value))throw Error('配合阶段不正确');return save({...current,stage:value==='auto'?undefined:value});}
  if(action==='duel-own'||action==='duel-foe'){
   const side=action==='duel-own'?'own':'foe';
   if(value!==''&&!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(value))throw Error('英雄选择格式不正确');
   const next={...(current.duelPick||{}),[side]:value||undefined};
   return save({...current,duelPick:next.own||next.foe?next:undefined});
  }
  if(action==='item'){
   const m=getModel();
   if(m.live.matched)throw Error('背包正在同步，购买进度以实际背包为准；可切换回城目标');
   if(typeof value!=='string'||!m.route.some(i=>i.id===value))throw Error('这个装备不在当前方案中');
   const progress=m.completedItems,blocked=m.routeBlocked.find(i=>i.id===value);if(blocked&&!progress.includes(value))throw Error(blocked.reason);
   return save({...current,...(current.purchaseTarget===value&&!progress.includes(value)?{purchaseTarget:undefined}:{}),completedItems:progress.includes(value)?progress.filter(id=>id!==value):[...progress,value]});
  }
  if(action==='copy'){const m=getModel();clipboard.writeText(`${m.champion.name} · ${m.mode==='hex'?'海克斯大乱斗':m.role}\n${m.route.map(i=>i.name).join(' → ')}\n本次购买：${m.next?.name||'路线已完成'}\n理由：${m.nextReason}\n取舍：${m.nextCaution}\n加点：${m.priority||'请按游戏提示'}${m.nextSkill?'；当前建议 '+m.nextSkill:''}\n加点理由：${m.skillAdvice.reason}\n取舍：${m.skillAdvice.caution}\n符文：${m.runes.map(r=>r.name).join(' / ')}\n${m.combo?[m.combo.title,m.combo.ownJob,...(m.combo.steps||[]),m.combo.window,m.combo.early,m.combo.economy].filter(Boolean).join('\n'):''}\n${(m.adjustments||[]).map(a=>`${a.title}：${a.text}`).join('\n')}\n${m.tips}\n资料 ${m.version} · ${m.source}\n${m.status?.build||''}`);return true;}
  throw Error('不支持此操作');
 });
 async function changePhase(next,isConnected){
  const previous=lastConnectedPhase,id=getState()?.match?.gameId,newGame=!!(id&&lastGameId&&id!==lastGameId),wasMicro=activeFamily==='hex';phase=next;connected=!!isConnected;if(newGame){displayEpoch++;micro.suspend();}if(isHex()&&(ended()||connected&&wasMicro&&!usesHexMicro()))hide();inputMode();publish();
  // Same-game loading must not turn a deliberately hidden reconnect into a
  // first entry. A changed id still starts a new game's visibility decision.
  if(connected){if(next!=='GameStart'||newGame||!inGame(previous))lastConnectedPhase=next;if(id)lastGameId=id;}
  if(!connected)return;
  const preferences=getPreferences();
  // Transient lobby/None snapshots may still carry this game's identity.
  // Only an unknown-ID round needs a fresh selection phase to reset its token.
  if(autoShowGame==='unknown'&&!id&&next==='ChampSelect'&&previous!=='ChampSelect')autoShowGame=null;
  const autoGame=String(id||'unknown');
  if(next==='InProgress'&&(newGame||!['InProgress','Reconnect'].includes(previous))&&autoShowGame!==autoGame&&preferences.guideAutoShow!==false){autoShowGame=autoGame;autoShowUntil=Date.now()+30000;}
  if(!['InProgress','Reconnect'].includes(next))autoShowUntil=0;
  if(next===previous&&!newGame&&!needsAutoShow())return;
  if(next==='InProgress'&&needsAutoShow()&&currentSelection()){
   const epoch=displayEpoch,gameId=getState()?.match?.gameId;
   if(await prepareCurrent()&&epoch===displayEpoch&&gameId===getState()?.match?.gameId&&phase===next&&connected&&needsAutoShow())show(true);
  }
  if(getState()&&['WaitingForStats','PreEndOfGame','EndOfGame'].includes(next)&&!['WaitingForStats','PreEndOfGame','EndOfGame'].includes(previous)){
   const behavior=preferences.guideAfterGame||'hide';if(behavior==='hide')hide();
   else if(behavior==='collapse'&&!isHex()&&!isStrip()){await save({...getState(),compact:true,collapsed:false});applyMode();}
  }
 }
 return {show,recover,setGameBounds,toggle,publish,interact,phase:changePhase,needsAutoShow,setHotkey:value=>{hotkeyAvailable=!!value;},setInteractionHotkey:value=>{interactionHotkeyAvailable=!!value;inputMode();publish();},destroy:()=>{for(const event of ['display-added','display-removed','display-metrics-changed'])screen.removeListener(event,displayChanged);peek.destroy();skill.destroy();jungle.destroy();micro.destroy();win?.destroy();},isVisible:()=>micro.visible()||peek.visible()||!!win?.isVisible()||skill.visible()||jungle.visible(),window:()=>win,windowInfo:()=>usesHexMicro()?{hexWindows:micro.info(),visible:micro.visible(),mode:'hex'}:win&&!win.isDestroyed()?{bounds:win.getBounds(),visible:win.isVisible(),minimized:win.isMinimized(),collapsed:getState()?.collapsed===true,ball:isBall(),strip:isStrip(),compact:isCompact(),skillWidget:skill.info(),jungleWidget:jungle.info(),clickThrough:!isBall()&&!isStrip()&&shouldIgnore()}:null};
};
module.exports.resolveGuideIgnoreMouse=resolveGuideIgnoreMouse;
module.exports.cursorInBounds=cursorInBounds;
