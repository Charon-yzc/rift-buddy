import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/opponent-wait-smoke-')),release=JSON.parse(await fs.readFile('release/latest.json'));
const archiveSha256=createHash('sha256').update(await fs.readFile(path.join(release.directory,'resources/app.asar'))).digest('hex');
if(archiveSha256!==release.archiveSha256)throw Error('Packaged archive hash mismatch');
const reports=[];
for(const group of [['waiting-save','waiting-restart'],['waiting-selection'],['waiting-loading'],['waiting-live'],['waiting-guards']]){
 const folder=path.join(root,group[0]),state=defaultState();await fs.mkdir(folder);
 Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:true,clientCompanion:false,guideAutoShow:true,installPath:path.join(folder,'client-fixture')});
 await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-fixture-only:https');await saveState(folder,state);
 for(const phase of group){
  const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-matchup-focus.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:folder,RIFT_MATCHUP_FOCUS_PHASE:phase},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),90000);
  try{const [code]=await once(child,'exit');if(code!==0)throw Error(`Opponent wait ${phase} failed: ${folder}`);}finally{clearTimeout(timer);}
  const report=JSON.parse(await fs.readFile(path.join(folder,'matchup-focus-'+phase+'.json')));if(!report.passed||report.archiveSha256!==archiveSha256||report.actualRuneWrites!==0)throw Error('Invalid workflow proof');reports.push(report);
 }
}
await fs.writeFile(path.join(root,'opponent-wait.json'),JSON.stringify({passed:true,archiveSha256,reports,actualRuneWrites:0,realGame:'UNPROVEN'},null,2));
await fs.writeFile('.local/latest-opponent-wait-smoke.json',JSON.stringify({root},null,2));console.log(JSON.stringify({root,passed:true,scenarios:reports.length,archiveSha256}));
