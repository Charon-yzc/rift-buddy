// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {ultimateReference} from '../src/core/combat-models.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide as renderGuideActual} from '../src/guide-view.mjs';
const renderGuide=(snapshot,...rest)=>renderGuideActual({...snapshot,model:snapshot?.model?{...snapshot.model,compact:false}:snapshot?.model},...rest);
const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json'));data.builds=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/builds.json')).entries;data.hexBuilds=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/hex-builds.json')).entries;
const hero=id=>data.champions.find(c=>c.id===id),cho=hero('Chogath'),garen=hero('Garen'),patch='16.20';
const ranks={Q:4,W:2,E:2,R:1},input={champion:cho,level:9,skills:ranks,panel:{ap:200,maxHp:3000},patch};
const live=()=>({available:true,champion:'Chogath',mode:'rift',mapId:11,level:9,skills:ranks,at:Date.now(),inventory:[{id:'3089',count:1},{id:'3084',count:1}],inventoryKnown:true,gold:800,stats:{ap:200,maxHp:3000},enemies:[]});
const state=selectGuide(null,{id:'Chogath',role:'jungle',mode:'rift'});

test('Feast single-cast champion and non-champion damage use actual AP and unrounded level health',()=>{
 const champion={...cho,stats:{...cho.stats,hp:600,hpperlevel:100}};
 // At L6 base HP is995; L11 base1477.5; L16 base2047.5. Explicit bonus HP is500/1000/1000.
 for(const [level,skills,maxHp,championDamage,nonChampionDamage] of [[6,{Q:3,W:1,E:1,R:1},1495,450,1350],[11,{Q:5,W:1,E:3,R:2},2477.5,675,1400],[16,{Q:5,W:3,E:5,R:3},3047.5,850,1400]]){
  const result=ultimateReference({champion,level,skills,panel:{ap:200,maxHp},patch});
  assert.equal(result.available,true);assert.equal(result.championDamage,championDamage);assert.equal(result.nonChampionDamage,nonChampionDamage);
 }
});

test('the live health already includes items and Feast stacks, without adding either again',()=>{
 const model=createGuideModel(data,state,live());
 assert.equal(model.ultimateReference.championDamage,572);assert.equal(model.ultimateReference.nonChampionDamage,1472);
 assert.equal(model.ultimateReference.ap,200);assert.ok(Math.abs(model.ultimateReference.bonusHp-1722.44)<1e-6);
 const bare=createGuideModel(data,state,{...live(),inventory:[]});assert.deepEqual(bare.ultimateReference,model.ultimateReference);
 const html=renderGuide({model},'combat',false,()=>'<img>');assert.doesNotMatch(html,/对英雄约|单次技能参考/);assert.match(html,/compact-guide-main/);
});

test('a missing real AP or maximum-health field does not become guessed Feast damage',()=>{
 for(const panel of [{maxHp:3000},{ap:200},{ap:null,maxHp:3000},{ap:200,maxHp:null},{ap:200,maxHp:0},{ap:NaN,maxHp:3000}]){
  const result=ultimateReference({...input,panel});assert.equal(result.available,false);assert.equal(Object.hasOwn(result,'championDamage'),false);
 }
 assert.equal(ultimateReference({...input,panel:{ap:0,maxHp:3000}}).available,true,'A known zero AP is valid');
 const model=createGuideModel(data,state,{...live(),stats:{maxHp:3000}}),html=renderGuide({model},'combat',false,()=>'<img>');
 assert.equal(model.ultimateReference.available,false);assert.match(model.ultimateReference.reason,/实时法强或最大生命暂不可读/);assert.doesNotMatch(html,/对英雄约 <strong>/);
});

test('single-cast references reject impossible ranks, unlearned R and unknown levels',()=>{
 for(const changes of [{level:null},{level:19},{level:5,skills:{Q:2,W:1,E:1,R:1}},{level:10,skills:{Q:4,W:2,E:2,R:2}},{level:15,skills:{Q:5,W:2,E:4,R:3}},{skills:{Q:5,W:5,E:5,R:1}},{skills:{Q:4,W:2,E:2}},{skills:{Q:4,W:2,E:2,R:'1'}}])assert.equal(ultimateReference({...input,...changes}).available,false);
 assert.match(ultimateReference({...input,level:5,skills:{Q:3,W:1,E:1,R:0}}).reason,/尚未学习/);
});

test('old patches, unreviewed modes and a stale champion source cannot use current R constants',()=>{
 for(const changes of [{patch:'16.19'},{patch:'17.1'},{mode:'hex'},{champion:{...cho,combatStatsSource:{patch:'16.19'}}}])assert.equal(ultimateReference({...input,...changes}).available,false);
 assert.equal(ultimateReference({...input,champion:hero('Ashe')}),null);
});

test('Garen uses the current R base plus missing-health ratio without fabricating enemy health',()=>{
 for(const [level,skills,baseDamage,missingHealthRatio] of [[6,{Q:3,W:1,E:1,R:1},125,.25],[11,{Q:5,W:1,E:3,R:2},200,.3],[16,{Q:5,W:3,E:5,R:3},275,.35]]){
  const result=ultimateReference({champion:garen,level,skills,patch,panel:{}});assert.equal(result.available,true);assert.equal(result.baseDamage,baseDamage);assert.equal(result.missingHealthRatio,missingHealthRatio);assert.equal(Object.hasOwn(result,'championDamage'),false);
 }
 const model=createGuideModel(data,selectGuide(null,{id:'Garen',role:'top',mode:'rift'}),{...live(),champion:'Garen',stats:{}}),html=renderGuide({model},'combat',false,()=>'<img>');
 assert.equal(model.ultimateReference.baseDamage,125);assert.equal(model.ultimateReference.missingHealthRatio,.25);assert.equal(Object.hasOwn(model.ultimateReference,'championDamage'),false);assert.doesNotMatch(html,/立即击杀|可斩杀|可抢龙|对英雄约/);
});

test('R references remain useful without enemies but stop with stale, partial or unsupported snapshots',()=>{
 assert.equal(createGuideModel(data,state,live()).ultimateReference.available,true);
 for(const change of [{available:false},{inventoryKnown:false},{level:20},{at:Date.now()-15000}])assert.equal(createGuideModel(data,state,{...live(),...change}).ultimateReference,null);
 const hex=selectGuide(null,{id:'Chogath',role:'jungle',mode:'hex'});assert.equal(createGuideModel(data,hex,{...live(),mode:'hex',mapId:12}).ultimateReference,null);
});
