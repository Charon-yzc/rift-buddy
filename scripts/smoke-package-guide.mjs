import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/guide-smoke-'));
const state=defaultState();state.preferences.autoSync=false;state.preferences.autoCheck=false;
state.preferences.autoLive=false;
await saveState(root,state);
const executable=electronExecutable();
const child=spawn(executable,[path.resolve('scripts/smoke-guide.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_DIAGNOSTICS:path.join(root,'startup.log')},windowsHide:false,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),30000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error(`Packaged guide smoke failed (${code}); ${root}`);console.log(await fs.readFile(path.join(root,'guide-smoke.json'),'utf8'));await fs.writeFile('.local/latest-guide-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
