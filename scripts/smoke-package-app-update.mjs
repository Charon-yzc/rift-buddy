import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/app-update-smoke-')),state=defaultState();
state.preferences.autoSync=false;state.preferences.autoCheck=false;state.preferences.autoLive=false;state.preferences.appUpdateCheck=false;state.preferences.updateMirror='';await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-app-update.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_UPDATE_DRY_RUN:'1',RIFT_BUDDY_UPDATE_TEMPDIR:path.join(root,'update-tmp')},windowsHide:false,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),65000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error(`App update smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-app-update-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
