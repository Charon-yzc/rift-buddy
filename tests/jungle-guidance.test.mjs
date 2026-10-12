import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {jungleGuidance,changeJungleNotes,validateJungleNotes} from '../src/core/jungle-guidance.mjs';
import {selectGuide,createGuideModel,reconcileGuide,validateGuideState} from '../src/core/guide.mjs';
import {jungleGuidanceView} from '../src/jungle-guidance-view.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));data.builds=JSON.parse(fs.readFileSync(new URL('../data/builds.json',import.meta.url))).entries;
const live={matched:true,mapId:11,queueId:420,gameTime:400,skills:{Q:3,W:1,E:1,R:0},stats:{hp:600,maxHp:1000,resource:{type:'MANA',value:400,max:500}}};
const make=(extra={})=>jungleGuidance({champion:'Nocturne',role:'jungle',mode:'rift',patch:'16.20',live,...extra});

test('later jungle rotations remain concrete, and an explicit half change does not invent camp or lane evidence',()=>{
 const red=make({notes:{half:'red'},live:{...live,gameTime:1100}});
 assert.equal(red.rotationRoute.length,2);assert.match(red.rotationRoute[0],/锋喙鸟.*石甲虫.*实际可刷/);assert(!red.openingPhase);assert(!red.ready);
 const notes=changeJungleNotes({start:'red'},'half','blue',1100),blue=make({notes,live:{...live,gameTime:1100}});
 assert.match(blue.rotationRoute[0],/三狼.*魔沼蛙.*实际可刷/);assert.equal(notes.lane,undefined);assert.equal(notes.at,undefined);
 assert.match(make({champion:'Ivern',notes}).rotationRoute.join(' '),/画圈.*成熟营地/);
 assert.throws(()=>changeJungleNotes(notes,'half','enemy',1100));
 assert.equal(validateJungleNotes({half:'enemy',campAlive:true}),undefined);
});
test('Nocturne and Diana retain concrete six camps while Ivern uses passive release, without inferring a clear record',()=>{
 const nocturne=make();assert.equal(nocturne.opening.length,6);assert.match(nocturne.choices[0].text,/尚未学会/);assert.match(nocturne.mechanics,/6级前/);
 const diana=make({champion:'Diana',notes:{start:'red'}});assert.equal(diana.opening[0],'红BUFF');assert.match(diana.mechanics,/学会|6级R/);
 const ivern=make({champion:'Ivern'});assert(ivern.special);assert(ivern.opening.some(t=>t.includes('画圈')));assert.match(jungleGuidanceView(ivern),/不代表当前已经刷过/);
 for(const start of ['blue','red']){
  const opening=make({champion:'Ivern',notes:{start},live:{...live,gameTime:100}});
  assert.equal(opening.compactRoute.length,2);assert.match(opening.compactRoute[0],start==='blue'?/^蓝→蛙→三狼/:/^红→锋喙鸟/);
  assert.match(opening.compactRoute[0],/画圈；转/);assert.match(opening.compactRoute[1],/成熟.*回收.*惩戒/);assert.match(opening.lead.title,/画圈/);
 }
 assert.equal(make({role:'mid'}),null);assert.equal(make({mode:'hex'}),null);
});
test('only fresh player-checked lane conditions offer a gank option; low health, stale patch, and other queues stop it',()=>{
 const notes={lane:'bottom',at:390,pushed:true,follow:true,control:true,safe:true};
 const ready=make({notes});assert(ready.ready);assert.match(ready.choices[1].title,/下路/);assert.match(ready.choices[1].text,/没有R/);assert.equal(ready.choices.length,3);
 for(const extra of [{live:{...live,gameTime:481}},{live:{...live,stats:{hp:399,maxHp:1000}}},{live:{...live,queueId:490}},{patch:'16.21'},{notes:{...notes,safe:false}},{live:null}])assert.equal(make({notes,...extra}).ready,false);
 assert.equal(make({notes:{...notes,at:401}}).fresh,false);
});
test('refreshing one expired observation cannot revive the other old lane claims, and switching lanes resets them',()=>{
 const notes={start:'red',lane:'bottom',at:100,pushed:true,follow:true,control:true,safe:true};
 const next=changeJungleNotes(notes,'pushed',undefined,200);assert(next.pushed);assert(!next.follow);assert(!next.control);assert(!next.safe);
 const changed=changeJungleNotes(notes,'lane','top',120);assert.equal(changed.lane,'top');assert(!changed.pushed);assert.equal(changed.start,'red');
 assert.throws(()=>changeJungleNotes(notes,'safe',undefined,null),/进入本局/);assert.throws(()=>changeJungleNotes(notes,'enemyPosition','mid',120));
});
test('new match and changing own hero clear lane evidence, while the guide exposes real public own health and learned ranks',()=>{
 const selection={id:'Nocturne',role:'jungle',mode:'rift',conditions:[]},jungleNotes={lane:'top',at:100,pushed:true};
 const state=validateGuideState({...selectGuide(null,selection),jungleNotes,match:{gameId:'10',phase:'InProgress'}});
 assert.equal(reconcileGuide(state,{phase:'InProgress',gameId:'11'}).guide.jungleNotes,undefined);
 assert.equal(selectGuide(state,{...selection,id:'Diana'}).jungleNotes,undefined);
 const model=createGuideModel(data,state,null,null);assert(model.jungle);assert.equal(model.jungle.ready,false);assert.match(jungleGuidanceView(model.jungle),/兵线|观察/);
});

test('unavailable or mismatched public skills never imply an unlearned ultimate',()=>{
 for(const champion of ['Nocturne','Diana','Fiddlesticks','Evelynn']){
  for(const unknown of [null,{matched:false,skills:{R:0},stats:{hp:1,maxHp:1000}},{...live,skills:{}},{...live,skills:{R:null}},{...live,skills:{R:-1}}]){
   const text=make({champion,live:unknown}).choices[0].text;
   assert.match(text,/等级未知/);assert.doesNotMatch(text,/尚未学会|生命不足/);
  }
  assert.match(make({champion}).choices[0].text,/尚未学会/);
  assert.doesNotMatch(make({champion,live:{...live,skills:{R:1}}}).choices[0].text,/尚未学会|等级未知/);
 }
});

test('birth side determines the default lower-side start and finishing lane, without inventing camp progress',()=>{
 const blue=make({live:{...live,teamSide:'blue'}});assert.equal(blue.start,'red');assert.match(blue.finish,/上路/);
 const red=make({live:{...live,teamSide:'red'}});assert.equal(red.start,'blue');assert.match(red.finish,/上路/);
 const changed=make({live:{...live,teamSide:'red'},notes:{start:'red',side:'blue'}});assert.equal(changed.side,'red');assert.match(changed.finish,/下路/);
 const fallback=make({live:null,notes:{side:'red'}});assert.equal(fallback.side,'red');assert.match(fallback.lead.title,/等待/);
 assert.match(make().finish,/未知/);assert.equal(blue.compactRoute.join(' → ').split(' → ').length,6);
 assert.match(jungleGuidanceView(blue),/不代表当前已经刷过/);
});

test('interruption clears old gank evidence, lasts at most 90 seconds, and cannot revive it after resume',()=>{
 const notes={start:'red',side:'blue',lane:'top',at:390,pushed:true,follow:true,control:true,safe:true};assert(make({notes}).ready);
 for(const reason of ['invaded','recalled','no-window']){
  const next=changeJungleNotes(notes,'situation',reason,400);assert.equal(next.lane,undefined);assert.equal(next.start,'red');
  assert.equal(validateGuideState({...selectGuide(null,{id:'Nocturne',role:'jungle',mode:'rift'}),jungleNotes:next}).jungleNotes.situation,reason);
  assert.equal(make({notes:next}).recovery,reason);assert(!make({notes:next}).ready);
  assert.equal(make({notes:next,live:{...live,gameTime:491}}).recovery,null);
  assert.equal(make({notes:next,live:{...live,gameTime:399}}).recovery,null);
  const resumed=changeJungleNotes(next,'resume',undefined,null);assert(!make({notes:resumed}).ready);assert(!resumed.situation);
 }
 assert.throws(()=>changeJungleNotes(notes,'situation','enemy-near',400));
 assert.throws(()=>changeJungleNotes(notes,'situation','invaded',null));
 assert.deepEqual(validateJungleNotes({situation:'enemy-near',situationAt:400,enemyX:3000}),undefined);
});

test('current action prioritizes safety and evidence, and champion coordination respects learned skills',()=>{
 const notes={lane:'bottom',at:390,pushed:true,follow:true,control:true,safe:true};
 assert.match(make({notes,live:{...live,stats:{hp:200,maxHp:1000}}}).lead.title,/暂停进场/);
 assert.match(make({notes,patch:'16.21'}).lead.title,/待复核/);
 assert.match(make({notes,live:{...live,queueId:490}}).lead.title,/模式尚未/);
 for(const skills of [{Q:0,W:1,E:1,R:0},{Q:1,W:null,E:1,R:1},{}]){const unknown=make({notes,live:{...live,skills}});assert(!unknown.ready);assert.match(unknown.skillNote,/基础技能/);}
 const j4=make({champion:'JarvanIV',notes});assert.match(j4.lead.text,/EQ/);assert.match(j4.routeTitle,/三营/);assert.doesNotMatch(j4.lead.text,/R留人/);
 const vi=make({champion:'Vi',notes,live:{...live,skills:{...live.skills,R:1}}});assert.match(vi.lead.text,/R/);assert.match(vi.skillNote,/≠/);
 assert.match(make({champion:'LeeSin',notes}).lead.text,/二段/);
 assert.match(make({champion:'Ivern',notes}).lead.text,/E套/);
 assert.match(make({champion:'Evelynn'}).routeTitle,/通用/);assert.match(make({champion:'Evelynn'}).mechanics,/尚未补/);
 assert.doesNotMatch(make({champion:'LeeSin',live:{...live,gameTime:1200}}).lead.title,/三营/);
});

test('low own mana or energy takes precedence over a gank candidate, with unknown resources disclosed',()=>{
 const notes={lane:'bottom',at:390,pushed:true,follow:true,control:true,safe:true};
 const read=resource=>make({notes,live:{...live,stats:{...live.stats,resource}}});
 assert(!read({type:'MANA',value:99,max:500}).ready);assert.match(read({type:'MANA',value:99,max:500}).lead.title,/恢复法力/);
 assert(read({type:'MANA',value:100,max:500}).ready);
 assert.match(read({type:'ENERGY',value:49,max:200}).lead.title,/回能量/);
 for(const resource of [null,{type:'RAGE',value:0,max:100},{type:'MANA',value:-1,max:100},{type:'MANA',value:0,max:0}])assert.match(read(resource).skillNote,/需核对/);
 assert.match(make({notes,live:{...live,matched:false,stats:{...live.stats,resource:{type:'MANA',value:0,max:500}}}}).lead.title,/等待/);
});
