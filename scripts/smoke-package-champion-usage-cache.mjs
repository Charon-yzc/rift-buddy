import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/champion-usage-cache-smoke-')),state=defaultState();
Object.assign(state.preferences,{autoSync:true,autoCheck:false,appUpdateCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,roomAuto:false,installPath:path.join(root,'client')});
await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-history-only:https');await saveState(root,state);
await fs.writeFile(path.join(root,'import-usage.json'),JSON.stringify({version:1,basis:'current-season-screenshot',observedAt:new Date().toISOString(),usage:{sampled:18,counts:{Ahri:12,Ashe:6}}}));
for(const step of ['seed','restore']){
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-match-history.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:process.argv.includes('--source')?'1':'0',RIFT_BUDDY_USAGE_CACHE_SMOKE:step},windowsHide:true,stdio:'inherit'});
 const timer=setTimeout(()=>child.kill(),45000);try{const [code]=await once(child,'exit');if(code!==0)throw Error('Champion usage cache smoke failed ('+code+'): '+root);}finally{clearTimeout(timer);}
}
console.log(JSON.stringify({root,seed:JSON.parse(await fs.readFile(path.join(root,'cache-seed-result.json'),'utf8')),restore:JSON.parse(await fs.readFile(path.join(root,'cache-restore-result.json'),'utf8'))},null,2));
