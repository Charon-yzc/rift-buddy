import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {selectGuide} from '../src/core/guide.mjs';

const results=[];
const samples=[{order:'client-first',scenario:'safe'},{order:'app-first',scenario:'safe'},...(process.argv.includes('--safety')?['game-background','game-minimized','noobserver','auto-off','refused'].map(scenario=>({order:'client-first',scenario})):[])];
for(const {order,scenario} of samples){
 const root=await fs.mkdtemp(path.resolve('.local/startup-connection-')),state=defaultState();
 Object.assign(state.preferences,{installPath:path.join(root,'client'),autoSync:true,autoCheck:false,appUpdateCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,roomAuto:true,chatNotice:false});
 if(scenario==='auto-off')state.preferences.autoSync=false;
 if(order==='client-first')state.guide=selectGuide(null,{id:'Ahri',role:'mid',mode:'rift'});
 await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:0:23456:isolated-startup-only:https');await saveState(root,state);
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-startup-connection.cjs')],{windowsHide:true,stdio:'inherit',env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_STARTUP_ORDER:order,RIFT_BUDDY_STARTUP_SAFETY:scenario,RIFT_BUDDY_SOURCE:process.argv.includes('--source')?'1':'0'}}),timer=setTimeout(()=>child.kill(),45000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Startup connection failed ('+code+'): '+root);}finally{clearTimeout(timer);}
 results.push({root,...JSON.parse(await fs.readFile(path.join(root,'result.json')))});
}
await fs.writeFile('.local/latest-startup-connection-smoke.json',JSON.stringify({passed:true,results},null,2));
