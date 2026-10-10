import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,creativeMemberCombo,creativeComboContext} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {defaultState,validateState,saveState,readState,createBackup,readBackup,mergeState,STATE_MAX_BYTES} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;

test('500 complete three-member favorites and their original configurations survive disk, backup and restoration',async()=>{
 const slots=createSlots().map(s=>({...s,party:['top','jungle','mid'].includes(s.role),...(s.role==='top'?{champion:'Darius',locked:true}:s.role==='mid'?{champion:'Ahri',locked:true}:{})}));
 const row=recommend({slots,champions:data.champions,scope:'party',style:'balanced',rolePools:{jungle:{mode:'only',heroes:['JarvanIV']}}})[0];row.creativePlan=captureCreativePlan(row,data);assert.ok(row.creativePlan);
 const configurations=captureTeamConfigurations(row,data,createPreparationStore()),state=defaultState();
 state.favorites=Array.from({length:500},(_,i)=>({id:'capacity-'+i,title:'原保存的三人分工 '+i,type:'team',slots:row.slots,creativePlan:row.creativePlan,configurations,scope:'party',style:'balanced',version:data.version,createdAt:'2026-10-10T00:00:00Z'}));
 state.preparations=configurations;state.ownedPageId=44;state.preferences.installPath='D:/英雄联盟';
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-full-favorites-'));await saveState(root,state);
 assert.ok((await fs.stat(path.join(root,'settings.json'))).size>10_000_000,'Exercise complete saved content beyond the previous one-megabyte guard');
 const loaded=await readState(root);assert.equal(loaded.favorites.length,500);assert.deepEqual(loaded.favorites[499].creativePlan,row.creativePlan);assert.deepEqual(loaded.favorites[0].configurations,configurations);
 const backup=path.join(root,'portable.json');await fs.writeFile(backup,createBackup(loaded));const incoming=await readBackup(backup);
 assert.equal(incoming.ownedPageId,null);assert.equal(incoming.preferences.installPath,'');
 const restored=mergeState(defaultState(),incoming,data.champions);assert.equal(restored.favorites.length,500);assert.deepEqual(restored.favorites[0].configurations,configurations);assert.deepEqual(restored.preparations,configurations);
 await saveState(root,restored);assert.deepEqual((await readState(root)).favorites,loaded.favorites);
});

test('rejected oversized collections do not replace saved favorites or prevent the next ordinary preference save',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-favorite-rejection-')),state=defaultState();
 const favorite={id:'kept',title:'保留我的原配置',type:'build',champion:'Ahri',role:'mid',mode:'rift'};state.favorites=[favorite];await saveState(root,state);
 const previous=await fs.readFile(path.join(root,'settings.json'));
 await assert.rejects(saveState(root,{...state,favorites:Array.from({length:501},(_,i)=>({...favorite,id:'too-many-'+i}))}),/收藏或排除列表/);
 const tooLarge={...state,extra:'中'.repeat(Math.ceil(STATE_MAX_BYTES/3))};assert.throws(()=>validateState(tooLarge),/保存空间/);
 await assert.rejects(saveState(root,tooLarge),/保存空间/);assert.deepEqual(await fs.readFile(path.join(root,'settings.json')),previous);
 state.preferences.autoSync=false;await saveState(root,state);const restored=await readState(root);assert.equal(restored.favorites.length,1);assert.equal(restored.favorites[0].id,'kept');assert.equal(restored.preferences.autoSync,false);
});

test('portable backup input uses the same byte budget and retains legacy omitted preferences',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-backup-budget-')),file=path.join(root,'backup.json');
 const current=validateState({...defaultState(),preferences:{...defaultState().preferences,autoSync:false,buildSource:{region:'kr',tier:'diamond_plus'}}}),legacy={schema:1,favorites:[],excluded:[],preferences:{style:'balanced'}};
 await fs.writeFile(file,JSON.stringify(legacy,null,2));const merged=mergeState(current,await readBackup(file),data.champions);assert.equal(merged.preferences.autoSync,false);assert.deepEqual(merged.preferences.buildSource,current.preferences.buildSource);
 const handle=await fs.open(file,'w');await handle.truncate(STATE_MAX_BYTES+1);await handle.close();await assert.rejects(readBackup(file),/保存空间/);
});

test('creative action order differs from position order without changing saved identity, member builds or guide context',async()=>{
 const slots=createSlots().map(s=>({...s,party:['top','mid','bottom'].includes(s.role)}));
 const row=recommend({slots,champions:data.champions,scope:'party',style:'balanced',rolePools:{top:{mode:'only',heroes:['Darius']},mid:{mode:'only',heroes:['Annie']},bottom:{mode:'only',heroes:['Yunara']}}})[0],plan=captureCreativePlan({slots:row.slots,creative:row.creative},data);
 assert.notDeepEqual(plan.members.map(m=>m.champion),plan.ordered.map(m=>m.champion));row.creativePlan=plan;
 const configurations=captureTeamConfigurations(row,data,createPreparationStore());assert.equal(configurations.length,3);
 for(const member of plan.members){const combo=creativeMemberCombo(plan,member.champion,member.role);assert.deepEqual(creativeComboContext(combo).creativePlan,plan);assert.equal(combo.members.find(m=>m.champion===member.champion).job,plan.ordered.find(m=>m.champion===member.champion).job);}
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-reordered-creative-'));await saveState(root,{...defaultState(),preparations:configurations,guide:{selection:configurations[0]}});
 const restored=await readState(root);assert.deepEqual(restored.preparations,configurations);assert.deepEqual(restored.guide.selection.creativePlan,plan);
});
