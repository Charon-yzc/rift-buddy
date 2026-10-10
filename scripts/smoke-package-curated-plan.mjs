import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';

const scenario=['all-routes','side-pressure','side-pressure-trio','yasuo-relay','trio-stages','loadout-review'].find(name=>process.argv.includes('--'+name))||'';
const customRunes=process.argv.includes('--custom-runes'),duoStages=process.argv.includes('--duo-stages'),readiness=process.argv.includes('--readiness'),independent=process.argv.includes('--independent-four')||process.argv.includes('--independent-five'),tactics=process.argv.includes('--tactics')||process.argv.includes('--tactics-four'),partySize=process.argv.includes('--tactics-four')||process.argv.includes('--independent-four')?4:5,routes=tactics||process.argv.includes('--routes')||independent||['all-routes','side-pressure','side-pressure-trio'].includes(scenario),root=await fs.mkdtemp(path.resolve('.local/curated-plan-smoke-'));
const release=JSON.parse(await fs.readFile('release/latest.json','utf8'));
if(createHash('sha256').update(await fs.readFile(path.join(release.directory,'resources/app.asar'))).digest('hex')!==release.archiveSha256)throw Error('Archive changed');
const examples={'side-pressure-trio':{top:'Jax',jungle:'Sejuani',mid:'Ahri'},'all-routes':{top:'Ornn',jungle:'Sejuani',mid:'Orianna',bottom:'Jinx',support:'Lulu'},'side-pressure':{top:'Fiora',jungle:'Graves',mid:'TwistedFate',support:'Bard'},'yasuo-relay':{top:'Malphite',jungle:'Diana',mid:'Yasuo'},'trio-stages':{top:'Shen',jungle:'Nocturne',mid:'Galio'}};
const fixed=examples[scenario]|| (duoStages?{bottom:'Ashe',support:'Braum'}:readiness?{top:'Kled',jungle:'Khazix',mid:'Anivia'}:independent?{top:'Garen',jungle:'Khazix',mid:'Kassadin',bottom:'Yunara',...(partySize===5?{support:'Milio'}:{})}:tactics?{top:'Jayce',jungle:'Nidalee',mid:'Ziggs',bottom:'Ezreal',...(partySize===5?{support:'Karma'}:{})}:routes?{top:'Urgot',jungle:'Udyr',mid:'Orianna',bottom:'Varus',support:'Milio'}:{mid:'Galio',bottom:'Nilah',support:'Rakan'}),state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,rolePools:{}});
if(tactics)state.preferences.play={...state.preferences.play,tempo:'poke'};
if(scenario==='all-routes')state.preferences.play={...state.preferences.play,tempo:'teamfight'};
state.draft={slots:createSlots().map(s=>({...s,party:!!fixed[s.role],champion:fixed[s.role]||null,locked:!!fixed[s.role],...(fixed[s.role]?{manualPosition:true}:{})})),scope:'party',style:'fun'};
await saveState(root,state);
for(const restart of [false,true]){
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-curated-plan.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_CURATED_SCENARIO:scenario,RIFT_CURATED_CUSTOM_RUNES:customRunes?'1':'0',RIFT_CURATED_DUO_STAGES:duoStages?'1':'0',RIFT_CURATED_READINESS:readiness?'1':'0',RIFT_CURATED_ROUTES:routes?'1':'0',RIFT_CURATED_TACTICS:tactics?String(partySize):'0',RIFT_CURATED_INDEPENDENT:independent?String(partySize):'0',RIFT_CURATED_RESTART:restart?'1':'0'},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),90000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Saved curated workflow failed: '+root);}finally{clearTimeout(timer);}
 const proof=JSON.parse(await fs.readFile(path.join(root,restart?'restart.json':'select.json'),'utf8'));
 if(!proof.passed||proof.archiveSha256!==release.archiveSha256||proof.actualRuneWrites!==0)throw Error('Invalid proof');
}
await fs.writeFile(scenario?`.local/latest-${scenario}-smoke.json`:customRunes?'.local/latest-custom-runes-smoke.json':duoStages?'.local/latest-duo-stages-smoke.json':readiness?'.local/latest-personal-readiness-smoke.json':independent?`.local/latest-independent-party-${partySize}-smoke.json`:tactics?`.local/latest-party-tactics-${partySize}-smoke.json`:routes?'.local/latest-party-routes-smoke.json':'.local/latest-curated-plan-smoke.json',JSON.stringify({root},null,2));
console.log(JSON.stringify({root,passed:true,routes,archiveSha256:release.archiveSha256}));
