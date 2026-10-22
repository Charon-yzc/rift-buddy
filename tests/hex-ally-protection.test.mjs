import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import review from '../src/core/hex-ally-protection-review.json' with {type:'json'};
import {hexAllyProtection} from '../src/core/hex-ally-protection.mjs';
import {hexChampionReview} from '../src/core/hex-review.mjs';
import {hexRecommendations} from '../src/core/hex-recommendations.mjs';
import {compareAugments} from '../src/core/hex-compare.mjs';
import {hexDecision} from '../src/core/hex-decisions.mjs';
import {renderHexComparison} from '../src/hex-view.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const read=async file=>JSON.parse(await fs.readFile(new URL(file,import.meta.url))),base=await read('../data/game.json'),routes=(await read('./fixtures/hex-routes-16.21.json')).game,draft=await read('./fixtures/hex-draft-16.21.json'),fixture=await read('./fixtures/hex-ally-protection-16.21.json');
const sources=new Map();for(const c of [...routes.champions,...draft.champions,...fixture.champions])sources.set(c.id,{...sources.get(c.id),...c});
const data={...base,...routes,champions:base.champions.map(c=>({...c,...sources.get(c.id)}))};
const hero=id=>data.champions.find(c=>c.id===id),row=(id,owned=[],other=data)=>hexRecommendations({data:other,hero:id,options:[1141],owned}).rows[0];

test('32 purpose-limited ability reviews add named conditions without approving other affinities or ranking new kits',()=>{
 const before=JSON.stringify(data);assert.equal(Object.keys(review.heroes).length,32);
 for(const id of Object.keys(review.heroes)){
  const evidence=hexAllyProtection(hero(id),data.patch);assert(evidence?.available,id);assert(evidence.conditions.length);
  const result=hexDecision({data,hero:id,options:[1058,1141,1004]}),r=result.rows[1],direct=row(id);
  assert.deepEqual(result.rows.map(r=>r.id),[1058,1141,1004]);assert(evidence.conditions.every(text=>r.reasons.includes(text)),id);assert.equal(direct.score,undefined);assert.equal(direct.winRate,undefined);
  if(hexChampionReview(hero(id),data.patch)!=='current'){assert.equal(r.heroReviewed,false);assert.equal(r.level,'conditional');assert.equal(r.rank,null);assert.equal(r.top,false);assert.match(r.cautions.join(' '),/仅核对上述/);}
  assert.doesNotMatch([...r.reasons,...r.cautions].join(' '),/自身未核实友方|不推定英雄技能适用/);assert.doesNotMatch(r.reasons.join(' '),/30%/);
  const bare=compareAugments({champion:hero(id),patch:data.patch,options:[1141],augments:data.augments})[0];assert(evidence.conditions.every(text=>bare.reasons.includes(text)),id);
 }
 assert.equal(JSON.stringify(data),before);
});

test('self recovery, receiving support, pet effects and speed buffs are not approved ally-protection paths',()=>{
 for(const id of 'Aatrox Ambessa DrMundo Hecarim Illaoi JarvanIV Kled Lucian Naafiri Shyvana'.split(' ')){
  assert.equal(hexAllyProtection(hero(id),data.patch),null,id);assert(!review.heroes[id]);
  assert(!row(id).reasons.some(text=>/友方英雄.*护盾|治疗附近.*友方|友方.*治疗/.test(text)),id);
 }
 assert.equal(hexAllyProtection(undefined,data.patch),null);assert.equal(hexAllyProtection({id:'Unknown'},data.patch),null);
});

test('only owned and currently verified ultimate locks withdraw reviewed R paths, never declare the whole augment useless',()=>{
 for(const id of ['Fiora','Galio','Kindred','Nilah','Shen','TahmKench']){
  assert(row(id).reasons.some(text=>text.startsWith('R ')),id);
  const r=row(id,[1004]);assert(!r.reasons.some(text=>text.startsWith('R ')),id);assert.notEqual(r.level,'conflict');assert.match(r.cautions.join(' '),/R 无法使用/);assert.match(r.cautions.join(' '),/其他途径须另行核对/);
  const offered=hexDecision({data,hero:id,options:[1141,1004]});assert(offered.rows[0].reasons.some(text=>text.startsWith('R ')));assert.equal(offered.reroll.recommended,false);
  for(const field of ['key','description']){const changed=structuredClone(data);changed.augments.find(a=>a.id===1004)[field]+=' changed';assert(row(id,[1004],changed).reasons.some(text=>text.startsWith('R ')));}
 }
 for(const id of ['Janna','Milio','Senna','Soraka','Yuumi']){const r=row(id,[1004]);assert(r.reasons.some(text=>!text.startsWith('R ')));assert(!r.reasons.some(text=>text.startsWith('R ')));assert.match(r.cautions.join(' '),/仍须满足上列基础技能条件/);}
});

test('form, attachment, target and area prerequisites stay explicit instead of implying always-on healing',()=>{
 const checks={Hwei:/WW「渲浓」.*池中/,LeeSin:/第一段 W.*友方英雄.*摸眼.*第二段/,Nidalee:/仅人类形态 E.*美洲狮形态 E/,Yuumi:/E 只有在附身时/,Thresh:/第一个.*接触/,Morgana:/魔法护盾.*不能.*物理/,Fiora:/四处破绽.*至少.*一处.*阵亡/,Kindred:/R 结束.*敌人.*10%/,Seraphine:/自己已有护盾.*延迟/,Taric:/消耗已储存充能/};
 for(const [id,pattern]of Object.entries(checks))assert.match(row(id).reasons.join(' '),pattern,id);
 assert.match(row('Nidalee',[1004]).cautions.join(' '),/不推定当前形态或仍能切回人类/);
 assert.match(row('Nilah').reasons.join(' '),/未核实被动转授/);assert.match(row('Renata').reasons.join(' '),/不把 W.*复活/);
});

test('same-patch source drift and effect drift withdraw only the purpose-specific conditions',()=>{
 for(const mutate of [c=>delete c.mechanicSource,c=>c.mechanicSource.character.sha256='0'.repeat(64),c=>c.mechanicSource.dataDragonURL+='changed',c=>c.mechanicSource.spells[2].tooltip+=' changed',c=>c.mechanicSource.passive.description+=' changed']){
  const changed=structuredClone(data);mutate(changed.champions.find(c=>c.id==='Morgana'));assert.equal(hexAllyProtection(changed.champions.find(c=>c.id==='Morgana'),data.patch),null);assert(!row('Morgana',[],changed).reasons.some(text=>text.startsWith('E 以友方英雄')));
 }
 for(const patch of ['16.20','16.22'])assert.equal(hexAllyProtection(hero('Morgana'),patch),null);
 const dated=structuredClone(hero('Morgana'));dated.mechanicSource.observedAt='2026-10-23T00:00:00Z';assert(hexAllyProtection(dated,data.patch)?.available);
 for(const field of ['key','description']){const changed=structuredClone(data);changed.augments.find(a=>a.id===1141)[field]+=' changed';assert(!row('Morgana',[],changed).reasons.some(text=>text.startsWith('E 以友方英雄')));}
 for(const mode of ['rift','arena']){const r=hexDecision({data,hero:'Morgana',mode,options:[1141]}).rows[0];assert(!r.reasons.some(text=>text.startsWith('E 以友方英雄')));assert.equal(r.top,false);}
});

test('main/sidebar and guide expose the same narrow evidence without an automatic best choice',()=>{
 const input={data,hero:'Morgana',options:[1058,1141,1004],owned:[]},text=hexAllyProtection(hero('Morgana'),data.patch).conditions[0],html=renderHexComparison(input);assert(html.includes(text));assert.doesNotMatch(html,/优先看这项/);
 const model=createGuideModel(data,{...selectGuide(null,{id:'Morgana',role:'support',mode:'hex',compareIds:input.options}),compact:false}),guide=renderGuide({model},'augments',false,()=>'<img>');assert(guide.includes(text));assert.equal(model.comparison.find(r=>r.id===1141).top,false);
});
