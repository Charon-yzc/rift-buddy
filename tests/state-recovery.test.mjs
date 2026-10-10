import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {defaultState,readState,saveState,validateState,mergeState} from '../services/storage.mjs';
import {stateRecoveryView} from '../src/state-recovery-view.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {selectGuide} from '../src/core/guide.mjs';
const root=()=>fs.mkdtemp(path.join(os.tmpdir(),'rift-state-recovery-'));
const choice={id:'Ashe',role:'bottom',mode:'rift',runeId:'source-retained-choice'};
const favorite={id:'good-ashe',title:'我的艾希',type:'build',champion:'Ashe',role:'bottom',mode:'rift',runeId:choice.runeId};
const fixture=()=>({...defaultState(),favorites:[favorite],preparations:[choice],excluded:['Garen'],preferences:{...defaultState().preferences,autoSync:false,autoCheck:false,pool:['Ashe'],poolMode:'only'},draft:{slots:createSlots().map(s=>({...s,champion:s.role==='mid'?'Lux':null,locked:s.role==='mid'})),scope:'party',style:'fun'},ownedPageId:3,guide:selectGuide(null,choice)});
async function corrupt(directory,state){const bytes=JSON.stringify(state);await fs.writeFile(path.join(directory,'settings.json'),bytes);return bytes;}

test('one malformed favorite preserves valid choices, draft, guide, ownership and preferences, with an exact original backup',async()=>{
 const directory=await root(),source=fixture();source.favorites.push({...favorite,id:'bad',role:undefined});const bytes=await corrupt(directory,source);
 const recovered=await readState(directory),expected=validateState(fixture());
 const {recovery,...state}=recovered;assert.deepEqual(state,expected);assert.equal(recovery.backedUp,true);assert.deepEqual(recovery.issues,['收藏 1 项无法读取或超过容量']);
 assert.equal(await fs.readFile(path.join(directory,recovery.backupFile),'utf8'),bytes);assert.equal(await fs.readFile(path.join(directory,'settings.json'),'utf8'),bytes);
 assert.match(stateRecoveryView(recovery),/role="alert"/);assert.match(stateRecoveryView(recovery),/收藏 1 项/);assert.ok(stateRecoveryView(recovery).includes(recovery.backupFile));
 await saveState(directory,recovered);const restarted=await readState(directory);assert.deepEqual(restarted,expected);assert.equal(restarted.recovery,undefined);assert.equal(await fs.readFile(path.join(directory,recovery.backupFile),'utf8'),bytes);
});

test('partial recovery keeps good entries in each list and repairs a bad path without resetting unrelated preferences',async()=>{
 const directory=await root(),source=fixture();source.favorites.push({type:'unknown'});source.preparations.push({...choice,id:'Lux',role:'bad'});source.excluded.push({id:'invalid'},'Ashe');source.preferences.installPath='bad\npath';
 await corrupt(directory,source);const state=await readState(directory);
 assert.equal(state.favorites[0].id,favorite.id);assert.equal(state.favorites.length,1);assert.deepEqual(state.preparations,validateState(fixture()).preparations);assert.deepEqual(state.excluded,['Garen','Ashe']);assert.equal(state.preferences.autoSync,false);assert.equal(state.preferences.autoCheck,false);assert.deepEqual(state.preferences.pool,['Ashe']);assert.equal(state.preferences.poolMode,'only');assert.equal(state.preferences.installPath,defaultState().preferences.installPath);assert.equal(state.ownedPageId,3);
 assert.equal(state.recovery.issues.length,4);assert.equal((await fs.readdir(directory)).filter(f=>f.includes('.recovery-')).length,1);
});

test('malformed optional sections cannot discard readable collections and valid preferences',async()=>{
 const directory=await root(),source=fixture();source.draft={slots:null};source.guide={selection:{id:'invalid!',role:'mid'}};
 await corrupt(directory,source);const state=await readState(directory);
 assert.equal(state.draft,null);assert.equal(state.guide,null);assert.equal(state.favorites.length,1);assert.equal(state.preparations.length,1);assert.equal(state.preferences.autoSync,false);assert.deepEqual(state.recovery.issues,['当前阵容无法读取','指引无法读取']);
});

test('unreadable JSON is disclosed and preserved, while normal and missing settings need no recovery notice',async()=>{
 const directory=await root();assert.equal((await readState(directory)).recovery,undefined);
 await fs.writeFile(path.join(directory,'settings.json'),'broken original bytes');const recovered=await readState(directory);assert.deepEqual(recovered.recovery.issues,['保存文件格式无法读取']);assert.equal(await fs.readFile(path.join(directory,recovered.recovery.backupFile),'utf8'),'broken original bytes');
 await saveState(directory,fixture());assert.equal((await readState(directory)).recovery,undefined);assert.equal(stateRecoveryView(null),'');
});

test('failed recovery backup prevents overwriting original bytes, and a later successful reread releases the block',async t=>{
 const directory=await root(),source=fixture();source.favorites.push({id:'bad'});const bytes=await corrupt(directory,source);
 const mock=t.mock.method(fs,'copyFile',async()=>{throw Object.assign(Error('isolated backup write failure'),{code:'EIO'});});
 const recovered=await readState(directory);assert.equal(recovered.recovery.backedUp,false);assert.equal(recovered.recovery.backupFile,null);assert.doesNotMatch(stateRecoveryView(recovered.recovery),/原文件已保留/);assert.match(stateRecoveryView(recovered.recovery),/停止覆盖/);
 await assert.rejects(saveState(directory,fixture()),/停止覆盖原文件/);assert.equal(await fs.readFile(path.join(directory,'settings.json'),'utf8'),bytes);mock.mock.restore();
 const reread=await readState(directory);assert.equal(reread.recovery.backedUp,true);await saveState(directory,reread);assert.equal((await readState(directory)).recovery,undefined);
});

test('startup salvage never relaxes explicit save or backup import validation',async()=>{
 const invalid=fixture();invalid.favorites.push({id:'bad'});const directory=await root();await saveState(directory,fixture());const bytes=await fs.readFile(path.join(directory,'settings.json'),'utf8');
 assert.throws(()=>validateState(invalid),/收藏/);assert.throws(()=>mergeState(fixture(),invalid,[]),/收藏/);await assert.rejects(saveState(directory,invalid),/收藏/);assert.equal(await fs.readFile(path.join(directory,'settings.json'),'utf8'),bytes);
 const html=stateRecoveryView({issues:['<script>bad</script>'],backedUp:true,backupFile:'<img src=x>'});assert.doesNotMatch(html,/<script>|<img src=x>/);assert.match(html,/&lt;script&gt;/);
});
