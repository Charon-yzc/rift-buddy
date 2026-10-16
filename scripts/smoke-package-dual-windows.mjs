import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';
const root=await fs.mkdtemp(path.resolve('.local/dual-windows-smoke-')),state=defaultState();
// Cross-window editing uses an explicitly planned trio; no lobby identities
// are provided by this fixture. Leave the own lane unset for inference races.
state.draft={slots:createSlots().map(s=>({...s,partyManual:true})),scope:'party',style:'fun',soloRole:''};
state.preferences={...state.preferences,autoSync:process.argv.includes('--auto-sync'),autoCheck:false,appUpdateCheck:false,autoLive:false,clientCompanion:true,guideAutoShow:false,clickPrepare:false,companionWidth:440};
state.preferences.installPath=path.join(root,'client-fixture');await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-test-only:https');await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-dual-windows.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:process.argv.includes('--source')?'1':'0',RIFT_BUDDY_DIAGNOSTICS:path.join(root,'main.log')},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),150000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error('Dual-window smoke failed ('+code+'); '+root);await fs.writeFile('.local/latest-dual-windows-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
