import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';

const source=new URL('../electron/guide-window.cjs',import.meta.url),nativeRequire=createRequire(source);
function fixture(prepareCurrent){
 const windows=[],handlers=new Map(),area={x:0,y:0,width:1920,height:1040};
 let state={selection:{id:'Ashe',role:'bottom',mode:'rift'},match:{gameId:'1'},compactBounds:{x:100,y:100,width:350,height:260}};
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.bounds={x:0,y:0,...options};this.visible=false;this.focusable=options.focusable;this.webContents=new EventEmitter();Object.assign(this.webContents,{id:windows.length+1,mainFrame:{},send(){},setWindowOpenHandler(){}});windows.push(this);}
  getBounds(){const {x,y,width,height}=this.bounds;return {x,y,width,height};}setBounds(value){this.bounds=value;}setMinimumSize(){}setResizable(){}setOpacity(){}setAlwaysOnTop(){}isAlwaysOnTop(){return true;}setIgnoreMouseEvents(){}
  isDestroyed(){return !!this.destroyed;}isVisible(){return this.visible;}isMinimized(){return false;}isFocused(){return false;}isFocusable(){return this.focusable;}setFocusable(value){this.focusable=value;}
  hide(){this.visible=false;}showInactive(){this.visible=true;this.shows=(this.shows||0)+1;}loadFile(){}destroy(){this.destroyed=true;this.visible=false;this.emit('closed');}
 }
 const screen=Object.assign(new EventEmitter(),{getPrimaryDisplay:()=>({bounds:area}),getDisplayMatching:()=>({workArea:area}),getCursorScreenPoint:()=>({x:0,y:0})});
 const electron={BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},screen};
 const quiet=new Proxy({},{get:()=>()=>false});
 function load(file){const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,process,setTimeout,clearTimeout,setInterval:()=>({unref(){}}),clearInterval(){},require:name=>name==='electron'?electron:name==='./window-peek.cjs'?load(new URL('../electron/window-peek.cjs',import.meta.url)):['./skill-window.cjs','./jungle-window.cjs','./hex-micro-windows.cjs','./window-resize.cjs'].includes(name)?()=>quiet:nativeRequire(name)});return module.exports;}
 const guide=load(source)({root:'D:/isolated-guide',getState:()=>state,setState:async next=>{state=next;},getModel:()=>({mode:'rift',champion:{id:'Ashe'},live:{matched:true}}),currentSelection:()=>state.selection,prepareCurrent,isQuitting:()=>true,showMain(){},diagnostic(){},getPreferences:()=>({guideAutoShow:true})});
 const call=(window,channel,...args)=>handlers.get(channel)({sender:window.webContents,senderFrame:window.webContents.mainFrame},...args);
 return {guide,windows,call,state:()=>state,ready:()=>windows.forEach(window=>window.emit('ready-to-show'))};
}

test('folding equipment during delayed automatic preparation preserves the edge tab until explicitly restored',async()=>{
 let release;const prepared=new Promise(resolve=>{release=resolve;}),f=fixture(()=>prepared);
 try{
  f.guide.show();f.ready();const gear=f.guide.window(),saved=f.state().compactBounds;
  const flight=f.guide.phase('InProgress',true);
  await f.call(gear,'guide-control','fold');f.ready();const tab=f.windows.find(window=>window.options.webPreferences.preload.endsWith('peek-preload.cjs'));
  assert(!gear.isVisible());assert(tab.isVisible());
  release(true);await flight;f.guide.publish();
  assert(!gear.isVisible(),'The delayed automatic display unfolded the player-folded card');assert(tab.isVisible());
  for(const phase of ['InProgress','Reconnect','InProgress'])await f.guide.phase(phase,true);
  assert(!gear.isVisible());assert(tab.isVisible());assert.deepEqual(f.state().compactBounds,saved);
  assert.equal(f.call(tab,'peek-control','restore'),true);assert(gear.isVisible());assert(!tab.isVisible());
  assert.deepEqual(gear.getBounds(),saved);
  await f.call(gear,'guide-control','fold');f.state().match.gameId='2';await f.guide.phase('InProgress',true);
  assert(gear.isVisible(),'A later game still gets its own automatic display');assert.deepEqual(gear.getBounds(),saved);
 }finally{release(true);f.guide.destroy();}
});
