import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DUOS,TRIOS} from '../src/core/rules.mjs';
import {comboMembers} from '../src/core/combo-members.mjs';
import {createSlots,recommend,currentCombo} from '../src/core/recommend.mjs';
import {captureCreativePlan,creativePlanId,validateCreativePlan,creativeComboContext} from '../src/core/creative-plan.mjs';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {createPreparationStore,recallPreparation} from '../src/core/preparation.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
import {resultAsText} from '../src/result-text.mjs';
import {favoriteTeamSummary} from '../src/favorites-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);
function fixture(combo){
 const members=comboMembers(combo),slots=createSlots().map(s=>({...s,party:members.some(m=>m.role===s.role),champion:members.find(m=>m.role===s.role)?.champion||null,locked:members.some(m=>m.role===s.role)}));
 return {id:combo.id,title:combo.name,slots,scope:'party',targets:[],...(members.length===3?{trio:combo}:{duo:combo})};
}

test('every curated duo and trio can retain its own ordered instructions and loadout bindings',()=>{
 for(const combo of [...DUOS,...TRIOS]){
  const result=fixture(combo),plan=captureCreativePlan(result,data,'2026-10-10T08:00:00.000Z');
  assert.equal(plan?.archetype,'curated',combo.id);
  assert.deepEqual(plan.members,comboMembers(combo).map(({role,champion})=>({role,champion})));
  assert.deepEqual(validateCreativePlan(plan,result.slots),plan);
  assert.equal(plan.curated.id,combo.id);assert.equal(plan.patch,combo.patch);
 }
});

test('a saved Galio/Nilah/Rakan plan survives same-ID catalog edits, restart and all member pages without reversing the authored lead',async()=>{
 const combo=TRIOS.find(t=>t.id==='galio-nilah-rakan'),result=fixture(combo),plan=captureCreativePlan(result,data),store=createPreparationStore();
 assert.match(plan.steps.join(' '),/洛/);assert.match(plan.ordered.find(m=>m.champion==='Rakan').job,/W|R/);
 const configs=captureTeamConfigurations({...result,creativePlan:plan},data,store),favorite={...result,id:'saved-curated',type:'team',style:'fun',version:data.version,createdAt:plan.createdAt,creativePlan:plan,configurations:configs};
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-curated-'));
 await saveState(root,{...defaultState(),favorites:[favorite],draft:{slots:result.slots,scope:'party',style:'fun',creativePlan:plan}});
 const original=structuredClone(combo);
 try{
  combo.name='同 ID 的新计划';combo.steps=['加里奥先手'];combo.window='新的窗口';combo.early='新的开局';combo.economy='新的经济';combo.sources=[];
  combo.members.forEach(m=>{m.job='新的分工';m.loadoutId='default';});
  const saved=(await readState(root)).favorites[0],restored=restoreTeamFavorite(saved,createSlots(),data.champions);
  assert.deepEqual(restored.creativePlan,plan);assert.deepEqual(restored.configurations,configs);
  const [again]=recommend({slots:restored.slots,creativePlan:restored.creativePlan,champions:data.champions,scope:'party'});
  assert.equal(again.origin,'curated');assert.deepEqual(again.trio.steps,plan.steps);assert.equal(again.trio.early,plan.curated.early);
  const copied=resultAsText(again,data);assert.ok(copied.includes(plan.curated.economy));assert.doesNotMatch(copied,/同 ID 的新计划|新的分工|加里奥先手/);
  for(const selection of configs){
   const build=getBuild(hero(selection.id),selection.role,data,selection),job=plan.ordered.find(m=>m.champion===selection.id).job;
   assert.equal(build.combo.ownJob,job);assert.deepEqual(build.combo.steps,plan.steps);assert.equal(build.combo.economy,plan.curated.economy);
   assert.equal(build.combo.preferred,plan.curated.members.find(m=>m.champion===selection.id).loadoutId);
   assert.ok(buildAsText(build,hero(selection.id),data).includes(job));
   const guide=createGuideModel(data,selectGuide(null,selection),null,{...selection,comboKnown:true});assert.equal(guide.combo.ownJob,job);assert.equal(guide.coach.action,job);
  }
  assert.match(favoriteTeamSummary(data,saved,0),/原保存的整理套路/);
 }finally{Object.assign(combo,original);}
});

test('freezing a catalog plan preserves existing explicit rune, item and loadout choices',()=>{
 const combo=TRIOS.find(t=>t.id==='ball-delivery'),result=fixture(combo),plan=captureCreativePlan(result,data),store=createPreparationStore();
 const legacy={id:'Orianna',role:'mid',mode:'rift',comboId:combo.id,loadoutId:'default',conditions:['ap'],coreIndex:1};
 const base=getBuild(hero('Orianna'),'mid',data,legacy),runeId=base.runeOptions.at(-1).id;
 store.remember({...legacy,runeId});
 const context={id:'Orianna',role:'mid',mode:'rift',...creativeComboContext(currentCombo(result.slots,'Orianna','mid',null,null,plan))};
 const restored=recallPreparation(store,null,context);assert.equal(restored.loadoutId,'default');assert.equal(restored.runeId,runeId);assert.equal(restored.comboId,plan.id);
 const member=captureTeamConfigurations({...result,creativePlan:plan},data,store).find(s=>s.id==='Orianna');
 assert.equal(member.loadoutId,'default');assert.equal(member.runeId,runeId);assert.deepEqual(member.conditions,['ap']);
 const current=getBuild(hero('Orianna'),'mid',data,{...context});assert.equal(current.loadoutId,'default');assert.equal(current.reference.patch,data.patch);assert.ok(current.selectionWarnings.some(w=>w.includes('原组合配装')));
 const original=getBuild(hero('Orianna'),'mid',data,{...context,loadoutId:'trio-ball'});assert.equal(original.loadoutId,'trio-ball');assert.equal(original.reference,null);
});

test('curated identity includes sources and loadout bindings; malformed or mismatched saved pages are rejected',()=>{
 const result=fixture(TRIOS[0]),plan=captureCreativePlan(result,data);
 for(const change of [p=>p.curated.members[0].champion='Annie',p=>p.curated.sources[0].url='javascript:alert(1)',p=>p.curated.members[0].loadoutId='../../private']){
  const bad=structuredClone(plan);change(bad);bad.id=creativePlanId(bad);assert.throws(()=>validateCreativePlan(bad));
 }
 const revision=structuredClone(plan);revision.curated.members[0].loadoutId='default';revision.id=creativePlanId(revision);assert.notEqual(revision.id,plan.id);assert.ok(validateCreativePlan(revision));
 assert.equal(captureCreativePlan({...result,scope:'solo'},data),null);
});
