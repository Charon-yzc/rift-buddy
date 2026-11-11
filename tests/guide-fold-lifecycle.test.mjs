import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';

const source=new URL('../electron/guide-window.cjs',import.meta.url),nativeRequire=createRequire(source);
function fixture(prepareCurrent,{autoShow=true}={}){
 const windows=[],handlers=new Map(),polls=[],area={x:0,y:0,width:1920,height:1040};let cursor={x:0,y:0};
 let state={selection:{id:'Ashe',role:'bottom',mode:'rift'},match:{gameId:'1'},clickThrough:true,compactBounds:{x:100,y:100,width:350,height:260}};
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.bounds={x:0,y:0,...options};this.visible=false;this.focusable=options.focusable;this.sent=[];this.webContents=new EventEmitter();Object.assign(this.webContents,{id:windows.length+1,mainFrame:{},send:(channel,payload)=>this.sent.push({channel,payload}),getZoomFactor:()=>this.zoom||1,setWindowOpenHandler(){}});windows.push(this);}
  getBounds(){const {x,y,width,height}=this.bounds;return {x,y,width,height};}setBounds(value){this.bounds=value;}setMinimumSize(){}setResizable(){}setOpacity(){}setAlwaysOnTop(){}isAlwaysOnTop(){return true;}setIgnoreMouseEvents(value){this.ignored=value;}
  isDestroyed(){return !!this.destroyed;}isVisible(){return this.visible;}isMinimized(){return false;}isFocused(){return false;}isFocusable(){return this.focusable;}setFocusable(value){this.focusable=value;}
  hide(){this.visible=false;}showInactive(){this.visible=true;this.shows=(this.shows||0)+1;}loadFile(){}destroy(){this.destroyed=true;this.visible=false;this.emit('closed');}
 }
 const screen=Object.assign(new EventEmitter(),{getPrimaryDisplay:()=>({bounds:area}),getDisplayMatching:()=>({workArea:area}),getCursorScreenPoint:()=>cursor});
 const electron={BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},screen};
 const quiet=new Proxy({},{get:()=>()=>false});
 function load(file){const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,process,setTimeout,clearTimeout,setInterval:fn=>{polls.push(fn);return {unref(){}};},clearInterval(){},require:name=>name==='electron'?electron:['./window-peek.cjs','./window-resize.cjs'].includes(name)?load(new URL('../electron/'+name.slice(2),import.meta.url)):['./skill-window.cjs','./jungle-window.cjs','./hex-micro-windows.cjs'].includes(name)?()=>quiet:nativeRequire(name)});return module.exports;}
 const guide=load(source)({root:'D:/isolated-guide',getState:()=>state,setState:async next=>{state=next;},getModel:()=>({mode:'rift',champion:{id:'Ashe'},live:{matched:true}}),currentSelection:()=>state.selection,prepareCurrent,isQuitting:()=>true,showMain(){},diagnostic(){},getPreferences:()=>({guideAutoShow:autoShow})});
 const call=(window,channel,...args)=>handlers.get(channel)({sender:window.webContents,senderFrame:window.webContents.mainFrame},...args);
 return {guide,windows,call,state:()=>state,ready:()=>windows.forEach(window=>window.emit('ready-to-show')),poll:()=>polls.forEach(fn=>fn()),cursor:value=>{cursor=value;}};
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

async function pointerFixture(){const f=fixture(async()=>true,{autoShow:false});f.guide.setInteractionHotkey(true);f.guide.show();f.ready();await f.guide.phase('InProgress',true);return {...f,gear:f.guide.window()};}
function query(f,x,y){const b=f.gear.getBounds();f.cursor({x:b.x+x,y:b.y+y});const count=f.gear.sent.length;f.poll();const message=f.gear.sent.slice(count).find(row=>row.channel==='guide-pointer');assert(message,'The OS fallback must ask the real renderer, not infer a fixed strip');return message.payload;}

test('guide pointer fallback releases body input and reuses renderer header/grip hits at the current zoom',async()=>{
 const f=await pointerFixture();try{
  const body=query(f,12,35);assert.equal(f.gear.ignored,true);f.call(f.gear,'guide-hover',false,body.id);assert.equal(f.gear.ignored,true,'The old 44px strip must not claim body input');
  const header=query(f,12,10);f.call(f.gear,'guide-hover',true,header.id);assert.equal(f.gear.ignored,false);
  const lower=query(f,12,90);f.call(f.gear,'guide-hover',false,lower.id);assert.equal(f.gear.ignored,true,'The poll must release the header even when no DOM move arrives');
  f.gear.zoom=1.25;const grip=query(f,325,245);assert.equal(grip.x,260);assert.equal(grip.y,196);f.call(f.gear,'guide-hover',true,grip.id);assert.equal(f.gear.ignored,false);
  f.cursor({x:-100,y:-100});f.poll();assert.equal(f.gear.ignored,true,'Leaving the window cannot wait for a renderer reply');
 }finally{f.guide.destroy();}
});

for(const change of ['cursor-body','outside','bounds','hide','new-game','pass-off-on','resize','dom-move'])test(`guide pointer fallback rejects a late reply after ${change}`,async()=>{
 const f=await pointerFixture();try{
  const held=query(f,12,10);const b=f.gear.getBounds();
  if(change==='cursor-body')f.cursor({x:b.x+12,y:b.y+90});
  if(change==='outside')f.cursor({x:-100,y:-100});
  if(change==='bounds')f.gear.setBounds({...b,width:b.width+10});
  if(change==='hide')await f.call(f.gear,'guide-control','hide');
  if(change==='new-game'){f.state().match.gameId='2';await f.guide.phase('InProgress',true);}
  if(change==='pass-off-on'){await f.guide.interact();await f.guide.interact();}
  if(change==='resize')await f.call(f.gear,'guide-control','resize-start');
  if(change==='dom-move')f.call(f.gear,'guide-hover',false);
  f.call(f.gear,'guide-hover',change!=='resize',held.id);assert.equal(f.gear.ignored,change!=='resize');
 }finally{f.guide.destroy();}
});

test('one unanswered guide query does not block a reloaded renderer and its old ticket stays stale',async()=>{
 const f=await pointerFixture();try{
  const held=query(f,12,10),before=f.gear.sent.length;f.poll();f.poll();assert.equal(f.gear.sent.length,before,'Healthy polls must not stack unresolved queries');
  f.gear.webContents.emit('did-finish-load');const fresh=query(f,12,10);assert.notEqual(fresh.id,held.id);
  f.call(f.gear,'guide-hover',true,held.id);assert.equal(f.gear.ignored,true,'The old reply cannot consume or apply the new query');
  f.call(f.gear,'guide-hover',true,fresh.id);assert.equal(f.gear.ignored,false,'The real header can recover after load');
  f.guide.destroy();assert.throws(()=>f.call(f.gear,'guide-hover',true,fresh.id),/不允许/);
 }finally{if(!f.gear.isDestroyed())f.guide.destroy();}
});
