import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/prepared-refresh-smoke-')),state=defaultState();
state.preferences.autoSync=false;state.preferences.autoCheck=true;state.preferences.autoLive=false;state.preferences.lastCheck=new Date().toISOString();await saveState(root,state);
const child=spawn(path.resolve('node_modules/electron/dist/electron.exe'),[path.resolve('scripts/smoke-prepared-refresh.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),80000);try{const[code]=await once(child,'exit');if(code!==0)throw Error(`Prepared refresh smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-prepared-refresh-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
