// Only the assistant's own window is resized. The observed League windows
// are read-only anchors, including on mixed-DPI and disconnected displays.
module.exports=function createClientCompanion({root,getWindow,createWindow,getClient,getPreferences,savePlacement,placement,diagnostic}){
 const {screen,BrowserWindow}=require('electron');
 let native=null,docked=false,normal=null,pinned=false,phase='',expanded=false,dismissed=false,hidden=false,last='',lastPublished='';
 let boundWindow=null,manual=false,manualBounds=null,timer=null;
 const peek=require('./window-peek.cjs')({root,getWindow,getArea:()=>screen.getDisplayMatching(getWindow()?.getBounds()||screen.getPrimaryDisplay().bounds).workArea,title:'选人助手',onRestore:()=>{const win=getWindow();if(docked)sync();else win?.show();}});
 const layout=()=>({docked,...(docked?{overlap:last==='edge',custom:!!(manualBounds||getPreferences().companionBounds)}:{})});
 const limits=area=>({minWidth:Math.min(280,area.width),minHeight:Math.min(480,area.height),maxWidth:area.width,maxHeight:area.height});
 function bindWindow(){const win=getWindow();if(!win||win===boundWindow)return;boundWindow=win;
  const begin=()=>{manual=true;clearTimeout(timer);};
  const remember=()=>{if(!manual||win.isMinimized()||win.isMaximized())return;if(docked)manualBounds=win.getBounds();clearTimeout(timer);timer=setTimeout(async()=>{manual=false;timer=null;const b=win.getBounds(),key=docked?'companionBounds':'mainBounds';if(docked)manualBounds=b;try{await savePlacement({[key]:b});publish();}catch(error){diagnostic('window placement not saved '+error.message);}},350);};
  win.on('will-move',begin);win.on('will-resize',begin);win.on('move',remember);win.on('resize',remember);
  win.on('closed',()=>{peek.destroy();clearTimeout(timer);timer=null;manual=false;boundWindow=null;});
 }
 function publish(){const win=getWindow(),key=JSON.stringify(layout());if(win&&!win.isDestroyed()&&key!==lastPublished){lastPublished=key;win.webContents.send('window-layout',layout());}}
 function restore(hide=false){
  const win=getWindow();if(!docked)return;
  const wasFolded=peek.active();peek.unfold();clearTimeout(timer);timer=null;manual=false;docked=false;hidden=false;
  if(win&&!win.isDestroyed()){
   if(hide)win.hide();
   const area=screen.getDisplayMatching(normal||win.getBounds()).workArea;
   win.setMinimumSize(Math.min(1050,area.width),Math.min(720,area.height));
   win.setBounds(placement.fitWindow(normal,area,{minWidth:Math.min(1050,area.width),minHeight:Math.min(720,area.height),maxWidth:area.width,maxHeight:area.height,width:1460,height:980}));
   win.setAlwaysOnTop(pinned);if(wasFolded&&!hide)win.showInactive();publish();
  }
 }
 function sync(){
  const client=getClient(),next=client.connected?client.phase:'Offline';
  if(next!==phase){phase=next;expanded=false;dismissed=false;}
  if(phase!=='ChampSelect'||getPreferences().clientCompanion===false||expanded||dismissed){const inGame=['GameStart','InProgress','Reconnect'].includes(phase);restore(inGame);peek.sync(!inGame,!!native?.foreground||BrowserWindow.getAllWindows().some(w=>!w.isDestroyed()&&w.isFocused()));return;}
  if(!native||native.minimized){peek.sync(false);if(docked){getWindow()?.hide();hidden=true;}return;}
  let win=getWindow();if(!win||win.isDestroyed()){createWindow();win=getWindow();}
  bindWindow();
  if(!docked){const current=win.getBounds();if(!normal||['x','y','width','height'].some(k=>Math.abs(current[k]-normal[k])>4))normal=current;pinned=win.isAlwaysOnTop();docked=true;}
  const saved=manualBounds||getPreferences().companionBounds,area=screen.getDisplayMatching(saved||native).workArea,b=saved?{...placement.fitWindow(saved,area,limits(area)),side:'custom'}:placement.companionPlacement(native,area,getPreferences().companionWidth);
  win.setMinimumSize(Math.min(280,area.width),Math.min(480,area.height));
  // Windows rounds framed window bounds at fractional display scales. Avoid
  // repeatedly resizing a window that is already within that rounding margin.
  const current=win.getBounds();if(!manual&&['x','y','width','height'].some(k=>Math.abs(current[k]-b[k])>3))win.setBounds({x:b.x,y:b.y,width:b.width,height:b.height});
  // Include our modal dialogs in the foreground interaction group. Never
  // repeatedly toggle the topmost flag while focus moves inside the assistant.
  const onTop=native.foreground||BrowserWindow.getAllWindows().some(w=>!w.isDestroyed()&&w.isFocused());if(win.isAlwaysOnTop()!==onTop)win.setAlwaysOnTop(onTop,'floating');
  if(peek.active()){win.hide();peek.sync(true,onTop);}else if(!win.isVisible()||hidden){win.showInactive();hidden=false;}
  last=b.side;publish();
 }
 async function reset(all=false,defaults=false){peek.unfold();clearTimeout(timer);timer=null;manual=false;manualBounds=null;await savePlacement({companionBounds:undefined,...(defaults?{companionWidth:520}:{}),...(all?{mainBounds:undefined}:{})});if(all){normal=null;const win=getWindow();if(win&&!docked){const area=screen.getDisplayMatching(win.getBounds()).workArea;win.setBounds(placement.fitWindow(null,area,{width:1460,height:980,minWidth:Math.min(1050,area.width),minHeight:Math.min(720,area.height),maxWidth:area.width,maxHeight:area.height}));}}sync();publish();return layout();}
 return {layout,sync,bindWindow,reset,unfold:()=>peek.unfold(),fold:()=>{peek.fold();return layout();},observe:value=>{native=value;sync();},setMode:value=>{expanded=!value;dismissed=false;if(!value)restore();else sync();publish();return layout();},dismiss:()=>{dismissed=true;restore();},destroy:()=>{peek.destroy();clearTimeout(timer);restore();}};
};
