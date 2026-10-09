import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';

const reordered=process.argv.includes('--reordered'),members=reordered?{top:['Darius'],mid:['Annie'],bottom:['Yunara']}:{mid:['Annie'],bottom:['Ashe'],support:['Rell']};
const root=await fs.mkdtemp(path.resolve('.local/creative-plan-workflow-')),state=defaultState();
state.preferences={...state.preferences,autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,rolePools:Object.fromEntries(['top','jungle','mid','bottom','support'].map(role=>[role,{mode:members[role]?'only':'off',heroes:members[role]||[]}]))};
state.preferences.installPath=path.join(root,'client-fixture');state.draft={slots:createSlots().map(slot=>({...slot,party:!!members[slot.role]})),style:reordered?'balanced':'fun',scope:'party'};
await fs.mkdir(state.preferences.installPath);await fs.writeFile(path.join(state.preferences.installPath,'lockfile'),'LeagueClient:1:23456:isolated-test-only:https');await saveState(root,state);
for(const restart of [false,true]){
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-creative-plan-continuity.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_CREATIVE_RESTART:restart?'1':'0',RIFT_BUDDY_CREATIVE_REORDERED:reordered?'1':'0'},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),90000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Creative plan workflow failed ('+code+'); '+root);}finally{clearTimeout(timer);}
}
await fs.writeFile(reordered?'.local/latest-reordered-plan-workflow.json':'.local/latest-creative-plan-workflow.json',JSON.stringify({root},null,2));
