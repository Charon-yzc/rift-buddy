import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';import {defaultState,saveState} from '../services/storage.mjs';import {createSlots} from '../src/core/recommend.mjs';
const crossLane=process.argv.includes('--cross-lane'),root=await fs.mkdtemp(path.resolve(crossLane?'.local/cross-lane-smoke-':'.local/cooperation-smoke-')),state=defaultState(),release=JSON.parse(await fs.readFile('release/latest.json'));
if(createHash('sha256').update(await fs.readFile(path.join(release.directory,'resources/app.asar'))).digest('hex')!==release.archiveSha256)throw Error('Archive changed');
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,rolePools:{jungle:{mode:'only',heroes:[crossLane?'LeeSin':'Sejuani']},mid:{mode:'only',heroes:[crossLane?'Ahri':'Seraphine']}}});
state.draft={slots:createSlots().map(s=>({...s,party:['top','jungle','mid'].includes(s.role),...(s.role==='top'?{champion:crossLane?'Darius':'Trundle',locked:true,manualPosition:true,clientCellId:2}:{})})),style:'fun',scope:'party'};await saveState(root,state);
for(const restart of [false,true]){
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-cooperation.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_COOP_RESTART:restart?'1':'0',RIFT_BUDDY_COOP_CROSS_LANE:crossLane?'1':'0'},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),90000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Cooperation workflow failed: '+root);}finally{clearTimeout(timer);}
 const report=JSON.parse(await fs.readFile(path.join(root,restart?'restart.json':'select.json')));if(!report.passed||report.archiveSha256!==release.archiveSha256||report.actualRuneWrites!==0)throw Error('Invalid proof');
}
await fs.writeFile(crossLane?'.local/latest-cross-lane-smoke.json':'.local/latest-cooperation-smoke.json',JSON.stringify({root},null,2));console.log(JSON.stringify({root,passed:true,archiveSha256:release.archiveSha256}));
