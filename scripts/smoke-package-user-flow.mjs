import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,validateState,saveState} from '../services/storage.mjs';
import {selectGuide} from '../src/core/guide.mjs';
import {createSlots} from '../src/core/recommend.mjs';
const root=await fs.mkdtemp(path.resolve('.local/user-flow-smoke-')),state=validateState(defaultState());
// The synthetic League client is served from an isolated lockfile so the main
// process and the renderer read the same fixture instead of disagreeing.
const installPath=path.join(root,'client-fixture','LeagueClient');
await fs.mkdir(installPath,{recursive:true});await fs.writeFile(path.join(installPath,'lockfile'),'LeagueClient:1:23456:isolated-user-flow:https');
state.preferences.autoSync=false;state.preferences.autoCheck=false;state.preferences.appUpdateCheck=false;state.preferences.autoLive=false;state.preferences.roomAuto=false;state.preferences.installPath=installPath;
state.preferences.rolePools.bottom={mode:'only',heroes:['Ashe','Jhin']};
state.preferences.rolePools.support={mode:'only',heroes:['Nami','Lux']};
state.draft={slots:createSlots(),scope:'party',style:'fun',soloRole:'bottom'};
state.guide=selectGuide(null,{id:'Seraphine',role:'bottom',mode:'rift',loadoutId:'sera-team',runeId:'curated-guardian',comboId:'double-song',conditions:['heal']});
await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-user-flow.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root,TEMP:root,TMP:root},windowsHide:true,stdio:'inherit'});
// A slow CI runner needs the same headroom as the neighbouring package smokes;
// this guard only stops a hung run, it never decides whether a check passed.
const timer=setTimeout(()=>child.kill(),210000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error(`User flow smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-user-flow-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
