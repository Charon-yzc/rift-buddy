const path=require('node:path');const {pathToFileURL}=require('node:url');
const {jungleWidgetPlacement,jungleWidgetOffset}=require('../src/core/guide-placement.mjs');
module.exports=function createJungleWindow({root,getState,setState,getPayload,getArea,getGameBounds,getScale,isQuitting,onChange,showDetails,diagnostic}){
 const {BrowserWindow,ipcMain}=require('electron');let win=null,moving=false,timer,last='',requested=false;
 const visible=()=>!!win&&!win.isDestroyed()&&win.isVisible();
 function fit(){if(!win||win.isDestroyed()||timer)return;const current=win.getBounds(),next=jungleWidgetPlacement(getState()?.jungleWidget?.offset,getArea(),getGameBounds(),getScale());if(['x','y','width','height'].every(k=>Math.abs(current[k]-next[k])<=2))return;moving=true;win.setBounds(next);moving=false;}
 function publish(value=getPayload()){if(!eligible(value)||getState()?.jungleWidget?.enabled===false){win?.hide();return;}if(requested&&!win)show();if(!win||win.isDestroyed())return;if(requested&&!win.isVisible())win.showInactive();win.setOpacity(getState()?.opacity||1);const m=value.model,payload={jungle:m.jungle,level:m.live?.level,time:m.live?.gameTime,objectives:m.objectives,presentation:value.presentation},key=JSON.stringify(payload);if(key!==last){last=key;win.webContents.send('jungle-update',payload);}fit();}
 function hide(){requested=false;win?.hide();}
 function create(){const bounds=jungleWidgetPlacement(getState()?.jungleWidget?.offset,getArea(),getGameBounds(),getScale());
  win=new BrowserWindow({...bounds,frame:false,show:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,transparent:true,backgroundColor:'#00000000',title:'开黑搭子 · 野区规划',icon:path.join(root,'assets/icon.png'),webPreferences:{preload:path.join(root,'electron/jungle-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setAlwaysOnTop(true,'screen-saver');win.setOpacity(getState()?.opacity||1);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(root,'src/jungle.html')).href)event.preventDefault();});
  win.once('ready-to-show',()=>{if(requested)win.showInactive();publish();});
  win.on('move',()=>{if(moving)return;clearTimeout(timer);timer=setTimeout(async()=>{timer=null;if(!win||win.isDestroyed()||!getState())return;const state=getState();try{await setState({...state,jungleWidget:{...state.jungleWidget,offset:jungleWidgetOffset(win.getBounds(),getArea(),getGameBounds())}},state);onChange();}catch(error){diagnostic('jungle placement not saved '+error.message);}},350);});
  win.on('close',event=>{if(!isQuitting()){event.preventDefault();close().catch(error=>diagnostic('jungle close failed '+error.message));}});
  win.on('closed',()=>{clearTimeout(timer);win=null;last='';});win.loadFile(path.join(root,'src/jungle.html'));
 }
 async function close(){const state=getState();if(state)await setState({...state,jungleWidget:{...state.jungleWidget,enabled:false}},state);hide();onChange();}
 const eligible=value=>!!value?.model?.jungle&&!['champion','mode','role','combo'].includes(value.model.live?.kind)&&(['InProgress','Reconnect'].includes(value.phase)||value.model.live?.matched===true);
 function show(){requested=true;if(!getState()||getState().jungleWidget?.enabled===false||!eligible(getPayload()))return;if(!win)create();else{fit();win.showInactive();publish();}}
 function guard(name,handler){ipcMain.handle(name,(event,...args)=>{if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('不允许此操作');return handler(...args);});}
 guard('jungle-bootstrap',getPayload);guard('jungle-control',async action=>{if(action==='hide'){await close();return true;}if(action==='details'){await showDetails();return true;}throw Error('不支持此操作');});
 return {show,hide,fit,publish,visible,destroy:()=>{clearTimeout(timer);win?.destroy();},info:()=>win&&!win.isDestroyed()?{bounds:win.getBounds(),visible:win.isVisible(),enabled:getState()?.jungleWidget?.enabled!==false}:null};
};
