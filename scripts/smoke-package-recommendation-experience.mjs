import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';
const root=await fs.mkdtemp(path.resolve('.local/recommendation-experience-smoke-')),state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,appUpdateCheck:false,autoLive:false,roomAuto:false,clientCompanion:false,guideAutoShow:false,clickPrepare:true,theme:'hextech'});
state.draft={slots:createSlots().map(s=>({...s,party:['mid','bottom','support'].includes(s.role)})),partyCount:3,scope:'party',style:'fun',soloRole:'bottom',playerPosition:{role:'bottom',cellId:0}};
await saveState(root,state);console.log('EXPERIENCE ROOT '+root);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-recommendation-experience.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:process.argv.includes('--source')?'1':'0'},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),180000);try{const [code]=await once(child,'exit');if(code!==0)throw Error('Recommendation experience smoke failed; '+root);await fs.writeFile('.local/latest-recommendation-experience-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
