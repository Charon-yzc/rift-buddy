import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/role-preparation-smoke-')),state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,installPath:path.join(root,'client-fixture')});
await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-fixture-only:https');await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-role-preparation.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),90000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error('Role preparation smoke failed: '+root);}finally{clearTimeout(timer);}
await fs.writeFile('.local/latest-role-preparation-smoke.json',JSON.stringify({root},null,2));
