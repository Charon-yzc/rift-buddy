import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
function fixture({lateClose=false}={}){
 const windows=[],handlers=new Map(),timers=new Map();let next=1,restored=0;
 class Window extends EventEmitter{
  constructor(options){super();this.bounds={x:0,y:0,...options};this.destroyed=false;this.visible=false;this.webContents=new EventEmitter();Object.assign(this.webContents,{id:next++,mainFrame:{},setWindowOpenHandler(){},send(){}});windows.push(this);}
  loadFile(){} isDestroyed(){return this.destroyed;}getBounds(){return this.bounds;}setBounds(value){this.bounds=value;}isVisible(){return this.visible;}showInactive(){this.visible=true;}hide(){this.visible=false;}isAlwaysOnTop(){return true;}setAlwaysOnTop(){}
  destroy(){this.destroyed=true;this.visible=false;if(!lateClose)this.emit('closed');}
 }
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(new URL('../electron/window-peek.cjs',import.meta.url),'utf8'),{module,require:name=>name==='electron'?{BrowserWindow:Window,ipcMain:{handle:(name,handler)=>handlers.set(name,handler)}}:nativeRequire(name),setTimeout:fn=>{const timer={unref(){}};timers.set(timer,fn);return timer;},clearTimeout:timer=>timers.delete(timer)});
 const owner={hide(){},getBounds:()=>({x:400,y:40,width:440,height:800})};
 const peek=module.exports({root:'D:/fixture',getWindow:()=>owner,getArea:()=>({x:0,y:0,width:1920,height:1080}),title:'选人侧栏',onRestore:()=>restored++});
 const invoke=(window,action,frame=window.webContents.mainFrame)=>handlers.get('peek-control')({sender:window.webContents,senderFrame:frame},action);
 return {peek,windows,timers,invoke,restored:()=>restored,flush(){for(const [timer,fn] of [...timers]){timers.delete(timer);fn();}}};
}
test('restoring a fold tab releases its renderer without extending the restore IPC or postponing release on repeated show',()=>{
 const f=fixture();f.peek.fold();const tab=f.windows[0];tab.emit('ready-to-show');assert(tab.isVisible());
 assert.throws(()=>f.invoke(tab,'restore',{}),/不允许/);assert(f.peek.active());
 assert.equal(f.invoke(tab,'restore'),true);assert.equal(f.restored(),1);assert(!f.peek.active());assert(!tab.isVisible());assert(!tab.isDestroyed());
 const timer=[...f.timers.keys()][0];f.peek.unfold();assert.equal(f.timers.size,1);assert.equal([...f.timers.keys()][0],timer);
 f.flush();assert(tab.isDestroyed());assert.throws(()=>f.invoke(tab,'bootstrap'),/不允许/);
 f.peek.fold();assert.equal(f.windows.length,2);assert(!f.windows[1].isDestroyed());f.peek.destroy();assert(f.windows[1].isDestroyed());
});
test('folding again during release grace keeps the active tab and late close callbacks cannot discard its replacement',()=>{
 const f=fixture({lateClose:true});f.peek.fold();const old=f.windows[0];f.peek.unfold();f.peek.fold();f.flush();assert(!old.isDestroyed());assert.equal(f.windows.length,1);
 f.peek.unfold();f.flush();assert(old.isDestroyed());f.peek.fold();const replacement=f.windows[1];old.emit('closed');old.emit('ready-to-show');
 f.peek.fold();assert.equal(f.windows.length,2);assert(!replacement.isDestroyed());assert.throws(()=>f.invoke(old,'bootstrap'),/不允许/);
 f.peek.destroy();f.flush();assert(replacement.isDestroyed());
});
