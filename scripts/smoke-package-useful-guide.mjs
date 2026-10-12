import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';
const root=await fs.mkdtemp(path.resolve('.local/useful-guide-smoke-'));
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-useful-guide.cjs')],{cwd:process.cwd(),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:process.argv.includes('--source')?'1':'0'},windowsHide:true,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),50000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error('Useful guide smoke failed ('+code+'); '+root);await fs.writeFile('.local/latest-useful-guide-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
