import test from 'node:test';
import assert from 'node:assert/strict';
import {companionPlacement,guidePlacement,fitWindow} from '../src/core/window-placement.mjs';
import {windowSnapshot} from '../services/window-observer.mjs';
import {defaultState,validateState,mergeState} from '../services/storage.mjs';
const area={x:0,y:0,width:2195,height:1187};
function contained(b,a){assert.ok(b.x>=a.x&&b.y>=a.y&&b.x+b.width<=a.x+a.width&&b.y+b.height<=a.y+a.height);}
test('175% display: the observed client in DIPs leaves space for an adjacent sidebar',()=>{
 const client={x:71,y:158,width:1601,height:901},b=companionPlacement(client,area);
 assert.equal(b.side,'right');assert.equal(b.x,1680);assert.equal(b.width,440);assert.equal(b.overlap,false);contained(b,area);
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
});
test('automatic companion defaults on, opt-out survives saving and partial backup import',()=>{
 assert.equal(validateState(defaultState()).preferences.clientCompanion,true);
 const current=validateState({...defaultState(),preferences:{clientCompanion:false}});
 assert.equal(validateState(current).preferences.clientCompanion,false);
 assert.equal(mergeState(current,defaultState(),[]).preferences.clientCompanion,false);
 const explicit=defaultState();explicit.preferences.clientCompanion=true;
 assert.equal(mergeState(current,explicit,[]).preferences.clientCompanion,true);
});
