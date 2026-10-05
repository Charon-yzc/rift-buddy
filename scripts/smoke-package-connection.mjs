import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots,mergeClientSession} from '../src/core/recommend.mjs';
import {moveChampion} from '../src/core/draft.mjs';
const root=await fs.mkdtemp(path.resolve('.local/connection-ui-')),state=defaultState();
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
const session={myTeam:[{cellId:1,championId:data.champions.find(c=>c.id==='Ashe').key,assignedPosition:'BOTTOM'}],localPlayerCellId:1};
state.draft={slots:moveChampion(mergeClientSession(createSlots(),session,data.champions).slots,'bottom','mid'),style:'fun',scope:'context'};
state.preferences.autoSync=false;state.preferences.autoCheck=false;state.preferences.autoLive=false;await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-connection.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:false,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),30000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error(`Connection UI smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-connection-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
