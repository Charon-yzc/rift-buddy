import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {jungleGuidance,changeJungleNotes} from '../src/core/jungle-guidance.mjs';
import {selectGuide,createGuideModel,reconcileGuide,validateGuideState} from '../src/core/guide.mjs';
import {jungleGuidanceView} from '../src/jungle-guidance-view.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));data.builds=JSON.parse(fs.readFileSync(new URL('../data/builds.json',import.meta.url))).entries;
const live={matched:true,mapId:11,queueId:420,gameTime:400,skills:{Q:3,W:1,E:1,R:0},stats:{hp:600,maxHp:1000}};
const make=(extra={})=>jungleGuidance({champion:'Nocturne',role:'jungle',mode:'rift',patch:'16.20',live,...extra});
test('Nocturne and Diana retain concrete six camps while Ivern uses passive release, without inferring a clear record',()=>{
 const nocturne=make();assert.equal(nocturne.opening.length,6);assert.match(nocturne.choices[0].text,/尚未学会/);assert.match(nocturne.mechanics,/6级前/);
 const diana=make({champion:'Diana',notes:{start:'red'}});assert.equal(diana.opening[0],'红BUFF');assert.match(diana.mechanics,/学会|6级R/);
 const ivern=make({champion:'Ivern'});assert(ivern.special);assert(ivern.opening.some(t=>t.includes('画圈')));assert.match(jungleGuidanceView(ivern),/不代表当前已经刷过/);
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
