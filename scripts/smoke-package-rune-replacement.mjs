import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
import {selectGuide} from '../src/core/guide.mjs';
const root=await fs.mkdtemp(path.resolve('.local/rune-replacement-smoke-')),state=defaultState();
state.preferences={...state.preferences,autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false};
state.guide={...selectGuide(null,{id:'Volibear',role:'top',mode:'rift'}),ball:true,collapsed:true};
state.preferences.installPath=path.join(root,'client-fixture');
await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-test-only:https');await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-rune-replacement.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),90000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error('Rune replacement smoke failed ('+code+'); '+root);await fs.writeFile('.local/latest-rune-replacement-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
