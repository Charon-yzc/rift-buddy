import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/matchup-mechanics-smoke-')),state=defaultState(),release=JSON.parse(await fs.readFile('release/latest.json'));
if(createHash('sha256').update(await fs.readFile(path.join(release.directory,'resources/app.asar'))).digest('hex')!==release.archiveSha256)throw Error('Packaged archive changed');
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,installPath:path.join(root,'client-fixture')});
await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-fixture-only:https');await saveState(root,state);
for(const restart of [false,true]){
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-matchup-preparation.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_MATCHUP_RESTART:restart?'1':'0',RIFT_BUDDY_MATCHUP_MECHANICS:'1'},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),90000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Mechanics preparation failed: '+root);}finally{clearTimeout(timer);}
 const report=JSON.parse(await fs.readFile(path.join(root,restart?'mechanics-restart.json':'mechanics-select.json')));if(!report.passed||report.archiveSha256!==release.archiveSha256||report.actualRuneWrites!==0)throw Error('Invalid mechanics proof');
}
await fs.writeFile('.local/latest-matchup-mechanics-smoke.json',JSON.stringify({root},null,2));console.log(JSON.stringify({root,passed:true,archiveSha256:release.archiveSha256}));
