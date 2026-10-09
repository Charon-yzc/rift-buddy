import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
import {getBuild} from '../src/core/builds.mjs';
const root=await fs.mkdtemp(path.resolve('.local/database-smoke-')),state=defaultState();
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const build=getBuild(data.champions.find(c=>c.id==='Ashe'),'bottom',data,{comboId:'ashe-taric'});
// Existing installations have favorites predating explicit skill selections.
state.favorites=[{id:'legacy-ashe-taric',type:'build',title:'旧版寒冰收藏',version:data.version,createdAt:new Date(0).toISOString(),champion:'Ashe',role:'bottom',mode:'rift',coreIndex:0,loadoutId:build.loadoutId,comboId:'ashe-taric',conditions:[]}];
state.preferences.autoSync=false;state.preferences.autoCheck=false;state.preferences.autoLive=false;await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-database.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),60000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error(`Database smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-database-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
