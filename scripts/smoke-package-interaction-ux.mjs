import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {electronExecutable} from './electron-runtime.mjs';

const release=JSON.parse(await fs.readFile('release/latest.json','utf8')),archive=path.resolve(release.directory,'resources/app.asar');
const hash=async()=>createHash('sha256').update(await fs.readFile(archive)).digest('hex');
await fs.mkdir('.local',{recursive:true});const root=await fs.mkdtemp(path.resolve('.local/interaction-ux-smoke-'));
const report={passed:false,root,archive,expectedArchiveSha256:release.archiveSha256,cases:[]};
try{
 report.archiveSha256=await hash();assert.equal(report.archiveSha256,release.archiveSha256,'Packaged interaction ASAR hash mismatch');
 for(const name of ['feedback','selection']){
  const script=path.resolve(`scripts/smoke-${name}-interaction.cjs`),log=path.join(root,`${name}.log`),started=Date.now();
  console.log(`PACKAGED INTERACTION ${name}: ${archive}; log ${log}`);
  const child=spawn(electronExecutable(),[script],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,RIFT_BUDDY_SMOKE_APP:archive}});
  let output='',timedOut=false,exitCode=null,signal=null;
  child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{output+=chunk;process.stderr.write(chunk);});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},90000);
  try{[exitCode,signal]=await once(child,'close');}
  catch(error){output+=error.stack;throw error;}
  finally{clearTimeout(timer);await fs.writeFile(log,output);report.cases.push({name,script,log,exitCode,signal,timedOut,elapsedMs:Date.now()-started});}
  assert.equal(timedOut,false,`Packaged ${name} interaction timed out; ${log}`);
  assert.equal(exitCode,0,`Packaged ${name} interaction failed; ${log}`);
 }
 report.archiveSha256After=await hash();assert.equal(report.archiveSha256After,release.archiveSha256,'Packaged interaction ASAR changed during checks');report.passed=true;
}catch(error){report.error=error.message;throw error;}
finally{
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify(report,null,2));
 await fs.writeFile('.local/latest-interaction-ux-smoke.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
