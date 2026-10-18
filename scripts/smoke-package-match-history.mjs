import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/match-history-smoke-')),state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,appUpdateCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,roomAuto:false,installPath:path.join(root,'client')});
await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-history-only:https');await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-match-history.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:process.argv.includes('--source')?'1':'0'},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),90000);try{const [code]=await once(child,'exit');if(code!==0)throw Error('Match history smoke failed ('+code+'): '+root);console.log(JSON.stringify({root,...JSON.parse(await fs.readFile(path.join(root,'result.json'),'utf8'))},null,2));}finally{clearTimeout(timer);}
