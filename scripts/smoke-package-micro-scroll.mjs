import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {electronExecutable} from './electron-runtime.mjs';
const root=await fs.mkdtemp(path.resolve('.local/micro-scroll-'));
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-micro-scroll.cjs')],{cwd:process.cwd(),windowsHide:true,stdio:'inherit',env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:process.argv.includes('--source')?'1':'0'}});
const timer=setTimeout(()=>child.kill(),45000);
try{const [code]=await once(child,'exit');assert.equal(code,0,'Micro scroll failed: '+root);await fs.writeFile('.local/latest-micro-scroll.json',JSON.stringify({root,passed:true},null,2));}finally{clearTimeout(timer);}
