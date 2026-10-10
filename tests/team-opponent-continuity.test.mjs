import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {heroCoach} from '../src/core/hero-coach.mjs';
import {heroCoachView} from '../src/hero-coach-view.mjs';
import {cooperationPlan,createCooperationGraph} from '../src/core/cooperation.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {selectGuide,createGuideModel,prepareGuideOpponent,validateGuideState} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {companionPlanView} from '../src/companion-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json'));
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const graph=createCooperationGraph(data.champions);
function planFor(members){
 const slots=createSlots().map(slot=>{
  const member=members.find(([role])=>role===slot.role);
  return {...slot,...(member?{champion:member[1],party:true,locked:true}:{})};
 });
 return captureCreativePlan({adaptive:cooperationPlan(members.map(([role,champion])=>({role,champion})),graph),slots},data);
}

test('public enemy conditions retain accepted duo/trio order and every member task',()=>{
 for(const members of [
  [['jungle','Vi'],['mid','Ahri']],
  [['jungle','JarvanIV'],['mid','Syndra']],
  [['top','Kayle'],['jungle','Kindred'],['mid','Vladimir']]
 ]){
  const saved=planFor(members),identity=JSON.stringify(saved);
  for(const [role,id] of members)for(const stage of ['key','later']){
   const build=getBuild(data.champions.find(c=>c.id===id),role,data,{creativePlan:saved,comboId:saved.id});
   const input={data,champion:id,role,combo:build.combo,stage,ownSkills:{Q:3,W:1,E:2,R:1}};
   const before=heroCoach(input);
   for(const enemyId of ['Janna','Morgana','Soraka']){
    const after=heroCoach({...input,enemyId});
    assert.equal(after.sequenceSource,'team');
    assert.ok(after.sequence.endsWith(before.sequence));
    for(const step of saved.steps)assert.ok(after.sequence.includes(step));
    assert.ok(after.action.includes(build.combo.ownJob));
    assert.ok(after.sequence.startsWith(after.matchup.sequence[0]));
    for(const compact of [false,true])assert.ok(heroCoachView(after,{compact}).includes('沿用已选配合'));
   }
  }
  assert.equal(JSON.stringify(saved),identity,'Reading opponent conditions must not rewrite the saved plan');
 }
});

test('a partner ultimate does not gate the local member while an unlearned own spell does',()=>{
 const saved=planFor([['jungle','JarvanIV'],['mid','Syndra']]);
 const build=getBuild(data.champions.find(c=>c.id==='Syndra'),'mid',data,{creativePlan:saved,comboId:saved.id});
 const input={data,champion:'Syndra',role:'mid',stage:'key',combo:build.combo,enemyId:'Janna'};
 const ready=heroCoach({...input,ownSkills:{Q:3,W:1,E:1,R:0}});
 assert.deepEqual(ready.unlearned,[]);
 assert.match(ready.sequence,/嘉文 R/);
 const missing=heroCoach({...input,ownSkills:{Q:3,W:1,E:0,R:0}});
 assert.deepEqual(missing.unlearned,['E']);
 assert.match(missing.futureSequence,/嘉文 R/);
 assert.doesNotMatch(missing.sequence,/嘉文 R/);
 assert.match(missing.sequence,/尚未学会 E/);
 assert.match(heroCoachView(missing),/学会 E 后的条件顺序/);
});

test('opening preparation and solo coaching keep their original purpose',()=>{
 const combo={ownJob:'R 接已确认的控制。',steps:['双方 R 实际可用再接力。'],patch:data.patch};
 const opening=heroCoach({data,champion:'Ahri',role:'mid',stage:'opening',combo,enemyId:'Janna',ownSkills:{Q:1,W:0,E:0,R:0}});
 assert.equal(opening.sequenceSource,'personal');
 assert.doesNotMatch(opening.sequence,/双方 R/);
 const solo=heroCoach({data,champion:'Ahri',role:'mid',stage:'key',enemyId:'Janna'});
 assert.equal(solo.sequenceSource,'personal');
 assert.equal(solo.sequence,solo.matchup.sequence.join(' → '));
 const samira=getBuild(data.champions.find(c=>c.id==='Samira'),'bottom',data,{comboId:'naut-samira'}).combo;
 const unavailable=heroCoach({data,champion:'Samira',role:'bottom',stage:'key',combo:samira,enemyId:'Morgana',ownSkills:{Q:1,W:1,E:0,R:0}});
 assert.ok(unavailable.futureSequence);
 assert.match(unavailable.sequence,/别把黑盾目标当已经被控住/);
});

test('the sidebar and restored guide share the selected team order and lose withdrawn opponent conditions',()=>{
 const saved=planFor([['jungle','JarvanIV'],['mid','Syndra']]);
 const selection={id:'Syndra',role:'mid',mode:'rift',comboId:saved.id,creativePlan:saved};
 const build=getBuild(data.champions.find(c=>c.id===selection.id),selection.role,data,selection);
 const sidebar=companionPlanView(data,{selection,build},[],{enemyIds:['Janna'],opponentId:'Janna'});
 for(const step of saved.steps)assert.ok(sidebar.includes(step));
 assert.ok(sidebar.includes('沿用已选配合'));
 const guide=prepareGuideOpponent(selectGuide(null,selection),selection,'Janna',{gameId:'3201',enemyIds:['Janna']});
 const restored=validateGuideState(JSON.parse(JSON.stringify({...guide,stage:'key'})));
 const live={available:true,champion:'Syndra',mode:'rift',mapId:11,queueId:420,at:Date.now(),level:7,gold:800,gameTime:900,inventory:[],skills:{Q:3,W:1,E:1,R:0},enemies:[{id:'Janna',name:'迦娜',level:7,items:[],itemsKnown:true}],allies:[]};
 const model=createGuideModel(data,restored,live),html=renderGuide({model},'team',false,()=>'<img>');
 assert.equal(model.coach.matchup.enemy.id,'Janna');
 assert.deepEqual(model.coach.unlearned,[]);
 for(const step of saved.steps)assert.ok(model.coach.sequence.includes(step)&&html.includes(step));
 assert.equal(model.coach.sequenceSource,'team');
 const withdrawn=createGuideModel(data,restored,{...live,enemies:[]});
 assert.equal(withdrawn.coach.enemy,null);
 assert.equal(withdrawn.coach.matchup,null);
 for(const step of saved.steps)assert.ok(withdrawn.coach.sequence.includes(step));
});
