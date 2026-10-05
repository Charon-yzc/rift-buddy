import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/catalog-smoke-')),state=defaultState();
state.preferences.autoSync=false;state.preferences.autoCheck=false;state.preferences.autoLive=false;await saveState(root,state);
const child=spawn(path.resolve('node_modules/electron/dist/electron.exe'),[path.resolve('scripts/smoke-catalog.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:false,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),65000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error(`Catalog smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-catalog-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
