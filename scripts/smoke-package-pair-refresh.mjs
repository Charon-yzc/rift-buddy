import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';

const root=await fs.mkdtemp(path.resolve('.local/pair-refresh-smoke-')),state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,style:'balanced'});
state.preferences.rolePools={top:{heroes:['Gwen'],mode:'only'}};
state.draft={slots:createSlots().map(s=>({...s,party:['top','jungle','mid'].includes(s.role),champion:s.role==='jungle'?'Graves':s.role==='mid'?'Vex':null,locked:['jungle','mid'].includes(s.role)})),scope:'party',style:'balanced'};
await saveState(root,state);
await fs.writeFile(path.join(root,'initial-state.json'),JSON.stringify(state));
for(const phase of ['refresh','restart']){
 const log=await fs.open(path.join(root,phase+'.log'),'wx'),child=spawn(electronExecutable(),[path.resolve('scripts/smoke-pair-refresh.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_PAIR_PHASE:phase},windowsHide:true,stdio:['ignore',log.fd,log.fd]});
 const timer=setTimeout(()=>child.kill(),120000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Pair refresh '+phase+' failed: '+await fs.readFile(path.join(root,phase+'.log'),'utf8'));}
 finally{clearTimeout(timer);await log.close();}
}
const result={root,...JSON.parse(await fs.readFile(path.join(root,'result.json')))};
await fs.writeFile('.local/latest-pair-refresh-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
