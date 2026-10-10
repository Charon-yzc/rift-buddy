import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/guide-continuation-smoke-')),state=defaultState();Object.assign(state.preferences,{autoSync:false,autoCheck:false,autoLive:false,clientCompanion:false,guideAutoShow:false});await saveState(root,state);
for(const phase of ['select','restart']){
 const log=await fs.open(path.join(root,phase+'.log'),'wx'),child=spawn(electronExecutable(),[path.resolve('scripts/smoke-guide-continuation.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_CONTINUATION_PHASE:phase},windowsHide:true,stdio:['ignore',log.fd,log.fd]}),timer=setTimeout(()=>child.kill(),60000);
 try{const[code]=await once(child,'exit');if(code!==0)throw Error('Guide continuation failed '+phase+': '+await fs.readFile(path.join(root,phase+'.log'),'utf8'));}finally{clearTimeout(timer);await log.close();}
}
const result={root,...JSON.parse(await fs.readFile(path.join(root,'result.json')))};await fs.writeFile('.local/latest-guide-continuation-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
