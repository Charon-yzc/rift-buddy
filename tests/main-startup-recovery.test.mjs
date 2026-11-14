// Run the real main window and IPC functions with mocked Electron surfaces.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {EventEmitter} from 'node:events';
import * as placement from '../src/core/window-placement.mjs';
const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const bootWindowLine=source.split('\n').find(line=>line.trim().startsWith('Menu.setApplicationMenu(null);'));
assert(bootWindowLine);
function fixture(){
 const windows=[],events=new Map(),ipc=new Map(),loads=[];
 class Window extends EventEmitter{
  constructor(options){super();this.bounds=options;this.visible=false;this.destroyed=false;this.minimized=false;this.focused=0;this.webContents=new EventEmitter();Object.assign(this.webContents,{id:windows.length+1,mainFrame:{},setWindowOpenHandler(){},send(){}});windows.push(this);}
  loadFile(){loads.push({id:this.webContents.id,bootstrapRegistered:ipc.has('bootstrap')});}
  isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}isMinimized(){return this.minimized;}
  show(){this.visible=true;}showInactive(){this.visible=true;}hide(){this.visible=false;}focus(){this.focused++;}restore(){this.minimized=false;}
  getBounds(){return this.bounds;}destroy(){this.destroyed=true;this.visible=false;this.emit('closed');}
 }
 const peek={folded:false,unfold(){this.folded=false;},destroy(){this.folded=false;}};
 const c=vm.createContext({win:undefined,data:{champions:[]},state:{preferences:{}},rendererReady:false,mainBootReady:false,mainDismissed:false,mainExplicitInGame:false,quitting:false,
  root:'D:/fixture',__dirname:'D:/fixture/electron',path,pathToFileURL,process:{env:{}},BrowserWindow:Window,mainRequests:new Map(),companion:null,inGame:()=>false,observedWindows:null,observedAt:0,OBSERVATION_MAX_AGE_MS:5000,mainPeek:peek,mainRelease:{cancel(){},activity(){},request(){}},diagnostic(){},latestClient:{connected:false,phase:'Offline'},
  screen:{getPrimaryDisplay:()=>({bounds:{x:0,y:0,width:1920,height:1080}}),getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})},require:()=>placement,app:{on:(name,fn)=>events.set(name,fn)},ipcMain:{handle:(name,fn)=>ipc.set(name,fn)},Menu:{setApplicationMenu(){}}
 });
 const start=source.indexOf('function showMainWindow(){'),end=source.indexOf('async function boot(){');assert(start>=0&&end>start);
 const helpers=source.split('\n').filter(line=>line.startsWith('function appWindows()')||line.startsWith('const shouldHideMainForGame='));assert.equal(helpers.length,2);
 vm.runInContext(helpers.join('\n')+'\n'+source.slice(start,end),c);
 const open=()=>events.get('second-instance')(null,[]);
 const bootstrap=window=>ipc.get('bootstrap')({sender:window.webContents,senderFrame:window.webContents.mainFrame});
 const finishBoot=()=>{vm.runInContext('guard("bootstrap",()=>({ok:true}));'+bootWindowLine,c);windows.at(-1)?.emit('ready-to-show');};
 return {c,windows,loads,peek,open,finishBoot,bootstrap};
}

test('double opening during data preparation waits for bootstrap and creates one fresh usable main window',async()=>{
 const f=fixture();f.open();f.open();
 assert.equal(f.windows.length,0,'Having loaded data does not mean the bootstrap IPC and window controllers are ready');
 f.finishBoot();assert.equal(f.windows.length,1);assert.equal(f.loads[0].bootstrapRegistered,true);assert.equal((await f.bootstrap(f.windows[0])).ok,true);
});

test('second-instance still restores the existing minimized or folded main, then recreates a closed main',async()=>{
 const f=fixture();f.finishBoot();const first=f.windows[0];first.minimized=true;f.open();assert.equal(first.minimized,false);assert.equal(first.focused,1);assert.equal(f.windows.length,1);
 f.peek.folded=true;first.visible=false;f.open();assert.equal(f.peek.folded,false);assert(first.visible);assert.equal(f.windows.length,1);
 first.emit('close');first.destroy();assert.equal(f.c.win,null);f.open();const replacement=f.windows[1];replacement.emit('ready-to-show');assert.equal(f.windows.length,2);assert.equal(f.c.win,replacement);assert.equal((await f.bootstrap(replacement)).ok,true);
});

test('the original window guard continues to reject an unrelated sender',async()=>{
 const f=fixture();f.finishBoot();const stranger={webContents:{mainFrame:{}}};await assert.rejects(f.bootstrap(stranger),/不允许此操作/);
});

test('a fresh native game observation keeps automatic startup hidden while an explicit open still works',()=>{
 const f=fixture();f.c.observedWindows={game:{}};f.c.observedAt=Date.now();f.finishBoot();assert.equal(f.windows[0].visible,false);
 f.open();assert.equal(f.windows[0].visible,true);assert.equal(f.windows[0].focused,1);
 const stale=fixture();stale.c.observedWindows={game:{}};stale.c.observedAt=Date.now()-6000;stale.finishBoot();assert.equal(stale.windows[0].visible,true);
});
