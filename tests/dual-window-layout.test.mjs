import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import placement from '../electron/companion-placement.cjs';
import * as windowPlacement from '../src/core/window-placement.mjs';
import {validateState,defaultState} from '../services/storage.mjs';
const area={x:0,y:0,width:1920,height:1040},anchor={x:40,y:80,width:1280,height:720,foreground:true,minimized:false};
const nativeRequire=createRequire(import.meta.url);

function fixture({timing={setTimeout,clearTimeout},initialPreferences={}}={}){
 const windows=[],preferences={clientCompanion:true,companionWidth:440,...initialPreferences},saved=[];let client={connected:true,phase:'ChampSelect'},shown=0,id=0;
 class Window extends EventEmitter{
  constructor(options={}){super();this.bounds={x:options.x||0,y:options.y||0,width:options.width||1200,height:options.height||800};this.visible=options.show===true;this.minimum=[options.minWidth||0,options.minHeight||0];this.top=false;this.destroyed=false;this.changes=0;this.messages=[];this.webContents=new EventEmitter();this.webContents.id=++id;this.webContents.send=(...value)=>this.messages.push(value);this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
  getBounds(){return {...this.bounds};}setBounds(value){this.bounds={...value};this.changes++;this.emit('move');this.emit('resize');}getMinimumSize(){return this.minimum;}setMinimumSize(...value){this.minimum=value;}isAlwaysOnTop(){return this.top;}setAlwaysOnTop(value){this.top=value;}isVisible(){return this.visible;}showInactive(){this.visible=true;}hide(){this.visible=false;}isDestroyed(){return this.destroyed;}isMinimized(){return false;}isMaximized(){return false;}loadFile(){queueMicrotask(()=>this.emit('ready-to-show'));}destroy(){this.destroyed=true;this.visible=false;this.emit('closed');}
 }
 const main=new Window({x:100,y:100,width:1200,height:850,show:true}),before=main.getBounds();
 const peek={folded:false,fold(){this.folded=true;windows.at(-1).hide();},unfold(){this.folded=false;},active(){return this.folded;},sync(){},destroy(){this.folded=false;}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('../electron/client-companion.cjs',import.meta.url),'utf8'),{module,require:name=>name==='electron'?{screen:{getDisplayMatching:()=>({workArea:area}),getPrimaryDisplay:()=>({bounds:area})},BrowserWindow:Window}:name==='./window-peek.cjs'?()=>peek:name==='./companion-placement.cjs'?placement:nativeRequire(name),setTimeout:timing.setTimeout,clearTimeout:timing.clearTimeout});
 const companion=module.exports({root:'D:/fixture',getWindow:()=>main,showMain:()=>shown++,getClient:()=>client,getPreferences:()=>preferences,savePlacement:async patch=>{saved.push(patch);for(const [key,value] of Object.entries(patch))if(value===undefined)delete preferences[key];else preferences[key]=value;},placement:windowPlacement,diagnostic:()=>{}});companion.bindWindow();
 return {companion,main,before,windows,preferences,saved,setClient:value=>client=value,getShown:()=>shown};
}
test('sidebar width stays fixed through tight side room and its height matches the client',()=>{
 for(const client of [anchor,{...anchor,x:80,width:1500},{...anchor,x:100,width:1510},{...anchor,x:120,width:1520}]){const copy=structuredClone(client),bounds=placement(client,area);assert.equal(bounds.width,440);assert.equal(bounds.height,720);assert.deepEqual(client,copy);assert.ok(bounds.x>=area.x&&bounds.x+bounds.width<=area.width);}
 const negative=placement({...anchor,x:-1400}, {...area,x:-1920});assert.equal(negative.width,440);assert.equal(negative.height,anchor.height);assert.equal(negative.side,'left');
 assert.equal(validateState(defaultState()).preferences.companionWidth,440);for(const width of [400,440,480,520,600])assert.equal(validateState({...defaultState(),preferences:{companionWidth:width}}).preferences.companionWidth,width);
});
test('main and sidebar coexist, bounds ignore rounding noise, and expansion preserves the sidebar',async()=>{
 const f=fixture();f.companion.observe(anchor);await Promise.resolve();const side=f.companion.getWindow();assert.ok(side.isVisible());assert.ok(f.main.isVisible());assert.deepEqual(f.main.getBounds(),f.before);assert.equal(f.companion.layout().docked,false);assert.equal(f.companion.layout('companion').docked,true);
 const changes=side.changes,messages=side.messages.length;for(let n=0;n<20;n++)f.companion.observe({...anchor,x:anchor.x+n%3,height:anchor.height+n%3});assert.equal(side.changes,changes);assert.equal(side.messages.length,messages);assert.equal(side.isAlwaysOnTop(),true);
 f.companion.observe({...anchor,foreground:false});assert.equal(side.isAlwaysOnTop(),false);f.companion.setMode(false);assert.equal(f.getShown(),1);assert.ok(side.isVisible());assert.deepEqual(f.main.getBounds(),f.before);f.companion.destroy();
});
test('manual sidebar placement persists, restore defaults follows again, and game start releases its renderer',async()=>{
 const f=fixture();f.companion.observe(anchor);await Promise.resolve();const side=f.companion.getWindow(),custom={x:20,y:30,width:480,height:650};side.emit('will-resize');side.setBounds(custom);await new Promise(resolve=>setTimeout(resolve,390));assert.deepEqual(f.preferences.companionBounds,custom);
 f.companion.observe({...anchor,x:140});assert.deepEqual(side.getBounds(),custom);await f.companion.reset(false,true);assert.equal(side.getBounds().width,440);assert.equal(side.getBounds().height,720);assert.equal(f.preferences.companionBounds,undefined);assert.deepEqual(f.main.getBounds(),f.before);
 f.setClient({connected:true,phase:'GameStart'});f.companion.sync();assert.equal(side.isDestroyed(),true);assert.equal(f.companion.getWindow(),null);f.setClient({connected:true,phase:'ChampSelect'});f.companion.sync();await Promise.resolve();assert.ok(f.companion.getWindow().isVisible());assert.notEqual(f.companion.getWindow(),side);f.companion.destroy();
});

function placementClock(){
 const timers=new Map();let serial=0;
 return {setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);},size:()=>timers.size,async flush(){for(const[id,fn]of [...timers]){timers.delete(id);await fn();}await Promise.resolve();}};
}
for(const release of ['native-close','dismiss','game-start','disconnect','destroy'])test(`the final manual sidebar bounds survive ${release} before the debounce and a fresh controller restart`,async()=>{
 const timing=placementClock(),f=fixture({timing});f.companion.observe(anchor);await Promise.resolve();const side=f.companion.getWindow(),custom={x:20,y:30,width:480,height:650};
 side.emit('will-move');side.setBounds({...custom,x:40});side.emit('will-resize');side.setBounds(custom);assert.equal(timing.size(),1);assert.equal(f.saved.length,0);
 if(release==='native-close'){side.emit('close');side.destroy();}
 else if(release==='dismiss')f.companion.dismiss();
 else if(release==='destroy')f.companion.destroy();
 else{f.setClient(release==='game-start'?{connected:true,phase:'GameStart'}:{connected:false,phase:'Offline'});f.companion.sync();}
 await timing.flush();assert.equal(f.saved.length,1);assert.deepEqual(f.preferences.companionBounds,custom);assert.equal(timing.size(),0);
 const restarted=fixture({timing,initialPreferences:JSON.parse(JSON.stringify(f.preferences))});restarted.companion.observe(anchor);await Promise.resolve();assert.deepEqual(restarted.companion.getWindow().getBounds(),custom);
 f.companion.destroy();restarted.companion.destroy();await timing.flush();assert.equal(f.saved.length,1,'close and release cannot duplicate a committed placement');
});

test('reset discards a pending manual placement and later release cannot restore the old bounds',async()=>{
 const timing=placementClock(),f=fixture({timing});f.companion.observe(anchor);await Promise.resolve();const side=f.companion.getWindow();
 side.emit('will-resize');side.setBounds({x:20,y:30,width:480,height:650});await f.companion.reset(false,true);f.companion.dismiss();await timing.flush();
 assert.equal(f.preferences.companionBounds,undefined);assert.equal(f.preferences.companionWidth,440);assert.equal(f.saved.length,1);assert.equal(f.saved[0].companionBounds,undefined);f.companion.destroy();
});

test('automatic sidebar following and release never persist a layout without a native user move',async()=>{
 const timing=placementClock(),f=fixture({timing});f.companion.observe(anchor);await Promise.resolve();f.companion.observe({...anchor,x:100,y:110,width:1300});
 f.companion.dismiss();await timing.flush();assert.equal(f.saved.length,0);assert.equal(f.preferences.companionBounds,undefined);f.companion.destroy();
});
test('missing or minimized client hides only sidebar and follow resumes without moving main',async()=>{
 const f=fixture();f.companion.observe(anchor);await Promise.resolve();const side=f.companion.getWindow();f.companion.observe(null);assert.equal(side.isVisible(),false);assert.equal(f.main.isVisible(),true);f.companion.observe({...anchor,minimized:true});assert.equal(side.isVisible(),false);f.companion.observe(anchor);assert.equal(side.isVisible(),true);assert.deepEqual(f.main.getBounds(),f.before);f.companion.destroy();
});

test('the same sidebar follows lobby, matchmaking, ready check and selection without resizing main',async()=>{
 const f=fixture();f.setClient({connected:true,phase:'Lobby'});f.companion.observe(anchor);await Promise.resolve();
 const side=f.companion.getWindow();assert.ok(side?.isVisible());
 for(const phase of ['Matchmaking','ReadyCheck','ChampSelect']){f.setClient({connected:true,phase});f.companion.sync();assert.equal(f.companion.getWindow(),side);assert.ok(side.isVisible());assert.deepEqual(f.main.getBounds(),f.before);}
 f.setClient({connected:true,phase:'InProgress'});f.companion.sync();assert.equal(side.isDestroyed(),true);f.companion.destroy();
});

test('a manually opened sidebar follows the whole pregame flow without enabling automatic opening',async()=>{
 const f=fixture();f.preferences.clientCompanion=false;f.setClient({connected:true,phase:'Lobby',game:{gameId:50}});f.companion.observe(anchor);await Promise.resolve();assert.equal(f.companion.getWindow(),null);
 assert.equal(f.companion.setMode(true).docked,true);await Promise.resolve();const side=f.companion.getWindow();assert.ok(side.isVisible());
 for(const phase of ['Matchmaking','ReadyCheck','ChampSelect']){f.setClient({connected:true,phase,game:{gameId:50},...(phase==='ChampSelect'?{session:{gameId:101}}:{})});f.companion.sync();assert.equal(f.companion.getWindow(),side);assert.ok(side.isVisible());assert.deepEqual(f.main.getBounds(),f.before);}
 f.companion.observe({...anchor,minimized:true});assert.equal(side.isVisible(),false);f.companion.observe({...anchor,foreground:false});assert.ok(side.isVisible());assert.equal(side.isAlwaysOnTop(),false);
 assert.equal(f.preferences.clientCompanion,false);assert.equal(f.saved.length,0);f.companion.destroy();
});

test('closing or dismissing a manually opened sidebar does not reopen it in the next pregame phase',async()=>{
 for(const close of [f=>{const side=f.companion.getWindow();side.emit('close');side.destroy();},f=>f.companion.dismiss()]){
  const f=fixture();f.preferences.clientCompanion=false;f.setClient({connected:true,phase:'Lobby'});f.companion.observe(anchor);f.companion.setMode(true);await Promise.resolve();close(f);
  f.setClient({connected:true,phase:'Matchmaking'});f.companion.sync();assert.equal(f.companion.getWindow(),null);assert.equal(f.preferences.clientCompanion,false);f.companion.destroy();
 }
});

test('closing the automatic sidebar stays closed across waiting phases and reopens for the next selection',async()=>{
 const f=fixture();f.setClient({connected:true,phase:'Lobby'});f.companion.observe(anchor);await Promise.resolve();const original=f.companion.getWindow();original.emit('close');original.destroy();
 for(const phase of ['Matchmaking','ReadyCheck','Matchmaking','Lobby','ReadyCheck']){f.setClient({connected:true,phase});f.companion.sync();await Promise.resolve();assert.equal(f.companion.getWindow(),null,phase+' belongs to the same waiting flow');}
 f.setClient({connected:true,phase:'ChampSelect',session:{gameId:101}});f.companion.sync();await Promise.resolve();assert.ok(f.companion.getWindow()?.isVisible(),'A new selection still opens the automatic sidebar');assert.equal(f.preferences.clientCompanion,true);f.companion.destroy();
});

test('a closed automatic sidebar can still be restored explicitly during the waiting flow',async()=>{
 const f=fixture();f.setClient({connected:true,phase:'Lobby'});f.companion.observe(anchor);await Promise.resolve();f.companion.dismiss();f.setClient({connected:true,phase:'ReadyCheck'});f.companion.sync();assert.equal(f.companion.getWindow(),null);
 assert.equal(f.companion.setMode(true).docked,true);await Promise.resolve();assert.ok(f.companion.getWindow()?.isVisible());assert.equal(f.preferences.clientCompanion,true);assert.equal(f.saved.length,0);f.companion.destroy();
});

test('leaving pregame, disconnecting or returning from selection clears only the temporary open request',async()=>{
 for(const boundary of [{connected:true,phase:'InProgress'},{connected:false,phase:'Offline'},{connected:true,phase:'Lobby'}]){
  const f=fixture();f.preferences.clientCompanion=false;f.setClient({connected:true,phase:'ChampSelect',session:{gameId:101}});f.companion.observe(anchor);f.companion.setMode(true);await Promise.resolve();const side=f.companion.getWindow();
  f.setClient(boundary);f.companion.sync();assert.equal(side.isDestroyed(),true);
  f.setClient({connected:true,phase:'Lobby'});f.companion.sync();assert.equal(f.companion.getWindow(),null);
  assert.equal(f.companion.setMode(true).docked,true);await Promise.resolve();assert.ok(f.companion.getWindow().isVisible());assert.equal(f.preferences.clientCompanion,false);f.companion.destroy();
 }
});

test('unknown game IDs preserve the manual request but a confirmed replacement game clears it',async()=>{
 const f=fixture();f.preferences.clientCompanion=false;f.setClient({connected:true,phase:'ChampSelect',session:{gameId:101}});f.companion.observe(anchor);f.companion.setMode(true);await Promise.resolve();const side=f.companion.getWindow();
 for(const gameId of [undefined,101]){f.setClient({connected:true,phase:'ChampSelect',session:{gameId}});f.companion.sync();assert.equal(f.companion.getWindow(),side);assert.ok(side.isVisible());}
 f.setClient({connected:true,phase:'ChampSelect',session:{gameId:202}});f.companion.sync();assert.equal(side.isDestroyed(),true);assert.equal(f.companion.getWindow(),null);assert.equal(f.preferences.clientCompanion,false);f.companion.destroy();
});
