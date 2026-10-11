import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {compactGuidePlacement,skillWidgetPlacement,skillWidgetOffset} from '../src/core/guide-placement.mjs';
import {createGuideModel,selectGuide,validateGuideState,reconcileGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));data.builds=JSON.parse(fs.readFileSync(new URL('../data/builds.json',import.meta.url))).entries;
const selection={id:'Ashe',mode:'rift',role:'bottom',conditions:[]};
test('default in-game card shows complete ordered items, while components and large modules require details',()=>{
 const m=createGuideModel(data,selectGuide(null,selection)),html=renderGuide({model:m},'overview',false,()=>'<img>');
 assert.equal(m.compact,true);assert.equal(m.completeGear.route.length,6);assert.equal((html.match(/class="compact-slot /g)||[]).length,6);assert.match(html,/成装顺序/);assert.match(html,/data-action="layout" data-id="details"/);assert.doesNotMatch(html,/本次回城 · 可买组件|duel-box|hero-summary|--gear-count/);
 const full=renderGuide({model:{...m,compact:false}},'items',false,()=>'<img>');assert.match(full,/完整成装顺序/);assert.match(full,/购买计划|回城/);assert.match(full,/data-id="compact"/);
});
test('manual offline progress advances the compact goal without claiming real inventory',()=>{
 const state=selectGuide(null,selection),before=createGuideModel(data,state),first=before.route[0].id;
 state.completedItems=[first];const model=createGuideModel(data,state),gear=model.completeGear,html=renderGuide({model},'overview',false,()=>'<img>');
 assert.equal(gear.next.id,model.next.id);assert.notEqual(gear.next.id,first);
 assert.equal(gear.route.find(i=>i.id===first).planned,true);assert(gear.route.every(i=>!i.owned));assert(!gear.automatic);
 assert.deepEqual(model.autoCompletedItems,[]);assert.equal(model.targetPlan.credit,0);
 assert.match(html,/手动计划/);assert.match(html,/不代表已持有/);assert.match(html,new RegExp('下一件 <b>'+gear.next.name));
 assert.doesNotMatch(html,/完整路线已持有|<em>✓<\/em>/);
 state.completedItems=before.route.map(i=>i.id);
 const remaining=createGuideModel(data,state);assert(remaining.completeGear.next.suggested);assert.equal(remaining.completeGear.next.planned,false);
 state.selection.laterIds=before.completeGear.route.filter(i=>i.suggested).map(i=>Number(i.id));
 state.completedItems=createGuideModel(data,state).route.map(i=>i.id);
 const all=createGuideModel(data,state);assert.equal(all.completeGear.next,null);
 assert.match(renderGuide({model:all},'overview',false,()=>'<img>'),/计划进度已标记/);
});
test('moving the separate skill window follows the game bottom while clamping disconnected displays',()=>{
 const area={x:-1920,y:0,width:1920,height:1040},game={x:-1920,y:0,width:1920,height:1080},first=skillWidgetPlacement(null,area,game);
 assert(first.y+first.height<game.height-100);const moved={...first,x:first.x-90,y:first.y-40},offset=skillWidgetOffset(moved,area,game);
 const later=skillWidgetPlacement(offset,{...area,x:0},{...game,x:0});assert.equal(later.x,moved.x+1920);assert.equal(later.y,moved.y);
 for(const scale of [1,1.1,1.25])for(const saved of [null,{x:-99999,y:99999}]){const b=compactGuidePlacement(saved,area,game,scale);assert(b.x>=area.x&&b.x+b.width<=area.x+area.width);assert(b.y>=area.y&&b.y+b.height<=area.height);assert(b.width<=450&&b.height<=295);}
});
test('new game returns to compact view, preserves explicitly closed skills, and rejects malformed placement',()=>{
 const state={...selectGuide(null,selection),compact:false,skillWidget:{enabled:false,offset:{x:100,y:-170}},match:{phase:'InProgress',gameId:'10'}};
 const saved=validateGuideState(JSON.parse(JSON.stringify(state)));assert.deepEqual(saved.skillWidget,state.skillWidget);
 const next=reconcileGuide(saved,{phase:'InProgress',gameId:'11'}).guide;assert.equal(next.compact,true);assert.equal(next.skillWidget.enabled,false);
 const malformed=validateGuideState({...state,compactBounds:{x:Infinity,y:2},skillWidget:{enabled:false,offset:{x:'10',y:0}}});assert.equal(malformed.compactBounds,undefined);assert.equal(malformed.skillWidget.offset,undefined);
});

test('compact resource notice only uses a fresh preparation window, without treating an expired spawn as an ongoing fight',()=>{
 const m=createGuideModel(data,selectGuide(null,selection)),objectives={available:true,rows:[{state:'prepare',name:'元素亚龙',label:'还有 0:45',action:'先处理兵线与回城'}]};
 const html=renderGuide({model:{...m,objectives}},'overview',false,()=>'<img>');assert.match(html,/compact-resource/);assert.match(html,/元素亚龙/);
 for(const o of [{...objectives,stale:true},{...objectives,rows:[{...objectives.rows[0],state:'check'}]},{available:false,rows:[]}])assert.doesNotMatch(renderGuide({model:{...m,objectives:o}},'overview',false,()=>'<img>'),/compact-resource/);
});
