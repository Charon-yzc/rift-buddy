const path=require('node:path');
const {pathToFileURL}=require('node:url');
const sidebarPlacement=require('./companion-placement.cjs');
const {publicClientGameId}=require('../src/core/draft.mjs');
const PREGAME_PHASES=['Lobby','Matchmaking','ReadyCheck','ChampSelect'];
const DRAFT_RECONNECT_MS=8000;
// League windows are read-only anchors. The sidebar has its own lifetime and
// bounds; opening the full assistant never resizes or replaces either window.
module.exports=function createClientCompanion({root,getWindow,showMain,getClient,getPreferences,savePlacement,placement,diagnostic}){
 const {screen,BrowserWindow}=require('electron');
 let native=null,side=null,ready=false,phase='',gameId=null,dismissed=false,manualRequested=false,manual=false,manualBounds=null,boundMain=null,overlap=false,cancelSidePlacement=()=>{},cancelMainPlacement=()=>{},draftReconnectTimer=null;
 const published=new Map();
 const areaFor=b=>screen.getDisplayMatching(b||screen.getPrimaryDisplay().bounds).workArea;
 const limits=area=>({minWidth:Math.min(280,area.width),minHeight:Math.min(320,native?.height||320,area.height),maxWidth:area.width,maxHeight:area.height});
 const peek=require('./window-peek.cjs')({root,getWindow:()=>side,getArea:()=>areaFor(side?.getBounds()),title:'选人侧栏',onRestore:()=>sync()});
 function layout(surface='main'){return surface==='companion'?{surface,docked:true,overlap,custom:!!(manualBounds||getPreferences().companionBounds)}:{surface:'main',docked:false,companionVisible:!!side&&!side.isDestroyed()&&side.isVisible()};}
 function publish(){for(const [surface,win] of [['main',getWindow()],['companion',side]]){if(!win||win.isDestroyed())continue;const value=layout(surface),key=JSON.stringify(value);if(published.get(win.webContents.id)!==key){published.set(win.webContents.id,key);win.webContents.send('window-layout',value);}}}
 function bindPlacement(win,key){let moving=false,saveTimer=null,pendingBounds=null;const id=win.webContents.id;
  const begin=()=>{moving=true;if(key==='companionBounds')manual=true;clearTimeout(saveTimer);};
  const persist=async bounds=>{try{await savePlacement({[key]:bounds});publish();}catch(error){diagnostic('window placement not saved '+error.message);}};
  // Closing commits the last user move; a layout reset only cancels it.
  const cancel=(flush=false)=>{clearTimeout(saveTimer);saveTimer=null;moving=false;if(key==='companionBounds')manual=false;const bounds=pendingBounds;pendingBounds=null;if(flush&&bounds)return persist(bounds);};
  const remember=()=>{if(!moving||win.isMinimized()||win.isMaximized())return;pendingBounds=win.getBounds();if(key==='companionBounds')manualBounds=pendingBounds;clearTimeout(saveTimer);saveTimer=setTimeout(()=>cancel(true),350);};
  win.on('will-move',begin);win.on('will-resize',begin);win.on('move',remember);win.on('resize',remember);
  win.on('closed',()=>{cancel(true);published.delete(id);});return cancel;
 }
 function bindWindow(){const main=getWindow();if(!main||main===boundMain)return;boundMain=main;cancelMainPlacement=bindPlacement(main,'mainBounds');main.on('closed',()=>{boundMain=null;});publish();}
 function create(){
  const area=areaFor(native),bounds=sidebarPlacement(native,area,getPreferences().companionWidth);
  side=new BrowserWindow({...bounds,...limits(area),title:'开黑搭子 · 选人侧栏',backgroundColor:'#10151e',icon:path.join(root,'assets/icon.png'),show:false,autoHideMenuBar:true,skipTaskbar:true,
   webPreferences:{preload:path.join(root,'electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const win=side,url=pathToFileURL(path.join(root,'src/index.html'));url.searchParams.set('surface','companion');
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,value)=>{if(value!==url.href)event.preventDefault();});
  cancelSidePlacement=bindPlacement(win,'companionBounds');
  win.on('close',()=>{dismissed=true;manualRequested=false;});win.on('closed',()=>{if(side===win){side=null;ready=false;manual=false;peek.destroy();publish();}});
  win.once('ready-to-show',()=>{if(side===win){ready=true;sync();}});
  win.webContents.on('render-process-gone',(_event,detail)=>diagnostic('sidebar renderer gone '+detail.reason));
  win.loadFile(path.join(root,'src/index.html'),{query:{surface:'companion'}});publish();
 }
 function clearReconnect(){clearTimeout(draftReconnectTimer);draftReconnectTimer=null;}
 function release(){clearReconnect();peek.destroy();cancelSidePlacement(true);if(side&&!side.isDestroyed())side.destroy();side=null;ready=false;publish();}
 function sync(){
  const client=getClient(),next=client.connected?client.phase:'Offline',pregame=PREGAME_PHASES.includes(next),nextGame=next==='ChampSelect'?publicClientGameId(client):null;
  const keepDraft=next==='Offline'&&client.transportInterrupted===true&&phase==='ChampSelect'&&!!gameId&&!!native&&!!side&&!side.isDestroyed()&&getPreferences().clientCompanion!==false&&!dismissed;
  if(keepDraft){
   if(draftReconnectTimer===null)draftReconnectTimer=setTimeout(()=>{phase='Offline';gameId=null;manualRequested=false;release();},DRAFT_RECONNECT_MS);
  }else if(draftReconnectTimer!==null){
   if(nextGame!==gameId)release();else clearReconnect();
  }
  // A manual opening belongs to this pregame cycle, not one polling phase.
  if(!keepDraft){
   if(!pregame||(next==='Lobby'&&(phase==='ChampSelect'||gameId))||(gameId&&nextGame&&gameId!==nextGame))manualRequested=false;
   if(!pregame||next==='Lobby')gameId=null;else if(nextGame)gameId=nextGame;
   if(next!==phase){const waiting=['Lobby','Matchmaking','ReadyCheck'];if(!waiting.includes(phase)||!waiting.includes(next))dismissed=false;phase=next;}
   if(!pregame||getPreferences().clientCompanion===false&&!manualRequested||dismissed){release();return;}
  }
  if(!native||native.minimized){peek.sync(false,false);if(side&&!side.isDestroyed()&&side.isVisible())side.hide();publish();return;}
  if(!side||side.isDestroyed())create();
  const saved=manualBounds||getPreferences().companionBounds,area=areaFor(saved||native),bounds=saved?placement.fitWindow(saved,area,limits(area)):sidebarPlacement(native,area,getPreferences().companionWidth);
  overlap=!saved&&bounds.overlap===true;const minimum=side.getMinimumSize(),nextLimits=limits(area);if(minimum[0]!==nextLimits.minWidth||minimum[1]!==nextLimits.minHeight)side.setMinimumSize(nextLimits.minWidth,nextLimits.minHeight);
  // Fractional-DPI rounding and native observation noise must not cause a
  // resize on every tick. Width is fixed; normal movement changes position only.
  const current=side.getBounds();if(!manual&&['x','y','width','height'].some(k=>Math.abs(current[k]-bounds[k])>3))side.setBounds({x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height});
  const onTop=!!native.foreground;if(side.isAlwaysOnTop()!==onTop)side.setAlwaysOnTop(onTop,'floating');
  if(peek.active()){if(side.isVisible())side.hide();peek.sync(true,onTop);}else if(ready&&!side.isVisible())side.showInactive();publish();
 }
 async function reset(all=false,defaults=false){peek.unfold();cancelSidePlacement();manualBounds=null;await savePlacement({companionBounds:undefined,...(defaults?{companionWidth:440}:{}),...(all?{mainBounds:undefined}:{})});if(all){cancelMainPlacement();const main=getWindow();if(main&&!main.isDestroyed()){const area=areaFor(main.getBounds());main.setBounds(placement.fitWindow(null,area,{width:1460,height:980,minWidth:Math.min(1050,area.width),minHeight:Math.min(720,area.height),maxWidth:area.width,maxHeight:area.height}));}}dismissed=false;sync();return layout();}
 return {layout,sync,bindWindow,reset,getWindow:()=>side,unfold:()=>{peek.unfold();sync();},fold:()=>{peek.fold();publish();return layout('companion');},observe:value=>{native=value;sync();},setMode:value=>{if(!value)showMain();else{const client=getClient();if(!client.connected||!PREGAME_PHASES.includes(client.phase))return {docked:false,reason:'连接客户端并进入组队大厅后可打开侧栏'};if(!native||native.minimized)return {docked:false,reason:'请先打开英雄联盟客户端窗口'};sync();manualRequested=true;dismissed=false;peek.unfold();sync();}return layout(value?'companion':'main');},dismiss:()=>{dismissed=true;manualRequested=false;release();},destroy:release};
};
