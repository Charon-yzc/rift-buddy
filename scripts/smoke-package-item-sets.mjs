import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/item-set-workflow-')),state=defaultState(),installPath=path.join(root,'client-fixture','LeagueClient'),game=path.join(root,'client-fixture','Game'),target=path.join(game,'Config','Global','Recommended');
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,installPath});
await fs.mkdir(installPath,{recursive:true});await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(installPath,'lockfile'),'LeagueClient:1:23456:isolated-fixture-only:https');await fs.writeFile(path.join(installPath,'LeagueClient.exe'),'isolated fixture marker');await fs.writeFile(path.join(game,'League of Legends.exe'),'isolated fixture marker');
for(const name of ['user-build.json','akari1-106.json','rift-buddy-22-bottom-rift.json'])await fs.writeFile(path.join(target,name),'preserve user file '+name);
await saveState(root,state);
for(const phase of ['select','restart']){
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-item-sets.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_ITEM_SET_PHASE:phase},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),120000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error(`Item set ${phase} smoke failed: ${root}`);}finally{clearTimeout(timer);}
}
await fs.writeFile('.local/latest-item-set-smoke.json',JSON.stringify({root},null,2));
