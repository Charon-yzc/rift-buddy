import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';
const root=await fs.mkdtemp(path.resolve('.local/game-transition-smoke-')),state=defaultState();
state.preferences.autoSync=false;state.preferences.autoCheck=false;state.preferences.autoLive=false;state.preferences.installPath=path.join(root,'client-fixture');
state.draft={slots:createSlots(),style:'balanced',scope:'party'};
Object.assign(state.draft.slots.find(s=>s.role==='support'),{champion:'Ashe',locked:true,manualPosition:true,clientCellId:1});
await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-test-only:https');await saveState(root,state);
const child=spawn(path.resolve('node_modules/electron/dist/electron.exe'),[path.resolve('scripts/smoke-game-transition.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),90000);try{const[code]=await once(child,'exit');if(code!==0)throw Error(`Game transition smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-game-transition-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
