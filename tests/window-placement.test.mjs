import test from 'node:test';
import assert from 'node:assert/strict';
import {companionPlacement,guidePlacement,fitWindow,tooltipPlacement} from '../src/core/window-placement.mjs';
import {windowSnapshot} from '../services/window-observer.mjs';
import {compactGuidePlacement,jungleWidgetPlacement,skillWidgetPlacement} from '../src/core/guide-placement.mjs';
import {defaultState,validateState,mergeState} from '../services/storage.mjs';
const area={x:0,y:0,width:2195,height:1187};
function contained(b,a){assert.ok(b.x>=a.x&&b.y>=a.y&&b.x+b.width<=a.x+a.width&&b.y+b.height<=a.y+a.height);}
test('hover cards flip at every display edge and leave the source and pointer clear',()=>{
 const viewport={x:-1600,y:80,width:1600,height:900};
 for(const source of [{x:-1588,y:100,width:280,height:36},{x:-300,y:100,width:280,height:36},{x:-800,y:92,width:36,height:36},{x:-800,y:920,width:36,height:36}])for(const prefer of ['left','right','top','bottom']){
  const pointer={x:source.x+source.width/2,y:source.y+source.height/2},card=tooltipPlacement(source,viewport,{width:190,height:136,pointer,prefer});
  contained(card,viewport);
  assert(card.x+card.width<=source.x||card.x>=source.x+source.width||card.y+card.height<=source.y||card.y>=source.y+source.height);
  assert(pointer.x<card.x||pointer.x>card.x+card.width||pointer.y<card.y||pointer.y>card.y+card.height);
 }
});
test('a long tooltip in a short equipment window is shortened instead of covering the hovered icon',()=>{
 const viewport={x:0,y:0,width:320,height:236},source={x:140,y:72,width:32,height:32},pointer={x:154,y:88};
 const card=tooltipPlacement(source,viewport,{width:284,height:220,pointer,prefer:'bottom'});
 contained(card,viewport);assert(card.height<220);assert(card.y>=source.y+source.height+12);assert(card.height>40);
});
test('no free hover space never falls back onto the source',()=>{
 const viewport={x:0,y:0,width:100,height:64};
 assert.equal(tooltipPlacement(viewport,viewport,{width:90,height:64,pointer:{x:50,y:32}}),null);
});
test('default equipment and jungle windows do not overlap at 720p and preserve explicit placement',()=>{
 const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
 for(const area of [{x:0,y:0,width:1280,height:720},{x:0,y:0,width:853,height:480}])for(const scale of [1,1.1,1.25]){
  const equipment=compactGuidePlacement(null,area,area,scale),jungle=jungleWidgetPlacement(null,area,area,scale);
  const skill=skillWidgetPlacement(null,area,area,scale);assert.equal(equipment.y,56);assert(!overlaps(equipment,jungle));assert(!overlaps(jungle,skill));assert(!overlaps(equipment,skill));contained(jungle,area);contained(skill,area);
 }
 const area={x:0,y:0,width:1280,height:720};
 const manual={x:20,y:25,width:400,height:236};assert.deepEqual(compactGuidePlacement(manual,area,area),manual);
 const offset={x:-500,y:-400};assert.equal(jungleWidgetPlacement(offset,area,area).x,780);assert.equal(jungleWidgetPlacement(offset,area,area).y,320);
});
test('175% display: the observed client in DIPs leaves space for an adjacent sidebar',()=>{
 const client={x:71,y:158,width:1601,height:901},b=companionPlacement(client,area);
 assert.equal(b.side,'right');assert.equal(b.x,1680);assert.equal(b.width,515);assert.equal(b.overlap,false);contained(b,area);
});
test('sidebar follows negative-coordinate displays and switches sides without resizing its anchor',()=>{
 const a={x:-1920,y:0,width:1920,height:1040},client={x:-1400,y:80,width:1360,height:900},copy=structuredClone(client),b=companionPlacement(client,a);
 assert.equal(b.side,'left');assert.ok(b.x+b.width<client.x);contained(b,a);assert.deepEqual(client,copy);
 const full=companionPlacement({...a},a);assert.equal(full.overlap,true);contained(full,a);
});
test('sidebar uses available room without shrinking or overlapping a client with narrow side space',()=>{
 const client={x:40,y:80,width:1520,height:800},copy=structuredClone(client),a={x:0,y:0,width:1920,height:1040};
 const placed=companionPlacement(client,a);assert.equal(placed.width,352);assert.equal(placed.overlap,false);contained(placed,a);assert.deepEqual(client,copy);
});
test('guide recovery expands on the game display and keeps valid placement until recovery',()=>{
 const a={x:1920,y:0,width:1280,height:720},game={x:1920,y:0,width:1280,height:720};
 const saved={x:2030,y:40,width:400,height:600};assert.deepEqual(guidePlacement(saved,a,game),saved);
 const moved=guidePlacement({x:-1800,y:40,width:400,height:740},a,game);contained(moved,a);assert.equal(moved.x,2788);
 const ball=guidePlacement(saved,a,game,{ball:true,recover:true});assert.equal(ball.width,76);assert.equal(ball.height,76);contained(ball,a);
 const recovered=guidePlacement(null,a,game,{recover:true});assert.equal(recovered.height,720);assert.equal(recovered.width,400);contained(recovered,a);
});
test('display shrink and disconnected monitor recovery cannot leave assistant windows off-screen',()=>{
 const a={x:0,y:0,width:320,height:400};
 for(const b of [fitWindow({x:9999,y:9999,width:1460,height:980},a),guidePlacement({x:9999,y:9999,width:500,height:900},a,null),companionPlacement({x:0,y:0,width:320,height:400},a)])contained(b,a);
});
test('native snapshots accept bounded geometry only and drop unrelated window data',()=>{
 const raw={x:-1200,y:10,width:1280,height:720,foreground:true,minimized:false,title:'private title',token:'not geometry'};
 assert.deepEqual(windowSnapshot({client:raw}).client,{x:-1200,y:10,width:1280,height:720,foreground:true,minimized:false});
 for(const v of [{...raw,width:Infinity},{...raw,x:0.5},{...raw,x:999999},{...raw,height:0}])assert.equal(windowSnapshot({game:v}).game,null);
 assert.deepEqual(windowSnapshot({gameProcessPresent:true,gameExclusiveFullscreen:true,pid:42}),{client:null,game:null,gameProcessPresent:true,gameExclusiveFullscreen:true});
 assert.equal(windowSnapshot({gameProcessPresent:false,gameExclusiveFullscreen:true}).gameExclusiveFullscreen,false);
});
test('automatic companion defaults on, opt-out survives saving and partial backup import',()=>{
 assert.equal(validateState(defaultState()).preferences.clientCompanion,true);
 const current=validateState({...defaultState(),preferences:{clientCompanion:false}});
 assert.equal(validateState(current).preferences.clientCompanion,false);
 assert.equal(mergeState(current,defaultState(),[]).preferences.clientCompanion,false);
 const explicit=defaultState();explicit.preferences.clientCompanion=true;
 assert.equal(mergeState(current,explicit,[]).preferences.clientCompanion,true);
});
