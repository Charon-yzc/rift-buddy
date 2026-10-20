import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {profile} from '../src/core/rules.mjs';
import {rankAugmentOptions,recommendAugmentReroll,analyzeAugmentSet} from '../src/core/hex-compare.mjs';
const data=JSON.parse(fs.readFileSync('data/game.json','utf8'));
const hero=id=>data.champions.find(c=>c.id===id);
const ranked=(champion,options,owned=[],buildKey=profile(champion).build)=>rankAugmentOptions({champion,options,owned,augments:data.augments,buildKey});

test('crit carry ranks a crit augment first and marks only the leading fit as the first pick',()=>{
 const rows=ranked(hero('Ashe'),[1047,1041,1141]);
 assert.equal(rows[0].id,1047);
 assert.equal(rows[0].priority,'优先');
 assert.equal(rows[0].top,true);
 assert.equal(rows[0].rank,1);
 assert.ok(rows.find(row=>row.id===1141).cautions.some(text=>/队友/.test(text)));
 for(const row of rows){
  assert.ok(!('score' in row));
  assert.ok(!('winRate' in row));
  assert.ok(!('pickRate' in row));
 }
});

test('tank champion ranks a survival augment above a crit augment',()=>{
 const rows=ranked(hero('Malphite'),[1047,1041]);
 assert.equal(rows[0].id,1041);
 assert.equal(rows[0].top,true);
 assert.equal(rows.find(row=>row.id===1047).priority,'备选');
});

test('reroll advice is positive only when every offered augment lacks a mechanical fit',()=>{
 const bad=recommendAugmentReroll({champion:hero('Ashe'),options:[1141,1013,1346],owned:[],augments:data.augments,buildKey:'crit'});
 assert.equal(bad.recommended,true);
 assert.match(bad.text,/重随/);
 const good=recommendAugmentReroll({champion:hero('Ashe'),options:[1047,1356,1048],owned:[],augments:data.augments,buildKey:'crit'});
 assert.equal(good.recommended,false);
 assert.doesNotMatch(good.text,/胜率|选取率/);
});

test('combo analysis names a formed package and its direction without synthetic rates',()=>{
 const set=analyzeAugmentSet({champion:hero('Ashe'),owned:[1047,1048,1356],augments:data.augments,buildKey:'crit'});
 const crit=set.packages.find(row=>row.id==='crit');
 assert.ok(crit?.formed);
 assert.ok(set.synergies.some(text=>/暴击/.test(text)));
 assert.match(set.buildDirection,/暴击/);
 for(const key of ['score','winRate','pickRate']){
  assert.ok(!(key in set));
  for(const row of set.packages)assert.ok(!(key in row));
 }
});

test('combo analysis reports an ultimate conflict and an AD conversion mismatch',()=>{
 const ultimate=analyzeAugmentSet({champion:hero('Ashe'),owned:[1004,1349],augments:data.augments,buildKey:'crit'});
 assert.ok(ultimate.conflicts.some(text=>/终极/.test(text)));
 const mismatch=analyzeAugmentSet({champion:hero('Ashe'),owned:[1205],augments:data.augments,buildKey:'crit'});
 assert.ok(mismatch.conflicts.some(text=>/攻击力|法术强度/.test(text)));
});

test('mage skill-crit augment is not contradicted by a caster penalty',()=>{
 const row=ranked(hero('Veigar'),[1048])[0];
 assert.equal(row.priority,'优先');
 assert.ok(!row.cautions.some(text=>/暴击强化/.test(text)));
 assert.ok(row.reasons.some(text=>/技能.*暴击/.test(text)));
});

test('burn damage crit augment fits a burn mage without a caster penalty',()=>{
 const row=ranked(hero('Brand'),[1092])[0];
 assert.equal(row.priority,'优先');
 assert.equal(row.top,true);
 assert.ok(row.reasons.some(text=>/持续伤害/.test(text)));
 assert.ok(!row.cautions.some(text=>/暴击强化/.test(text)));
 const offBuild=ranked(hero('Zed'),[1092])[0];
 assert.equal(offBuild.priority,'备选');
});

test('self-healing frontline can use death ring without a support penalty or conflict',()=>{
 const row=ranked(hero('DrMundo'),[1015])[0];
 assert.equal(row.priority,'优先');
 assert.equal(row.top,true);
 assert.ok(!row.cautions.some(text=>/队友/.test(text)));
 assert.ok(row.reasons.some(text=>/自身回复|生命回复/.test(text)));
 const set=analyzeAugmentSet({champion:hero('DrMundo'),owned:[1015,1346],augments:data.augments,buildKey:'tank'});
 assert.equal(set.conflicts.some(text=>/治疗|护盾|队友/.test(text)),false);
 assert.ok(set.synergies.some(text=>/死亡之环/.test(text)));
});

test('ally shield champions are recognized as support triggers',()=>{
 for(const id of ['Thresh','Morgana','LeeSin']){
  const row=ranked(hero(id),[1141])[0];
  assert.equal(row.priority,'优先');
  assert.equal(row.top,true);
  assert.ok(row.reasons.some(text=>/治疗或护盾/.test(text)));
  assert.ok(!row.cautions.some(text=>/缺少稳定手段/.test(text)));
 }
});

test('front-line survival reason is not repeated after ranking',()=>{
 const row=ranked(hero('Malphite'),[1041])[0];
 assert.equal(row.reasons.filter(text=>/前排/.test(text)).length,1);
 const support=ranked(hero('Thresh'),[1141])[0];
 assert.equal(support.reasons.filter(text=>/队友|友方/.test(text)).length,1);
});

test('reroll advice asks for a champion before judging',()=>{
 const advice=recommendAugmentReroll({champion:null,options:[1047,1041],owned:[],augments:data.augments});
 assert.equal(advice.recommended,false);
 assert.match(advice.text,/选择英雄/);
});

test('non-caster burn augment keeps its trigger check on an off-build',()=>{
 const row=ranked(hero('Zed'),[1092])[0];
 assert.equal(row.priority,'备选');
 assert.ok(row.reasons.some(text=>/触发条件/.test(text)));
 assert.ok(!row.cautions.some(text=>/暴击强化/.test(text)));
});

test('non-burn non-mage caster burn augment fits a sustained AP build',()=>{
 for(const id of ['Nami','Akali']){
  const row=ranked(hero(id),[1092])[0];
  assert.equal(row.priority,'次选');
  assert.equal(row.top,false);
  assert.ok(row.reasons.some(text=>/持续伤害可以暴击/.test(text)));
 }
});
test('a defensive crit augment is not treated as a carry-only crit pick',()=>{
 const rows=ranked(hero('Malphite'),[1080]);
 assert.equal(rows[0].priority,'次选');
 assert.ok(rows[0].reasons.some(text=>/减伤|防御/.test(text)));
});

test('heal and shield power without an ally trigger is reported as unusable',()=>{
 const set=analyzeAugmentSet({champion:hero('Ashe'),owned:[1037,1324],augments:data.augments,buildKey:'crit'});
 assert.ok(set.conflicts.some(text=>/治疗|护盾/.test(text)));
});

test('support package is credited only to champions that can heal or shield allies',()=>{
 const ashe=analyzeAugmentSet({champion:hero('Ashe'),owned:[1141,1037,1095],augments:data.augments,buildKey:'crit'});
 assert.ok(ashe.conflicts.some(text=>/治疗|护盾|队友/.test(text)));
 const nami=analyzeAugmentSet({champion:hero('Nami'),owned:[1141,1037,1095],augments:data.augments,buildKey:'enchanter'});
 assert.ok(nami.packages.some(row=>row.id==='support'&&row.formed));
 assert.equal(nami.conflicts.some(text=>/没有.*治疗/.test(text)),false);
});

test('hex view renders the ranking, reroll note and set analysis',async()=>{
 const {renderHexComparison}=await import('../src/hex-view.mjs');
 const html=renderHexComparison({data,hero:'Ashe',options:[1047,1041,1141],owned:[1047,1048]});
 assert.match(html,/首选|优先/);
 assert.match(html,/不是胜率|不预测/);
 assert.match(html,/本局组合/);
 assert.doesNotMatch(html,/胜率\s*\d/);
});
