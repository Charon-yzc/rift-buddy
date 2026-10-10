import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';

const root=await fs.mkdtemp(path.resolve('.local/summoners-smoke-')),state=defaultState();
const release=JSON.parse(await fs.readFile('release/latest.json'));
if(createHash('sha256').update(await fs.readFile(path.join(release.directory,'resources/app.asar'))).digest('hex')!==release.archiveSha256)throw Error('Archive changed');
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,installPath:path.join(root,'client-fixture'),rolePools:{bottom:{heroes:['Aphelios'],mode:'only'},support:{heroes:['Thresh'],mode:'only'}}});
state.draft={slots:createSlots(),scope:'bot',style:'balanced'};
await saveState(root,state);
for(const phase of ['prepare','restore']){
 const log=await fs.open(path.join(root,phase+'.log'),'wx');
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-summoners.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SUMMONER_PHASE:phase},windowsHide:true,stdio:['ignore',log.fd,log.fd]});
 const timer=setTimeout(()=>child.kill(),90000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Summoner smoke failed ('+phase+'): '+await fs.readFile(path.join(root,phase+'.log'),'utf8'));}
 finally{clearTimeout(timer);await log.close();}
 const report=JSON.parse(await fs.readFile(path.join(root,phase+'.json')));
 if(!report.passed||report.archiveSha256!==release.archiveSha256||report.actualRuneWrites!==0)throw Error('Invalid summoner proof');
}
await fs.writeFile('.local/latest-summoners-smoke.json',JSON.stringify({root,passed:true,archiveSha256:release.archiveSha256},null,2));
console.log(JSON.stringify({root,passed:true,archiveSha256:release.archiveSha256},null,2));
