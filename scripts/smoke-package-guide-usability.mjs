import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';
const root=await fs.mkdtemp(path.resolve('.local/guide-usability-smoke-'));
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-guide-usability.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),60000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error('Guide usability failed ('+code+'); '+root);await fs.writeFile('.local/latest-guide-usability-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
