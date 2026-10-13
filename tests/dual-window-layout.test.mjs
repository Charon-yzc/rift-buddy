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

function fixture(){
 const windows=[],preferences={clientCompanion:true,companionWidth:440},saved=[];let client={connected:true,phase:'ChampSelect'},shown=0,id=0;
 class Window extends EventEmitter{
  constructor(options={}){super();this.bounds={x:options.x||0,y:options.y||0,width:options.width||1200,height:options.height||800};this.visible=options.show===true;this.minimum=[options.minWidth||0,options.minHeight||0];this.top=false;this.destroyed=false;this.changes=0;this.messages=[];this.webContents=new EventEmitter();this.webContents.id=++id;this.webContents.send=(...value)=>this.messages.push(value);this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
  getBounds(){return {...this.bounds};}setBounds(value){this.bounds={...value};this.changes++;this.emit('move');this.emit('resize');}getMinimumSize(){return this.minimum;}setMinimumSize(...value){this.minimum=value;}isAlwaysOnTop(){return this.top;}setAlwaysOnTop(value){this.top=value;}isVisible(){return this.visible;}showInactive(){this.visible=true;}hide(){this.visible=false;}isDestroyed(){return this.destroyed;}isMinimized(){return false;}isMaximized(){return false;}loadFile(){queueMicrotask(()=>this.emit('ready-to-show'));}destroy(){this.destroyed=true;this.visible=false;this.emit('closed');}
 }
 const main=new Window({x:100,y:100,width:1200,height:850,show:true}),before=main.getBounds();
 const peek={folded:false,fold(){this.folded=true;windows.at(-1).hide();},unfold(){this.folded=false;},active(){return this.folded;},sync(){},destroy(){this.folded=false;}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('../electron/client-companion.cjs',import.meta.url),'utf8'),{module,require:name=>name==='electron'?{screen:{getDisplayMatching:()=>({workArea:area}),getPrimaryDisplay:()=>({bounds:area})},BrowserWindow:Window}:name==='./window-peek.cjs'?()=>peek:name==='./companion-placement.cjs'?placement:nativeRequire(name),setTimeout,clearTimeout});
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
test('missing or minimized client hides only sidebar and follow resumes without moving main',async()=>{
 const f=fixture();f.companion.observe(anchor);await Promise.resolve();const side=f.companion.getWindow();f.companion.observe(null);assert.equal(side.isVisible(),false);assert.equal(f.main.isVisible(),true);f.companion.observe({...anchor,minimized:true});assert.equal(side.isVisible(),false);f.companion.observe(anchor);assert.equal(side.isVisible(),true);assert.deepEqual(f.main.getBounds(),f.before);f.companion.destroy();
});

test('the same sidebar follows lobby, matchmaking, ready check and selection without resizing main',async()=>{
 const f=fixture();f.setClient({connected:true,phase:'Lobby'});f.companion.observe(anchor);await Promise.resolve();
 const side=f.companion.getWindow();assert.ok(side?.isVisible());
 for(const phase of ['Matchmaking','ReadyCheck','ChampSelect']){f.setClient({connected:true,phase});f.companion.sync();assert.equal(f.companion.getWindow(),side);assert.ok(side.isVisible());assert.deepEqual(f.main.getBounds(),f.before);}
 f.setClient({connected:true,phase:'InProgress'});f.companion.sync();assert.equal(side.isDestroyed(),true);f.companion.destroy();
});
