import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';

const routes=process.argv.includes('--routes'),root=await fs.mkdtemp(path.resolve('.local/curated-plan-smoke-'));
const release=JSON.parse(await fs.readFile('release/latest.json','utf8'));
if(createHash('sha256').update(await fs.readFile(path.join(release.directory,'resources/app.asar'))).digest('hex')!==release.archiveSha256)throw Error('Archive changed');
const fixed=routes?{top:'Urgot',jungle:'Udyr',mid:'Orianna',bottom:'Varus',support:'Milio'}:{mid:'Galio',bottom:'Nilah',support:'Rakan'},state=defaultState();
Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,rolePools:{}});
state.draft={slots:createSlots().map(s=>({...s,party:!!fixed[s.role],champion:fixed[s.role]||null,locked:!!fixed[s.role],...(fixed[s.role]?{manualPosition:true}:{})})),scope:'party',style:'fun'};
await saveState(root,state);
for(const restart of [false,true]){
 const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-curated-plan.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_CURATED_ROUTES:routes?'1':'0',RIFT_CURATED_RESTART:restart?'1':'0'},windowsHide:true,stdio:'inherit'}),timer=setTimeout(()=>child.kill(),90000);
 try{const [code]=await once(child,'exit');if(code!==0)throw Error('Saved curated workflow failed: '+root);}finally{clearTimeout(timer);}
 const proof=JSON.parse(await fs.readFile(path.join(root,restart?'restart.json':'select.json'),'utf8'));
 if(!proof.passed||proof.archiveSha256!==release.archiveSha256||proof.actualRuneWrites!==0)throw Error('Invalid proof');
}
await fs.writeFile(routes?'.local/latest-party-routes-smoke.json':'.local/latest-curated-plan-smoke.json',JSON.stringify({root},null,2));
console.log(JSON.stringify({root,passed:true,routes,archiveSha256:release.archiveSha256}));
