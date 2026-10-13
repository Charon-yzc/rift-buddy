import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {escape as e} from '../src/ui.mjs';
import {jungleGuidance,changeJungleNotes} from '../src/core/jungle-guidance.mjs';
import {jungleRouteMap,routeStepButton} from '../src/jungle-route-view.mjs';
const live={matched:true,mapId:11,queueId:420,teamSide:'blue',gameTime:120,skills:{Q:1,W:1,E:1,R:0},stats:{hp:600,maxHp:1000,resource:{type:'MANA',value:400,max:500}}};
const make=(champion,notes,time=120)=>jungleGuidance({champion,notes,live:{...live,gameTime:time},role:'jungle',mode:'rift',patch:'16.20'});

async function renderer(jungle,time=120){
 let update,click;const calls=[],root={innerHTML:'',addEventListener:(type,handler)=>{if(type==='click')click=handler;}},api={bootstrap:async()=>({jungle,time}),onUpdate:fn=>{update=fn;},control:async(...args)=>calls.push(args)};
 const source=fs.readFileSync(new URL('../src/jungle.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 await vm.runInNewContext(`(async()=>{${source}\n})()`,{document:{getElementById:()=>root},window:{jungleWidget:api},e,jungleRouteMap,routeStepButton,applyPresentation:()=>{},windowResizeGrip:'',installWindowResize:()=>{}});
 return {html:()=>root.innerHTML,update:(j,time)=>update({jungle:j,time}),click:async value=>click({target:{closest:()=>({dataset:{action:'note',value},isConnected:false})}}),calls};
}
const route=html=>html.match(/<div class="route"[^>]*>([\s\S]*?)<\/div>/)?.[1]||'';
test('the actual jungle renderer replaces an early opening with recovery camps and keeps stage controls separate',async()=>{
 for(const champion of ['Elise','Lillia']){
  const view=await renderer(make(champion));assert.match(route(view.html()),/红BUFF/);assert.match(view.html(),/stage:rotation/);
  await view.click('stage:rotation');assert.deepEqual(view.calls,[['note','stage:rotation']]);
  const notes=changeJungleNotes({stage:'opening'},'situation','invaded',120);
  view.update(make(champion,notes),120);
  assert.match(view.html(),/刷野路线 · 中断恢复/);assert.match(route(view.html()),/三狼.*魔沼蛙.*蓝BUFF/);
  assert.doesNotMatch(route(view.html()),/红BUFF.*石甲虫/);assert.doesNotMatch(view.html(),/stage:rotation|stage:opening/);
  assert.match(view.html(),/入口已确认安全才走/);assert.match(view.html(),/data-value="resume"/);
  view.update(make(champion,{stage:'opening'},600),600);assert.match(view.html(),/刷野路线 · 首轮参考/);assert.match(route(view.html()),/红BUFF/);
  view.update(make(champion,{stage:'rotation'},120),120);assert.match(view.html(),/刷野路线 · 后续轮转/);assert.match(view.html(),/stage:opening/);
 }
});

test('the jungle window accepts only valid stage controls from its own renderer and persists the route plan',async()=>{
 const nativeRequire=createRequire(import.meta.url),handlers={},area={x:0,y:0,width:1920,height:1080},windows=[];
 let state={jungleNotes:{start:'red',half:'red',lane:'mid',at:100,pushed:true}};
 class Window extends EventEmitter{
  constructor(options){super();this.bounds=options;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
  getBounds(){return this.bounds;}setBounds(value){this.bounds=value;}isDestroyed(){return false;}isVisible(){return true;}showInactive(){}hide(){}setOpacity(){}setAlwaysOnTop(){}loadFile(){}destroy(){}
 }
 const module={exports:{}},peek={unfold(){},fold(){},active:()=>false,visible:()=>false,destroy(){},sync(){}},resize={active:()=>false,cancel(){},control(){}};
 vm.runInNewContext(fs.readFileSync(new URL('../electron/jungle-window.cjs',import.meta.url),'utf8'),{module,setTimeout,clearTimeout,require:name=>name==='electron'?{BrowserWindow:Window,ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}}}:name==='./window-peek.cjs'?()=>peek:name==='./window-resize.cjs'?()=>resize:nativeRequire(name)});
 const jungleWindow=module.exports({root:fileURLToPath(new URL('..',import.meta.url)),getState:()=>state,setState:async next=>{state=next;},getPayload:()=>({phase:'InProgress',model:{jungle:make('Elise',state.jungleNotes),live}}),getArea:()=>area,getGameBounds:()=>null,getScale:()=>1,isQuitting:()=>false,onChange:()=>{},showDetails:()=>{},diagnostic:()=>{}});
 jungleWindow.show();const win=windows[0],event={sender:win.webContents,senderFrame:win.webContents.mainFrame},control=handlers['jungle-control'];
 await control(event,'note','stage:rotation');assert.equal(state.jungleNotes.stage,'rotation');assert.equal(state.jungleNotes.at,100);assert.equal(state.jungleNotes.pushed,true);
 await control(event,'note','situation:recalled');assert.equal(state.jungleNotes.stage,'rotation');assert.equal(state.jungleNotes.lane,undefined);
 await control(event,'note','resume');assert.equal(state.jungleNotes.stage,'rotation');assert.equal(state.jungleNotes.situation,undefined);
 await assert.rejects(control(event,'note','stage:done'),/标记不正确/);
 assert.throws(()=>control({sender:{},senderFrame:{}},'note','stage:opening'),/不允许/);
 jungleWindow.destroy();
});
