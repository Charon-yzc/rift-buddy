import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';

const source=process.argv.includes('--source'),release=source?null:JSON.parse(await fs.readFile('release/latest.json'));
const hash=async()=>createHash('sha256').update(await fs.readFile(path.join(release.directory,'resources/app.asar'))).digest('hex');
if(!source)assert.equal(await hash(),release.archiveSha256);
await fs.mkdir('.local',{recursive:true});const root=await fs.mkdtemp(path.resolve('.local/hex-shared-bench-smoke-'));
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-hex-shared-bench.cjs')],{cwd:process.cwd(),windowsHide:true,stdio:'inherit',env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_SOURCE:source?'1':'0'}});
const timer=setTimeout(()=>child.kill(),120000);
try{const [code]=await once(child,'exit');assert.equal(code,0,'Shared-bench smoke failed; '+root);}finally{clearTimeout(timer);}
const proof=JSON.parse(await fs.readFile(path.join(root,'proof.json')));assert(proof.passed);
if(!source){assert.equal(await hash(),release.archiveSha256);assert.equal(proof.archiveSha256,release.archiveSha256);}
await fs.writeFile('.local/latest-hex-shared-bench-smoke.json',JSON.stringify({root,...proof},null,2));
