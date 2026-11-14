import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DEFAULT_BUILD_SOURCE,projectBuildSources} from '../src/core/build-source.mjs';
import {BUNDLED_CATALOG,historicalData,historicalSelection} from './fixtures/snapshot-16.20/catalog.mjs';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {heroClickSelection,configurationChoices} from '../src/core/configuration-choices.mjs';
import {comboMembers} from '../src/core/combo-members.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,resultCooperation} from '../src/core/creative-plan.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {captureRoomConfigurations,roomClientPlan} from '../src/core/room-configuration.mjs';
import {preparationEquipment} from '../src/core/complete-gear.mjs';
import {createItemSet} from '../src/core/item-sets.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
const load=async name=>{
 const data=JSON.parse(await fs.readFile(name+'/game.json'));data.builds=projectBuildSources(JSON.parse(await fs.readFile(name+'/builds.json')).entries,DEFAULT_BUILD_SOURCE,data.patch);return data;
};
const data=historicalData(await load('tests/fixtures/snapshot-16.20')),current=await load('data'),hero=(d,id)=>d.champions.find(c=>c.id===id);
const slotsFor=members=>createSlots().map(s=>({...s,party:members.some(m=>m.role===s.role),champion:members.find(m=>m.role===s.role)?.champion||null,locked:members.some(m=>m.role===s.role)}));
const payload=b=>({items:b.items.map(i=>i.id),runes:b.runePage?{primaryStyleId:b.runePage.primaryStyleId,subStyleId:b.runePage.subStyleId,selectedPerkIds:b.runePage.selectedPerkIds}:null,summoners:b.summoners,skills:b.skillOrder});
function acceptedCombo(kind){
 const combo=BUNDLED_CATALOG[kind].find(c=>!data.catalogInfo.status[c.id].stale&&comboMembers(c).some(m=>m.loadoutId!=='default'&&data.builds[m.champion+':'+m.role]));assert(combo);
 const members=comboMembers(combo),slots=slotsFor(members),result={slots,scope:'party',[members.length===2?'duo':'trio']:combo},plan=captureCreativePlan(result,data);
 return {combo,members,slots,result,plan};
}

test('an avatar ignores previous manual or group fields and uses the current same-role OP.GG payload',()=>{
 const ref=Object.values(current.builds).find(r=>r.role==='mid'),h=hero(current,ref.champion),ordinary=getBuild(h,ref.role,current);
 const clicked=heroClickSelection(current,{id:h.id,role:ref.role,mode:'rift',loadoutId:'old-manual',comboId:'old-group',runeId:'old-rune',skillId:'old-skill',customSkillOrder:{order:'QWE'},summonerIds:['SummonerHeal'],laterIds:[3089],conditions:['ap']});
 assert.equal(clicked.loadoutId,'default');for(const key of ['comboId','creativePlan','runeId','skillId','customSkillOrder','summonerIds','laterIds'])assert.equal(clicked[key],undefined);
 const after=getBuild(h,ref.role,current,clicked);assert.equal(after.selectedRune.source,'OP.GG');assert.deepEqual(payload(after),payload(ordinary));
});

test('a duo and trio configuration is available manually while combo context alone leaves the source default',()=>{
 for(const kind of ['duos','trios']){
  const {combo,members}=acceptedCombo(kind),original=structuredClone(combo),m=members.find(m=>m.loadoutId!=='default'&&data.builds[m.champion+':'+m.role]),h=hero(data,m.champion),solo=getBuild(h,m.role,data);
  const context={id:h.id,role:m.role,mode:'rift',comboId:combo.id},automatic=getBuild(h,m.role,data,context);assert.equal(automatic.loadoutId,'default');assert.deepEqual(payload(automatic),payload(solo));
  const selection={...context,...historicalSelection(combo.id,h.id,m.role)},manual=getBuild(h,m.role,data,selection);
  assert.equal(manual.loadoutId,m.loadoutId);assert.equal(manual.reference,null);assert.ok(manual.configurationSources.length);assert.equal(manual.selectedRune.samples,null);
  const previous={...context,runeId:solo.selectedRuneId,customRunePage:solo.runePage,summonerIds:[...solo.summoners].reverse(),customSkillOrder:{order:solo.skillOrder.slice(0,3),patch:data.patch},conditions:['ap']};
  const rows=configurationChoices(data,previous,getBuild(h,m.role,data,previous)),choice=rows.find(r=>r.selection.loadoutId===m.loadoutId);assert(choice,'An authored route remains an explicit complete configuration choice');
  assert.equal(choice.selection.runeId,undefined);assert.equal(choice.selection.customRunePage,undefined);assert.equal(choice.selection.summonerIds,undefined);
  assert.equal(choice.selection.customSkillOrder,undefined);assert.equal(choice.selection.conditions,undefined);assert.deepEqual(payload(choice.build),payload(manual));
  assert.ok(buildAsText(manual,h,data).includes(manual.configurationNote));for(const source of manual.configurationSources)assert.ok(buildAsText(manual,h,data).includes(source.url));
  const guide=createGuideModel(data,selectGuide(null,selection));assert.deepEqual(guide.configurationSources,manual.configurationSources);assert.equal(guide.configurationNote,manual.configurationNote);
  assert.deepEqual(combo,original,'Runtime stage enrichment and configuration projection cannot rewrite the authored source');
 }
});

test('the same hero in another role cannot borrow the manual page or scoped skills',()=>{
 const page=BUNDLED_CATALOG.loadouts.find(l=>l.champions.includes('Galio')&&l.roles.includes('bottom')),selection={loadoutId:page.id};
 const manual=getBuild(hero(data,'Galio'),'bottom',data,selection),other=getBuild(hero(data,'Galio'),'mid',data,selection);
 assert.equal(manual.loadoutId,page.id);assert.equal(other.loadoutId,'default');assert.ok(other.skillChoices.every(s=>s.loadoutId!==page.id));
 assert.deepEqual(payload(other),payload(getBuild(hero(data,'Galio'),'mid',data)));
});

test('accepted manual pages retain every member payload through favorite restoration, room transfer and item sets',()=>{
 const {combo,members,slots,result,plan}=acceptedCombo('trios'),store=createPreparationStore();
 for(const m of members){
  const selection={id:m.champion,role:m.role,mode:'rift',...historicalSelection(combo.id,m.champion,m.role),comboId:plan.id,creativePlan:plan},build=getBuild(hero(data,m.champion),m.role,data,selection);
  store.remember({...selection,runeId:build.runeOptions.at(-1).id,summonerIds:[...build.summoners].reverse(),customSkillOrder:{order:build.skillOrder.slice(0,3),patch:data.patch},conditions:['ap']});
 }
 const configurations=captureTeamConfigurations({...result,creativePlan:plan},data,store),favorite={slots,scope:'party',creativePlan:plan,configurations},frozen=structuredClone(favorite);
 const restored=restoreTeamFavorite(JSON.parse(JSON.stringify(favorite)),createSlots(),data.champions);assert.deepEqual(restored.configurations,configurations);
 const shared=captureRoomConfigurations(slots,data,store,{creativePlan:plan});assert.equal(shared.length,members.length);
 for(const selection of restored.configurations){
  const b=getBuild(hero(data,selection.id),selection.role,data,selection),wire=shared.find(c=>c.champion===selection.id),receiver=roomClientPlan(wire,{...data,builds:{},buildSources:{}},plan);
  assert.deepEqual(payload(receiver.build),payload(b));assert.deepEqual(receiver.build.combo.steps,plan.steps);
  const expected=preparationEquipment(data,b,selection).map(i=>Number(i.id));assert.deepEqual(preparationEquipment(data,receiver.build,receiver.selection).map(i=>Number(i.id)),expected);
  const set=createItemSet(hero(data,selection.id),b,data),ids=set.blocks.filter(g=>g.type.startsWith('当前成装')||g.type.startsWith('鞋子')||g.type.startsWith('后期计划')).flatMap(g=>g.items.map(i=>Number(i.id)));
  assert.deepEqual(new Set(ids),new Set(expected));
 }
 assert.deepEqual(favorite,frozen,'Rendering and concrete transfer cannot rewrite the accepted saved pages');
});

test('party completion obeys explicit pools, locked friends and exclusions without requiring an authored rank',()=>{
 const trio=BUNDLED_CATALOG.trios.find(t=>!data.catalogInfo.status[t.id].stale),members=trio.members,slots=slotsFor(members);
 const target=members[2],slot=slots.find(s=>s.role===target.role);slot.champion=null;slot.locked=false;const before=structuredClone(slots);
 const input={slots,champions:data.champions,scope:'party',patch:data.patch,builds:data.builds,catalogStatus:data.catalogInfo.status,rolePools:{[target.role]:{mode:'only',heroes:[target.champion]}},limit:6};
 const rows=recommend(input);assert.ok(rows.length);for(const row of rows){assert.equal(row.slots.find(s=>s.role===target.role).champion,target.champion);for(const m of members.slice(0,2))assert.deepEqual(row.slots.find(s=>s.role===m.role),before.find(s=>s.role===m.role));}
 assert.deepEqual(slots,before);assert.throws(()=>recommend({...input,excluded:[target.champion]}),/没有可选英雄/);assert.deepEqual(slots,before);
});

test('five- and six-result pages form one complete executable stream without origin quotas',()=>{
 const slots=createSlots().map(s=>({...s,party:['mid','bottom','support'].includes(s.role)}));
 const input={slots,champions:data.champions,scope:'party',patch:data.patch,builds:data.builds,catalogStatus:data.catalogInfo.status,play:{unusual:false}};
 for(const size of [5,6]){
  const stream=recommend({...input,limit:size*3}),pages=[0,size,size*2].flatMap(offset=>recommend({...input,limit:size,offset}));
  assert.equal(stream.length,size*3);assert.deepEqual(pages.map(r=>r.id),stream.map(r=>r.id));assert.equal(new Set(pages.map(r=>r.id)).size,pages.length);
  for(const row of pages){assert.ok(row.slots.filter(s=>s.party).every(s=>s.champion));assert.ok(resultCooperation(row),'Each result retains executable group instructions');}
 }
});
