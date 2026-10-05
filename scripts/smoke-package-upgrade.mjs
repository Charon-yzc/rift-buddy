import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/upgrade-smoke-')),state=defaultState();
state.preferences.autoSync=false;state.preferences.autoCheck=false;state.preferences.autoLive=false;await saveState(root,state);
const child=spawn(path.resolve('node_modules/electron/dist/electron.exe'),[path.resolve('scripts/smoke-upgrade.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_DIAGNOSTICS:path.join(root,'startup.log')},windowsHide:false,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),45000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error(`Upgrade smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-upgrade-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
