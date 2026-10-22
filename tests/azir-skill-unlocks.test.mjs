// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {legalSkillPrefix,legalSkillOrder,fillSkillOrder,editSkillOrder,skillOptions,nextSkill,recommendSkill,validateCustomSkillOrder,validateSavedSkillOrder} from '../src/core/skill-advice.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {skillEditorView} from '../src/skill-editor-view.mjs';
import {selectedBuildFields} from '../src/core/build-favorites.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {captureRoomConfigurations,roomPreparation} from '../src/core/room-configuration.mjs';
import {selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {defaultState,validateState,saveState,readState,createBackup,mergeState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json'));data.builds=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/builds.json')).entries;
const azir=data.champions.find(c=>c.id==='Azir');
// Independent game-data oracle, CharacterRecords/Root.SpellLevelUpInfoList.
// https://raw.communitydragon.org/16.20/game/data/characters/azir/azir.bin.json
// Whole raw file SHA256 aff9f2141eb9abf9760b6f49f3d8c0bef65838d1300d16458c1b6099aaeedd00.
// Missing first-rank requirement on W defaults to 1, rather than Q/E's 2.
const unlocks={Q:[2,3,5,7,9],W:[1,3,5,7,9],E:[2,3,5,7,9],R:[6,11,16]};
const live=(level,skills={Q:0,W:0,E:0,R:0})=>({matched:true,level,skills});
const old={order:'QWEWWRWQWQRQQEEREE',patch:data.patch};

test('Azir first-unlock oracle governs prefix, editor, import and actual-level banked points',()=>{
 assert.equal(legalSkillPrefix('Q','Azir'),false);assert.equal(legalSkillPrefix('E','Azir'),false);assert.equal(legalSkillPrefix('W','Azir'),true);
 assert.equal(legalSkillOrder(old.order,'Azir'),false);assert.throws(()=>validateCustomSkillOrder(old,'Azir'),/等级规则/);
 for(let level=1;level<=18;level++){
  const options=skillOptions('Azir',live(level));
  assert.deepEqual(options.allowed,Object.keys(unlocks).filter(k=>unlocks[k][0]<=level),`banked actual level ${level}`);
 }
 assert.deepEqual(skillOptions('Azir',live(1)).allowed,['W']);assert.deepEqual(skillOptions('Azir',live(2)).allowed,['Q','W','E']);
 assert.equal(skillOptions('Azir',live(1,{Q:1,W:0,E:0,R:0})),null);
 assert.equal(skillOptions('Azir',live(1,{Q:0,W:0,E:1,R:0})),null);
 assert.equal(skillOptions('Azir',live(2,{Q:1,W:0,E:0,R:0})).points,1,'Q learned after banking is valid without W');
 assert.deepEqual(skillOptions('Azir',live(2,{Q:0,W:1,E:0,R:0})).allowed,['Q','E']);
 assert.equal(nextSkill('Azir','QEW','QWE',live(1)),'W');
 assert.equal(recommendSkill({champion:'Azir',priority:'QEW',first:'WQE',live:live(2),reviewed:false}).next,null);
 const order=fillSkillOrder('','Azir',{priority:'WQE',first:'QWE'});assert.equal(order[0],'W');assert.equal(order.length,18);
 const ranks={Q:0,W:0,E:0,R:0};for(const [i,k] of [...order].entries()){assert(i+1>=unlocks[k][ranks[k]],`${i+1} ${k} oracle`);ranks[k]++;}
 for(const key of ['Q','E'])assert.throws(()=>editSkillOrder(order,'Azir',0,key),/等级/);
 for(const key of ['Q','E'])assert.equal(editSkillOrder(order,'Azir',1,key)[1],key);
 const html=skillEditorView(getBuild(azir,'mid',data));const first=html.match(/data-skill-index="0"[^>]*>([\s\S]*?)<\/select>/)[1];
 assert.deepEqual([...first.matchAll(/option value="([QWER])"/g)].map(m=>m[1]),['W']);
});

test('obsolete Azir personal record survives favorites, backup, restart and unrelated changes as unavailable',async()=>{
 assert.deepEqual(validateSavedSkillOrder(old,'Azir'),old);assert.throws(()=>validateSavedSkillOrder({...old,order:'QQQ'},'Azir'),/等级规则/);
 assert.throws(()=>validateSavedSkillOrder({order:'QWER',patch:data.patch},'Jayce'),/等级规则/);
 const selection={id:'Azir',role:'mid',mode:'rift',customSkillOrder:old},before=structuredClone(selection),build=getBuild(azir,'mid',data,selection);
 assert.notEqual(build.selectedSkill?.source,'个人自选');assert.equal(build.skillOrder[0],'W');
 assert(build.selectionWarnings.some(w=>w.includes(old.order)&&w.includes('原记录保留')));assert.deepEqual(selection,before);
 const fields=selectedBuildFields({...selection,build},{preserveUnavailable:true});assert.deepEqual(fields.customSkillOrder,old);
 const state=validateState({...defaultState(),preparations:[selection],guide:selectGuide(null,selection),favorites:[{id:'old-azir',type:'build',title:'旧阿兹尔',champion:'Azir',role:'mid',mode:'rift',...fields}]});
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rift-azir-unlocks-'));try{
  await saveState(dir,state);const restarted=await readState(dir);
  assert.deepEqual(restarted.preparations[0].customSkillOrder,old);assert.deepEqual(restarted.favorites[0].customSkillOrder,old);assert.deepEqual(restarted.guide.selection.customSkillOrder,old);
  assert.equal(restarted.recovery,undefined,'a known disabled old choice must not trigger lossy recovery');
  const model=createGuideModel(data,restarted.guide);assert.equal(model.skillOrder[0],'W');assert(model.selectionWarnings.some(w=>w.includes(old.order)));
  const imported=mergeState(defaultState(),JSON.parse(createBackup(restarted)),data.champions);assert.deepEqual(imported.preparations[0].customSkillOrder,old);assert.deepEqual(imported.favorites[0].customSkillOrder,old);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
 assert.deepEqual(changeCompanionPlan(data,selection,'condition','ad').customSkillOrder,old);
 assert.equal(changeCompanionPlan(data,selection,'skill-reset').customSkillOrder,undefined);
 assert.equal(changeCompanionPlan(data,selection,'skill-custom:0','W').customSkillOrder.order[0],'W');
});

test('Azir room snapshots send the legal fallback and reject an invalid first point on adoption',()=>{
 const store=createPreparationStore();store.remember({id:'Azir',role:'mid',mode:'rift',customSkillOrder:old});
 const slots=['top','jungle','mid','bottom','support'].map(role=>({role,champion:role==='mid'?'Azir':null,party:role==='mid',locked:false}));
 const [shared]=captureRoomConfigurations(slots,data,store);assert.equal(shared.skills[0],'W');
 assert.equal(roomPreparation(shared,data).customSkillOrder.order[0],'W');
 assert.throws(()=>roomPreparation({...shared,skills:old.order,first:'QWE'},data),/等级规则/);
 assert.deepEqual(store.snapshot()[0].customSkillOrder,old,'sharing must not replace the disabled original');
});
