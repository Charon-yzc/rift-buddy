const path=require('node:path');const {pathToFileURL}=require('node:url');
const {skillWidgetPlacement,skillWidgetOffset,guideWindowLimits}=require('../src/core/guide-placement.mjs');
module.exports=function createSkillWindow({root,getState,setState,getPayload,getArea,getGameBounds,getScale,isQuitting,onChange,showDetails,diagnostic,isActive=()=>getState()?.selection?.mode!=='hex'}){
 const {BrowserWindow,ipcMain}=require('electron');let win=null,moving=false,timer,last='',requested=false,placed=null;
 const peek=require('./window-peek.cjs')({root,getWindow:()=>win,getArea,title:'加点提示',onRestore:()=>show()});
 const resize=require('./window-resize.cjs')({getWindow:()=>win,getArea,getLimits:area=>guideWindowLimits('skill',area,getScale()),onStart:()=>clearTimeout(timer),onEnd:remember});
 async function remember(){clearTimeout(timer);timer=null;if(!win||win.isDestroyed()||!getState())return;const state=getState(),b=win.getBounds();try{await setState({...state,skillWidget:{...state.skillWidget,offset:skillWidgetOffset(b,getArea(),getGameBounds()),size:{width:b.width,height:b.height}}},state);onChange();}catch(error){diagnostic('skill placement not saved '+error.message);}}
 const visible=()=>!!win&&!win.isDestroyed()&&(win.isVisible()||peek.visible());
 function fit(){if(!win||win.isDestroyed()||timer||resize.active())return;const current=win.getBounds(),next=skillWidgetPlacement(getState()?.skillWidget?.offset,getArea(),getGameBounds(),getScale(),getState()?.skillWidget?.size),same=(a,b)=>a&&b&&['x','y','width','height'].every(k=>Math.abs(a[k]-b[k])<=2);
  // Windows can clamp a transparent native window to 64px. Clip its visible
  // and input region to one line, and retain the applied bounds so polls do
  // not repeatedly resize that unavoidable native backing window.
  if(placed&&same(next,placed.requested)&&same(current,placed.actual))return;
  moving=true;if(!same(current,next))win.setBounds(next);const actual=win.getBounds();if(win.setShape)win.setShape([{x:0,y:0,width:actual.width,height:next.height}]);placed={requested:next,actual};moving=false;
 }
 function publish(value=getPayload()){if(!isActive()){hide();return;}if(peek.active()){peek.sync(true);return;}if(!win||win.isDestroyed())return;win.setOpacity(getState()?.opacity||1);const payload={model:value.model,presentation:value.presentation},key=JSON.stringify(payload);if(key!==last){last=key;win.webContents.send('skill-update',payload);}fit();}
 function hide(){peek.unfold();resize.cancel();requested=false;win?.hide();}
 function create(){const bounds=skillWidgetPlacement(getState()?.skillWidget?.offset,getArea(),getGameBounds(),getScale(),getState()?.skillWidget?.size);
  win=new BrowserWindow({...bounds,frame:false,show:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,transparent:true,backgroundColor:'#00000000',title:'开黑搭子 · 加点',icon:path.join(root,'assets/icon.png'),webPreferences:{preload:path.join(root,'electron/skill-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  fit();
  win.setAlwaysOnTop(true,'screen-saver');win.setOpacity(getState()?.opacity||1);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(root,'src/skill.html')).href)event.preventDefault();});
  win.once('ready-to-show',()=>{if(requested&&isActive())win.showInactive();publish();});
  win.on('move',()=>{if(moving||resize.active())return;clearTimeout(timer);timer=setTimeout(remember,350);});
  win.on('close',event=>{if(!isQuitting()){event.preventDefault();close().catch(error=>diagnostic('skill close failed '+error.message));}});
  win.on('closed',()=>{peek.destroy();resize.cancel();clearTimeout(timer);win=null;placed=null;last='';});win.loadFile(path.join(root,'src/skill.html'));
 }
 async function close(){const state=getState();if(state)await setState({...state,skillWidget:{...state.skillWidget,enabled:false}},state);hide();onChange();}
 function show(){if(!isActive())return;peek.unfold();if(!getState()||getState().skillWidget?.enabled===false)return;requested=true;if(!win)create();else{fit();win.showInactive();publish();}}
 function guard(name,handler){ipcMain.handle(name,(event,...args)=>{if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('不允许此操作');return handler(...args);});}
 guard('skill-bootstrap',getPayload);guard('skill-control',async(action,value)=>{if(!isActive())throw Error('当前模式不使用此窗口');if(action==='fold'){resize.cancel();peek.fold();return true;}if(['resize-start','resize','resize-end','resize-key'].includes(action))return resize.control(action,value);if(action==='hide'){await close();return true;}if(action==='details'){await showDetails();return true;}throw Error('不支持此操作');});
 return {show,hide,fit,reset:()=>{peek.unfold();resize.cancel();clearTimeout(timer);timer=null;fit();},publish,visible,destroy:()=>{peek.destroy();resize.cancel();clearTimeout(timer);win?.destroy();},info:()=>win&&!win.isDestroyed()?{bounds:win.getBounds(),visible:win.isVisible(),enabled:getState()?.skillWidget?.enabled!==false}:null};
};
