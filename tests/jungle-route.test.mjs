import test from 'node:test';
import assert from 'node:assert/strict';
import {jungleGuidance,changeJungleNotes,validateJungleNotes} from '../src/core/jungle-guidance.mjs';
import {jungleRouteMap,jungleRouteView} from '../src/jungle-route-view.mjs';
import {validateRouteProgress} from '../src/core/jungle-route.mjs';
import {selectGuide,validateGuideState,reconcileGuide} from '../src/core/guide.mjs';
const live={matched:true,mapId:11,queueId:420,gameTime:120,teamSide:'blue',skills:{Q:1,W:1,E:1,R:0},stats:{hp:700,maxHp:1000,resource:{type:'MANA',value:400,max:500}}};
const make=(notes={},extra={})=>jungleGuidance({champion:'Nocturne',role:'jungle',mode:'rift',patch:'16.20',live,notes,...extra});
const step=(j,index)=>changeJungleNotes(j.notes,'step',`${j.route.actionKey}.${index}`,live.gameTime,j.route);

test('a route exposes actual ordered camps and mirrors only the own-side diagram, without observed positions',()=>{
 const blue=make(),red=make({}, {live:{...live,teamSide:'red'}});
 assert.equal(blue.route.steps.length,6);assert.equal(blue.route.current.name,'红BUFF');
 assert.equal(red.route.current.name,'蓝BUFF');assert.equal(blue.route.manual,false);
 for(const a of blue.route.steps){const b=red.route.steps.find(s=>s.id===a.id);assert.deepEqual(b.point,a.point.map(n=>100-n));}
 const unknown=make({}, {live:{...live,teamSide:undefined}});
 assert(unknown.route.steps.every(s=>s.point===null));assert.doesNotMatch(jungleRouteMap(unknown.route),/<svg/);
 assert.match(jungleRouteMap(unknown.route),/确认出生方/);
 assert.match(jungleRouteView(blue.route),/连线不是可穿墙路径.*手动标记/);
});
test('explicit progress pins its stage, supports skipping/backtracking, and ends without inventing a new spawn',()=>{
 let j=make();j=make(step(j,0));assert(j.route.manual);assert.equal(j.route.index,0);
 j=make(step(j,3),{live:{...live,gameTime:500}});assert.equal(j.route.stage,'opening');assert.equal(j.route.current.name,'三狼');
 j=make(step(j,2));assert.equal(j.route.current.name,'锋喙鸟');
 j=make(step(j,6));assert(j.route.complete);assert.equal(j.route.current,null);
 assert.match(jungleRouteView(j.route),/不自动循环假装营地刷新/);
 const reset=changeJungleNotes(j.notes,'step',`${j.route.actionKey}.reset`,120,j.route);assert.equal(reset.routeProgress,undefined);
 assert.equal(make(reset).route.manual,false);assert.equal(make(reset).route.index,0);
});
test('absolute steps are idempotent across windows and stale route keys cannot alter a different route',()=>{
 const original=make(),value=`${original.route.actionKey}.1`;
 const first=changeJungleNotes({},'step',value,120,original.route),second=changeJungleNotes(first,'step',value,120,make(first).route);
 assert.deepEqual(first,second);assert.equal(make(second).route.index,1);
 const switched=make(changeJungleNotes(first,'start','blue',120));assert.equal(switched.route.manual,false);
 assert.throws(()=>changeJungleNotes(switched.notes,'step',value,120,switched.route),/路线已变化/);
 assert.throws(()=>step(original,7),/步骤/);
 for(const value of ['x.1','Nocturne-opening-red.-1','Nocturne-opening-red.99','<img>.0'])assert.throws(()=>changeJungleNotes({},'step',value,120,original.route));
});
test('manual follow preserves the chosen automatic start when public birth-side data temporarily disappears or arrives late',()=>{
 for(const side of ['blue','red']){
  const j=make({}, {live:{...live,teamSide:side}}),notes=step(j,2);
  assert.equal(notes.start,j.start);
  const missing=make(notes,{live:{...live,teamSide:undefined,gameTime:500}});
  assert.equal(missing.route.key,j.route.key);assert(missing.route.manual);assert.equal(missing.route.index,2);assert.equal(missing.side,null);
  assert(missing.route.steps.every(s=>s.point===null));
  const restored=make(notes,{live:{...live,teamSide:side,gameTime:501}});assert.equal(restored.route.index,2);assert.equal(restored.start,j.start);
 }
 const unknown=make({}, {live:{...live,teamSide:undefined}}),notes=step(unknown,1);
 const known=make(notes);assert(known.route.manual);assert.equal(known.start,unknown.start);assert.equal(known.route.index,1);
});
test('recovery adoption switches to the candidate half, clears old gank evidence and does not depend on the old opening',()=>{
 const checked={start:'red',half:'red',stage:'opening',lane:'mid',at:110,pushed:true,follow:true,control:true,safe:true};
 for(const reason of ['invaded','recalled','no-window']){
  const notes=changeJungleNotes(checked,'situation',reason,120),j=make(notes);
  assert.equal(j.route.stage,'rotation');assert.equal(j.route.half,reason==='invaded'?'blue':'red');assert.equal(j.route.writable,false);assert(j.route.canAdopt);
  assert.throws(()=>step(j,1),/路线已变化/);
  const adopted=changeJungleNotes(notes,'adopt',j.route.actionKey,120,j.route),next=make(adopted);
  assert.equal(next.half,j.route.half);assert.equal(next.route.key,j.route.key);assert(next.route.manual);assert.equal(next.route.index,0);
  assert.equal(next.recovery,null);assert.equal(next.notes.lane,undefined);assert.equal(next.ready,false);assert.equal(next.route.stage,'rotation');
  assert.equal(next.route.steps.length,3);assert.equal(next.route.current.name,reason==='invaded'?'三狼':'锋喙鸟');
  const expired=make(notes,{live:{...live,gameTime:211}});assert.throws(()=>changeJungleNotes(notes,'adopt',j.route.actionKey,211,expired.route),/候选已变化/);
 }
});
test('opening recovery uses the current manually planned camp half instead of the original start half',()=>{
 for(const index of [0,2,3,5,6]){
  const j=make(step(make(),index));
  const plannedHalf=index<3?'red':'blue';assert.equal(j.half,plannedHalf);
  for(const reason of ['invaded','recalled']){
   const interrupted=make(changeJungleNotes(j.notes,'situation',reason,120));
   assert.equal(interrupted.route.half,reason==='invaded'?(plannedHalf==='red'?'blue':'red'):plannedHalf);
   assert(interrupted.route.steps.every(s=>s.half===interrupted.route.half));
  }
 }
});
test('Ivern distinguishes drawing from mature release at repeated camp areas in both starts and recovery',()=>{
 for(const start of ['red','blue']){
  let j=make({start},{champion:'Ivern'});assert.equal(j.route.steps.length,10);assert(j.route.steps.slice(0,5).every(s=>s.action==='mark'));assert(j.route.steps.slice(5).every(s=>s.action==='release'));
  assert.equal(j.route.steps[0].id,start);assert.deepEqual(j.route.steps[0].point,j.route.steps[5].point);
  assert.match(jungleRouteMap(j.route),/画圈/);assert.doesNotMatch(jungleRouteMap(j.route),/>6<\/text>/);
  j=make(step(j,5),{champion:'Ivern'});assert.match(jungleRouteMap(j.route),/成熟后回收/);assert.match(jungleRouteMap(j.route),/>6<\/text>/);
  assert.match(j.route.current.label,/成熟后回收/);assert.match(j.route.hint,/惩戒/);
  const interrupted=make(changeJungleNotes(j.notes,'situation','invaded',120),{champion:'Ivern'});
  assert.equal(interrupted.route.steps.length,6);assert(interrupted.route.steps.every(s=>s.half===interrupted.route.half));
  const camps=[...new Set(interrupted.route.steps.map(s=>s.name))].join(' → ');
  assert(interrupted.recoveryRoute[0].includes(camps));assert(interrupted.lead.text.includes(camps));
  assert.doesNotMatch(interrupted.recoveryRoute[0],/转另一半区/);
 }
});
test('Ivern normal rotation text names only the chosen half shown by the manual camp sequence',()=>{
 for(const half of ['red','blue']){
  const j=make({stage:'rotation',half},{champion:'Ivern'});
  for(const camp of new Set(j.route.steps.map(s=>s.name)))assert(j.rotationRoute[0].includes(camp));
  assert.doesNotMatch(j.rotationRoute.join(' '),/另一半区/);assert.match(j.rotationRoute[1],/同半区成熟营地/);
 }
});
test('click intents reject another known match and a new interruption without losing stored progress when an ID arrives',()=>{
 const old=make({}, {matchId:'100'}),newMatch=make({}, {matchId:'101'});
 assert.throws(()=>changeJungleNotes({},'step',`${old.route.actionKey}.3`,120,newMatch.route),/路线已变化/);
 const unknown=make(),notes=step(unknown,2),known=make(notes,{matchId:'100'});
 assert(known.route.manual);assert.equal(known.route.index,2);assert.notEqual(unknown.route.actionKey,known.route.actionKey);
 assert.throws(()=>changeJungleNotes(notes,'step',`${unknown.route.actionKey}.3`,120,known.route),/路线已变化/);
 const firstNotes=changeJungleNotes({},'situation','invaded',120),first=make(firstNotes,{matchId:'100'});
 const laterNotes=changeJungleNotes({},'situation','invaded',220),later=make(laterNotes,{matchId:'100',live:{...live,gameTime:220}});
 assert.equal(first.route.key,later.route.key);assert.notEqual(first.route.actionKey,later.route.actionKey);
 assert.throws(()=>changeJungleNotes(laterNotes,'adopt',first.route.actionKey,220,later.route),/候选已变化/);
 const adopted=changeJungleNotes(laterNotes,'adopt',later.route.actionKey,220,later.route);assert.equal(adopted.routeProgress.key,later.route.key);
});
test('stored progress is bounded, discarded for other routes, and cleared by match or champion changes',()=>{
 for(const value of [{key:'<script>',index:1},{key:'Nocturne-opening-red',index:13},{key:'Nocturne-opening-red',index:-1},{key:'Nocturne-opening-red',index:1.1},{index:1},null])assert.equal(validateRouteProgress(value),undefined);
 const j=make(step(make(),2));const state=validateGuideState({...selectGuide(null,{id:'Nocturne',role:'jungle',mode:'rift'}),jungleNotes:j.notes,match:{gameId:'10',phase:'InProgress'}});
 assert.deepEqual(state.jungleNotes.routeProgress,j.notes.routeProgress);
 assert.equal(reconcileGuide(state,{phase:'InProgress',gameId:'11'}).guide.jungleNotes,undefined);
 assert.equal(selectGuide(state,{id:'Diana',role:'jungle',mode:'rift'}).jungleNotes,undefined);
 assert.equal(make(j.notes,{champion:'Diana'}).route.manual,false);
 assert.equal(make({routeProgress:{key:make().route.key,index:12}}).route.manual,false);
 assert.equal(validateJungleNotes({routeProgress:{key:'bad data',index:0}}),undefined);
});
test('unsupported queues, wrong patches and unmatched games never accept progress or recovery adoption',()=>{
 for(const extra of [{live:null},{live:{...live,matched:false}},{live:{...live,queueId:490}},{patch:'16.21'}]){
  const j=make({},extra);assert(!j.route.writable);assert.throws(()=>step(j,0));
  const recovery=make({situation:'invaded',situationAt:120},extra);assert(!recovery.route.canAdopt);
 }
 assert.equal(make({}, {live:{...live,stats:{hp:100,maxHp:1000}}}).route.pause,'先补给，暂停进场');
});
