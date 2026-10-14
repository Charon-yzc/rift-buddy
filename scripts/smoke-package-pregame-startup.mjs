import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';

const root=await fs.mkdtemp(path.resolve('.local/pregame-startup-smoke-')),state=defaultState();
const installPath=path.join(root,'client-fixture','LeagueClient'),gamePath=path.join(root,'client-fixture','Game');
Object.assign(state.preferences,{autoSync:true,autoCheck:false,appUpdateCheck:false,autoLive:false,roomAuto:false,clientCompanion:true,guideAutoShow:false,companionWidth:440,flashSlot:'current',installPath});
const savedHeroes={top:'Garen',jungle:'Vi',mid:'Ahri',bottom:'Ashe',support:'Nami'};
state.draft={slots:createSlots().map(slot=>({...slot,party:true,champion:savedHeroes[slot.role],locked:true})),scope:'party',style:'balanced',soloRole:''};
await fs.mkdir(installPath,{recursive:true});await fs.mkdir(gamePath,{recursive:true});
await fs.writeFile(path.join(installPath,'lockfile'),'LeagueClient:1:23456:isolated-startup-fixture:https');
await fs.writeFile(path.join(installPath,'LeagueClient.exe'),'isolated fixture marker');
await fs.writeFile(path.join(gamePath,'League of Legends.exe'),'isolated fixture marker');
await saveState(root,state);
console.log('PREGAME STARTUP ROOT '+root);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-pregame-startup.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:process.argv.includes('--source')?'1':'0',RIFT_BUDDY_DIAGNOSTICS:path.join(root,'main.log')},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),150000);
try{
 const [code]=await once(child,'exit');
 if(code!==0)throw Error('Pregame startup smoke failed ('+code+'); '+root);
 await fs.writeFile('.local/latest-pregame-startup-smoke.json',JSON.stringify({root},null,2));
}finally{clearTimeout(timer);}
