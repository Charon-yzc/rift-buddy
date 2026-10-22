// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {mechanicReview,reviewedCatalogEntry} from '../src/core/mechanic-review.mjs';
import {createCooperationGraph,cooperationPlan} from '../src/core/cooperation.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {currentCombo,createSlots} from '../src/core/recommend.mjs';
import {BUNDLED_CATALOG,catalogIssues} from '../src/core/catalog.mjs';
import {companionPickIntent} from '../src/core/companion-plan.mjs';
const data=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/game.json',import.meta.url)));
const builds=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/builds.json',import.meta.url))).entries;
const members=[{champion:'Trundle',role:'top'},{champion:'Sejuani',role:'jungle'},{champion:'Seraphine',role:'mid'}];
test('new patches and same-patch kit changes cannot acquire current family or generic relay claims',()=>{
 const hero=data.champions.find(hero=>hero.id==='Sejuani');assert.equal(mechanicReview(hero,data.patch),'current');assert.equal(mechanicReview(hero,'16.21'),'pending-review');
 const changed=structuredClone(data.champions);changed.find(hero=>hero.id==='Sejuani').mechanics.spells[0].description+=' 热修变动';assert.equal(mechanicReview(changed.find(hero=>hero.id==='Sejuani'),data.patch),'pending-review');
 for(const graph of [createCooperationGraph(data.champions,{currentPatch:'16.21'}),createCooperationGraph(changed)]){assert.equal(graph.skills.edges(members),null);assert.equal(cooperationPlan(members,graph),null);assert(!graph.edge(members[0],members[1])?.current);}
 assert(cooperationPlan(members,createCooperationGraph(data.champions)));
});
test('pending catalog entries remain readable but do not qualify for automatic curated bonuses',()=>{
 const row=BUNDLED_CATALOG.trios[0];assert(reviewedCatalogEntry(row,{},row.patch));assert(!reviewedCatalogEntry(row,{[row.id]:{stale:true}},row.patch));assert(!reviewedCatalogEntry(row,{},'16.21'));assert(!reviewedCatalogEntry(row,{[row.id]:{invalid:true}},row.patch));
});
test('automatic hero preparation cannot rediscover an old duo, while an explicit saved choice remains readable',()=>{
 const duo=BUNDLED_CATALOG.duos.find(row=>row.patch!==data.patch),slots=createSlots().map(slot=>({...slot,champion:slot.role==='bottom'?duo.carry:slot.role==='support'?duo.support:null}));
 assert.equal(currentCombo(slots,duo.carry,'bottom',{},null,null,{patch:data.patch}),null);
 assert.equal(currentCombo(slots,duo.carry,'bottom',{},null,null,{allowPending:true}).id,duo.id);
 assert.equal(getBuild(data.champions.find(hero=>hero.id===duo.carry),'bottom',data,{comboId:duo.id,loadoutId:duo.loadouts.bottom}).combo.id,duo.id);
});

test('individually reviewed current combinations remain discoverable beneath an older catalogue header',()=>{
 const trio=BUNDLED_CATALOG.trios.find(row=>row.patch===data.patch);assert(trio);assert.notEqual(BUNDLED_CATALOG.patch,data.patch);
 const own=trio.members[0],slots=createSlots().map(slot=>({...slot,champion:trio.members.find(member=>member.role===slot.role)?.champion||null}));
 assert.equal(currentCombo(slots,own.champion,own.role)?.id,trio.id);
 assert.equal(currentCombo(slots,own.champion,own.role,{},null,null,{patch:'16.21'}),null);
});

test('companion hover preparation uses the actual data patch before inferring a combination',()=>{
 const duo=BUNDLED_CATALOG.duos.find(row=>row.patch===data.patch),slots=createSlots().map(slot=>({...slot,champion:slot.role==='bottom'?duo.carry:slot.role==='support'?duo.support:null}));
 const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:data.champions.find(hero=>hero.id===duo.carry).key,assignedPosition:'BOTTOM'}]}};
 assert.equal(companionPickIntent(client,data.champions,slots,{patch:data.patch}).selection.comboId,duo.id);
 assert.equal(companionPickIntent(client,data.champions,slots,{patch:'16.21'}).selection.comboId,undefined);
});
test('an explicitly selected independent skill survives an unavailable gear route with a source build present',()=>{
 const hero=data.champions.find(hero=>hero.id==='Orianna'),plan=BUNDLED_CATALOG.skillPlans.find(plan=>plan.champion===hero.id&&plan.role==='mid'&&plan.loadoutId==='trio-ball'),gear=BUNDLED_CATALOG.loadouts.find(row=>row.id===plan.loadoutId),changed=structuredClone({...data,builds});changed.items[gear.items[0]].requiredChampion='Garen';
 const build=getBuild(changed.champions.find(row=>row.id===hero.id),'mid',changed,{comboId:'ball-delivery',loadoutId:gear.id,skillId:'scoped-skill-'+plan.id});
 assert.equal(build.loadoutId,'default');assert(build.reference);assert.equal(build.selectedSkill.id,'scoped-skill-'+plan.id);assert.equal(build.skillOrder,plan.order);assert.equal(build.selectedSkill.stale,false);
});
test('stale dedicated builds require explicit selection and incompatible champion-only gear is excluded',()=>{
 const hero=data.champions.find(hero=>hero.id==='Orianna'),combo=BUNDLED_CATALOG.trios.find(row=>row.id==='ball-delivery'),id=combo.members.find(row=>row.champion===hero.id).loadoutId;
 const stale={...data,builds,catalogInfo:{loadoutStatus:{[id]:{stale:true}}}};const automatic=getBuild(hero,'mid',stale,{comboId:combo.id});assert.equal(automatic.loadoutId,'default');assert(automatic.selectionWarnings.some(text=>text.includes('待复核')));
 assert.equal(getBuild(hero,'mid',data,{comboId:combo.id,loadoutId:id}).loadoutId,id);
 const modified=structuredClone(data),item=BUNDLED_CATALOG.loadouts.find(row=>row.id===id).items[0];modified.items[item].requiredChampion='Garen';assert.equal(getBuild(hero,'mid',modified,{comboId:combo.id,loadoutId:id}).loadoutId,'default');
 assert.equal(catalogIssues(BUNDLED_CATALOG,data).status[combo.id].invalid,false,'Version changes request review rather than proving the mechanic invalid');
});
