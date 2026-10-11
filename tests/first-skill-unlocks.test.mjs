import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {legalSkillPrefix,legalSkillOrder,fillSkillOrder,editSkillOrder,skillOptions,nextSkill,recommendSkill,validateCustomSkillOrder,validateSavedSkillOrder,orderPriority} from '../src/core/skill-advice.mjs';
import {getBuild} from '../src/core/builds.mjs';import {skillEditorView} from '../src/skill-editor-view.mjs';import {selectedBuildFields} from '../src/core/build-favorites.mjs';import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';import {captureRoomConfigurations,roomPreparation} from '../src/core/room-configuration.mjs';import {selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {defaultState,validateState,saveState,readState,createBackup,mergeState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const live=(level,skills={Q:0,W:0,E:0,R:0})=>({matched:true,level,skills});
// Same-patch Riot CharacterRecords/Root.SpellLevelUpInfoList, via game-file mirror:
// https://raw.communitydragon.org/16.20/game/data/characters/shen/shen.bin.json
// SHA256 e1868c48cf0e954e1728b99bec111a3fa7d82f0f33463dce3e6a3060d0f54a9a
// https://raw.communitydragon.org/16.20/game/data/characters/zilean/zilean.bin.json
// SHA256 bf566037b247c627c38ebc44b6ea3acd437ad0c0127efbdf474f045a7d96f1bf
const gates={Q:[1,3,5,7,9],W:[2,3,5,7,9],E:[1,3,5,7,9],R:[6,11,16]};
for(const [id,role] of [['Shen','top'],['Zilean','support']]){
 test(`${id} first W unlock constrains editor, import and banked live points`,()=>{
  assert.equal(legalSkillPrefix('W',id),false);assert.equal(legalSkillOrder('WQE',id),false);assert.throws(()=>validateCustomSkillOrder({order:'WQE',patch:data.patch},id),/等级规则/);
  assert.deepEqual(skillOptions(id,live(1)).allowed,['Q','E']);assert.deepEqual(skillOptions(id,live(2)).allowed,['Q','W','E']);assert.equal(skillOptions(id,live(1,{Q:0,W:1,E:0,R:0})),null);
  assert.equal(skillOptions(id,live(2,{Q:0,W:1,E:0,R:0})).points,1,'banking to level 2 does not require Q/E first');
  assert.notEqual(nextSkill(id,'WQE','WQE',live(1)),'W');assert.equal(recommendSkill({champion:id,role,priority:'WQE',live:live(2),reviewed:false}).next,null);
  const order=fillSkillOrder('',id,{priority:'WQE',first:'WQE'}),ranks={Q:0,W:0,E:0,R:0};assert.equal(order.length,18);assert.notEqual(order[0],'W');
  for(const [i,k] of [...order].entries())assert(i+1>=gates[k][ranks[k]++],`${id} point ${i+1}: ${k}`);
  assert.throws(()=>editSkillOrder(order,id,0,'W'),/等级/);assert.equal(editSkillOrder(order,id,1,'W')[1],'W');
  const first=skillEditorView(getBuild(data.champions.find(c=>c.id===id),role,data)).match(/data-skill-index="0"[^>]*>([\s\S]*?)<\/select>/)[1];assert.deepEqual([...first.matchAll(/option value="([QWER])"/g)].map(m=>m[1]),['Q','E']);
 });
 test(`${id} obsolete first W choice survives storage and backups disabled while shared fallback stays legal`,async()=>{
  const old={order:'WQEQQRQEQEREEWWRWW',patch:data.patch},selection={id,role,mode:'rift',customSkillOrder:old},hero=data.champions.find(c=>c.id===id),build=getBuild(hero,role,data,selection);
  assert.deepEqual(validateSavedSkillOrder(old,id),old);assert.throws(()=>validateSavedSkillOrder({...old,order:'WWW'},id),/等级规则/);assert.equal(build.selectedSkill?.source==='个人自选',false);assert.notEqual(build.first[0],'W');assert(build.selectionWarnings.some(w=>w.includes(old.order)&&w.includes('原记录保留')));
  const fields=selectedBuildFields({...selection,build},{preserveUnavailable:true}),state=validateState({...defaultState(),preparations:[selection],guide:selectGuide(null,selection),favorites:[{id:'old-'+id,type:'build',title:id,champion:id,role,mode:'rift',...fields}]}),dir=await fs.mkdtemp(path.join(os.tmpdir(),'rift-first-unlock-'));
  try{await saveState(dir,state);const restarted=await readState(dir);assert.equal(restarted.recovery,undefined);for(const saved of [restarted.preparations[0],restarted.favorites[0],restarted.guide.selection])assert.deepEqual(saved.customSkillOrder,old);assert.notEqual(createGuideModel(data,restarted.guide).first[0],'W');const imported=mergeState(defaultState(),JSON.parse(createBackup(restarted)),data.champions);assert.deepEqual(imported.preparations[0].customSkillOrder,old);assert.deepEqual(imported.favorites[0].customSkillOrder,old);}finally{await fs.rm(dir,{recursive:true,force:true});}
  assert.deepEqual(changeCompanionPlan(data,selection,'condition','ad').customSkillOrder,old);assert.equal(changeCompanionPlan(data,selection,'skill-reset').customSkillOrder,undefined);assert.throws(()=>changeCompanionPlan(data,selection,'skill-custom:0','W'),/等级/);
  const store=createPreparationStore();store.remember(selection);const slots=['top','jungle','mid','bottom','support'].map(r=>({role:r,champion:r===role?id:null,party:r===role,locked:false})),[shared]=captureRoomConfigurations(slots,data,store);assert.notEqual(shared.skills[0],'W');assert.notEqual(roomPreparation(shared,data).customSkillOrder.order[0],'W');assert.throws(()=>roomPreparation({...shared,skills:old.order,first:'WQE'},data),/等级规则/);assert.deepEqual(store.snapshot()[0].customSkillOrder,old);
 });
}
test('Yuumi paid-point editor allows sixth Q at level eleven but never infers live investments from automatic W',()=>{
 // Same mirror /yuumi/yuumi.bin.json SHA256 5778ace8b7117164b1ce3a192b420252a3aacdd1eaf05dcc0147d1d97f834214:
 // Q [1,3,5,7,9,11], W [2,3,5,7,9]. This does not prove Live's automatic W value.
 assert.equal(legalSkillPrefix('W','Yuumi'),false);const sixthAt11='QEQWQRQWQEQ';assert.equal(legalSkillOrder(sixthAt11,'Yuumi'),true);assert.equal(legalSkillPrefix('QEQWQRQWQQ','Yuumi'),false);
 const order=fillSkillOrder(sixthAt11,'Yuumi',{priority:'QEW'});assert.equal(order.length,18);assert.equal([...order].filter(k=>k==='Q').length,6);assert.equal(orderPriority(order,'Yuumi'),'QEW');
 assert.deepEqual(validateSavedSkillOrder({order:'WQE',patch:data.patch},'Yuumi'),{order:'WQE',patch:data.patch});
 for(const level of [1,2,11])for(const w of [0,1]){const snapshot=live(level,{Q:0,W:w,E:0,R:0});assert.equal(skillOptions('Yuumi',snapshot),null);const advice=recommendSkill({champion:'Yuumi',role:'support',priority:'QEW',first:'QEW',order,live:snapshot});assert.equal(advice.next,null);assert.match(advice.reason,/尚未验证实时数据/);}
 const build=getBuild(data.champions.find(c=>c.id==='Yuumi'),'support',data,{customSkillOrder:{order,patch:data.patch}});assert.equal(build.skillOrder,order);assert.match(skillEditorView(build),/data-skill-index="17"/);
});
