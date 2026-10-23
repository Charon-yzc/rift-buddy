import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {hexRecommendations,hexEquipmentImpact,resolveHexAugmentInput} from '../src/core/hex-recommendations.mjs';
import {renderHexAdvice,renderHexComparison} from '../src/hex-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.hexBuilds=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url),'utf8')).entries;

test('current hero recommendations cover the bundled roster without inventing samples or changing source records',()=>{
 const before=JSON.stringify(data.hexBuilds);
 for(const hero of data.champions){
  const advice=hexRecommendations({data,hero:hero.id});assert.ok(advice.rows.length>0,hero.id);assert.ok(advice.rows.length<=6);
  assert.equal(new Set(advice.rows.map(row=>row.id)).size,advice.rows.length);assert.equal(advice.source.patch,data.patch);
  for(const row of advice.rows){const fromSource=data.hexBuilds[hero.id].augmentIds.includes(row.id);assert.equal(row.fromSource,fromSource);if(!fromSource){assert.equal(row.mechanicReviewed,true);assert.ok(['preferred','conditional'].includes(row.level));}assert.equal(row.winRate,undefined);assert.equal(row.score,undefined);}
 }
 assert.equal(JSON.stringify(data.hexBuilds),before);
});

test('an independent source shortlist cannot hide a reviewed mechanism, become an offer pool or acquire its provenance',()=>{
 const before=JSON.stringify(data),hero='Teemo',id=1129,ref=data.hexBuilds[hero];assert(!ref.augmentIds.includes(id));
 const source=hexRecommendations({data,hero,limit:12}),without=hexRecommendations({data:{...data,hexBuilds:{}},hero,limit:12});
 for(const result of [source,without]){const row=result.rows.find(r=>r.id===id);assert(row);assert.equal(row.level,'preferred');assert.equal(row.fromSource,false);assert.equal(row.mechanicReviewed,true);assert(!row.reasons.some(r=>r.includes('OP.GG')));}
 assert(source.rows.some(r=>r.fromSource));assert.equal(source.source.name,'OP.GG');
 const options=ref.augmentIds.slice(0,3);assert(!options.includes(id));
 for(const actual of [data,{...data,hexBuilds:{}}]){const result=hexRecommendations({data:actual,hero,options});assert.deepEqual(result.rows.map(r=>r.id),options);assert.equal(result.rows.some(r=>r.id===id),false);}
 for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===id).description+=' changed',d=>d.augments.find(a=>a.id===id).catalogEnabled=false]){
  const changed=structuredClone(data);mutate(changed);assert(!hexRecommendations({data:changed,hero,limit:12}).rows.some(r=>r.id===id));
 }
 assert.equal(JSON.stringify(data),before);
});

test('marked-set contributions remain separate from general hero fit and withdraw when their partner changes',()=>{
 for(const owned of [[],[1002]])assert.deepEqual(hexRecommendations({data,hero:'Ashe',options:[1047],owned}).rows[0].markedReasons,[]);
 const linked=hexRecommendations({data,hero:'Ashe',options:[1047,1058],owned:[1048]});assert.match(linked.rows[0].markedReasons.join(' '),/珠光护手/);assert.deepEqual(linked.rows[1].markedReasons,[]);
 const changed=structuredClone(data);changed.augments.find(a=>a.id===1048).description+=' changed';assert.deepEqual(hexRecommendations({data:changed,hero:'Ashe',options:[1047],owned:[1048]}).rows[0].markedReasons,[]);
});

test('actual choices use reviewed trigger conditions and known conflicts instead of blindly copying the source list',()=>{
 const support=hexRecommendations({data,hero:'Sona',options:[1141,1205,1004]});assert.equal(support.bestChoice,1141);assert.match(support.rows[0].reasons.join(' '),/W 治疗.*友方.*护盾/);
 const mage=hexRecommendations({data,hero:'Lux',options:[1141,2072]});assert.equal(mage.rows[0].level,'conditional');assert.equal(mage.bestChoice,null,'Having a shield does not establish a protection-first game plan');
 const clash=hexRecommendations({data,hero:'Jinx',owned:[1004],options:[1088,1047,2072]});assert.equal(clash.rows[0].level,'conflict');assert.equal(clash.bestChoice,1047);assert.match(clash.rows[0].cautions.join(' '),/禁用终极/);
 const reverse=hexRecommendations({data,hero:'Karthus',owned:[1088],options:[1004]});assert.equal(reverse.rows[0].level,'conflict');assert.equal(reverse.bestChoice,null);
 assert.equal(hexRecommendations({data,hero:'Brand',owned:[1047],options:[1048,2072]}).bestChoice,1048);
});

test('unresolved ability targets, unknown versions and changed game keys do not receive confident mechanic recommendations',()=>{
 const skill=hexRecommendations({data,hero:'Lux',options:[2072]});assert.equal(skill.rows[0].level,'conditional');assert.equal(skill.bestChoice,null);assert.match(skill.rows[0].cautions.join(' '),/尚未核实.*技能/);
 const future={...data,patch:'16.22'},advice=hexRecommendations({data:future,hero:'Sona',options:[1141,1088],owned:[1004]});assert.equal(advice.source,null);assert.equal(advice.bestChoice,null);assert.ok(advice.rows.every(row=>!row.mechanicReviewed&&row.level!=='conflict'));
 assert.deepEqual(hexEquipmentImpact({data:future,hero:'Gwen',owned:[1129]}),[]);
 const changed={...data,augments:data.augments.map(a=>a.id===1004?{...a,key:'Changed_Key'}:a)};
 assert.notEqual(hexRecommendations({data:changed,hero:'Ashe',options:[1088],owned:[1004]}).rows[0].level,'conflict');
 const changedEffect={...data,augments:data.augments.map(a=>a.id===1004?{...a,description:'不同机制'}:a)};
 assert.notEqual(hexRecommendations({data:changedEffect,hero:'Ashe',options:[1088],owned:[1004]}).rows[0].level,'conflict');
});

test('equipment advice is conditional, map-legal and separate from automatic build changes',()=>{
 const before=JSON.stringify(data.hexBuilds.Gwen),gwen=hexEquipmentImpact({data,hero:'Gwen',owned:[1129,1002]}),brand=hexEquipmentImpact({data,hero:'Brand',owned:[1129]});
 assert.ok(gwen.some(row=>row.items.some(item=>item.id===3115)));assert.ok(gwen.some(row=>row.items.some(item=>item.id===3157)));assert.equal(brand[0].items.length,0,'Pure spell casters must not be told to buy Nashor just for AP');
 const unavailable={...data,items:{...data.items,3115:{...data.items[3115],maps:{'12':false}},3157:{...data.items[3157],inStore:false}}};
 assert.ok(hexEquipmentImpact({data:unavailable,hero:'Gwen',owned:[1129,1002]}).every(row=>row.items.length===0));assert.equal(JSON.stringify(data.hexBuilds.Gwen),before);
});

test('changed augment identities suppress old comparison claims including interactions on either side',()=>{
 const changedCooldown={...data,augments:data.augments.map(a=>a.id===1088?{...a,key:'NewEffect',description:'参与击杀时刷新你的终极技能'}:a)};
 const cooldown=hexRecommendations({data:changedCooldown,hero:'Ashe',options:[1088]}).rows[0];
 assert.doesNotMatch([...cooldown.reasons,...cooldown.interactions].join(' '),/施放终极技能后才刷新/);
 for(const id of [1047,1048]){
  const changed={...data,augments:data.augments.map(a=>a.id===id?{...a,key:'NewEffect',description:'新的移速效果'}:a)};
  for(const [options,owned]of [[[1048],[1047]],[[1047],[1048]]]){
   const row=hexRecommendations({data:changed,hero:'Brand',options,owned}).rows[0];
   assert.doesNotMatch([...row.reasons,...row.interactions].join(' '),/技能可暴击|共用暴击|适用技能能暴击/);
  }
 }
 const changed={...data,augments:data.augments.map(a=>a.id===1141?{...a,key:'NewHealing',description:'新的移速效果'}:a)};
 const row=hexRecommendations({data:changed,hero:'Sona',options:[1141]}).rows[0];
 assert.doesNotMatch(row.reasons.join(' '),/友方治疗或护盾|强化条件/);
});

test('same-patch kit changes disable hero affinity and concrete equipment, while observation timestamps do not',()=>{
 for(const mutate of [c=>{c.mechanicSource.character.sha256='0'.repeat(64);},c=>{delete c.mechanicSource;},c=>{c.mechanicSource.spells[0].description='Changed ability';}]){
  const changed=structuredClone(data);for(const id of ['Sona','Gwen'])mutate(changed.champions.find(c=>c.id===id));
  const row=hexRecommendations({data:changed,hero:'Sona',options:[1141]}).rows[0];
  assert.notEqual(row.level,'preferred');assert.doesNotMatch(row.reasons.join(' '),/已核实的友方|这个英雄有对友方/);
  assert.ok(hexEquipmentImpact({data:changed,hero:'Gwen',owned:[1129,1002]}).every(row=>row.items.length===0));
  assert.equal(hexRecommendations({data:changed,hero:'Gwen',options:[1088],owned:[1004]}).rows[0].level,'conflict','Augment-only conflicts remain useful');
 }
 const newer=structuredClone(data);newer.champions.find(c=>c.id==='Sona').mechanicSource.observedAt='2026-10-21T00:00:00Z';
 assert.equal(hexRecommendations({data:newer,hero:'Sona',options:[1141]}).bestChoice,1141);
});

test('option entry resolves only exact known choices and the UI exposes short advice with expandable evidence',()=>{
 const a=data.augments.find(a=>a.id===2005);assert.equal(resolveHexAugmentInput(a.name,data.augments),2005);assert.equal(resolveHexAugmentInput(a.name+' · #2005',data.augments),2005);
 for(const value of ['炼狱','<img src=x onerror=alert(1)>',a.name+' · #2072',''])assert.throws(()=>resolveHexAugmentInput(value,data.augments));
 assert.throws(()=>resolveHexAugmentInput(a.name,[a,{...a,id:999999}]));
 const html=renderHexComparison({data,hero:'Sona',options:[1141,1205],owned:[1002]});assert.match(html,/data-hex-option-input/);assert.match(html,/优先看这项/);assert.match(html,/已选强化的装备影响/);assert.match(html,/效果与依据/);assert.doesNotMatch(html,/class="compare-grid"/);
 assert.match(renderHexAdvice({data,hero:'Brand'}),/炼狱导管/);assert.match(renderHexAdvice({data,hero:'Brand'}),/不是胜率榜/);
 const withoutHero=hexRecommendations({data,options:[2005,2072]});assert.equal(withoutHero.rows.length,2);assert.equal(withoutHero.bestChoice,null);
});

test('reviewed attack-crit and AP spell-crit advice is hero-specific and cannot survive a changed kit or effect',()=>{
 for(const [hero,id]of [['Jinx',1328],['Caitlyn',1328],['Veigar',1048],['Lux',1048]]){
  const result=hexRecommendations({data,hero,options:[2072,id,1205]});assert.deepEqual(result.rows.map(r=>r.id),[2072,id,1205]);assert.equal(result.bestChoice,id);assert.equal(result.rows[1].level,'preferred');assert.equal(result.rows[1].score,undefined);
  for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===id).description+=' changed']){
   const changed=structuredClone(data);mutate(changed);const degraded=hexRecommendations({data:changed,hero,options:[id]});assert.equal(degraded.bestChoice,null);assert.notEqual(degraded.rows[0]?.level,'preferred');
  }
 }
 for(const hero of ['Jhin','Ashe','Brand'])assert.equal(hexRecommendations({data,hero,options:[1328]}).bestChoice,null,'No blanket crit/marksman endorsement for '+hero);
 assert.equal(hexRecommendations({data,hero:'Brand',options:[1048]}).bestChoice,null,'Keep other spell casters conditional until reviewed');
});
