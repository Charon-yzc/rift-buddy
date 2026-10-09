import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {getBuild} from '../src/core/builds.mjs';
import {selectBuildSource} from '../src/core/build-source.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {selectedBuildFields,buildFavoriteId,findSavedBuild} from '../src/core/build-favorites.mjs';
import {selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
const game=JSON.parse(await fs.readFile('data/game.json')),builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const hero=game.champions.find(c=>c.id==='Ahri');
const get=(data,s)=>getBuild(hero,s.role,data,s);
function fixture(){
 const data={...game,builds},base={id:'Ahri',role:'mid',mode:'rift'},b=get(data,base);
 const choice={...base,loadoutId:'default',coreIndex:1,coreId:'core-'+b.reference.core[1].items.join('-'),runeId:b.runeOptions[1].id,skillId:b.skillChoices[1].id,laterIds:[3165]};
 selectBuildSource(data,{region:'kr',tier:'diamond_plus'});
 assert.equal(get(data,choice).reference,null);return {data,choice};
}

test('editing pressure in a missing source preserves independent choices through save, guide, favorite and restart',async()=>{
 const {data,choice}=fixture(),changed=changeCompanionPlan(data,choice,'condition','ap');
 assert.deepEqual(changed,{...choice,conditions:['ap']});
 const store=createPreparationStore();store.remember(changed);
 const v={...changed,build:get(data,changed)},fields=selectedBuildFields(v,{preserveUnavailable:true});
 const favorite={id:buildFavoriteId(v),...fields,coreIndex:choice.coreIndex,conditions:changed.conditions,champion:choice.id,role:choice.role,mode:choice.mode,type:'build',title:'原配置'};
 assert.equal(findSavedBuild([favorite],v),favorite);assert.notEqual(favorite.id,buildFavoriteId({...choice,coreId:undefined,runeId:undefined,skillId:undefined,laterIds:[],build:get(data,{...choice,coreId:undefined,runeId:undefined,skillId:undefined,laterIds:[]})}));
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-source-edit-'));
 await saveState(root,{...defaultState(),favorites:[favorite],preparations:store.snapshot(),guide:selectGuide(null,changed)});
 const reopened=await readState(root);store.restore(reopened.preparations);
 selectBuildSource(data,{region:'global',tier:'emerald_plus'});
 for(const selection of [store.recall(choice),reopened.guide.selection,{...reopened.favorites[0],id:choice.id}]){
  const b=get(data,selection);assert.equal(b.selectedCoreId,choice.coreId);assert.equal(b.selectedRuneId,choice.runeId);assert.equal(b.selectedSkillId,choice.skillId);assert.deepEqual(b.selectedLaterIds,[3165]);assert.deepEqual(selection.conditions,['ap']);
 }
 const model=createGuideModel(data,reopened.guide);assert.equal(model.selection.coreId,choice.coreId);assert.equal(model.runes.length,9);
});

test('each inline edit changes its own selection and preserves unrelated unavailable fields',()=>{
 const {data,choice}=fixture(),fallback=get(data,choice);
 for(const [field,value,key] of [['boots',fallback.bootsOptions[0].id,'bootsId'],['start',fallback.startOptions[0].id,'startId'],['rune',fallback.runeOptions[0].id,'runeId'],['skill','','skillId'],['later','3165','laterIds']]){
  const next=changeCompanionPlan(data,choice,field,value);
  for(const original of ['coreIndex','coreId','loadoutId','runeId','skillId','laterIds'])if(original!==key)assert.deepEqual(next[original],choice[original],field+' changed '+original);
 }
 const swapped=changeCompanionPlan(data,choice,'loadout','default');assert.equal(swapped.coreIndex,0);assert.equal(swapped.coreId,undefined);assert.equal(swapped.runeId,undefined);assert.equal(swapped.skillId,undefined);assert.deepEqual(swapped.laterIds,[]);
 selectBuildSource(data,{region:'global',tier:'emerald_plus'});
 const core=changeCompanionPlan(data,choice,'core','0');assert.equal(core.coreId,'core-'+get(data,choice).reference.core[0].items.join('-'));assert.deepEqual(core.laterIds,[]);assert.equal(core.runeId,choice.runeId);assert.equal(core.skillId,choice.skillId);
});
