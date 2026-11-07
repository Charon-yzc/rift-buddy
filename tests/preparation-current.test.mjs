import test from 'node:test';
import assert from 'node:assert/strict';
import {preparationSnapshotCurrent,validatePreparation} from '../src/core/preparation.mjs';
import fs from 'node:fs/promises';
import {getBuild} from '../src/core/builds.mjs';
import {clientPreparationPlan} from '../src/client-preparation-view.mjs';
const base={id:'Volibear',role:'support',mode:'rift',coreAuto:true};
const clicked={...base,loadoutId:'default',runeId:'curated-conqueror',laterIds:[]};
test('an in-flight configuration accepts its own exact persisted choice',()=>{
 assert(preparationSnapshotCurrent(validatePreparation(base),validatePreparation(base),clicked));
 assert(preparationSnapshotCurrent(validatePreparation(base),validatePreparation(clicked),clicked));
 assert(preparationSnapshotCurrent(null,validatePreparation(clicked),clicked));
});
test('a newer independent configuration, removal or different member still cancels remaining writes',()=>{
 for(const changed of [{...clicked,runeId:'another-page'},{...clicked,laterIds:[3031]},{...clicked,role:'jungle'},{...clicked,id:'Ashe'},null]){
  assert.equal(preparationSnapshotCurrent(validatePreparation(base),changed&&validatePreparation(changed),clicked),false);
 }
});
test('materializing the clicked defaults preserves its concrete payload while a different rune page cancels it',async()=>{
 const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
 const hero=data.champions.find(hero=>hero.id==='Volibear'),selection={...base,role:'top',loadoutId:'default'},build=getBuild(hero,selection.role,data,selection);
 const resolve=choice=>clientPreparationPlan(data,{selection:choice,build:getBuild(hero,choice.role,data,choice)})?.fingerprint;
 const frozen={...selection,runeId:build.selectedRuneId,...(build.selectedSkillId?{skillId:build.selectedSkillId}:{}),laterIds:[]};
 assert.equal(resolve(frozen),resolve(selection));
 assert(preparationSnapshotCurrent(validatePreparation(base),validatePreparation(frozen),selection,resolve));
 const different={...frozen,runeId:undefined,customRunePage:{...build.runePage,patch:data.patch,selectedPerkIds:build.runePage.selectedPerkIds.map((id,index)=>index===6?(id===5005?5007:5005):id)}};
 assert.notEqual(resolve(different),resolve(selection),'The regression must exercise an actually different rune page');
 assert.equal(preparationSnapshotCurrent(validatePreparation(base),validatePreparation(different),selection,resolve),false);
});
