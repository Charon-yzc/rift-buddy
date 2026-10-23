import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';import {defaultState,saveState} from '../services/storage.mjs';import {createSlots,recommend} from '../src/core/recommend.mjs';import {captureCreativePlan} from '../src/core/creative-plan.mjs';
const release=JSON.parse(await fs.readFile('release/latest.json')),archive=path.join(release.directory,'resources/app.asar'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');assert.equal(sha(await fs.readFile(archive)),release.archiveSha256);
await fs.mkdir('.local',{recursive:true});const root=await fs.mkdtemp(path.resolve('.local/current-data-smoke-')),state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,appUpdateCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,roomAuto:false,chatNotice:false});
state.draft={slots:createSlots().map(slot=>({...slot,party:['mid','bottom','support'].includes(slot.role),...(['top','jungle'].includes(slot.role)?{champion:slot.role==='top'?'Garen':'LeeSin',locked:true,manualPosition:true,clientCellId:slot.role==='top'?2:3}:{})})),scope:'party',style:'fun'};
// Only this saved personal example uses the historical fixture. The actual
// package, bootstrap, worker, current configurations and Hex pages remain 21.
const old=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json')),legacy=recommend({slots:state.draft.slots,champions:old.champions,scope:'party',style:'fun',limit:18}).find(row=>row.creative);assert(legacy);
const plan=captureCreativePlan({slots:legacy.slots,creative:legacy.creative},old);assert.equal(plan.dataVersion,old.version);assert.notEqual(plan.patch,'16.21');
state.favorites=[{id:'historical-personal-preserved',type:'team',title:'历史个人方案',version:old.version,createdAt:'2026-10-01T00:00:00.000Z',slots:legacy.slots,style:'fun',scope:'party',creativePlan:plan,configurations:[]}];
await saveState(root,state);const persisted=JSON.parse(await fs.readFile(path.join(root,'settings.json')));await fs.writeFile(path.join(root,'original-favorite.json'),JSON.stringify(persisted.favorites[0]));
const hexRoot=await fs.mkdtemp(path.resolve('.local/current-hex-smoke-'));
const cases=[{phase:'prepare',profile:root},{phase:'restart',profile:root}];
for(const phase of ['hex-sync-0','hex-sync-180','hex-sync-500','spells-prepare']){const profile=await fs.mkdtemp(path.resolve('.local/current-configuration-'));await saveState(profile,state);await fs.writeFile(path.join(profile,'original-favorite.json'),JSON.stringify(persisted.favorites[0]));cases.push({phase,profile});if(phase==='spells-prepare')cases.push({phase:'spells-restore',profile});}
cases.push({phase:'hex',profile:hexRoot});
cases.push({phase:'item-mode-reference',profile:await fs.mkdtemp(path.resolve('.local/item-mode-reference-')),syntheticModeOnlyHotfix:true,scope:'Packaged guide factory/preload/IPC with isolated mode-only reference change'});
for(const {phase,profile} of cases){
 const child=spawn(electronExecutable(),['--force-device-scale-factor=1',path.resolve(phase==='hex'?'scripts/smoke-hex-current.cjs':phase==='item-mode-reference'?'scripts/smoke-item-mode-reference.cjs':'scripts/smoke-current-data.cjs')],{cwd:process.cwd(),windowsHide:true,stdio:'inherit',env:{...process.env,RIFT_BUDDY_USER_DATA:profile,RIFT_BUDDY_CURRENT_PHASE:phase}}),timer=setTimeout(()=>child.kill(),150000);
 try{const [code]=await once(child,'exit');assert.equal(code,0,'Actual current data '+phase+' failed; '+root);}finally{clearTimeout(timer);}
}
assert.equal(sha(await fs.readFile(archive)),release.archiveSha256);const report={passed:true,root,hexRoot,cases,archiveSha256:release.archiveSha256,patch:'16.21',dataInjected:true,dataInjectionScope:'Only the item-mode-reference phase simulates a 40-to-41 mode-only hotfix in isolated public reference data',actualCurrentDataPhases:cases.filter(c=>!c.syntheticModeOnlyHotfix).length,syntheticModeOnlyHotfixPhase:'item-mode-reference',historicalPersonalFavoritePreserved:true,actualClientWrites:0};await fs.writeFile('.local/latest-current-data-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
