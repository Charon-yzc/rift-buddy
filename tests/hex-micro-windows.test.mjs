import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const area={x:0,y:0,width:1920,height:1040};
const root=fileURLToPath(new URL('..',import.meta.url));
function setup(){
 const file=new URL('../electron/hex-micro-windows.cjs',import.meta.url),nativeRequire=createRequire(file),handlers={},windows=[],intervals=[],timers=new Map();let nextTimer=0;
 let state={selection:{mode:'hex'},hexWindows:{}},active=true,cursor={x:0,y:0},height=()=>Promise.resolve(70),saves=0,write=async next=>{state=next;};
 const value={referenceRevision:1,model:{mode:'hex',champion:{id:'Yasuo',name:'亚索'},matchId:'5',equipment:{available:true,ally:{players:[{id:'Yasuo',name:'亚索',known:true,value:300}]},enemy:{players:[]}},hexMicroRoutes:[]}};
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.bounds={x:options.x||0,y:options.y||0,width:options.width,height:options.height};this.visible=false;this.shows=0;this.sent=[];this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.send=(...args)=>this.sent.push(args);this.webContents.setWindowOpenHandler=()=>{};this.webContents.executeJavaScript=()=>height();windows.push(this);}
  getBounds(){return this.bounds;}setBounds(b){this.bounds=b;this.emit('move');}isDestroyed(){return this.destroyed===true;}isVisible(){return this.visible;}showInactive(){this.visible=true;this.shows++;}hide(){assert(!this.isDestroyed(),'must not touch a destroyed window');this.visible=false;}setAlwaysOnTop(){}setIgnoreMouseEvents(value){this.ignore=value;}loadFile(){}async loadURL(){}destroy(){this.destroyed=true;this.emit('closed');}
 }
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:name=>name==='electron'?{BrowserWindow:Window,ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}},screen:{getCursorScreenPoint:()=>cursor}}:nativeRequire(name),setInterval:fn=>{intervals.push(fn);return {unref(){}};},clearInterval(){},setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)});
 const micro=module.exports({root,getState:()=>state,setState:async(next,base)=>{saves++;await write(next,base);},getPayload:()=>value,getArea:()=>area,getGameBounds:()=>null,getScale:()=>1,isActive:()=>active,isQuitting:()=>false,onHide(){},onChange(){},showMain(){},diagnostic(){}});
 const call=(kind,name,input)=>{const win=windows.find(w=>w.options.webPreferences.additionalArguments?.includes('--rift-hex-window='+kind));return handlers[name]({sender:win.webContents,senderFrame:win.webContents.mainFrame},kind,input);};
 return {micro,windows,value,handlers,call,ready:()=>windows.filter(w=>w.options.webPreferences.preload).forEach(w=>w.emit('ready-to-show')),active:v=>{active=v;},state:v=>{if(v)state=v;return state;},writer:fn=>{write=fn;},height:fn=>{height=fn;},pointer:p=>{cursor=p;intervals.forEach(fn=>fn());},timers,saveCount:()=>saves};
}
const hover={side:'ally',id:'Yasuo',rect:{x:6,y:10,width:18,height:18}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('delayed native readiness and repeated polling cannot reopen a closed micro window',()=>{
 const s=setup();s.micro.show();assert.equal(s.windows.length,2);
 s.call('economy','hex-micro-control','hide');s.ready();assert.equal(s.windows[0].visible,false);assert.equal(s.windows[1].visible,true);
 for(let i=0;i<6;i++){s.value.model.live={gameTime:i};s.micro.publish();s.micro.fit();}
 assert.equal(s.windows[0].shows,0);assert.equal(s.windows[1].visible,true);
 s.call('routes','hex-micro-control','hide');s.micro.publish();assert.equal(s.micro.visible(),false);
 s.micro.show();assert.equal(s.windows[0].visible,true);assert.equal(s.windows[1].visible,true);
 s.active(false);s.micro.publish();s.ready();assert.equal(s.micro.visible(),false);s.micro.destroy();
});

test('tooltip survives unchanged observer bounds; body clicks pass through and delayed measurements cannot resurrect it',async()=>{
 const s=setup();s.micro.show();s.ready();const economy=s.windows[0],p=s.call('economy','hex-micro-bootstrap');
 assert.equal(await s.call('economy','hex-micro-hover',{...hover,context:p.context}),true);const tip=s.windows[2];assert.equal(tip.visible,true);assert.equal(tip.options.focusable,false);assert.equal(tip.ignore,true);
 for(let i=0;i<10;i++){s.micro.fit();s.micro.publish();}assert.equal(tip.visible,true);
 s.call('routes','hex-micro-hover',null);assert.equal(tip.visible,true,'another window clearing its hover cannot dismiss this tooltip');
 const b=economy.bounds;s.pointer({x:b.x+20,y:b.y+30});assert.equal(economy.ignore,true);s.pointer({x:b.x+20,y:b.y+2});assert.equal(economy.ignore,false);s.pointer({x:b.x+b.width-10,y:b.y+10});assert.equal(economy.ignore,false);
 let resolve;s.height(()=>new Promise(r=>{resolve=r;}));const flight=s.call('economy','hex-micro-hover',{...hover,rect:{...hover.rect,x:30},context:p.context});await tick();s.call('economy','hex-micro-control','hide');resolve(70);assert.equal(await flight,false);assert.equal(tip.visible,false);
 assert.throws(()=>s.handlers['hex-micro-control']({sender:{},senderFrame:{}},'routes','hide'),/不允许/);s.micro.destroy();
});

test('layout recovery cancels pending drag persistence before clearing offsets',async()=>{
 const s=setup();s.micro.show();s.ready();const win=s.windows[0];win.setBounds({...win.bounds,x:450,y:300});assert.equal(s.timers.size,1);
 await s.micro.reset();s.state({...s.state(),hexWindows:undefined});s.micro.fit();for(const fn of s.timers.values())await fn();
 assert.equal(s.saveCount(),0);assert.equal(win.bounds.x,12);assert.equal(win.bounds.y,12);s.micro.destroy();
});

test('recovery drains an already saving drag before taking the latest state, preserving both independent positions',async()=>{
 for(const initial of [undefined,{economy:{x:40,y:60}}]){
  const s=setup();s.state({...s.state(),hexWindows:initial});s.micro.show();s.ready();let release,entered=false,resetDone=false;
  s.writer(async(next,base)=>{assert.equal(base,s.state());entered=true;await new Promise(r=>{release=r;});s.state(next);});
  const win=s.windows[0];win.setBounds({...win.bounds,x:450,y:300});const save=[...s.timers.values()][0]();await tick();assert(entered);
  const reset=s.micro.reset().then(()=>{resetDone=true;});await tick();assert.equal(resetDone,false,'cannot clear offsets using a pre-save state');release();await save;await reset;
  s.state({...s.state(),hexWindows:undefined});s.micro.fit();assert.equal(win.bounds.x,12);assert.equal(win.bounds.y,12);s.micro.destroy();
 }
});

test('a suspended new game cannot be revealed by a late ready callback or content poll',()=>{
 const s=setup();s.micro.show();s.micro.suspend();s.value.model.matchId='next-game';s.micro.publish();s.ready();assert.equal(s.micro.visible(),false);
 s.micro.resume();assert.equal(s.micro.visible(),true);s.micro.destroy();
});

test('late Rift widget ready, peek restore and controls cannot create a third Hex window',async()=>{
 for(const kind of ['skill','jungle']){
  const file=new URL('../electron/'+kind+'-window.cjs',import.meta.url),nativeRequire=createRequire(file),handlers={},windows=[];let mode='rift',restore;
  class Window extends EventEmitter{
   constructor(options){super();this.bounds=options;this.visible=false;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
   getBounds(){return this.bounds;}isDestroyed(){return false;}isVisible(){return this.visible;}showInactive(){this.visible=true;}hide(){this.visible=false;}setOpacity(){}setAlwaysOnTop(){}loadFile(){}destroy(){}
  }
  const peek={unfold(){},active:()=>false,visible:()=>false,destroy(){},sync(){}};
  const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,setTimeout,clearTimeout,require:name=>name==='electron'?{BrowserWindow:Window,ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}}}:name==='./window-peek.cjs'?options=>{restore=options.onRestore;return peek;}:name==='./window-resize.cjs'?()=>({active:()=>false,cancel(){}}):nativeRequire(name)});
  const widget=module.exports({root,getState:()=>({selection:{mode}}),setState:async()=>{},getPayload:()=>({phase:'InProgress',model:{jungle:{},live:{matched:true}}}),getArea:()=>area,getGameBounds:()=>null,getScale:()=>1,isQuitting:()=>false,onChange(){},showDetails(){throw Error('stale details must not run');},diagnostic(){}});
  widget.show();assert.equal(windows.length,1);mode='hex';widget.publish();restore();windows[0].emit('ready-to-show');assert.equal(windows[0].visible,false);
  const win=windows[0];await assert.rejects(handlers[kind+'-control']({sender:win.webContents,senderFrame:win.webContents.mainFrame},'details'),/当前模式/);widget.destroy();
 }
});


// Exercise the real guide owner and micro windows together: manual previews
// must stay editable without allowing a late legacy window over the game.
function guideOwner(){
 const file=new URL('../electron/guide-window.cjs',import.meta.url),nativeRequire=createRequire(file),handlers={},windows=[];let restore;
 let state={selection:{id:'Yasuo',mode:'hex',conditions:[]},compact:true,match:{gameId:'1'}};
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.bounds={x:options.x||0,y:options.y||0,width:options.width,height:options.height};this.visible=false;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
  getBounds(){return this.bounds;}setBounds(b){this.bounds=b;}getSize(){return [this.bounds.width,this.bounds.height];}setSize(width,height){Object.assign(this.bounds,{width,height});}setPosition(x,y){Object.assign(this.bounds,{x,y});}setMinimumSize(){}setResizable(){}setOpacity(){}setFocusable(){}isFocused(){return false;}isMinimized(){return false;}isDestroyed(){return !!this.destroyed;}isVisible(){return this.visible;}showInactive(){this.visible=true;}hide(){this.visible=false;}setAlwaysOnTop(){}setIgnoreMouseEvents(){}loadFile(){}async loadURL(){}destroy(){this.destroyed=true;this.emit('closed');}
 }
 const display={workArea:area,bounds:area},screen=Object.assign(new EventEmitter(),{getDisplayMatching:()=>display,getPrimaryDisplay:()=>display,getCursorScreenPoint:()=>({x:-100,y:-100})});
 const electron={BrowserWindow:Window,ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}},screen,clipboard:{}};
 const widget=()=>({show(){},hide(){},publish(){},fit(){},destroy(){},reset(){},visible:()=>false,info:()=>null});
 function load(url){const module={exports:{}};vm.runInNewContext(fs.readFileSync(url,'utf8'),{module,process,Buffer,setTimeout:()=>1,clearTimeout(){},setInterval:()=>({unref(){}}),clearInterval(){},require:name=>name==='electron'?electron:name==='./hex-micro-windows.cjs'?load(new URL('../electron/hex-micro-windows.cjs',import.meta.url)):['./skill-window.cjs','./jungle-window.cjs'].includes(name)?widget:name==='./window-peek.cjs'?options=>{restore=options.onRestore;return {unfold(){},destroy(){},active:()=>false,visible:()=>false,sync(){}};}:name==='./window-resize.cjs'?()=>({cancel(){},active:()=>false}):nativeRequire(name)});return module.exports;}
 const guide=load(file)({root,getState:()=>state,setState:async next=>{state=next;},getModel:()=>({mode:'hex',live:{matched:false},champion:{id:'Yasuo'},hexMicroRoutes:[]}),isQuitting:()=>false,showMain(){},diagnostic(){},currentSelection:()=>state.selection,prepareCurrent:async()=>true,getPreferences:()=>({guideAutoShow:true})});
 const legacy=()=>windows.find(w=>w.options.webPreferences.preload.endsWith('guide-preload.cjs'));
 const micro=()=>windows.filter(w=>w.options.webPreferences.additionalArguments?.some(a=>a.startsWith('--rift-hex-window=')));
 const call=(w,name,...args)=>handlers[name]({sender:w.webContents,senderFrame:w.webContents.mainFrame},...args);
 return {guide,windows,legacy,micro,call,state:()=>state,restore:()=>restore(),ready:()=>windows.forEach(w=>w.emit('ready-to-show'))};
}

test('Hex manual preview is editable; entering a game replaces it with only two micro windows',async()=>{
 const s=guideOwner();try{
  s.guide.show();s.ready();assert(s.legacy().isVisible());assert.equal(s.micro().length,0);
  await s.call(s.legacy(),'guide-control','condition','ap');assert.deepEqual([...s.state().selection.conditions],['ap']);
  await s.guide.phase('GameStart',true);s.ready();assert(s.micro().every(w=>w.isVisible()));
  await s.guide.phase('Offline',false);s.guide.publish();s.restore();s.legacy().emit('ready-to-show');assert(!s.legacy().isVisible());
  assert(s.micro().every(w=>w.isVisible()),'disconnect during first loading must retain micro windows');
  await assert.rejects(s.call(s.legacy(),'guide-control','main'),/两个精简窗口/);
  await s.guide.phase('InProgress',true);s.ready();assert.equal(s.micro().length,2);assert(s.micro().every(w=>w.isVisible()));assert(!s.legacy().isVisible());
  s.restore();s.legacy().emit('ready-to-show');assert(!s.legacy().isVisible());
  await assert.rejects(s.call(s.legacy(),'guide-control','main'),/两个精简窗口/);
  await s.guide.phase('Offline',false);s.guide.publish();assert(s.micro().every(w=>w.isVisible()));assert(!s.legacy().isVisible());
  await s.guide.phase('Reconnect',true);assert(s.micro().every(w=>w.isVisible()));
  for(const w of s.micro()){const kind=w.options.webPreferences.additionalArguments[0].split('=').at(-1);s.call(w,'hex-micro-control',kind,'hide');}
  await s.guide.phase('GameStart',true);await s.guide.phase('InProgress',true);s.ready();assert(!s.guide.isVisible(),'same-game reconnect must preserve manual hide');
 }finally{s.guide.destroy();}
});

test('Hex game exits hide every overlay instead of resurrecting the editable preview',async()=>{
 for(const exit of ['Lobby','ChampSelect','EndOfGame']){
  const s=guideOwner();try{
   await s.guide.phase('InProgress',true);s.ready();assert(s.micro().every(w=>w.isVisible()));
   await s.guide.phase('Offline',false);await s.guide.phase(exit,true);s.guide.publish();s.ready();assert(!s.guide.isVisible(),exit);
   s.guide.show();s.ready();assert(s.legacy().isVisible(),'an explicit out-of-game preview is still available');
   await s.call(s.legacy(),'guide-control','condition','heal');assert(s.state().selection.conditions.includes('heal'));
  }finally{s.guide.destroy();}
 }
});
