import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {compactGuidePlacement,skillWidgetPlacement,skillWidgetOffset} from '../src/core/guide-placement.mjs';
import {createGuideModel,selectGuide,validateGuideState,reconcileGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));data.builds=JSON.parse(fs.readFileSync(new URL('../data/builds.json',import.meta.url))).entries;
const selection={id:'Ashe',mode:'rift',role:'bottom',conditions:[]};
test('default in-game card shows complete ordered items, and ignores obsolete full-window layout requests',()=>{
 const m=createGuideModel(data,selectGuide(null,selection)),html=renderGuide({model:m},'overview',false,()=>'<img>');
 assert.equal(m.compact,true);assert.equal(m.completeGear.route.length,6);assert.equal((html.match(/class="compact-slot /g)||[]).length,6);assert.match(html,/成装顺序/);assert.doesNotMatch(html,/data-action="layout"|data-tab=/);assert.doesNotMatch(html,/本次回城 · 可买组件|duel-box|hero-summary|--gear-count/);
 const full=renderGuide({model:{...m,compact:false}},'items',false,()=>'<img>');assert.equal(full,html);
});
test('manual offline progress advances the compact goal without claiming real inventory',()=>{
 const state=selectGuide(null,selection),before=createGuideModel(data,state),first=before.route[0].id;
 state.completedItems=[first];const model=createGuideModel(data,state),gear=model.completeGear,html=renderGuide({model},'overview',false,()=>'<img>');
 assert.equal(gear.next.id,model.next.id);assert.notEqual(gear.next.id,first);
 assert.equal(gear.route.find(i=>i.id===first).planned,true);assert(gear.route.every(i=>!i.owned));assert(!gear.automatic);
 assert.deepEqual(model.autoCompletedItems,[]);assert.equal(model.targetPlan.credit,0);
 assert.match(html,/手动计划/);assert.match(html,/不代表已持有/);assert.match(html,new RegExp('下一件 <b>'+gear.next.name));
 assert.match(html,/data-action="reset"[^>]*>清标记/);
 assert.doesNotMatch(renderGuide({model:before},'overview',false,()=>'<img>'),/data-action="reset"/);
 assert.doesNotMatch(renderGuide({model:{...model,live:{matched:true}}},'overview',false,()=>'<img>'),/data-action="reset"/);
 assert.doesNotMatch(html,/完整路线已持有|<em>✓<\/em>/);
 state.completedItems=before.completeGear.route.filter(i=>i.fromPreparation).map(i=>i.id);
 const remaining=createGuideModel(data,state);assert(remaining.completeGear.next.suggested);assert.equal(remaining.completeGear.next.planned,false);assert.equal(remaining.next.id,remaining.completeGear.next.id);
 state.purchaseTarget=remaining.next.id;const chosen=createGuideModel(data,state);assert.equal(chosen.purchaseTarget,remaining.next.id);assert(chosen.shoppingTargets.some(i=>i.id===remaining.next.id&&i.kind==='路线成装'));
 state.completedItems=before.route.map(i=>i.id);
 const all=createGuideModel(data,validateGuideState(JSON.parse(JSON.stringify(state))));assert.equal(all.completeGear.next,null);assert.equal(all.next,null);assert.equal(all.purchaseTarget,'');assert.equal(all.route.length,6);assert.equal(all.selection.laterIds,undefined);
 assert.match(renderGuide({model:all},'overview',false,()=>'<img>'),/计划进度已标记/);
 assert.match(renderGuide({model:{...all,compact:false}},'items',false,()=>'<img>'),/计划进度已标记/);
});

test('automatically filled seventh items obey the same explicit quest and progress gates',()=>{
 const state=selectGuide(null,{...selection,bottomQuestPlan:true}),before=createGuideModel(data,state);assert.equal(before.route.length,7);
 const last=before.route[6].id;assert.equal(before.bottomQuest.itemId,last);assert(before.shoppingTargets.find(i=>i.id===last).blockedReason);
 state.completedItems=before.route.map(i=>i.id);state.purchaseTarget=last;
 const waiting=createGuideModel(data,state);assert.equal(waiting.next,null);assert.equal(waiting.completeGear.next,null);assert(!waiting.completedItems.includes(last));assert(!waiting.completeGear.route[6].planned);assert.equal(waiting.purchaseTarget,'');
 state.completedItems=before.route.slice(0,6).map(i=>i.id);state.bottomQuestConfirmed=true;
 const ready=createGuideModel(data,state);assert.equal(ready.next.id,last);assert.equal(ready.completeGear.next.id,last);assert.equal(ready.purchaseTarget,last);
});
test('an explicit return-to-shop goal remains visible on the compact card without replacing the full route',()=>{
 const state=selectGuide(null,selection),before=createGuideModel(data,state);state.purchaseTarget='3006';
 const model=createGuideModel(data,state),html=renderGuide({model},'overview',false,()=>'<img>');
 assert.equal(model.purchaseTarget,'3006');assert.equal(model.next.id,'3006');assert.deepEqual(model.completeGear.route.map(i=>i.id),before.completeGear.route.map(i=>i.id));assert(model.completeGear.route.find(i=>i.id==='3006').protected);
 assert.match(html,/回城目标 <b>狂战士胫甲<\/b>/);assert.doesNotMatch(html,/下一件 <b>/);
 state.completedItems=['3006'];const finished=createGuideModel(data,state);
 assert.equal(finished.purchaseTarget,'');assert.doesNotMatch(renderGuide({model:finished},'overview',false,()=>'<img>'),/回城目标 <b>/);
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

test('compact advice prioritizes visible equipment conditions over redundant objective timers',()=>{
 const m=createGuideModel(data,selectGuide(null,selection)),objectives={available:true,rows:[{state:'prepare',name:'元素亚龙',label:'还有 0:45',action:'先处理兵线与回城'}]};
 const html=renderGuide({model:{...m,objectives}},'overview',false,()=>'<img>');assert.doesNotMatch(html,/compact-resource|元素亚龙/);
 assert(m.completeGear.alternatives.length>=2);
 for(const a of m.completeGear.alternatives){
  assert(a.when&&a.use);assert(html.includes(a.when));assert(html.includes(a.name));
  assert(m.shoppingTargets.some(t=>t.id===a.id),'every visible alternative is a valid explicit shopping target');
 }
 assert.match(html,/data-action="purchase-target"/);
 const alternative=m.completeGear.alternatives.find(a=>!a.blockedReason);
 if(alternative){const chosen=createGuideModel(data,{...selectGuide(null,selection),purchaseTarget:alternative.id});assert.equal(chosen.next.id,alternative.id);assert.equal(chosen.purchaseTarget,alternative.id);assert.deepEqual(chosen.completeGear.route.map(i=>i.id),m.completeGear.route.map(i=>i.id));}
 const full=renderGuide({model:{...m,compact:false}},'items',false,()=>'<img>');assert(full.includes(m.completeGear.route.find(i=>i.use).use));
});
