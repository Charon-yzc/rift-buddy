// Historical guide content is tested by scope and propagation, not cookbook wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DEFAULT_BUILD_SOURCE,projectBuildSources} from '../src/core/build-source.mjs';
import {rolePlay,ROLE_PLAYS_PATCH} from '../src/core/role-plays.mjs';
import {heroCoach} from '../src/core/hero-coach.mjs';
import {heroCoachView} from '../src/hero-coach-view.mjs';
import {selectGuide,createGuideModel} from '../src/core/guide.mjs';
const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json'));
data.builds=projectBuildSources(JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/builds.json')).entries,DEFAULT_BUILD_SOURCE,data.patch);
const phases=['opening','key','later'];

test('authored role stages reach the actual guide with separate duties and no invented certainty',()=>{
 for(const [id,role] of [['Garen','top'],['Ahri','mid'],['LeeSin','jungle'],['Ashe','bottom'],['Nautilus','support']]){
  const actions=[];
  for(const stage of phases){const task=rolePlay(id,role,stage),model=createGuideModel(data,{...selectGuide(null,{id,role,mode:'rift'}),stage});
   assert(task);assert.equal(model.coach.action,task.action);assert.equal(model.coach.roleTask.stage,stage);assert.ok(heroCoachView(model.coach).includes(task.action));actions.push(task.action);
   assert.doesNotMatch(task.action,/必须红开|必须蓝开|最优刷野路线|对手现在没技能|敌方技能已经冷却|必杀|必赢/);
  }
  assert.equal(new Set(actions).size,phases.length);
 }
});

test('the same hero keeps role economy separate even with a public matchup',()=>{
 for(const stage of phases){
  const support=heroCoach({data,champion:'Maokai',role:'support',enemyId:'Nautilus',stage}),jungle=heroCoach({data,champion:'Maokai',role:'jungle',enemyId:'Nautilus',stage});
  assert.notEqual(support.action,jungle.action);assert.doesNotMatch(support.action+' '+support.matchup.opening+' '+support.matchup.fight,/刷野|营地/);
  assert.ok(support.sequence);assert.equal(support.skills.length,4);
 }
});

test('an uncovered role uses labelled generic stage duties and retains its own hero mechanics',()=>{
 const id='Zilean',role='top';assert.equal(rolePlay(id,role),null);const coaches=phases.map(stage=>heroCoach({data,champion:id,role,stage}));
 assert.equal(new Set(coaches.map(c=>c.action)).size,phases.length);
 for(const coach of coaches){assert.equal(coach.roleTask.generic,true);assert.ok(coach.sequence);assert.equal(coach.skills.length,4);
  const model=createGuideModel(data,{...selectGuide(null,{id,role,mode:'rift'}),stage:coach.stage});assert.equal(model.coach.action,coach.action);assert.match(heroCoachView(model.coach),/通用位置分工/);
 }
 assert.equal(rolePlay('UnknownHero','support'),null);
});

test('fresh own skill ranks separate current actions from future R sequences without imposing a level-six rule',()=>{
 for(const [id,enemy]of [['Kassadin','Heimerdinger'],['Ahri','Morgana']]){
  const state=selectGuide(null,{id,role:'mid',mode:'rift',threatId:enemy});
  const live={available:true,champion:id,mode:'rift',mapId:11,queueId:420,at:Date.now(),level:3,gold:700,gameTime:160,inventory:[],skills:{Q:1,W:1,E:1,R:0},enemies:[{id:enemy,level:3,items:[]}],allies:[]};
  const m=createGuideModel(data,state,live);assert.equal(m.live.matched,true);assert.equal(m.coach.stage,'opening');assert.deepEqual(m.coach.unlearned,['R']);
  assert.match(m.coach.futureSequence,/R/);assert.doesNotMatch(m.coach.sequence,/R接近|R 留一段|留蓝R退出/);assert.match(m.coach.sequence,/Q/);
  const html=heroCoachView(m.coach);assert.match(html,/学会 R 后的条件顺序/);assert.match(html,/尚未学会 R/);
  const learned=createGuideModel(data,state,{...live,level:6,skills:{Q:3,W:1,E:1,R:1}});assert.equal(learned.coach.futureSequence,null);assert.match(learned.coach.sequence,/R/);
  const unknown=createGuideModel(data,state,{...live,at:Date.now()-20000});assert.equal(unknown.live.matched,false);assert.equal(unknown.coach.futureSequence,null,'Stale own ranks must not be used');
 }
 for(const id of ['Jayce','Elise']){
  const c=heroCoach({data,champion:id,role:id==='Elise'?'jungle':'top',ownSkills:{Q:1,W:1,E:1,R:1}});
  assert.equal(c.futureSequence,null);assert.match(c.sequence,/R/);
 }
});

test('actual solo guide model and rendered action follow the later stage without a duo',()=>{
 for(const [id,role]of [['Garen','top'],['Ahri','mid'],['LeeSin','jungle']]){
  const state=selectGuide(null,{id,role,mode:'rift'});
  const live={available:true,champion:id,mode:'rift',mapId:11,queueId:420,at:Date.now(),level:12,gold:800,gameTime:1600,inventory:[],skills:{Q:3,W:2,E:5,R:2},enemies:[],allies:[]};
  const model=createGuideModel(data,state,live);
  assert.equal(model.coach.roleTask.stage,'later');assert.equal(model.coach.action,rolePlay(id,role,'later').action);
  assert.ok(heroCoachView(model.coach).includes(model.coach.action));
 }
});

test('combo member instructions retain priority and old role notes never inherit a new data patch',()=>{
 const combo={play:{patch:ROLE_PLAYS_PATCH,stages:{key:{ownAction:'先确认搭档已经击飞，再跟同一目标。',steps:['先限制目标','再跟进']}}}};
 assert.equal(heroCoach({data,champion:'Yasuo',role:'mid',stage:'key',combo}).action,combo.play.stages.key.ownAction);
 const future={...data,patch:'17.1',version:'17.1.1'};
 for(const [id,role]of [['Garen','top'],['Ahri','mid'],['LeeSin','jungle']]){
  const old=heroCoach({data:future,champion:id,role,stage:'later'});
  assert.equal(old.actionPatch,ROLE_PLAYS_PATCH);assert.equal(old.actionStale,true);assert.equal(old.roleTask.stale,true);
  assert.equal(old.action,rolePlay(id,role,'later').action);
 }
});
