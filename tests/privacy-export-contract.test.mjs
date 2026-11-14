import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {defaultState,saveState,readState,createBackup,readBackup,mergeState} from '../services/storage.mjs';
import {createChampionUsageCache} from '../services/champion-usage-cache.mjs';

const privateValue='PRIVATE-RAW-HISTORY-SENTINEL';
const raw={puuid:privateValue,token:privateValue,matches:[{gameId:privateValue,participants:[{puuid:privateValue}]}]};
const summary={usage:{sampled:10,counts:{Ashe:7,Ahri:3}},scanned:10,complete:true,source:'lcu',basis:'recent',updatedAt:1000};
const assertNoHistory=value=>{
 const text=typeof value==='string'?value:JSON.stringify(value);
 assert.doesNotMatch(text,/PRIVATE-RAW-HISTORY-SENTINEL|championUsage|matchHistory|participants|puuid|"matches"|"games"|"gameId"|"counts"|"token"/);
};

test('actual save, restart, backup and merge export only player settings, never raw history or summary cache',async()=>{
 const root=await fs.mkdtemp(path.resolve('.local/privacy-export-')),key=createHash('sha256').update('synthetic account and region').digest('hex');
 const cache=await createChampionUsageCache({root});await cache.put(key,{...summary,...raw});
 const state={...defaultState(),...raw,matchHistory:raw,championUsage:summary};
 state.excluded=['Ahri'];state.favorites=[{id:'kept-build',type:'build',title:'玩家收藏',champion:'Ashe',role:'bottom',mode:'rift',version:'77.1.1',createdAt:'2026-10-20T00:00:00Z',...raw}];
 Object.assign(state.preferences,{familiarityMass:.6,poolMode:'only',pool:['Ashe'],championUsage:summary,matchHistory:raw});
 await saveState(root,state);const settings=await fs.readFile(path.join(root,'settings.json'),'utf8'),loaded=await readState(root);assertNoHistory(settings);assertNoHistory(loaded);
 assert.equal(loaded.preferences.familiarityMass,.6);assert.deepEqual(loaded.preferences.pool,['Ashe']);assert.equal(loaded.favorites[0].id,'kept-build');
 const cacheBytes=await fs.readFile(path.join(root,'champion-usage.json'),'utf8');assert.doesNotMatch(cacheBytes,/PRIVATE-RAW-HISTORY-SENTINEL|participants|puuid|"matches"|"token"/);
 assert.deepEqual((await createChampionUsageCache({root})).get(key),summary,'The separately authorized bounded summary survives restart');
 const backupFile=path.join(root,'portable-backup.json'),backup=createBackup({...loaded,...raw,championUsage:summary});await fs.writeFile(backupFile,backup);assertNoHistory(backup);
 assert.ok(!backup.includes(key));assert.ok(!backup.includes('"counts"'));
 const imported=await readBackup(backupFile),merged=mergeState(defaultState(),{...imported,...raw,championUsage:summary},[{id:'Ashe'},{id:'Ahri'}]);
 assertNoHistory(merged);assert.equal(imported.preferences.familiarityMass,.6);assert.deepEqual(merged.excluded,['Ahri']);assert.equal(merged.favorites[0].id,'kept-build');
 await saveState(root,merged);assertNoHistory(await fs.readFile(path.join(root,'settings.json'),'utf8'));
 assert.equal(await fs.readFile(path.join(root,'champion-usage.json'),'utf8'),cacheBytes,'Settings import never rewrites the account-owned summary cache');
});

test('backup import restores an explicit familiarity mass and preserves local mass when old backups omit it',()=>{
 const backup=JSON.parse(createBackup({...defaultState(),preferences:{...defaultState().preferences,familiarityMass:.6}}));
 assert.equal(mergeState(defaultState(),backup,[]).preferences.familiarityMass,.6);
 const local=defaultState();local.preferences.familiarityMass=.4;delete backup.preferences.familiarityMass;
 assert.equal(mergeState(local,backup,[]).preferences.familiarityMass,.4);
});

test('validated backup files restore explicit Flash keys but omitted legacy keys retain the local preference and privacy boundaries',async t=>{
 const files=new Map(),reads=[];
 t.mock.method(fs,'stat',async filename=>{assert(files.has(filename));return {size:Buffer.byteLength(files.get(filename),'utf8')};});
 t.mock.method(fs,'readFile',async(filename,encoding)=>{assert(files.has(filename));assert.equal(encoding,'utf8');reads.push(filename);return files.get(filename);});
 for(const slot of ['d','f','current']){
  const source={...defaultState(),...raw,championUsage:summary};Object.assign(source.preferences,{flashSlot:slot,installPath:'mock-source-game',launchPath:'mock-source.exe',roomAuto:true,championUsage:summary});
  const filename='mock-explicit-'+slot+'.json',bytes=createBackup(source);assertNoHistory(bytes);files.set(filename,bytes);
  const incoming=await readBackup(filename);assert.equal(incoming.preferences.flashSlot,slot);
  const target=defaultState();Object.assign(target.preferences,{flashSlot:slot==='f'?'d':'f',installPath:'mock-local-game',launchPath:'mock-local.exe',roomAuto:false});
  const merged=mergeState(target,incoming,[]);assert.equal(merged.preferences.flashSlot,slot);assert.equal(merged.preferences.installPath,'mock-local-game');assert.equal(merged.preferences.launchPath,'mock-local.exe');assert.equal(merged.preferences.roomAuto,false);assertNoHistory(merged);
  const legacy=JSON.parse(bytes);delete legacy.preferences.flashSlot;const legacyFile='mock-legacy-'+slot+'.json';files.set(legacyFile,JSON.stringify(legacy));
  const old=await readBackup(legacyFile);assert.equal(Object.hasOwn(old.preferences,'flashSlot'),false);assert.equal(mergeState(target,old,[]).preferences.flashSlot,target.preferences.flashSlot);
 }
 assert.equal(reads.length,6,'Every explicit and legacy case passes the real backup reader and validator');
});
