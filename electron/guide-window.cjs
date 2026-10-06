const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');

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

module.exports=function createGuideWindow({root,getState,setState,getModel,isQuitting,showMain,diagnostic,currentSelection=()=>null,prepareCurrent=async()=>false,getPreferences=()=>({})}){
 const {BrowserWindow,ipcMain,screen,clipboard}=require('electron');
 let win=null,phase='Offline',lastConnectedPhase='Offline',lastGameId=null,connected=false,hotkeyAvailable=false,interactionHotkeyAvailable=false,lastPublished='',boundsTimer,adjusting=false,visibilityRequested=false,autoShowUntil=0,hoverHeader=false;
 const BALL_SIZE=76;
 const isBall=()=>!!getState()?.ball;
 const needsAutoShow=()=>autoShowUntil>Date.now()&&getPreferences().guideAutoShow!==false;
const mousePassThrough=()=>!!(getState()?.clickThrough&&(['InProgress','Reconnect'].includes(phase)||!connected&&getModel()?.live.matched)&&interactionHotkeyAvailable);
const shouldIgnore=()=>resolveGuideIgnoreMouse(mousePassThrough(),hoverHeader);
const inputMode=()=>{if(win&&!win.isDestroyed()){const ball=isBall(),ignore=ball?false:shouldIgnore(),pass=ball?true:mousePassThrough();win.setIgnoreMouseEvents(ignore,{forward:true});win.setFocusable(!pass);if(ignore&&win.isFocused())win.blur();}};
const payload=()=>{let model=null;try{model=getModel();}catch(error){diagnostic(`guide model failed ${error.message}`);}return {model,phase,connected,hotkeyAvailable,interactionHotkeyAvailable,mousePassThrough:mousePassThrough(),ball:isBall(),current:currentSelection()};};
function publish(){if(win&&!win.isDestroyed()){inputMode();const value=payload(),key=JSON.stringify(value);if(key!==lastPublished){lastPublished=key;win.webContents.send('guide-update',value);}}}
 async function save(next){await setState(next);publish();return payload();}
 function adjustHeight(){if(win&&!isBall()){adjusting=true;const collapsed=getState()?.collapsed,[width]=win.getSize(),area=screen.getDisplayMatching(win.getBounds()).workArea,height=Math.min(collapsed?220:getState()?.bounds?.height||640,area.height);win.setMinimumSize(360,collapsed?220:480);win.setSize(width,height);const b=win.getBounds();win.setPosition(Math.max(area.x,Math.min(b.x,area.x+area.width-width)),Math.max(area.y,Math.min(b.y,area.y+area.height-height)));adjusting=false;}}
 function applyMode(){
  if(!win||win.isDestroyed())return;
  if(isBall()){
   win.setMinimumSize(BALL_SIZE,BALL_SIZE);win.setSize(BALL_SIZE,BALL_SIZE);
   const area=screen.getDisplayMatching(win.getBounds()).workArea,b=win.getBounds();
   win.setPosition(Math.max(area.x,Math.min(b.x,area.x+area.width-BALL_SIZE)),Math.max(area.y,Math.min(b.y,area.y+area.height-BALL_SIZE)));
  }else{
   const saved=getState()?.bounds;
   const width=Number.isFinite(saved?.width)?Math.min(Math.max(saved.width,360),640):400;
   win.setSize(width,win.getSize()[1]);
   adjustHeight();
  }
  win.setResizable(!isBall());
  inputMode();publish();
 }
 function create(){
  const saved=getState()?.bounds,area=(saved?screen.getDisplayMatching(saved):screen.getPrimaryDisplay()).workArea;
  const ball=isBall();
  const width=ball?BALL_SIZE:Math.min(saved?.width||400,area.width),height=ball?BALL_SIZE:Math.min(getState()?.collapsed?220:saved?.height||640,area.height);
  win=new BrowserWindow({width,height,minWidth:ball?BALL_SIZE:360,minHeight:ball?BALL_SIZE:getState()?.collapsed?220:480,maxWidth:640,maxHeight:1000,
   x:Math.max(area.x,Math.min(saved?.x??area.x+area.width-440,area.x+area.width-width)),y:Math.max(area.y,Math.min(saved?.y??area.y+40,area.y+area.height-height)),frame:false,show:false,alwaysOnTop:true,skipTaskbar:true,transparent:true,
   backgroundColor:'#101823',title:'开黑搭子 · 本局指引',icon:path.join(root,'assets/icon.png'),resizable:!ball,
   webPreferences:{preload:path.join(root,'electron/guide-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setAlwaysOnTop(true,'screen-saver');win.setOpacity(getState()?.opacity||1);inputMode();
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(root,'src/guide.html')).href)event.preventDefault();});
  win.webContents.on('render-process-gone',(_e,detail)=>diagnostic(`guide renderer gone ${detail.reason}`));
  win.webContents.on('did-fail-load',(_e,code)=>diagnostic(`guide load failed ${code}`));
  win.once('ready-to-show',()=>{if(visibilityRequested)win.showInactive();diagnostic(`guide-ready visible=${win.isVisible()}`);});
  win.webContents.on('did-finish-load',()=>{
   diagnostic('guide loaded');
   if(process.env.RIFT_BUDDY_GUIDE_SCREENSHOT)setTimeout(async()=>{try{await fs.writeFile(process.env.RIFT_BUDDY_GUIDE_SCREENSHOT,(await win.webContents.capturePage()).toPNG());diagnostic('guide screenshot saved');}catch(e){diagnostic(`guide capture failed ${e.message}`);}},1500);
  });
  win.on('close',event=>{if(!isQuitting()){event.preventDefault();hide();}});
  const remember=()=>{if(adjusting||isBall())return;clearTimeout(boundsTimer);boundsTimer=setTimeout(()=>{if(!win||win.isDestroyed()||!getState())return;const b=win.getBounds(),current=getState();save({...current,bounds:{...b,height:current.collapsed?current.bounds?.height||680:Math.max(480,b.height)}}).catch(()=>{});},350);};
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
    if(!win||win.isDestroyed()||!win.isVisible()||isBall()||!mousePassThrough())return;
    const b=win.getBounds(),p=screen.getCursorScreenPoint();
    if(cursorInBounds(p,{...b,height:Math.min(STRIP_H,b.height)})){
     if(shouldIgnore()){hoverHeader=true;inputMode();}
    }else if(!cursorInBounds(p,b)){
     if(hoverHeader){hoverHeader=false;inputMode();}
    }
   }catch{}
  },120);
  if(hoverPoll.unref)hoverPoll.unref();
  win.on('closed',()=>{clearTimeout(boundsTimer);clearInterval(hoverPoll);win=null;lastPublished='';});win.loadFile(path.join(root,'src/guide.html'));
 }
 function hide(){autoShowUntil=0;visibilityRequested=false;hoverHeader=false;win?.hide();}
 function show(){autoShowUntil=0;visibilityRequested=true;hoverHeader=false;if(!win)create();else{if(win.isMinimized())win.restore();win.showInactive();inputMode();publish();}return payload();}
 function toggle(){if(win?.isVisible())hide();else show();}
 async function interact(){const current=getState();if(!current)return;await save({...current,clickThrough:!current.clickThrough});inputMode();publish();}
 function guard(name,handler){ipcMain.handle(name,(event,...args)=>{
  if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('不允许此操作');
  return handler(...args);
 });}
 guard('guide-bootstrap',payload);
 guard('guide-hover',value=>{const next=!!value;if(next!==hoverHeader){hoverHeader=next;inputMode();}return hoverHeader;});
 guard('guide-control',async(action,value)=>{
  if(action==='hide'){hide();return true;}
  if(action==='main'){showMain(getState()?.selection);return true;}
  if(action==='current'){if(!await prepareCurrent())throw Error('尚未确认当前英雄与模式，请在完整助手中选择');inputMode();publish();return payload();}
  const current=getState();if(!current)throw Error('先在配置页选择“本局指引”');
  if(action==='collapse'){const result=await save({...current,collapsed:!current.collapsed});adjustHeight();return result;}
  if(action==='ball'){const result=await save({...current,ball:!current.ball});applyMode();return result;}
  if(action==='opacity'){if(![0.65,0.85,1].includes(value))throw Error('透明度格式不正确');const result=await save({...current,opacity:value});win.setOpacity(value);return result;}
  if(action==='interaction'){await interact();return payload();}
  if(action==='condition'){if(!['ad','ap','control','heal','burst'].includes(value))throw Error('局势选项不正确');const conditions=current.selection.conditions.includes(value)?current.selection.conditions.filter(c=>c!==value):[...current.selection.conditions,value];return save({...current,selection:{...current.selection,conditions}});}
  if(action==='reset')return save({...current,completedItems:[]});
  if(action==='new-game'){const result=await save({...current,completedItems:[],clickThrough:true,purchaseTarget:undefined,stage:undefined,duelPick:undefined,selection:{...current.selection,compareIds:[],ownedAugmentIds:[]}});inputMode();return result;}
  if(action==='purchase-target'){if(value!==''&&!getModel().shoppingTargets.some(i=>i.id===value&&!i.owned))throw Error('目标已变化，请重新选择');return save({...current,purchaseTarget:value||undefined});}
  if(action==='stage'){if(!['auto','opening','key','later'].includes(value))throw Error('配合阶段不正确');return save({...current,stage:value==='auto'?undefined:value});}
  if(action==='duel-own'||action==='duel-foe'){
   const side=action==='duel-own'?'own':'foe';
   if(value!==''&&!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(value))throw Error('英雄选择格式不正确');
   const next={...(current.duelPick||{}),[side]:value||undefined};
   if(next.own&&next.foe&&next.own===next.foe)throw Error('不能自己打自己，请换一边');
   return save({...current,duelPick:next.own||next.foe?next:undefined});
  }
  if(action==='item'){
   if(getModel().live.matched)throw Error('背包正在同步，购买进度以实际背包为准；可切换回城目标');
   if(typeof value!=='string'||!getModel().route.some(i=>i.id===value))throw Error('这个装备不在当前方案中');
   return save({...current,...(current.purchaseTarget===value&&!current.completedItems.includes(value)?{purchaseTarget:undefined}:{}),completedItems:current.completedItems.includes(value)?current.completedItems.filter(id=>id!==value):[...current.completedItems,value]});
  }
  if(action==='copy'){const m=getModel();clipboard.writeText(`${m.champion.name} · ${m.mode==='hex'?'海克斯大乱斗':m.role}\n${m.route.map(i=>i.name).join(' → ')}\n加点：${m.priority||'请按游戏提示'}\n符文：${m.runes.map(r=>r.name).join(' / ')}\n${m.combo?[m.combo.title,m.combo.ownJob,...(m.combo.steps||[]),m.combo.window,m.combo.early,m.combo.economy].filter(Boolean).join('\n'):''}\n${(m.adjustments||[]).map(a=>`${a.title}：${a.text}`).join('\n')}\n${m.tips}\n资料 ${m.version} · ${m.source}\n${m.status?.build||''}`);return true;}
  throw Error('不支持此操作');
 });
 async function changePhase(next,isConnected){
  const previous=lastConnectedPhase,id=getState()?.match?.gameId,newGame=!!(id&&lastGameId&&id!==lastGameId);phase=next;connected=!!isConnected;inputMode();publish();
  // Same-game loading must not turn a deliberately hidden reconnect into a
  // first entry. A changed id still starts a new game's visibility decision.
  if(connected){if(next!=='GameStart'||newGame)lastConnectedPhase=next;if(id)lastGameId=id;}
  if(!connected||!getState())return;
  const preferences=getPreferences();
  if(next==='InProgress'&&(newGame||!['InProgress','Reconnect'].includes(previous))&&preferences.guideAutoShow!==false)autoShowUntil=Date.now()+30000;
  if(!['InProgress','Reconnect'].includes(next))autoShowUntil=0;
  if(next===previous&&!newGame&&!needsAutoShow())return;
  if(next==='InProgress'&&needsAutoShow()&&currentSelection()){
   if(await prepareCurrent()&&phase===next&&connected&&needsAutoShow())show();
  }
  if(['WaitingForStats','PreEndOfGame','EndOfGame'].includes(next)&&!['WaitingForStats','PreEndOfGame','EndOfGame'].includes(previous)){
   const behavior=preferences.guideAfterGame||'hide';if(behavior==='hide')hide();
   else if(behavior==='collapse'){await save({...getState(),collapsed:true});adjustHeight();}
  }
 }
 return {show,toggle,publish,interact,phase:changePhase,needsAutoShow,setHotkey:value=>{hotkeyAvailable=!!value;},setInteractionHotkey:value=>{interactionHotkeyAvailable=!!value;inputMode();publish();},destroy:()=>{win?.destroy();},window:()=>win};
};
module.exports.resolveGuideIgnoreMouse=resolveGuideIgnoreMouse;
module.exports.cursorInBounds=cursorInBounds;
