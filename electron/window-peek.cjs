const path=require('node:path');
const {pathToFileURL}=require('node:url');
const tabs=new Map();let registered=false;
module.exports=function createWindowPeek({root,getWindow,getArea,title,onRestore}){
 const {BrowserWindow,ipcMain}=require('electron');let tab=null,folded=false,shown=false,side='right',releaseTimer=null;
 if(!registered){registered=true;ipcMain.handle('peek-control',(event,action)=>{const item=tabs.get(event.sender.id);if(!item||event.senderFrame!==event.sender.mainFrame)throw Error('不允许此操作');if(action==='bootstrap')return item.payload();if(action==='restore')return item.restore();throw Error('收起按钮操作不正确');});}
 const payload=()=>({title,side});
 function place(){if(!tab||tab.isDestroyed())return;const area=getArea(),b=getWindow()?.getBounds()||area;side=b.x+b.width/2<area.x+area.width/2?'left':'right';
  const width=28,height=Math.min(64,area.height),x=side==='left'?area.x:area.x+area.width-width;let y=Math.max(area.y,Math.min(b.y,area.y+area.height-height));
  for(let attempt=0;attempt<tabs.size+1;attempt++){const conflict=[...tabs.values()].some(item=>item.tab!==tab&&item.tab.isVisible()&&Math.abs(item.tab.getBounds().x-x)<width&&Math.abs(item.tab.getBounds().y-y)<height+4);if(!conflict)break;y=y+height*2+8<=area.y+area.height?y+height+8:Math.max(area.y,y-height-8);}
  const current=tab.getBounds(),next={x,y,width,height};if(['x','y','width','height'].some(k=>Math.abs(current[k]-next[k])>3))tab.setBounds(next);tab.webContents.send('peek-update',payload());
 }
 function create(){const created=new BrowserWindow({width:28,height:64,frame:false,transparent:true,resizable:false,focusable:false,show:false,skipTaskbar:true,alwaysOnTop:true,title:'开黑搭子 · 展开'+title,backgroundColor:'#00000000',webPreferences:{preload:path.join(root,'electron/peek-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});tab=created;
  tabs.set(created.webContents.id,{tab:created,payload,restore});created.webContents.setWindowOpenHandler(()=>({action:'deny'}));created.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(path.join(root,'src/peek.html')).href)event.preventDefault();});
  created.once('ready-to-show',()=>{if(tab!==created||created.isDestroyed())return;place();if(folded&&shown)created.showInactive();});const id=created.webContents.id;created.on('closed',()=>{tabs.delete(id);if(tab===created)tab=null;});created.loadFile(path.join(root,'src/peek.html'));
 }
 function cancelRelease(){clearTimeout(releaseTimer);releaseTimer=null;}
 function fold(){if(!getWindow())return;cancelRelease();folded=true;shown=true;getWindow().hide();if(!tab)create();else{place();tab.showInactive();}}
 function sync(visible=true,onTop=true){if(!folded)return;shown=visible;if(!tab)return;place();if(tab.isAlwaysOnTop()!==onTop)tab.setAlwaysOnTop(onTop,'floating');if(visible&&!tab.isVisible())tab.showInactive();else if(!visible&&tab.isVisible())tab.hide();}
 function unfold(){folded=false;shown=false;tab?.hide();if(tab&&!releaseTimer){const idle=tab;
  // Let the restore IPC finish before releasing its sender. Repeated show/sync
  // calls must not postpone cleanup; a quick fold can still reuse this tab.
  releaseTimer=setTimeout(()=>{releaseTimer=null;if(!folded&&tab===idle){tab=null;if(!idle.isDestroyed())idle.destroy();}},250);releaseTimer.unref?.();}}
 function restore(){unfold();onRestore();return true;}
 return {fold,sync,unfold,active:()=>folded,visible:()=>folded&&shown,destroy:()=>{cancelRelease();folded=false;shown=false;const closing=tab;tab=null;closing?.destroy();}};
};
