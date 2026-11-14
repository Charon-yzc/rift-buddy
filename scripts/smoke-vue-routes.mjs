import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';
const root=await fs.mkdtemp(path.resolve('.local/vue-routes-smoke-'));
const child=spawn(electronExecutable(),['--disable-gpu',path.resolve('scripts/smoke-vue-routes.cjs')],{env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_VUE_PACKAGED:process.argv.includes('--packaged')?'1':'0'},stdio:'inherit',windowsHide:true});
const timer=setTimeout(()=>child.kill(),30000);
try{const [code,signal]=await once(child,'exit');if(code!==0)throw Error(`Vue route lifecycle smoke failed (${code}, ${signal||'no signal'}): ${root}`);}finally{clearTimeout(timer);}
