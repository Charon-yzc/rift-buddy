import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {EXTRA_ROLE_PLAYS} from '../src/core/role-plays-extra.mjs';
import {rolePlay,ROLE_PLAYS_PATCH} from '../src/core/role-plays.mjs';
import {matchupPlan} from '../src/core/matchup-plans.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {heroCoach} from '../src/core/hero-coach.mjs';
import {profile} from '../src/core/rules.mjs';
import {selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;

test('all stored support and bottom preparations provide concrete distinct stage duties in the guide',()=>{
 for(const key of Object.keys(data.builds).filter(key=>/:(support|bottom)$/.test(key))){
  const [id,role]=key.split(':'),notes=['opening','key','later'].map(stage=>rolePlay(id,role,stage));
  assert.ok(notes.every(note=>note&&!note.generic),key+' has no authored preparation');
  assert.equal(new Set(notes.map(note=>note.action)).size,3,key);
  for(const stage of ['opening','key','later']){
   const model=createGuideModel(data,{...selectGuide(null,{id,role,mode:'rift',threatId:'Nautilus'}),stage});
   assert.equal(model.coach.roleTask.generic,undefined,key);
   const html=renderGuide({model},'team',false,()=>'<img>');
   assert.ok(html.includes(model.coach.action),key+':'+stage+' missing from the actual guide');
   const against=heroCoach({data,champion:id,role,enemyId:'Nautilus',stage});
   assert.doesNotMatch(against.matchup.opening,/刷野|清营地|覆盖营地|处理营地/,key);
  }
 }
});

test('a public opponent never reintroduces the primary jungle opening into a support preparation',()=>{
 for(const id of ['Chogath','Poppy','Brand','Maokai','Warwick','Volibear','Jax','Zyra']){
  for(const stage of ['opening','key','later']){
   const coach=heroCoach({data,champion:id,role:'support',enemyId:'Nautilus',stage});
   assert.doesNotMatch(coach.matchup.opening,/刷野|营地/,id+':'+stage);
   assert.doesNotMatch(coach.matchup.fight,/刷野|营地/,id+':'+stage);
   assert.ok(coach.sequence.includes('Q'),id+' lost its mechanical sequence');
  }
 }
 const direct=matchupPlan({data,champion:'Chogath',role:'support',enemyId:'Leona',ownPlan:['刷野覆盖营地','刷野追击','Q 命中 → W → E 普攻']});
 assert.doesNotMatch(direct.opening,/刷野|营地/);assert.match(direct.sequence.join(' '),/Q 命中/);
 const later=heroCoach({data,champion:'Maokai',role:'support',enemyId:'Nautilus',stage:'later'});
 assert.match(later.matchup.fight,/核心.*W.*Q.*推开/);
});

test('secondary roles preserve actual mechanics, shared cooldown choices and economy responsibilities',()=>{
 assert.match(rolePlay('Hwei','support','key').action,/WE.*不能.*WW/);
 assert.match(rolePlay('TahmKench','support','key').action,/同一份层数.*吞敌/);
 assert.match(rolePlay('Mel','support','opening').action,/不能.*搭档.*护盾/);
 assert.match(rolePlay('Zoe','support','key').action,/一秒后必回起点/);
 assert.match(rolePlay('Camille','support','key').action,/低经济.*单人线/);
 assert.match(rolePlay('Yunara','bottom','opening').action,/普通 E.*不当作.*穿墙/);
 assert.match(rolePlay('Kennen','bottom','key').action,/当前配置.*持续普攻位置/);
 assert.match(rolePlay('Chogath','jungle','key').action,/丛刃.*安全连续普攻/);
 const c=data.champions.find(c=>c.id==='Chogath'),b=getBuild(c,'jungle',data);
 assert.ok(b.runeOptions.some(option=>option.page?.selectedPerkIds?.[0]===9923),'The referenced Hail of Blades page must actually exist');
 assert.match(rolePlay('Volibear','jungle','opening').action,/W 重复同一.*E.*自己能进入/);
 assert.notEqual(rolePlay('Chogath','support','opening').action,rolePlay('Chogath','jungle','opening').action);
});

test('uncovered hero-position pairs retain own mechanics plus distinct generic stage duties with an honest coverage label',()=>{
 const id='Zilean',role='mid';assert.equal(rolePlay(id,role),null);
 const coaches=['opening','key','later'].map(stage=>heroCoach({data,champion:id,role,stage}));
 assert.equal(new Set(coaches.map(c=>c.action)).size,3);
 assert.match(coaches[0].action,/兵线/);assert.match(coaches[1].action,/同侧.*资源/);assert.match(coaches[2].action,/核心.*资源/);
 for(const coach of coaches){assert.equal(coach.roleTask.generic,true);assert.match(coach.sequence,/Q附着.*W缩短冷却.*第二次Q/);assert.match(renderGuide({model:createGuideModel(data,{...selectGuide(null,{id,role,mode:'rift'}),stage:coach.stage})},'team',false,()=>'<img>'),/通用位置分工/);}
});

test('support stages and uncovered secondary roles never import jungle or solo-lane economy tasks',()=>{
 for(const id of ['Fiddlesticks','Elise']){
  const coaches=['opening','key','later'].map(stage=>heroCoach({data,champion:id,role:'support',stage}));
  assert.equal(new Set(coaches.map(c=>c.action)).size,3);
  for(const coach of coaches){assert.doesNotMatch(coach.action,/刷野|刷营地|清营地/);assert.ok(coach.sequence);assert.ok(coach.skills.length===4);}
  assert.match(coaches[0].action,/搭档/);assert.match(coaches[2].action,/核心/);
  assert.match(heroCoach({data,champion:id,role:'jungle'}).action,/刷野/);
 }
 for(const [id,role]of [['Kassadin','support'],['Kayn','support'],['Heimerdinger','jungle']]){
  const c=heroCoach({data,champion:id,role});assert.equal(c.roleTask.generic,true);
  assert.equal(c.action,c.roleTask.action);assert.equal(c.opening,c.roleTask.opening);assert.equal(c.fight,c.roleTask.key);assert.equal(c.later,c.roleTask.later);
 }
 for(const [id,role]of [['Kassadin','mid'],['Heimerdinger','mid'],['Kayn','jungle']]){
  const phases=['opening','key','later'].map(stage=>heroCoach({data,champion:id,role,stage}));
  assert.equal(new Set(phases.map(c=>c.action)).size,3);assert.ok(phases.every(c=>!c.roleTask.generic));
 }
});

test('fresh own skill ranks separate current actions from future R sequences without imposing a level-six rule',()=>{
 for(const [id,enemy]of [['Kassadin','Heimerdinger'],['Ahri','Morgana']]){
  const state=selectGuide(null,{id,role:'mid',mode:'rift',threatId:enemy});
  const live={available:true,champion:id,mode:'rift',mapId:11,queueId:420,at:Date.now(),level:3,gold:700,gameTime:160,inventory:[],skills:{Q:1,W:1,E:1,R:0},enemies:[{id:enemy,level:3,items:[]}],allies:[]};
  const m=createGuideModel(data,state,live);assert.equal(m.live.matched,true);assert.equal(m.coach.stage,'opening');assert.deepEqual(m.coach.unlearned,['R']);
  assert.match(m.coach.futureSequence,/R/);assert.doesNotMatch(m.coach.sequence,/R接近|R 留一段|留蓝R退出/);assert.match(m.coach.sequence,/Q/);
  const html=renderGuide({model:m},'team',false,()=>'<img>');assert.match(html,/学会 R 后的条件顺序/);assert.match(html,/尚未学会 R/);
  const learned=createGuideModel(data,state,{...live,level:6,skills:{Q:3,W:1,E:1,R:1}});assert.equal(learned.coach.futureSequence,null);assert.match(learned.coach.sequence,/R/);
  const unknown=createGuideModel(data,state,{...live,at:Date.now()-20000});assert.equal(unknown.live.matched,false);assert.equal(unknown.coach.futureSequence,null,'Stale own ranks must not be used');
 }
 for(const id of ['Jayce','Elise']){
  const c=heroCoach({data,champion:id,role:id==='Elise'?'jungle':'top',ownSkills:{Q:1,W:1,E:1,R:1}});
  assert.equal(c.futureSequence,null);assert.match(c.sequence,/R/);
 }
});

test('authored top, mid and jungle plans belong to playable roles and have distinct stage decisions',()=>{
 for(const [key,notes]of Object.entries(EXTRA_ROLE_PLAYS)){
  const [id,role]=key.split(':'),hero=data.champions.find(c=>c.id===id);
  assert.ok(hero,key);assert.ok(profile(hero).roles.includes(role),key);
  assert.ok(['top','mid','jungle'].includes(role));assert.equal(notes.length,3);
  assert.equal(new Set(notes).size,3,key+' repeats the same action for different stages');
  for(const stage of ['opening','key','later']){
   const coach=heroCoach({data,champion:id,role,stage});
   assert.equal(coach.action,rolePlay(id,role,stage).action,key+':'+stage);
   assert.ok(coach.action.length>20);assert.equal(coach.roleTask.stage,stage);assert.equal(coach.actionStale,false);
  }
  assert.doesNotMatch(notes.join(' '),/必须红开|必须蓝开|最优刷野路线|对手现在没技能|敌方技能已经冷却|必杀|必赢/);
 }
});

test('stage advice gives different concrete responsibilities for top, mid and jungle',()=>{
 assert.match(rolePlay('Garen','top','opening').action,/被动回复/);
 assert.match(rolePlay('Garen','top','later').action,/核心.*接应/);
 assert.match(rolePlay('Ahri','mid','key').action,/清线.*E 实际命中.*R/);
 assert.match(rolePlay('LeeSin','jungle','key').action,/Q 首段命中.*二段落点.*W.*R 方向/);
 assert.match(rolePlay('Sejuani','jungle','key').action,/W\/普攻.*霜冻.*Q 不作为/);
 assert.match(rolePlay('Lillia','jungle','later').action,/梦尘.*R.*W 中心/);
 assert.notEqual(rolePlay('Yone','top','key').action,rolePlay('Yone','mid','key').action);
 assert.notEqual(rolePlay('Yone','top','later').action,rolePlay('Yone','mid','later').action);
});

test('reviewed solo lane openings teach their own economy instead of a camp-clearing paragraph',()=>{
 const cases=[['Trundle','top'],['Olaf','top'],['Ekko','mid'],['Gragas','top'],['Gragas','mid'],['Chogath','mid'],['Locke','mid'],['Naafiri','mid'],['Talon','mid']];
 for(const [id,role] of cases)for(const stage of ['opening','key','later']){
  const coach=heroCoach({data,champion:id,role,stage});
  assert.equal(coach.roleTask.generic,undefined,id+':'+role);
  assert.doesNotMatch(coach.action,/刷野|营地/,id+':'+role+':'+stage);
  assert.doesNotMatch(coach.opening,/刷野|营地/);
  assert.match(coach.action,/[QWER]/);
  const model=createGuideModel(data,{...selectGuide(null,{id,role,mode:'rift'}),stage});
  assert.ok(renderGuide({model},'team',false,()=>'<img>').includes(coach.action));
 }
 assert.match(heroCoach({data,champion:'Chogath',role:'jungle'}).opening,/营地/);
 assert.match(heroCoach({data,champion:'Volibear',role:'jungle'}).opening,/野怪/);
});

test('actual solo guide model and rendered action follow the later stage without a duo',()=>{
 for(const [id,role]of [['Garen','top'],['Ahri','mid'],['LeeSin','jungle']]){
  const state=selectGuide(null,{id,role,mode:'rift'});
  const live={available:true,champion:id,mode:'rift',mapId:11,queueId:420,at:Date.now(),level:12,gold:800,gameTime:1600,inventory:[],skills:{Q:3,W:2,E:5,R:2},enemies:[],allies:[]};
  const model=createGuideModel(data,state,live);
  assert.equal(model.coach.roleTask.stage,'later');assert.equal(model.coach.action,rolePlay(id,role,'later').action);
  assert.ok(renderGuide({model},'team',false,()=>'<img>').includes(model.coach.action));
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
