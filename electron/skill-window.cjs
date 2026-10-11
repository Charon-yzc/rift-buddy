const path=require('node:path');const {pathToFileURL}=require('node:url');
const {skillWidgetPlacement,skillWidgetOffset}=require('../src/core/guide-placement.mjs');
module.exports=function createSkillWindow({root,getState,setState,getPayload,getArea,getGameBounds,getScale,isQuitting,onChange,showDetails,diagnostic}){
 const {BrowserWindow,ipcMain}=require('electron');let win=null,moving=false,timer,last='',requested=false;
 const visible=()=>!!win&&!win.isDestroyed()&&win.isVisible();
 function fit(){if(!win||win.isDestroyed()||timer)return;const current=win.getBounds(),next=skillWidgetPlacement(getState()?.skillWidget?.offset,getArea(),getGameBounds(),getScale());if(['x','y','width','height'].every(k=>Math.abs(current[k]-next[k])<=2))return;moving=true;win.setBounds(next);moving=false;}
 function publish(value=getPayload()){if(!win||win.isDestroyed())return;win.setOpacity(getState()?.opacity||1);const payload={model:value.model,presentation:value.presentation},key=JSON.stringify(payload);if(key!==last){last=key;win.webContents.send('skill-update',payload);}fit();}
 function hide(){requested=false;win?.hide();}
 function create(){const bounds=skillWidgetPlacement(getState()?.skillWidget?.offset,getArea(),getGameBounds(),getScale());
  win=new BrowserWindow({...bounds,frame:false,show:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,transparent:true,backgroundColor:'#00000000',title:'开黑搭子 · 加点',icon:path.join(root,'assets/icon.png'),webPreferences:{preload:path.join(root,'electron/skill-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setAlwaysOnTop(true,'screen-saver');win.setOpacity(getState()?.opacity||1);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(root,'src/skill.html')).href)event.preventDefault();});
  win.once('ready-to-show',()=>{if(requested)win.showInactive();publish();});
  win.on('move',()=>{if(moving)return;clearTimeout(timer);timer=setTimeout(async()=>{timer=null;if(!win||win.isDestroyed()||!getState())return;const state=getState();try{await setState({...state,skillWidget:{...state.skillWidget,offset:skillWidgetOffset(win.getBounds(),getArea(),getGameBounds())}},state);onChange();}catch(error){diagnostic('skill placement not saved '+error.message);}},350);});
  win.on('close',event=>{if(!isQuitting()){event.preventDefault();close().catch(error=>diagnostic('skill close failed '+error.message));}});
  win.on('closed',()=>{clearTimeout(timer);win=null;last='';});win.loadFile(path.join(root,'src/skill.html'));
 }
 async function close(){const state=getState();if(state)await setState({...state,skillWidget:{...state.skillWidget,enabled:false}},state);hide();onChange();}
 function show(){if(!getState()||getState().skillWidget?.enabled===false)return;requested=true;if(!win)create();else{fit();win.showInactive();publish();}}
 function guard(name,handler){ipcMain.handle(name,(event,...args)=>{if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('不允许此操作');return handler(...args);});}
 guard('skill-bootstrap',getPayload);guard('skill-control',async action=>{if(action==='hide'){await close();return true;}if(action==='details'){await showDetails();return true;}throw Error('不支持此操作');});
 return {show,hide,fit,publish,visible,destroy:()=>{clearTimeout(timer);win?.destroy();},info:()=>win&&!win.isDestroyed()?{bounds:win.getBounds(),visible:win.isVisible(),enabled:getState()?.skillWidget?.enabled!==false}:null};
};
