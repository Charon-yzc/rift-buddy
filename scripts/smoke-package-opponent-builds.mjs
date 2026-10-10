import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';
const source=process.argv.includes('--source'),root=await fs.mkdtemp(path.resolve('.local/opponent-source-smoke-')),state=defaultState();
const release=source?{archiveSha256:null}:JSON.parse(await fs.readFile('release/latest.json'));
if(!source&&createHash('sha256').update(await fs.readFile(path.join(release.directory,'resources/app.asar'))).digest('hex')!==release.archiveSha256)throw Error('Archive changed');
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,installPath:path.join(root,'client-fixture')});
const picks={mid:'Galio',bottom:'Nilah',support:'Rakan'};
state.draft={slots:createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role]})),scope:'party',style:'fun'};
await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-fixture-only:https');await saveState(root,state);
for(const phase of ['prepare','restore']){
 const log=await fs.open(path.join(root,phase+'.log'),'wx'),child=spawn(electronExecutable(),[path.resolve('scripts/smoke-opponent-builds.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:source?'1':'0',RIFT_BUDDY_OPPONENT_PHASE:phase,TEMP:root,TMP:root},windowsHide:true,stdio:['ignore',log.fd,log.fd]}),timer=setTimeout(()=>child.kill(),110000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Opponent source smoke failed ('+phase+'); '+root+': '+await fs.readFile(path.join(root,phase+'.log'),'utf8'));}
 finally{clearTimeout(timer);await log.close();}
}
await fs.writeFile('.local/latest-opponent-source-smoke.json',JSON.stringify({root,source,archiveSha256:release.archiveSha256},null,2));
console.log(JSON.stringify({passed:true,root,source,archiveSha256:release.archiveSha256,actualRuneWrites:0}));
