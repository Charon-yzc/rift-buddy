import {selectBuildSource} from "../src/core/build-source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {legalSkillOrder,orderPriority,skillOptions,nextSkill,recommendSkill} from '../src/core/skill-advice.mjs';
import {getBuild,validReference} from '../src/core/builds.mjs';
import {parseBuildJSON} from '../services/build-json.mjs';
import {companionPlanView} from '../src/companion-view.mjs';
import {skillSelector} from '../src/build-options-view.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const hero=id=>data.champions.find(c=>c.id===id),live=(level,skills)=>({matched:true,level,skills});
// Current OP.GG source sequences, independently checked against the
// character record's actual rank gates (sixth basic rank at level 11).
const udyrOrder='RWRERQRWRWRWWWE',jayceOrder='QWEQQWQWQWQWWEE';

test('missing position sources leave legal mechanism upgrades for every ordinary hero through level eighteen',()=>{
 const offline={...data,builds:{}};
 for(const champion of data.champions){
  if(champion.id==='Aphelios')continue; // Live ability ranks cannot identify invested stat points.
  for(const role of ['top','jungle','mid','bottom','support']){
   const build=getBuild(champion,role,offline),skills={Q:0,W:0,E:0,R:['Elise','Nidalee','Karma','Jayce'].includes(champion.id)?1:0};
   assert.ok(build.priority,`${champion.id}:${role} missing priority`);
   for(let level=1;level<=18;level++){
    const snapshot=live(level,{...skills}),options=skillOptions(champion.id,snapshot),next=nextSkill(champion.id,build.priority,build.first,snapshot);
    assert.ok(options?.points>0&&options.allowed.includes(next),`${champion.id}:${role} cannot spend level ${level}`);skills[next]++;
   }
  }
 }
 const champion=hero('Qiyana');assert.equal(getBuild(champion,'mid',offline).first,'WQE');assert.equal(getBuild(champion,'jungle',offline).first,'QWE');
});

test('offline Corki mid retains a legal basic priority and next skill at early and later levels',()=>{
 const offline={...data,builds:{}},build=getBuild(hero('Corki'),'mid',offline);
 assert.equal(build.reference,null);assert.equal(build.source,'机制基础方案');
 assert.equal(build.priority,'QEW');assert.equal(build.first,'EQW');
 assert.match(companionPlanView(offline,{own:{id:'Corki'},selection:{id:'Corki',role:'mid',mode:'rift'},build}),/加点/);
 for(const [level,skills,next] of [[1,{Q:0,W:0,E:0,R:0},'E'],[2,{Q:0,W:0,E:1,R:0},'Q'],[4,{Q:1,W:1,E:1,R:0},'Q'],[8,{Q:4,W:1,E:1,R:1},'E']]){
  assert.equal(nextSkill('Corki',build.priority,build.first,live(level,skills)),next);
  const model=createGuideModel(offline,selectGuide(null,{id:'Corki',role:'mid',mode:'rift'}),{available:true,at:Date.now(),champion:'Corki',mode:'rift',mapId:11,level,skills,inventory:[],gold:0});
  assert.equal(model.nextSkill,next);
 }
});
test('special source orders obey the actual champion gates instead of normal ultimate rules',()=>{
 assert.equal(legalSkillOrder(udyrOrder,'Udyr'),true);assert.equal(legalSkillOrder(udyrOrder,'Ashe'),false);
 assert.equal(legalSkillOrder(jayceOrder,'Jayce'),true);assert.equal(legalSkillOrder(jayceOrder,'Ashe'),false);
 assert.equal(legalSkillOrder('QWERRR','Jayce'),false);
 assert.equal(orderPriority(udyrOrder,'Udyr'),'RWEQ');
 const order=udyrOrder.slice(0,9)+'RR';assert.equal(legalSkillOrder(order,'Udyr'),false,'Sixth R cannot be learned at level 10');
 assert.equal(legalSkillOrder('QQQEQREQEQEEREW','Aphelios'),false,'Ability rows do not prove stat investments');
});
test('Udyr learns a stance at level one and follows Q at six instead of forcing R',()=>{
 assert.equal(nextSkill('Udyr','RWEQ','RWR',live(1,{Q:0,W:0,E:0,R:0}),udyrOrder),'R');
 const atSix=live(6,{Q:0,W:1,E:1,R:3});
 assert.equal(skillOptions('Udyr',atSix).points,1);assert.equal(nextSkill('Udyr','RWEQ','RWR',atSix,udyrOrder),'Q');
 assert.equal(nextSkill('Udyr','RWEQ','RWR',live(11,{Q:1,W:2,E:2,R:5}),udyrOrder),'R');
 assert.equal(skillOptions('Udyr',live(10,{Q:1,W:1,E:1,R:6})),null);
 const advice=recommendSkill({champion:'Udyr',priority:'RWEQ',first:'RWR',order:udyrOrder,live:live(1,{Q:0,W:0,E:0,R:0})});
 assert.equal(advice.next,'R');assert.match(advice.caution,/姿态/);assert.doesNotMatch(advice.reason,/大招/);
 assert.equal(recommendSkill({champion:'Udyr',priority:'RWEQ',live:atSix,reviewed:false}).next,null);
});
test('free R ranks do not consume points or suppress legal upgrades for transforming heroes',()=>{
 for(const id of ['Karma','Elise','Nidalee']){
  assert.equal(skillOptions(id,live(1,{Q:0,W:0,E:0,R:1})).points,1);
  assert.equal(nextSkill(id,'QEW','QEW',live(1,{Q:0,W:0,E:0,R:1})),'Q');
  assert.equal(skillOptions(id,live(5,{Q:3,W:1,E:1,R:1})).points,0);
  assert.equal(nextSkill(id,'QEW','QEW',live(6,{Q:3,W:1,E:1,R:1})),'R');
  assert.equal(skillOptions(id,live(6,{Q:3,W:1,E:1,R:2})).points,0);
  assert.equal(skillOptions(id,live(5,{Q:3,W:1,E:0,R:2})),null);
  assert.equal(skillOptions(id,live(1,{Q:0,W:0,E:0,R:0})),null,'Missing automatic R is unconfirmed');
 }
 assert.equal(nextSkill('Jayce','QWE','QWE',live(11,{Q:5,W:3,E:2,R:1}),jayceOrder),'Q');
 assert.equal(skillOptions('Jayce',live(10,{Q:6,W:2,E:1,R:1})),null);
 assert.equal(nextSkill('Jayce','QWE','QWE',live(18,{Q:6,W:6,E:6,R:1})),null);
});
function source(id,order){
 const c=hero(id),ref=data.builds[id+':top'],page=ref.runePage;
 return parseBuildJSON({meta:{version:data.patch},data:{summary:{id:c.key,positions:[{name:'TOP'}]},
  core_items:[{ids:ref.core[0].items,play:300,win:150}],boots:[],starter_items:[],last_items:[],summoner_spells:[],
  runes:[],rune_pages:[{builds:[{primary_page_id:page.primaryStyleId,secondary_page_id:page.subStyleId,primary_rune_ids:page.selectedPerkIds.slice(0,4),secondary_rune_ids:page.selectedPerkIds.slice(4,6),stat_mod_ids:page.selectedPerkIds.slice(6),play:300,win:150}]}],
  skills:[{order:[...order],play:300,win:150}],
 }},{champion:c,role:'top',data,url:`https://op.gg/lol/champions/${id.toLowerCase()}/build/top`});
}
test('parsed special orders survive cache validation, plan rendering and live guide selection',()=>{
 for(const [id,order] of [['Udyr',udyrOrder],['Jayce',jayceOrder]]){
  const ref=source(id,order),fixture={...data,builds:{...data.builds,[id+':top']:ref}};
  assert.equal(ref.skillOptions.length,1);assert.equal(validReference(ref,hero(id),'top',fixture),true);
  const build=getBuild(hero(id),'top',fixture),selection={id,role:'top',mode:'rift'};
  assert.equal(build.skillOrder,order);assert.equal(build.skillChoices[0].source,'OP.GG');
  assert.match(skillSelector(build),/11级/);assert.match(companionPlanView(fixture,{build,selection}),/11级/);
  if(id==='Udyr'){
   const m=createGuideModel(fixture,selectGuide(null,selection),{...live(6,{Q:0,W:1,E:1,R:3}),available:true,champion:id,mode:'rift',mapId:11,inventory:[],gold:800,at:Date.now()});
   assert.equal(m.nextSkill,'Q');assert.equal(m.skillOrder,order);
  }
 }
 const aphelios=getBuild(hero('Aphelios'),'bottom',data);
 assert.match(skillSelector(aphelios),/属性加点/);
 assert.match(recommendSkill({champion:'Aphelios',priority:'QWE',live:live(6,{Q:3,W:1,E:1,R:1})}).reason,/属性点/);
});

test('uncached Udyr sources learn E by level four and retain legal four-stance upgrades and guide advice',()=>{
 const fixture=structuredClone(data);selectBuildSource(fixture,{region:'kr',tier:'diamond_plus'});
 for(const role of ['top','jungle']){
  const build=getBuild(hero('Udyr'),role,fixture);assert.equal(build.reference,null);

  const skills={Q:0,W:0,E:0,R:0},sequence=[];
  for(let level=1;level<=18;level++){
   const snapshot=live(level,{...skills}),advice=recommendSkill({champion:'Udyr',role,priority:build.priority,first:build.first,live:snapshot});
   assert.ok(skillOptions('Udyr',snapshot).allowed.includes(advice.next));skills[advice.next]++;sequence.push(advice.next);
   if(level===4)assert.ok(skills.E>0,'Approach/stun advice must not omit learning E');
  }
  assert.match(sequence.join(''),/E/);assert.equal(Object.values(skills).reduce((sum,n)=>sum+n,0),18);
  const opening={Q:role==='jungle'?1:0,W:1,E:0,R:role==='jungle'?1:2};
  const model=createGuideModel(fixture,selectGuide(null,{id:'Udyr',role,mode:'rift'}),{...live(4,opening),available:true,champion:'Udyr',mode:'rift',mapId:11,inventory:[],gold:0,at:Date.now()});
  assert.equal(model.nextSkill,'E');assert.equal(model.priority,'RWEQ');
 }
 const cached=getBuild(hero('Udyr'),'jungle',data);assert.equal(cached.skillOrder,data.builds['Udyr:jungle'].skillOptions[0].order,'Available full source order must retain precedence');
});
