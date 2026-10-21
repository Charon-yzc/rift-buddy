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
