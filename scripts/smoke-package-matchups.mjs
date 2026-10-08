import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';

const root=await fs.mkdtemp(path.resolve('.local/matchups-smoke-'));
for(const phase of ['side','guide']){
 const directory=path.join(root,phase),state=defaultState();
 await fs.mkdir(directory);Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,installPath:path.join(directory,'client-fixture')});
 await fs.mkdir(state.preferences.installPath);await saveState(directory,state);
 const log=await fs.open(path.join(directory,'smoke.log'),'wx');
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-matchups.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:directory,RIFT_BUDDY_MATCHUP_PHASE:phase},windowsHide:true,stdio:['ignore',log.fd,log.fd]});
 const timer=setTimeout(()=>child.kill(),60000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error(phase+' matchup smoke failed: '+await fs.readFile(path.join(directory,'smoke.log'),'utf8'));}
 finally{clearTimeout(timer);await log.close();}
}
const side=JSON.parse(await fs.readFile(path.join(root,'side/result.json'),'utf8')),guide=JSON.parse(await fs.readFile(path.join(root,'guide/result.json'),'utf8'));
const result={root,side,guide};await fs.writeFile('.local/latest-matchups-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
