import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState,createBackup} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/state-transaction-smoke-')),state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false});
state.favorites=[{id:'original-kept',title:'原收藏',type:'build',champion:'Ashe',role:'bottom',mode:'rift'}];
await saveState(root,state);
const incoming=structuredClone(state);incoming.favorites=[{id:'imported-once',title:'导入收藏',type:'build',champion:'Ahri',role:'mid',mode:'rift'}];incoming.excluded=['Zed'];incoming.preferences.buildSource={region:'kr',tier:'diamond_plus'};incoming.preferences.style='balanced';
await fs.writeFile(path.join(root,'incoming.json'),createBackup(incoming));
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-state-transaction.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),60000);try{const[code]=await once(child,'exit');if(code!==0)throw Error(`State transaction smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-state-transaction-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
