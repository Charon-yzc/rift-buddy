const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');

// Pure pass-through decision, extracted for testability: hovering the header
// (drag bar + window buttons) always wins so the panel stays movable and
// clickable even while the content area passes clicks through to the game.
function resolveGuideIgnoreMouse(passThrough,hoverHeader){return !!passThrough&&!hoverHeader;}

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
  }else adjustHeight();
  inputMode();publish();
 }
 function create(){
  const saved=getState()?.bounds,area=(saved?screen.getDisplayMatching(saved):screen.getPrimaryDisplay()).workArea;
  const ball=isBall();
  const width=ball?BALL_SIZE:Math.min(saved?.width||400,area.width),height=ball?BALL_SIZE:Math.min(getState()?.collapsed?220:saved?.height||640,area.height);
  win=new BrowserWindow({width,height,minWidth:ball?BALL_SIZE:360,minHeight:ball?BALL_SIZE:getState()?.collapsed?220:480,maxWidth:640,maxHeight:1000,
   x:Math.max(area.x,Math.min(saved?.x??area.x+area.width-440,area.x+area.width-width)),y:Math.max(area.y,Math.min(saved?.y??area.y+40,area.y+area.height-height)),frame:false,show:false,alwaysOnTop:true,skipTaskbar:true,transparent:true,
   backgroundColor:'#101823',title:'开黑搭子 · 本局指引',icon:path.join(root,'assets/icon.png'),
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
  win.on('closed',()=>{clearTimeout(boundsTimer);win=null;lastPublished='';});win.loadFile(path.join(root,'src/guide.html'));
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
  if(action==='live-advice')return save({...current,liveAdvice:current.liveAdvice===false});
  if(['threatId','protectId','combatFocus'].includes(action)){
   const m=getModel();if(m.mode!=='rift')throw Error('当前模式不使用峡谷关注目标');
   if(action==='combatFocus'){if(!['lane','teamfight'].includes(value))throw Error('局势关注格式不正确');}
   else if(value!==''&&!(action==='threatId'?m.situation.enemies:m.situation.allies).some(p=>p.id===value))throw Error('公开英雄列表已变化，请重新选择');
   return save({...current,selection:{...current.selection,[action]:value||undefined}});
  }
  if(action==='condition'){if(!['ad','ap','control','heal','burst'].includes(value))throw Error('局势选项不正确');const conditions=current.selection.conditions.includes(value)?current.selection.conditions.filter(c=>c!==value):[...current.selection.conditions,value];return save({...current,selection:{...current.selection,conditions}});}
  if(action==='reset')return save({...current,completedItems:[]});
  if(action==='new-game'){const result=await save({...current,completedItems:[],clickThrough:true,purchaseTarget:undefined,purchaseTargetKind:undefined,stage:undefined,selection:{...current.selection,compareIds:[],ownedAugmentIds:[],threatId:undefined,protectId:undefined,combatFocus:undefined}});inputMode();return result;}
  if(action==='purchase-target'){const target=getModel().shoppingTargets.find(i=>i.id===value&&!i.owned);if(value!==''&&!target)throw Error('目标已变化，请重新选择');return save({...current,purchaseTarget:value||undefined,purchaseTargetKind:target?.kind==='局势备选'?'situation':undefined});}
  if(action==='stage'){if(!['auto','opening','key','later'].includes(value))throw Error('配合阶段不正确');return save({...current,stage:value==='auto'?undefined:value});}
  if(action==='item'){
   if(getModel().live.matched)throw Error('背包正在同步，购买进度以实际背包为准；可切换回城目标');
   if(typeof value!=='string'||!getModel().route.some(i=>i.id===value))throw Error('这个装备不在当前方案中');
   return save({...current,...(current.purchaseTarget===value&&!current.completedItems.includes(value)?{purchaseTarget:undefined}:{}),completedItems:current.completedItems.includes(value)?current.completedItems.filter(id=>id!==value):[...current.completedItems,value]});
  }
  if(action==='copy'){const m=getModel();clipboard.writeText(`${m.champion.name} · ${m.mode==='hex'?'海克斯大乱斗':m.role}\n${m.route.map(i=>i.name).join(' → ')}\n本次购买：${m.next?.name||'路线已完成'}\n理由：${m.nextReason}\n取舍：${m.nextCaution}\n加点：${m.priority||'请按游戏提示'}${m.nextSkill?'；当前建议 '+m.nextSkill:''}\n加点理由：${m.skillAdvice.reason}\n取舍：${m.skillAdvice.caution}\n符文：${m.runes.map(r=>r.name).join(' / ')}\n${m.combo?[m.combo.title,m.combo.ownJob,...(m.combo.steps||[]),m.combo.window,m.combo.early,m.combo.economy].filter(Boolean).join('\n'):''}\n${(m.adjustments||[]).map(a=>`${a.title}：${a.text}`).join('\n')}\n${m.tips}\n资料 ${m.version} · ${m.source}\n${m.status?.build||''}`);return true;}
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
