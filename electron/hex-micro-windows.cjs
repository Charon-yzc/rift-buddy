const path=require('node:path');const {pathToFileURL}=require('node:url');
const {HEX_WINDOWS,hexMicroPlacement,hexMicroOffset,hexMicroPayload}=require('../src/core/hex-micro.mjs');
const {fitWindow}=require('../src/core/window-placement.mjs');
const {hexMicroHint}=require('../src/core/hex-micro-hint.mjs');
const {orderHexCards}=require('../src/core/hex-route-card.mjs');
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

module.exports=function createHexMicroWindows({root,getState,setState,getPayload,getArea,getGameBounds,getScale,isActive,isQuitting,onHide,onChange,diagnostic,getPreferences=()=>({})}){
 const {BrowserWindow,ipcMain,screen}=require('electron'),entries=Object.fromEntries(HEX_WINDOWS.map(kind=>[kind,{win:null,requested:false,ready:false,adjusting:false,last:'',timer:null,payload:null}]));
 let everShown=false,suspended=true,placementWrites=Promise.resolve(),placementEpoch=0,resetting=0,tooltip=null,hoverSerial=0,tipKey='',tipKind=null;
 let routeSession=null,expanded=false,pinned=[];
 const active=()=>isActive();
 const enabled=kind=>kind==='economy'?getPreferences().guideEconomy!==false:getState()?.selection?.mode==='hex'&&getPreferences().guideEquipment!==false;
 const visible=()=>Object.values(entries).some(e=>e.win&&!e.win.isDestroyed()&&e.win.isVisible());
 const requested=()=>Object.values(entries).some(e=>e.requested);
 function hideTooltip(){hoverSerial++;tipKey='';tipKind=null;if(tooltip&&!tooltip.isDestroyed())tooltip.hide();}
 function fit(kind){const e=entries[kind];if(!e.win||e.win.isDestroyed()||e.timer)return;const b=hexMicroPlacement(kind,getState()?.hexWindows?.[kind],getArea(),getGameBounds(),getScale(),e.payload?.routes,e.payload?.expanded),old=e.win.getBounds();if(['x','y','width','height'].some(k=>Math.abs(old[k]-b[k])>2)){if(tipKind===kind)hideTooltip();e.regions=[];e.adjusting=true;e.win.setBounds(b);e.adjusting=false;}}
 function remember(kind){const e=entries[kind];clearTimeout(e.timer);e.timer=null;if(resetting||!e.win||e.win.isDestroyed()||!getState())return;const epoch=placementEpoch,offset=hexMicroOffset(e.win.getBounds(),getArea(),getGameBounds());
  placementWrites=placementWrites.then(async()=>{if(epoch!==placementEpoch)return;const state=getState();if(!state)return;await setState({...state,hexWindows:{...state.hexWindows,[kind]:offset}},state);onChange();}).catch(error=>diagnostic('hex micro placement not saved '+error.message));return placementWrites;
 }
 async function reset(clear=()=>{}){resetting++;placementEpoch++;for(const e of Object.values(entries)){clearTimeout(e.timer);e.timer=null;}hideTooltip();try{await placementWrites;await clear();}finally{resetting--;}}
 function publish(value=getPayload()){
  for(const kind of HEX_WINDOWS){const e=entries[kind],next=hexMicroPayload(value,kind);
   if(kind==='routes'){
    if(next.session!==routeSession){routeSession=next.session;expanded=false;pinned=[];}
    pinned=pinned.filter(id=>next.routes?.some(r=>r.id===id));
    if(next.active){next.routes=orderHexCards(next.routes,pinned);next.expanded=expanded;}
   }
   const key=JSON.stringify(next);e.payload=next;
   if(e.last!==key){e.last=key;e.regions=[];if(tipKind===kind)hideTooltip();if(e.win&&!e.win.isDestroyed())e.win.webContents.send('hex-micro-update',next);}
   if(e.win&&!e.win.isDestroyed()){fit(kind);if(suspended||!active()||!enabled(kind)||!e.requested||!next.active){if(tipKind===kind)hideTooltip();e.win.hide();}}
  }
 }
 function create(kind){const e=entries[kind],bounds=hexMicroPlacement(kind,getState()?.hexWindows?.[kind],getArea(),getGameBounds(),getScale(),e.payload?.routes,e.payload?.expanded);
  const win=new BrowserWindow({...bounds,frame:false,show:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,transparent:true,backgroundColor:'#00000000',title:'开黑搭子 · '+(kind==='economy'?'公开装备价值':'海克斯路线'),icon:path.join(root,'assets/icon.png'),webPreferences:{preload:path.join(root,'electron/hex-micro-preload.cjs'),additionalArguments:['--rift-hex-window='+kind],contextIsolation:true,nodeIntegration:false,sandbox:true}});e.win=win;e.ready=false;
  win.setAlwaysOnTop(true,'screen-saver');win.setIgnoreMouseEvents(true,{forward:true});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const url=pathToFileURL(path.join(root,'src/hex-micro.html')).href;win.webContents.on('will-navigate',(event,next)=>{if(next!==url)event.preventDefault();});
  win.once('ready-to-show',()=>{if(e.win!==win||win.isDestroyed())return;e.ready=true;if(!suspended&&active()&&enabled(kind)&&e.payload?.active&&e.requested)win.showInactive();publish();});
  win.on('move',()=>{hideTooltip();if(e.adjusting||resetting)return;clearTimeout(e.timer);e.timer=setTimeout(()=>remember(kind),350);});
  win.on('close',event=>{if(!isQuitting()){event.preventDefault();close(kind);}});
  win.on('closed',()=>{clearTimeout(e.timer);e.timer=null;e.win=null;e.ready=false;e.last='';hideTooltip();});win.loadFile(path.join(root,'src/hex-micro.html'));
 }
 function close(kind){const e=entries[kind];e.requested=false;e.win?.hide();hideTooltip();onHide();}
 function show(value=getPayload()){everShown=true;for(const e of Object.values(entries))e.requested=true;resume(value);}
 function resume(value=getPayload()){if(!everShown){show(value);return;}suspended=false;publish(value);if(!active())return;for(const kind of HEX_WINDOWS){const e=entries[kind];if(!e.requested||!enabled(kind)||!e.payload?.active)continue;if(!e.win)create(kind);else if(e.ready){fit(kind);e.win.showInactive();}}}
 function suspend(){suspended=true;hideTooltip();for(const e of Object.values(entries))e.win?.hide();}
 function hide(){for(const e of Object.values(entries))e.requested=false;suspend();}
 function guard(name,fn){ipcMain.handle(name,(event,kind,...args)=>{const e=entries[kind];if(!e?.win||event.sender!==e.win.webContents||event.senderFrame!==e.win.webContents.mainFrame)throw Error('不允许此操作');return fn(kind,...args);});}
 guard('hex-micro-bootstrap',kind=>{publish();return entries[kind].payload;});
 guard('hex-micro-control',(kind,action,input)=>{
  if(action==='tooltip-hide'){hideTooltip();return true;}
  const e=entries[kind],p=e.payload;if(!active()||!enabled(kind)||!e.requested)return false;
  if(action==='hide'){close(kind);return true;}
  if(['expand','pin'].includes(action)){
   if(kind!=='routes'||!e.win.isVisible()||!p?.active||input?.context!==p.context)return false;
   if(action==='expand'){if(p.routes.length<=3)return false;expanded=!expanded;}
   else {if(!expanded||!p.routes.some(r=>r.id===input.id))return false;pinned=[input.id,...pinned.filter(id=>id!==input.id)].slice(0,30);}
   hideTooltip();publish();return true;
  }
  throw Error('不支持此操作');
 });
 // Only bounded control hit areas can interrupt game click-through. The
 // renderer refreshes them after scrolling; icon bodies remain transparent.
 guard('hex-micro-regions',(kind,input)=>{
  const e=entries[kind],p=e.payload;e.regions=[];
  if(kind!=='routes'||input?.context!==p?.context||!Array.isArray(input.rows)||input.rows.length>32)return false;
  const b=e.win.getBounds(),s=p.scale||1;
  e.regions=input.rows.filter(r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=b.width+1&&r.y+r.height<=b.height+1&&(
   r.action==='expand'&&p.routes.length>3&&r.width<=26*s&&r.height<=22*s||
   r.action==='pin'&&p.expanded&&p.routes.some(route=>route.id===r.id)&&r.width<=18*s&&r.height<=30*s||
   r.action==='scroll'&&r.width<=12*s&&r.x>=b.width-20*s));
  return true;
 });
 guard('hex-micro-hover',async(kind,input)=>{
  if(!input){if(tipKind===kind)hideTooltip();return false;}
  const e=entries[kind],p=e.payload;if(!active()||!enabled(kind)||!e.requested||!e.win.isVisible()||!p?.active||input.context!==p.context)return false;
  let name,brief;
  if(kind==='economy'){
   const player=p.equipment?.available&&p.equipment[input.side]?.players?.find(row=>row.id===input.id);if(!player||!['ally','enemy'].includes(input.side))return false;
   name=player.name;brief=player.known&&Number.isFinite(player.value)?'公开装备标价 '+Math.floor(player.value)+' 金；不含未花金币。':'装备尚未读全。';
  }else if(input.kind==='status'&&!p.routes.length){name=p.hero?.name;brief=p.pending;}else{
   const route=p.routes.find(row=>row.id===input.route),list=input.kind==='augment'?route?.augments:input.kind==='item'?route?.items:null,entry=list?.find(row=>String(row.id)===String(input.id));if(!entry)return false;
   ({name,brief}=hexMicroHint(route,entry,input.kind));
  }
  const r=input.rect,b=e.win.getBounds();if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>b.width+1||r.y+r.height>b.height+1)return false;
  const key=JSON.stringify([kind,p.context,name,brief,r]);if(key===tipKey)return true;hideTooltip();tipKey=key;tipKind=kind;const serial=hoverSerial;
  if(!tooltip){tooltip=new BrowserWindow({width:190,height:96,frame:false,show:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,transparent:true,backgroundColor:'#00000000',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});tooltip.setAlwaysOnTop(true,'screen-saver');tooltip.setIgnoreMouseEvents(true);tooltip.webContents.setWindowOpenHandler(()=>({action:'deny'}));}
  const title=String(name).slice(0,48),text=String(brief).slice(0,100),html='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>*{box-sizing:border-box}html,body{margin:0;background:transparent}body{font:11px/16px "Microsoft YaHei UI",sans-serif;color:#ced9df;padding:6px 8px;background:#0b1626f5;border:1px solid #52606c;border-radius:4px}b{display:block;color:#e8dfc9;margin-bottom:3px;font-weight:600}p{margin:0;overflow-wrap:anywhere}</style><b>'+escape(title)+'</b><p>'+escape(text)+'</p>';
  try{await tooltip.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));if(serial!==hoverSerial||!active()||!enabled(kind)||!e.requested||!e.win.isVisible())return false;const height=Math.min(136,Math.max(38,await tooltip.webContents.executeJavaScript('Math.ceil(document.body.getBoundingClientRect().height)')));if(serial!==hoverSerial||!active()||!enabled(kind)||!e.requested||!e.win?.isVisible())return false;const area=getArea(),width=Math.min(190,area.width),x=kind==='economy'?b.x+b.width+5:b.x-width-5,next=fitWindow({x,y:b.y+r.y,width,height},area,{minWidth:width,maxWidth:width,minHeight:height,maxHeight:height});tooltip.setBounds(next);tooltip.showInactive();return true;}catch{if(serial===hoverSerial)hideTooltip();return false;}
 });
 // Forward pointer coordinates without intercepting game clicks. Only the
 // six-pixel drag strip and its hover controls temporarily accept mouse input.
 const pointer=setInterval(()=>{for(const kind of HEX_WINDOWS){const e=entries[kind],win=e.win;if(!win||win.isDestroyed()||!win.isVisible()||!active())continue;const p=screen.getCursorScreenPoint(),b=win.getBounds(),x=p.x-b.x,y=p.y-b.y,inside=x>=0&&y>=0&&x<b.width&&y<b.height,s=e.payload?.scale||1,control=e.regions?.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height);win.setIgnoreMouseEvents(!(inside&&(y<6*s||x>b.width-20*s&&y<16*s||control)),{forward:true});win.webContents.send('hex-micro-pointer',inside?{x,y}:null);}},120);pointer.unref?.();
 return {show,resume,suspend,hide,publish,visible,requested,reset,fit:()=>{for(const k of HEX_WINDOWS)fit(k);},info:()=>Object.fromEntries(HEX_WINDOWS.map(k=>[k,{requested:entries[k].requested,visible:!!entries[k].win?.isVisible(),bounds:entries[k].win?.getBounds()}])),destroy:()=>{placementEpoch++;clearInterval(pointer);hideTooltip();tooltip?.destroy();for(const e of Object.values(entries)){clearTimeout(e.timer);e.win?.destroy();}}};
};
