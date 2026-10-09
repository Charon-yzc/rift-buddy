import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {getBuild} from '../src/core/builds.mjs';
import {selectedBuildFields} from '../src/core/build-favorites.mjs';
import {createPreparationStore,storedPreparation} from '../src/core/preparation.mjs';
import {captureTeamConfigurations} from '../src/core/team-favorites.mjs';
import {favoriteTeamSummary} from '../src/favorites-view.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {defaultState,saveState,readState,validateState,mergeState} from '../services/storage.mjs';

const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const champion=id=>data.champions.find(c=>c.id===id);
const chosen=(id,role,context={})=>{
 const base={id,role,mode:'rift',coreIndex:1,conditions:['heal'],...context};
 const build=getBuild(champion(id),role,data,base);
 const selection={...base,runeId:build.runeOptions[1].id,...(build.skillChoices.length?{skillId:build.skillChoices.at(-1).id}:{})};
 const next=getBuild(champion(id),role,data,selection);
 return {...selection,...selectedBuildFields({...selection,build:next})};
};
const result=()=>({id:'aphelios-thresh',scope:'bot',slots:createSlots().map(s=>({...s,champion:s.role==='bottom'?'Aphelios':s.role==='support'?'Thresh':null}))});

test('ordinary selections survive a real state save and a new store without needing favorites or a guide',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-preparations-'));
 const store=createPreparationStore(),selection=chosen('Aphelios','bottom');
 store.remember({...selection,threatId:'Morgana',protectId:'Ashe',combatFocus:'lane',match:{gameId:'private'},completedItems:['1055']});
 await saveState(root,{...defaultState(),preparations:store.snapshot()});
 const saved=await readState(root),reopened=createPreparationStore();reopened.restore(saved.preparations);
 assert.equal(saved.guide,null);assert.equal(saved.favorites.length,0);
 const restored=reopened.recall(selection),before=getBuild(champion(selection.id),selection.role,data,selection),after=getBuild(champion(selection.id),selection.role,data,restored);
 assert.equal(after.selectedCoreId,before.selectedCoreId);assert.equal(after.selectedRuneId,before.selectedRuneId);assert.equal(after.selectedSkillId,before.selectedSkillId);
 assert.deepEqual(after.items.map(i=>i.id),before.items.map(i=>i.id));assert.deepEqual(after.runePage.selectedPerkIds,before.runePage.selectedPerkIds);
 const raw=await fs.readFile(path.join(root,'settings.json'),'utf8');
 for(const field of ['threatId','protectId','combatFocus','gameId','completedItems','Morgana'])assert.equal(raw.includes(field),false);
 restored.conditions.push('ad');assert.deepEqual(reopened.recall(selection).conditions,['heal']);
});

test('saved choices keep champion, position, mode and companion configuration independent',()=>{
 const store=createPreparationStore(),base=chosen('Ashe','bottom');
 const contexts=[base,{...base,role:'support',runeId:'curated-glacial'},{...base,comboId:'ashe-braum',runeId:'curated-hail'},{...base,comboId:'ashe-lux',runeId:'curated-comet'},
  {id:'Ashe',role:'bottom',mode:'hex',coreIndex:2,augmentIds:[1048],compareIds:[1048,1002],ownedAugmentIds:[1047]}];
 for(const value of contexts)store.remember(value);
 const restarted=createPreparationStore();restarted.restore(validateState({...defaultState(),preparations:store.snapshot()}).preparations);
 for(const value of contexts)assert.deepEqual(restarted.recall(value),store.recall(value));
 assert.equal(storedPreparation(restarted.snapshot(),{...base,comboId:'new-partner'}),null);
 assert.equal(restarted.recall({...base,id:'Jinx'}),null);
});

test('backup merge restores missing configurations while preserving current conflicting choices',()=>{
 const current=validateState({...defaultState(),preparations:[chosen('Aphelios','bottom')]}),backup=defaultState();
 backup.preparations=[{...current.preparations[0],coreId:'core-removed-old-item',runeId:'source-old-page'},chosen('Ashe','bottom'),{id:'FutureUnknown',role:'top',mode:'rift'}];
 const merged=mergeState(current,backup,data.champions);
 assert.deepEqual(storedPreparation(merged.preparations,current.preparations[0]),current.preparations[0]);
 assert.ok(storedPreparation(merged.preparations,backup.preparations[1]));assert.ok(storedPreparation(merged.preparations,backup.preparations[2]),'Unknown future champions retain their saved preference without entering recommendations');assert.equal(merged.preparations.length,3);
});

test('legacy and stale preferences remain readable, and corrupt optional preferences do not erase favorites',async()=>{
 const legacy=defaultState();delete legacy.preparations;
 assert.deepEqual(validateState(legacy).preparations,[]);
 const stale={id:'Ashe',role:'bottom',mode:'rift',coreId:'core-removed-old-item',runeId:'source-old-page',skillId:'source-old-order'};
 assert.equal(validateState({...legacy,preparations:[stale]}).preparations[0].coreId,stale.coreId);
 assert.match(getBuild(champion('Ashe'),'bottom',data,stale).selectionWarnings.join(' '),/原选择仍保留/);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-preparations-recovery-'));
 const favorite={id:'legacy-team',type:'team',title:'旧组合',slots:result().slots,style:'fun',scope:'bot'};
 await fs.writeFile(path.join(root,'settings.json'),JSON.stringify({...legacy,favorites:[favorite],preferences:{...legacy.preferences,autoSync:false},preparations:[{id:'Ashe',role:'invalid',mode:'rift'}]}));
 const recovered=await readState(root);assert.equal(recovered.favorites[0].id,favorite.id);assert.equal(recovered.preferences.autoSync,false);assert.deepEqual(recovered.preparations,[]);
 assert.ok((await fs.readdir(root)).some(name=>name.includes('.recovery-')));
});

test('team favorites snapshot every member choice and restore it after later changes and a real save',async()=>{
 const lineup=result(),store=createPreparationStore();
 const initial=captureTeamConfigurations(lineup,data,store);
 const selected=chosen(initial[0].id,initial[0].role,{comboId:initial[0].comboId});store.remember(selected);
 const configurations=captureTeamConfigurations(lineup,data,store),favorite={id:'team',title:'枪械与灯笼',type:'team',slots:lineup.slots,scope:'bot',style:'fun',configurations,version:data.version};
 assert.equal(configurations.length,2);assert.equal(configurations[0].runeId,selected.runeId);assert.equal(configurations[0].coreId,selected.coreId);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-team-preferences-'));await saveState(root,{...defaultState(),favorites:[favorite]});
 store.remember({...selected,coreIndex:0,coreId:'core-new-choice',runeId:'curated-fleet'});
 const reopened=await readState(root),saved=reopened.favorites[0];
 for(const selection of saved.configurations)store.remember(selection);
 assert.equal(store.recall(selected).runeId,selected.runeId);assert.equal(store.recall(selected).coreId,selected.coreId);
 assert.equal(saved.configurations[0].coreId,selected.coreId);
 const html=favoriteTeamSummary(data,saved,3);
 assert.match(html,/已保存 2 位成员/);assert.match(html,/厄斐琉斯/);assert.match(html,/锤石/);assert.match(html,/data-action="open-team-build"/);assert.match(html,/data-index="3"/);
});

test('a team snapshot cannot refer to another hero, lane, mode or duplicate member',()=>{
 const lineup=result(),configuration=captureTeamConfigurations(lineup,data,createPreparationStore())[0];
 const state={...defaultState(),favorites:[{id:'team',title:'Test',type:'team',scope:'bot',style:'fun',slots:lineup.slots,configurations:[configuration]}]};
 for(const change of [{id:'Ashe'},{role:'top'},{mode:'hex'}])assert.throws(()=>validateState({...state,favorites:[{...state.favorites[0],configurations:[{...configuration,...change}]}]}));
 assert.throws(()=>validateState({...state,favorites:[{...state.favorites[0],configurations:[configuration,configuration]}]}));
 assert.deepEqual(validateState({...state,favorites:[{...state.favorites[0],configurations:undefined}]}).favorites[0].configurations,[]);
 const solo={...lineup,scope:'solo',targets:['bottom']};assert.deepEqual(captureTeamConfigurations(solo,data,createPreparationStore()).map(s=>s.role),['bottom']);
});
