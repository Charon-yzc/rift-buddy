import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/recommendation-fit-smoke-'));
const state=defaultState();
Object.assign(state.preferences,{style:'balanced',autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false,
 installPath:path.join(root,'client-fixture'),rolePools:{mid:{mode:'only',heroes:['Galio','Gragas','Annie','Lux','Diana','Yasuo','Cassiopeia','Lissandra','Azir','Seraphine']}}});
await fs.mkdir(state.preferences.installPath);await saveState(root,state);
const log=await fs.open(path.join(root,'smoke.log'),'wx');
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-recommendation-fit.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:['ignore',log.fd,log.fd]});
const timer=setTimeout(()=>child.kill(),60000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error('Recommendation fit smoke failed: '+await fs.readFile(path.join(root,'smoke.log'),'utf8'));}
finally{clearTimeout(timer);await log.close();}
const result={root,...JSON.parse(await fs.readFile(path.join(root,'result.json'),'utf8'))};
await fs.writeFile('.local/latest-recommendation-fit-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
