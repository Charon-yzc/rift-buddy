import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/national-smoke-')),state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,appUpdateCheck:false,autoLive:false});await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-national-reference.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),80000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error(`National reference smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-national-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
