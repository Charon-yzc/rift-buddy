import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';

const root=await fs.mkdtemp(path.resolve('.local/preparations-smoke-')),state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,style:'balanced',installPath:path.join(root,'client-fixture')});
state.preferences.rolePools={bottom:{heroes:['Aphelios'],mode:'only'},support:{heroes:['Thresh'],mode:'only'}};
state.draft={slots:createSlots(),scope:'bot',style:'balanced'};
await saveState(root,state);
for(const phase of ['prepare','restore','team-restore']){
 const logfile=await fs.open(path.join(root,phase+'.log'),'wx');
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-preparations.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_PREPARATION_PHASE:phase},windowsHide:true,stdio:['ignore',logfile.fd,logfile.fd]});
 const timer=setTimeout(()=>child.kill(),60000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Preparation smoke failed ('+phase+'): '+await fs.readFile(path.join(root,phase+'.log'),'utf8'));}
 finally{clearTimeout(timer);await logfile.close();}
}
const result={root,...JSON.parse(await fs.readFile(path.join(root,'result.json'),'utf8'))};
await fs.writeFile('.local/latest-preparations-smoke.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
