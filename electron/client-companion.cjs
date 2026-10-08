// Only the assistant's own window is resized. The observed League windows
// are read-only anchors, including on mixed-DPI and disconnected displays.
module.exports=function createClientCompanion({getWindow,createWindow,getClient,getPreferences,placement,diagnostic}){
 const {screen}=require('electron');
 let native=null,docked=false,normal=null,pinned=false,phase='',expanded=false,dismissed=false,hidden=false,last='',lastPublished='';
 const layout=()=>({docked,...(docked?{overlap:last==='edge'}:{})});
 function publish(){const win=getWindow(),key=JSON.stringify(layout());if(win&&!win.isDestroyed()&&key!==lastPublished){lastPublished=key;win.webContents.send('window-layout',layout());}}
 function restore(hide=false){
  const win=getWindow();if(!docked)return;
  docked=false;hidden=false;
  if(win&&!win.isDestroyed()){
   if(hide)win.hide();
   const area=screen.getDisplayMatching(normal||win.getBounds()).workArea;
   win.setMinimumSize(Math.min(1050,area.width),Math.min(720,area.height));
   win.setBounds(placement.fitWindow(normal,area,{minWidth:Math.min(1050,area.width),minHeight:Math.min(720,area.height),maxWidth:area.width,maxHeight:area.height,width:1460,height:980}));
   win.setAlwaysOnTop(pinned);publish();
  }
 }
 function sync(){
  const client=getClient(),next=client.connected?client.phase:'Offline';
  if(next!==phase){phase=next;expanded=false;dismissed=false;}
  if(phase!=='ChampSelect'||getPreferences().clientCompanion===false||expanded||dismissed){restore(['GameStart','InProgress','Reconnect'].includes(phase));return;}
  if(!native||native.minimized){if(docked){getWindow()?.hide();hidden=true;}return;}
  let win=getWindow();if(!win||win.isDestroyed()){createWindow();win=getWindow();}
  if(!docked){const current=win.getBounds();if(!normal||['x','y','width','height'].some(k=>Math.abs(current[k]-normal[k])>4))normal=current;pinned=win.isAlwaysOnTop();docked=true;}
  const area=screen.getDisplayMatching(native).workArea,b=placement.companionPlacement(native,area);
  win.setMinimumSize(Math.min(280,area.width),Math.min(480,area.height));
  // Windows rounds framed window bounds at fractional display scales. Avoid
  // repeatedly resizing a window that is already within that rounding margin.
  const current=win.getBounds();if(['x','y','width','height'].some(k=>Math.abs(current[k]-b[k])>3))win.setBounds({x:b.x,y:b.y,width:b.width,height:b.height});
  const onTop=native.foreground||win.isFocused();if(win.isAlwaysOnTop()!==onTop)win.setAlwaysOnTop(onTop,'floating');
  if(!win.isVisible()||hidden){win.showInactive();hidden=false;}
  last=b.side;publish();
 }
 return {layout,sync,observe:value=>{native=value;sync();},setMode:value=>{expanded=!value;dismissed=false;if(!value)restore();else sync();publish();return layout();},dismiss:()=>{dismissed=true;restore();},destroy:()=>restore()};
};
