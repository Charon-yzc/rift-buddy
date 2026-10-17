import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/companion-workflow-smoke-')),state=defaultState();
// Exercise visible whole-configuration switches against isolated loopback mocks.
state.preferences={...state.preferences,autoSync:false,autoCheck:false,appUpdateCheck:false,autoLive:false,clientCompanion:true,guideAutoShow:false,clickPrepare:true};
state.preferences.installPath=path.join(root,'client-fixture','LeagueClient');await fs.mkdir(state.preferences.installPath,{recursive:true});await fs.mkdir(path.join(root,'client-fixture','Game'),{recursive:true});await fs.writeFile(path.join(state.preferences.installPath,'LeagueClient.exe'),'isolated marker');await fs.writeFile(path.join(root,'client-fixture','Game','League of Legends.exe'),'isolated marker');await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-test-only:https');await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-companion-workflow.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),180000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error('Companion workflow failed ('+code+'); '+root);await fs.writeFile('.local/latest-companion-workflow-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
