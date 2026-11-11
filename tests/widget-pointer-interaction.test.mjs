import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {holdRenderDuringPointer} from '../src/pointer-render.mjs';
import {guideRenderContext} from '../src/guide-render-context.mjs';
import {jungleGuidance,changeJungleNotes} from '../src/core/jungle-guidance.mjs';
import {jungleRouteMap,routeStepButton} from '../src/jungle-route-view.mjs';
import {hexEconomyView,hexMicroRoutesView,hexMicroLineView} from '../src/hex-micro-view.mjs';

// Run the production render/update/click handlers. Replacing innerHTML detaches
// the pressed node, just as Chromium does between native down and up.
async function renderer(kind,initial){
 const listeners=new Map(),timers=new Map(),calls=[],hoverCalls=[];let nextTimer=0,update,pointer,pointerTarget=null,html='',buttons=[];
 const matches=(node,selector)=>selector.split(',').some(part=>/\[data-action\]/.test(part)||part.includes(`[data-action="${node.dataset.action}"]`));
 const toolbar={dataset:{action:'fold'},isConnected:true,disabled:false,closest(selector){return matches(this,selector)?this:null;},setAttribute(){}};
 const root={className:'',dataset:{},style:{},addEventListener(name,fn){listen('root:'+name,fn);},contains:node=>buttons.includes(node),querySelector:()=>null,querySelectorAll:()=>[],
  get innerHTML(){return html;},set innerHTML(value){html=value;for(const b of buttons)b.isConnected=false;buttons=[...value.matchAll(/<button\b([^>]*)>/g)].map(([,attrs])=>{const dataset=Object.fromEntries([...attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(([,key,value])=>[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),value]));return {dataset,isConnected:true,disabled:/\sdisabled(?:\s|$)/.test(attrs),closest(selector){return matches(this,selector)?this:null;},setAttribute(){}};});}
 };
 function listen(name,fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);}
 const document={getElementById:()=>root,addEventListener:listen,elementFromPoint:()=>pointerTarget,activeElement:null,body:{className:''},documentElement:{style:{setProperty(){}},dataset:{}},querySelector:()=>toolbar,querySelectorAll:()=>[],defaultView:{addEventListener:listen}};
 const setTimer=fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimer=id=>timers.delete(id);
 const api={bootstrap:async()=>initial,onUpdate:fn=>{update=fn;},control:async(...args)=>{calls.push(args);return true;},hover:async(...args)=>{hoverCalls.push(args);},regions:async()=>{},onMeasure(){},onPointer:fn=>{pointer=fn;}};
 const source=(await fs.readFile(new URL(`../src/${kind}.mjs`,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
 const context={document,window:{guide:api,skillWidget:api,jungleWidget:api,hexMicro:api},setTimeout:setTimer,clearTimeout:clearTimer,URLSearchParams,location:{search:''},requestAnimationFrame(){},ResizeObserver:class{observe(){}},
  holdRenderDuringPointer:options=>holdRenderDuringPointer({...options,setTimer,clearTimer}),
  guideRenderContext,
  windowResizeGrip:'',installWindowResize(){},applyPresentation(){},e:value=>String(value??''),skillSummary:m=>({text:'time:'+m.live.gameTime,detail:'Q'}),jungleRouteMap,routeStepButton,hexEconomyView,hexMicroRoutesView,hexMicroLineView,
  renderGuide:value=>`<header><button data-action="fold">fold</button><button data-action="hide">hide</button></header><main>time:${value.model.live.gameTime}</main>`,createGameTooltips:()=>({close(){},repaint(_root,paint){paint();}})
 };
 await vm.runInNewContext(`(async()=>{${source}\n})()`,context);
 const emit=async(name,button,extra={})=>{const event={target:button,button:0,isPrimary:true,...extra};for(const fn of listeners.get(name)||[])await fn(event);if(name==='click'&&root.contains(button))for(const fn of listeners.get('root:click')||[])await fn(event);};
 return {root,calls,hoverCalls,point:node=>{pointerTarget=node;},poll:ticket=>{assert(pointer,'The renderer must answer fallback queries');pointer(ticket);},update:value=>update(value),button:(action,id)=>buttons.find(b=>b.dataset.action===action&&(id===undefined||b.dataset.id===id)),toolbar,
  emit,flush(){const due=[...timers.values()];timers.clear();due.forEach(fn=>fn());},html:()=>html};
}
const guideValue=(extra={})=>({referenceRevision:1,model:{champion:{id:'LeeSin'},selection:{id:'LeeSin',role:'jungle',mode:'rift'},mode:'rift',matchId:'100',source:'OP.GG',sourceUrl:'https://example.test/lee',fetchedAt:'2026-11-09',live:{gameTime:209},...extra}});
const jungleValue=time=>{const value={...guideValue(),time,jungle:jungleGuidance({champion:'LeeSin',role:'jungle',mode:'rift',patch:'16.22',matchId:'100',live:{matched:true,gameTime:time,mapId:11,queueId:420,teamSide:'blue'}})};return {...value,interactionContext:guideRenderContext(value)};};
const microValue=(extra={})=>({active:true,kind:'routes',layout:'full',expanded:true,context:'same',session:'same',view:1,routes:Array.from({length:4},(_,i)=>({id:'route-'+i,title:'route-'+i,augments:[],items:[]})),...extra});

test('guide fallback queries synchronously answer every header/grip result and clear a header on body movement',async()=>{
 const f=await renderer('guide',guideValue()),body={closest:()=>null},header={closest:selector=>selector.includes('#guide-root>header')?header:null},grip={closest:selector=>selector.includes('[data-window-resize]')?grip:null};
 f.point(body);f.poll({id:1,x:12,y:35});f.poll({id:2,x:12,y:35});assert.deepEqual(f.hoverCalls,[[false,1],[false,2]],'Repeated false replies cannot rely on the renderer hover cache');
 f.point(header);f.poll({id:3,x:12,y:10});assert.deepEqual(f.hoverCalls.at(-1),[true,3]);
 await f.emit('mousemove',body);assert.deepEqual(f.hoverCalls.at(-1),[false,undefined],'The DOM path must share the polled hover state');
 f.point(grip);f.poll({id:4,x:290,y:200});assert.deepEqual(f.hoverCalls.at(-1),[true,4]);
 f.point(null);f.poll({id:5,x:-1,y:-1});assert.deepEqual(f.hoverCalls.at(-1),[false,5]);
});

for(const map of [false,true])for(const change of ['hero','game','source'])test(`jungle ${map?'map':'text'} preference survives ${change} identity changes while old controls are invalidated`,async()=>{
 const first=jungleValue(120),f=await renderer('jungle',first);
 if(map)await f.emit('click',f.button('map'));
 const old=f.button('note');assert.match(old.dataset.value,/^step:/);await f.emit('pointerdown',old);
 const next=structuredClone(first);
 if(change==='hero'){
  next.model.champion.id='Ivern';next.model.selection.id='Ivern';
  next.jungle=jungleGuidance({champion:'Ivern',role:'jungle',mode:'rift',patch:'16.20',matchId:'100',notes:{start:'blue',stage:'opening',routeProgress:{key:'Ivern-opening-blue',index:5}},live:{matched:true,gameTime:120,mapId:11,queueId:420,teamSide:'red',skills:{Q:1,W:1,E:1,R:0},stats:{hp:600,maxHp:1000,resource:{type:'MANA',value:400,max:500}}}});
 }else if(change==='game'){
  next.model.matchId='101';
  next.jungle=jungleGuidance({champion:'LeeSin',role:'jungle',mode:'rift',patch:'16.20',matchId:'101',live:{matched:true,gameTime:120,mapId:11,queueId:420,teamSide:'blue'}});
 }else{next.model.source='other';next.model.sourceUrl='https://example.test/new-source';}
 next.interactionContext=guideRenderContext(next);f.update(next);
 assert.equal(old.isConnected,false,'The former identity must not keep its pressed DOM');
 await f.emit('pointerup',old);await f.emit('click',old);f.flush();assert.equal(f.calls.length,0,'A stale pressed control must not dispatch under the new identity');
 assert.equal(/<svg class="jungle-map"/.test(f.html()),map);
 assert.match(f.html(),new RegExp('data-action="map" aria-pressed="'+map+'"'));
 assert.ok(f.html().includes('step:'+next.jungle.route.actionKey+'.'),'Controls must belong to the newest route');
 if(change!=='source')assert.throws(()=>changeJungleNotes(undefined,'step',old.dataset.value.slice(5),120,next.jungle.route),/路线已变化/);
 if(change==='hero'){
  assert.equal(next.jungle.route.current.action,'release');
  if(map){assert.match(f.html(),/红色方己方营地成熟后回收顺序示意/);assert.match(f.html(),/>6<\/text>/);}else assert.match(f.html(),/蓝BUFF · 成熟后回收/);
  const previousPoints=f.html().match(/<polyline points="([^"]*)"/)?.[1],flipped=structuredClone(next);
  flipped.jungle=jungleGuidance({champion:'Ivern',role:'jungle',mode:'rift',patch:'16.20',matchId:'100',notes:{start:'blue',stage:'opening',routeProgress:{key:'Ivern-opening-blue',index:5}},live:{matched:true,gameTime:120,mapId:11,queueId:420,teamSide:'blue',skills:{Q:1,W:1,E:1,R:0},stats:{hp:600,maxHp:1000,resource:{type:'MANA',value:400,max:500}}}});
  f.update(flipped);assert.equal(/<svg class="jungle-map"/.test(f.html()),map);
  if(map){assert.match(f.html(),/蓝色方己方营地成熟后回收顺序示意/);assert.notEqual(f.html().match(/<polyline points="([^"]*)"/)?.[1],previousPoints,'A side update must repaint the new model points');}
 }
});

for(const kind of ['guide','skill','jungle'])test(`${kind}: same-identity refresh preserves the pressed control through pointerup and delivers one immediate action`,async()=>{
 const first=kind==='jungle'?jungleValue(209):guideValue(),f=await renderer(kind,first),button=f.button('fold');
 await f.emit('pointerdown',button);f.update(kind==='jungle'?jungleValue(211):{...first,model:{...first.model,live:{gameTime:211}}});
 assert.equal(button.isConnected,true,'A live repaint must not detach the pressed control');
 await f.emit('pointerup',button);assert.equal(button.isConnected,true,'Pointerup must not paint before click');
 await f.emit('click',button);assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'fold');
 f.flush();assert.equal(button.isConnected,false);assert.equal(f.calls.length,1);
 assert.match(f.html(),kind==='jungle'?/后续轮转/:/time:211/,'Release paints the newest payload');
});

for(const action of ['pin','expand'])test(`Hex ${action}: same-context route content refresh uses the latest view with the original valid target`,async()=>{
 const first=microValue({expanded:action==='pin'}),f=await renderer('hex-micro',first),button=f.button(action,action==='pin'?'route-1':undefined);
 await f.emit('pointerdown',button);const next=structuredClone(first);next.view=2;next.routes[3].title='updated';f.update(next);
 assert.equal(button.isConnected,true);await f.emit('pointerup',button);assert.equal(button.isConnected,true);
 await f.emit('click',button);assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],action);assert.equal(f.calls[0][1].view,2);assert.equal(f.calls[0][1].context,'same');
 f.flush();assert.equal(button.isConnected,false);
});

for(const kind of ['guide','skill','jungle'])test(`${kind}: identity changes cancel the pressed DOM rather than borrowing the new identity`,async()=>{
 for(const change of [v=>{v.model.champion.id='Vi';v.model.selection.id='Vi';},v=>{v.model.selection.role='mid';},v=>{v.model.mode='hex';},v=>{v.model.matchId='101';},v=>{v.model.source='other';},v=>{v.model.sourceUrl='https://example.test/other';},v=>{v.referenceRevision++;}]){
  const first=kind==='jungle'?jungleValue(209):guideValue(),f=await renderer(kind,first),old=f.button('fold');
  await f.emit('pointerdown',old);const next=structuredClone(first);change(next);if(kind==='jungle')next.interactionContext=guideRenderContext(next);f.update(next);
  assert.equal(old.isConnected,false);await f.emit('pointerup',old);await f.emit('click',old);f.flush();assert.equal(f.calls.length,0);
 }
});

test('Hex removed routes and changed contexts immediately invalidate the old pin; stable toolbar controls remain usable',async()=>{
 for(const change of [value=>{value.context='new';},value=>{value.interactionContext='new-role-or-source';},value=>{value.routes=value.routes.filter(r=>r.id!=='route-1');}]){
  const f=await renderer('hex-micro',microValue()),old=f.button('pin','route-1');await f.emit('pointerdown',old);const next=microValue({view:2});change(next);f.update(next);
  assert.equal(old.isConnected,false);await f.emit('pointerup',old);await f.emit('click',old);assert.equal(f.calls.length,0);
 }
 const f=await renderer('hex-micro',microValue());await f.emit('pointerdown',f.toolbar);f.update(microValue({view:2}));await f.emit('pointerup',f.toolbar);await f.emit('click',f.toolbar);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'fold');assert.equal(f.calls[0][1].view,2);
});

for(const release of ['pointercancel','blur','pointerup'])test(`widget paint resumes after ${release} without synthesizing an action`,async()=>{
 const f=await renderer('skill',guideValue()),old=f.button('fold');await f.emit('pointerdown',old);f.update(guideValue({live:{gameTime:220}}));await f.emit(release,old);f.flush();assert.equal(old.isConnected,false);assert.equal(f.calls.length,0);
});
