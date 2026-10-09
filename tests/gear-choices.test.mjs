import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getBuild} from '../src/core/builds.mjs';
import {prepareGear} from '../src/core/gear-choices.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {createPreparationStore,configurationPatch,mergeConfiguration} from '../src/core/preparation.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {selectedBuildFields,buildFavoriteId,findSavedBuild} from '../src/core/build-favorites.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {gearSelector} from '../src/build-options-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id),build=s=>getBuild(hero(s.id),s.role,data,s);

test('independent starter and footwear choices retain exact quantities, page and core, then reach saved plans and guide',()=>{
 const base={id:'Volibear',role:'top',mode:'rift'},b=build(base),starter=b.startOptions.find(o=>o.ids.includes(1054)),shoe=b.bootsOptions.find(o=>o.ids.includes(3158));assert.ok(starter&&shoe);
 let choice=changeCompanionPlan(data,base,'start',starter.id);choice=changeCompanionPlan(data,choice,'boots',shoe.id);
 const selected=build(choice);assert.deepEqual(selected.start.map(i=>Number(i.id)),[1054,2003]);assert.equal(selected.boots,3158);
 assert.equal(selected.selectedCoreId,b.selectedCoreId);assert.deepEqual(selected.runePage.selectedPerkIds,b.runePage.selectedPerkIds);
 const state=validateState({...defaultState(),preparations:[choice],favorites:[{id:buildFavoriteId({...choice,build:selected}),type:'build',title:'Shopping choice',champion:choice.id,role:choice.role,mode:choice.mode,...selectedBuildFields({...choice,build:selected})}]}),store=createPreparationStore();store.restore(state.preparations);
 assert.equal(store.recall(base).startId,starter.id);assert.equal(store.recall(base).bootsId,shoe.id);
 assert.ok(findSavedBuild(state.favorites,{...choice,build:selected}));assert.equal(findSavedBuild(state.favorites,{...base,build:b}),undefined);
 const guide=createGuideModel(data,selectGuide(null,store.recall(base)));assert.deepEqual(guide.start.map(i=>Number(i.id)),[1054,2003]);assert.equal(guide.route.filter(i=>Number(i.id)===3158).length,1);
 const patch=configurationPatch(base,choice);assert.ok(patch.includes('startId')&&patch.includes('bootsId'));assert.equal(mergeConfiguration(base,choice,patch).bootsId,shoe.id);
 assert.match(gearSelector(selected,'start'),/data-action="build-start"/);assert.match(gearSelector(selected,'boots',{companion:true,plan:'Volibear:top:rift'}),/data-action="companion-boots"/);
});

test('jungle pet alternatives survive source reordering, core changes and independent hero-position preparations',()=>{
 const base={id:'Chogath',role:'jungle',mode:'rift'},b=build(base);
 for(const id of [1101,1102,1103])assert.ok(b.startOptions.some(o=>o.ids.includes(id)));
 const option=b.startOptions.find(o=>o.ids.includes(1103)),choice=changeCompanionPlan(data,base,'start',option.id);
 const changed=changeCompanionPlan(data,choice,'core','1');assert.equal(changed.startId,option.id);assert.ok(build(changed).start.some(i=>Number(i.id)===1103));
 const reordered=structuredClone(data);reordered.builds['Chogath:jungle'].start.reverse();assert.deepEqual(getBuild(hero(base.id),base.role,reordered,choice).start.map(i=>i.id),build(choice).start.map(i=>i.id));
 const store=createPreparationStore();store.remember(choice);store.remember({id:'Chogath',role:'support',mode:'rift'});assert.equal(store.recall(base).startId,option.id);assert.equal(store.recall({...base,role:'support'}).startId,undefined);
 assert.throws(()=>changeCompanionPlan(data,base,'start','start-1054-2003'),/已变化/);
});

test('explicit footwear stays selected under pressure and changing core; restoring default resumes conditional choice',()=>{
 const base={id:'Volibear',role:'top',mode:'rift',conditions:['ad','control']},b=build(base),shoe=b.bootsOptions.find(o=>o.ids.includes(3158));assert.equal(b.boots,3111);
 const choice=changeCompanionPlan(data,base,'boots',shoe.id),selected=build(choice);assert.equal(selected.boots,3158);assert.ok(selected.adjustments.some(o=>o.title==='保留自选鞋子'));
 const core=changeCompanionPlan(data,choice,'core','1');assert.equal(build(core).boots,3158);
 assert.equal(build(changeCompanionPlan(data,choice,'boots','')).boots,3111);
});

test('shop filtering rejects over-budget, duplicate, unavailable and wrong-position groups, and preserves quest upgrade bases',()=>{
 const reference={patch:data.patch,start:[{items:[1055,2003,2003],samples:10},{items:[1055,1055]},{items:[1101,2003]},{items:[2031,2003]},{items:[2003,2003,2003,2003,2003,2003]},{items:[2051]}],boots:[{items:[3174],samples:10},{items:[3158,3111]},{items:[1054]}]};
 const gear=prepareGear({data,champion:'Volibear',role:'top',start:[1054,2003],boots:3047,reference});assert.equal(gear.startOptions.length,1);assert.equal(gear.bootsOptions.length,1);assert.deepEqual(gear.bootsOptions[0].ids,[3047]);assert.match(gear.warnings.join(' '),/预算/);
 const allyRestricted=structuredClone(data);allyRestricted.items[1054].requiredAlly='SomeoneElse';assert.equal(prepareGear({data:allyRestricted,champion:'Volibear',role:'top',start:[1054,2003],boots:3047}).startOptions.length,0);
 const cass=build({id:'Cassiopeia',role:'mid',mode:'rift',conditions:['ad','control']});assert.equal(cass.boots,3111);assert.ok(cass.bootsOptions.length);assert.ok(cass.items.some(i=>i.tags.includes('Boots')));
 const support=build({id:'Nautilus',role:'support',mode:'rift'});assert.ok(support.startOptions.every(o=>o.cost<=500&&!o.ids.includes(3865)));assert.ok(support.granted.some(i=>Number(i.id)===3865));
});

test('missing or stale source retains explicit choices without silently adopting a fallback, then restores them',()=>{
 const base={id:'Volibear',role:'top',mode:'rift'},b=build(base),choice=changeCompanionPlan(data,changeCompanionPlan(data,base,'start',b.startOptions.find(o=>o.ids.includes(1054)).id),'boots',b.bootsOptions.find(o=>o.ids.includes(3158)).id);
 const absent={...data,buildSource:{region:'kr',tier:'diamond_plus'}},fallback=getBuild(hero(base.id),base.role,absent,choice),fields=selectedBuildFields({...choice,build:fallback},{preserveUnavailable:true});
 assert.equal(fields.startId,choice.startId);assert.equal(fields.bootsId,choice.bootsId);assert.match(fallback.selectionWarnings.join(' '),/原选择保留/);
 const restored=build({...base,...fields});assert.equal(restored.selectedStartId,choice.startId);assert.equal(restored.selectedBootsId,choice.bootsId);
 const old=getBuild(hero(base.id),base.role,{...data,patch:'16.21',version:'16.21.1'},choice);assert.equal(old.selectedBootsId,choice.bootsId);assert.ok(old.bootsOptions.some(o=>o.source==='OP.GG'&&o.patch==='16.20'));
 assert.throws(()=>validateState({...defaultState(),preparations:[{...choice,startId:'../bad'}]}),/选择格式/);
});

test('all stored role records expose only budgeted, correctly purchased starter groups and a single footwear family',()=>{
 for(const ref of Object.values(data.builds)){
  const b=build({id:ref.champion,role:ref.role,mode:'rift'});
  for(const row of b.startOptions){assert.ok(row.cost<=500);assert.equal(row.cost,row.items.reduce((n,i)=>n+i.gold.total,0));assert.ok(row.items.every(i=>i.maps['11']&&i.inStore));}
  for(const row of b.bootsOptions){assert.equal(row.items.length,1);assert.ok(row.items[0].tags.includes('Boots'));}
  assert.ok(b.items.filter(i=>i.tags.includes('Boots')).length<=1);
 }
});
