import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {electronExecutable} from './electron-runtime.mjs';

const release=JSON.parse(await fs.readFile('release/latest.json'));
const archive=path.join(release.directory,'resources/app.asar');
const hash=async()=>createHash('sha256').update(await fs.readFile(archive)).digest('hex');
assert.equal(await hash(),release.archiveSha256);
await fs.mkdir('.local',{recursive:true});
const root=await fs.mkdtemp(path.resolve('.local/compact-ingame-smoke-')),cases=[];
for(const scale of [1,1.25]){
 const profile=path.join(root,String(scale));await fs.mkdir(profile);
 const child=spawn(electronExecutable(),['--force-device-scale-factor='+scale,path.resolve('scripts/smoke-compact-ingame.cjs')],{cwd:process.cwd(),windowsHide:true,stdio:'inherit',env:{...process.env,RIFT_BUDDY_USER_DATA:profile}});
 const timer=setTimeout(()=>child.kill(),150000);
 try{const [code]=await once(child,'exit');assert.equal(code,0,'Compact in-game windows failed at '+scale+'; '+profile);}finally{clearTimeout(timer);}
 const proof=JSON.parse(await fs.readFile(path.join(profile,'proof.json')));assert.equal(proof.archiveSha256,release.archiveSha256);cases.push({scale,profile,...proof});
}
assert.equal(await hash(),release.archiveSha256);
await fs.writeFile('.local/latest-compact-ingame-smoke.json',JSON.stringify({passed:true,root,archiveSha256:release.archiveSha256,cases},null,2));
