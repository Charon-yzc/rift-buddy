import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/import-smoke-')),state=defaultState();
state.preferences={...state.preferences,autoSync:false,autoCheck:false,autoLive:false,guideAutoShow:false,guideAfterGame:'keep',poolMode:'only',pool:['Ashe','Nami'],rolePools:{bottom:{mode:'only',heroes:['Ashe']},support:{mode:'only',heroes:['Nami']}}};await saveState(root,state);
await fs.writeFile(path.join(root,'old-backup.json'),JSON.stringify({schema:1,favorites:[],excluded:[],preferences:{style:'balanced',autoCheck:false,autoSync:false},draft:null,ownedPageId:null,guide:null}));
await fs.writeFile(path.join(root,'new-backup.json'),JSON.stringify({...state,preferences:{...state.preferences,poolMode:'only',pool:['Caitlyn','Lux'],rolePools:{bottom:{mode:'only',heroes:['Caitlyn']},support:{mode:'only',heroes:['Lux']}}}}));
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-import.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),60000);try{const[code]=await once(child,'exit');if(code!==0)throw Error(`Import smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-import-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
