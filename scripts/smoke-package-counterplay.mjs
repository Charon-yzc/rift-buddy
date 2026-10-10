import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';

const source=process.argv.includes('--source'),size=Number(process.argv.find(a=>/^--size=/.test(a))?.split('=')[1]||3),ball=process.argv.includes('--ball'),wallTrio=process.argv.includes('--wall-trio'),moon=process.argv.includes('--moon'),ballFive=process.argv.includes('--ball-five'),kindred=process.argv.includes('--kindred');
if(![2,3,4,5].includes(size)||(ball||wallTrio||moon)&&size!==3||ballFive&&size!==5||[ball,wallTrio,moon,ballFive].filter(Boolean).length>1)throw Error('Choose two through five players and a matching fixture size.');
const picks=ballFive?{top:'Ornn',jungle:'JarvanIV',mid:'Orianna',bottom:'MissFortune',support:'Leona'}:moon?{jungle:'Diana',mid:'Yasuo',support:'Rell'}:wallTrio?{top:'Camille',jungle:'JarvanIV',mid:'Galio'}:ball?{jungle:'Vi',mid:'Orianna',support:'Nautilus'}:Object.fromEntries(Object.entries({jungle:'Gragas',mid:'Yasuo',support:'Rakan',top:'Ornn',bottom:'Jinx'}).slice(0,size));
const root=await fs.mkdtemp(path.resolve('.local/party-counterplay-smoke-')),state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,rolePools:{}});
state.draft={slots:createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role],...(picks[s.role]?{manualPosition:true}:{}),...(s.role==='jungle'?{clientCellId:1}:{})})),style:'fun',scope:'party'};
await saveState(root,state);
const release=source?{archiveSha256:null}:JSON.parse(await fs.readFile('release/latest.json'));
if(!source&&createHash('sha256').update(await fs.readFile(path.join(release.directory,'resources/app.asar'))).digest('hex')!==release.archiveSha256)throw Error('Archive changed');
for(const restart of [false,true]){
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-counterplay.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:source?'1':'0',RIFT_BUDDY_COUNTERPLAY_RESTART:restart?'1':'0',RIFT_BUDDY_COUNTERPLAY_KINDRED:kindred?'1':'0',RIFT_BUDDY_COUNTERPLAY_BALL_FIVE:ballFive?'1':'0',TEMP:root,TMP:root},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),120000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Counterplay workflow failed: '+root);}finally{clearTimeout(timer);}
 const report=JSON.parse(await fs.readFile(path.join(root,restart?'restart.json':'select.json')));
 if(!report.passed||report.archiveSha256!==release.archiveSha256||report.actualRuneWrites!==0)throw Error('Invalid counterplay proof');
}
console.log(JSON.stringify({root,size,ball,wallTrio,moon,ballFive,kindred,passed:true,archiveSha256:release.archiveSha256}));
