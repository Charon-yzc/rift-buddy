import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/loadouts-smoke-')),state=defaultState();
state.preferences.autoSync=false;state.preferences.clientCompanion=false;state.preferences.autoCheck=false;state.preferences.autoLive=false;await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-loadouts.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:false,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),45000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error(`Loadouts smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-loadouts-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
