import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {installerScript} from './installer-script.mjs';
import {payloadManifest,installManifestText,deltaPayload,INSTALL_MANIFEST} from './installer-payload.mjs';
import {binaryPatches} from './binary-patch.mjs';
const root=await fs.mkdtemp(path.resolve('.local/installer-upgrade-smoke-')),registryId='RiftBuddy-Fixture-'+crypto.randomBytes(5).toString('hex'),shortcutName=registryId;
const install=path.join(root,'installed app'),lifecycle=path.join(root,'lifecycle.ps1'),compiler=process.env.RIFT_BUDDY_MAKENSIS||path.resolve('.local/tooling/nsis-3.12/makensis.exe');
await fs.writeFile(lifecycle,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),await fs.readFile('scripts/installer-lifecycle.ps1')]));
const run=async(file,args,options={})=>{const child=spawn(file,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],...options});let output='';child.stdout?.on('data',c=>output+=c);child.stderr?.on('data',c=>output+=c);const [code]=await once(child,'exit');if(code!==0)throw Error(file+' failed ('+code+')\n'+output);return output;};
const blockBase=crypto.randomBytes(2*1024*1024),blockTarget=Buffer.concat([blockBase.subarray(0,60000),Buffer.from('changed-length application update'),blockBase.subarray(60000)]);
async function bundle(version,old){const directory=path.join(root,version);await fs.mkdir(path.join(directory,'resources'),{recursive:true});await fs.copyFile(process.execPath,path.join(directory,'开黑搭子.exe'));await fs.writeFile(path.join(directory,'resources/app.asar'),old?'old application':'new application');await fs.writeFile(path.join(directory,'resources/blocks.bin'),old?blockBase:blockTarget);await fs.writeFile(path.join(directory,old?'retired.txt':'added.txt'),old?'retired file':'new file');const manifest=await payloadManifest(directory,version);await fs.writeFile(path.join(directory,INSTALL_MANIFEST),installManifestText(manifest));return {directory,manifest};}
async function compile(bundle,name,base,lifecycleFile=lifecycle){const output=path.join(root,name+'.exe'),script=path.join(root,name+'.nsi'),delta=base&&deltaPayload(base.manifest,bundle.manifest);let blockPatch='',patched=new Set();if(base){const blocks=await binaryPatches(base.directory,bundle.directory,base.manifest,bundle.manifest,delta.changed);assert.equal(blocks.patched.size,1);patched=blocks.patched;blockPatch=path.join(root,name+'-blocks.json');await fs.writeFile(blockPatch,JSON.stringify(blocks.descriptor));}await fs.writeFile(script,installerScript({version:bundle.manifest.version,directory:bundle.directory,output,icon:path.resolve('assets/icon.ico'),files:bundle.manifest.files.map(f=>f.name).concat(INSTALL_MANIFEST),lifecycle:lifecycleFile,registryId,shortcutName,diagnosticFile:path.join(root,name+'-lifecycle.log'),...(base?{baseManifest:path.join(base.directory,INSTALL_MANIFEST),payloadFiles:delta.changed.filter(f=>!patched.has(f.name)).map(f=>f.name).concat(INSTALL_MANIFEST),blockPatch}:{})}));await run(compiler,['/NOCONFIG','/INPUTCHARSET','UTF8',script]);return output;}
const old=await bundle('98.0.0',true),next=await bundle('98.0.1',false),oldInstaller=await compile(old,'old-full'),full=await compile(next,'new-full'),delta=await compile(next,'new-incremental',old);
// Use the published generator's uninstall logic with an isolated identity.
const legacyGenerator=path.join(root,'legacy-generator.mjs');await fs.writeFile(legacyGenerator,execFileSync('git',['show','30d2993881213cb3320580fc0029c478c7c615a3:scripts/installer-script.mjs']));
const legacyDirectory=path.join(root,'legacy');await fs.cp(old.directory,legacyDirectory,{recursive:true});await fs.unlink(path.join(legacyDirectory,INSTALL_MANIFEST));
const legacyOutput=path.join(root,'legacy-full.exe'),legacyScript=path.join(root,'legacy-full.nsi'),legacyModule=await import(pathToFileURL(legacyGenerator).href);
await fs.writeFile(legacyScript,legacyModule.installerScript({version:'98.0.0',directory:legacyDirectory,output:legacyOutput,icon:path.resolve('assets/icon.ico'),files:old.manifest.files.map(row=>row.name)}).replaceAll('RiftBuddy',registryId).replaceAll('$SMPROGRAMS\\开黑搭子','$SMPROGRAMS\\'+shortcutName).replaceAll('$DESKTOP\\开黑搭子.lnk','$DESKTOP\\'+shortcutName+'.lnk'));
await run(compiler,['/NOCONFIG','/INPUTCHARSET','UTF8',legacyScript]);
const cleanupLifecycle=path.join(root,'cleanup-lock.ps1');await fs.writeFile(cleanupLifecycle,(await fs.readFile(lifecycle,'utf8')).replace('function ClearBackup([string]$Root){',"function ClearBackup([string]$Root){ throw 'Synthetic backup cleanup lock';"));
const cleanupInstaller=await compile(next,'cleanup-incremental',old,cleanupLifecycle);
const installRun=file=>run(file,['/S','/D='+install],{windowsVerbatimArguments:true});
const launch=async file=>{const child=spawn(file,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});await once(child,'spawn');return child;};
let running,unrelated,locker;try{
 await installRun(oldInstaller);assert.ok(await fs.stat(path.join(install,'卸载开黑搭子.exe')));
 const userFile=path.join(install,'player-file.txt'),preferences=path.join(root,'player','settings.json');await fs.mkdir(path.dirname(preferences));await fs.writeFile(userFile,'User-owned file must survive');await fs.writeFile(preferences,'{"favorites":["Ashe"],"theme":"hextech"}');
 running=spawn(path.join(install,'开黑搭子.exe'),['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});await once(running,'spawn');const oldPid=running.pid;
 const badStage=path.join(root,'bad-stage');await fs.cp(next.directory,badStage,{recursive:true});await fs.writeFile(path.join(badStage,'resources/app.asar'),'corrupt payload');
 await assert.rejects(run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',lifecycle,'-InstallDir',install,'-PreviousInstallDir',install,'-StagedDir',badStage,'-RegistryId',registryId]),/integrity/);
 assert.equal(running.exitCode,null,'Invalid staged files stopped the old program');assert.equal(await fs.readFile(path.join(install,'resources/app.asar'),'utf8'),'old application');
 const missingUninstaller=path.join(root,'missing-uninstaller');await fs.cp(next.directory,missingUninstaller,{recursive:true});
 await assert.rejects(run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',lifecycle,'-InstallDir',install,'-StagedDir',missingUninstaller,'-RegistryId',registryId]),/uninstaller is missing/);assert.equal(running.exitCode,null);
 const migration=path.join(root,'migration');await fs.mkdir(path.join(migration,'resources'),{recursive:true});await fs.writeFile(path.join(migration,'resources/app.asar'),'user migration file');
 await assert.rejects(run(full,['/S','/D='+migration],{windowsVerbatimArguments:true}));
 assert.equal(await fs.readFile(path.join(migration,'resources/app.asar'),'utf8'),'user migration file');assert.equal(running.exitCode,null);
 await fs.writeFile(path.join(install,'added.txt'),'user file at a newly introduced payload path');
 await assert.rejects(installRun(delta));
 assert.equal(await fs.readFile(path.join(install,'added.txt'),'utf8'),'user file at a newly introduced payload path');
 assert.equal(await fs.readFile(path.join(install,'resources/app.asar'),'utf8'),'old application');assert.ok(await fs.stat(path.join(install,'卸载开黑搭子.exe')));
 assert.match(await run('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'+registryId,'/v','DisplayVersion']),/98\.0\.0/);
 await fs.unlink(path.join(install,'added.txt')); // This fixture created and owns this conflict file.
 const lockScript=path.join(root,'hold-file.ps1');await fs.writeFile(lockScript,'param([string]$File)\n$h=[IO.File]::Open($File,\'Open\',\'Read\',\'Read\');try{[Console]::WriteLine(\'READY\');Start-Sleep -Seconds 90}finally{$h.Dispose()}');
 locker=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',lockScript,path.join(install,'开黑搭子.exe')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{locker.stdout.on('data',data=>{if(String(data).includes('READY'))resolve();});locker.once('exit',code=>reject(Error('Locker exited '+code)));});
 await assert.rejects(installRun(full));
 assert.equal(await fs.readFile(path.join(install,'resources/app.asar'),'utf8'),'old application','One locked unchanged file must not prevent restoration of the rest');
 assert.match(await run('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'+registryId,'/v','DisplayVersion']),/98\.0\.0/);
 locker.kill();await once(locker,'exit');locker=null;
 await fs.mkdir(path.join(install,'tools'),{recursive:true});await fs.copyFile(process.execPath,path.join(install,'tools/node.exe'));unrelated=await launch(path.join(install,'tools/node.exe'));
 running=await launch(path.join(install,'开黑搭子.exe'));const upgradedPid=running.pid;
 await installRun(delta);await Promise.race([running.exitCode!==null?Promise.resolve():once(running,'exit'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Old process survived upgrade')),5000))]);
 assert.equal(unrelated.exitCode,null,'An unrelated tools/node.exe must survive');
 assert.ok(!await fs.stat(path.join(install,'retired.txt')).then(()=>true,()=>false));assert.equal(await fs.readFile(userFile,'utf8'),'User-owned file must survive');
 for(const row of next.manifest.files){const bytes=await fs.readFile(path.join(install,row.name));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256);}
 assert.equal(await fs.readFile(preferences,'utf8'),'{"favorites":["Ashe"],"theme":"hextech"}');
 await installRun(full);for(const row of next.manifest.files)assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(install,row.name))).digest('hex'),row.sha256);
 assert.equal(await fs.readFile(userFile,'utf8'),'User-owned file must survive');
 await run(path.join(install,'卸载开黑搭子.exe'),['/S','_?='+install],{windowsVerbatimArguments:true});
 await installRun(legacyOutput);assert.ok(!await fs.stat(path.join(install,INSTALL_MANIFEST)).then(()=>true,()=>false));
 running=await launch(path.join(install,'开黑搭子.exe'));await installRun(full);assert.equal(await fs.readFile(path.join(install,'resources/app.asar'),'utf8'),'new application');
 await installRun(oldInstaller);await installRun(cleanupInstaller);assert.match(await run('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'+registryId,'/v','DisplayVersion']),/98\.0\.1/);assert.ok((await fs.readdir(root)).some(name=>name.startsWith('installed app.rollback-')),'Cleanup failure must retain recovery backup');
 const report={passed:true,blockDeltaReconstructed:true,cleanupFailureKeptRegistration:true,root,registryId,oldPid,upgradedPid,processStopped:true,invalidStagePreservedOld:true,missingUninstallerPreservedOld:true,migrationCollisionPreserved:true,newFileCollisionRestoredOld:true,lockedFileRollbackRestoredOtherFiles:true,unrelatedProcessPreserved:true,legacyUninstallerCompatible:true,retiredFileRemoved:true,userFilesPreserved:true,preferencesPreserved:true,fullBytes:(await fs.stat(full)).size,incrementalBytes:(await fs.stat(delta)).size,reusedBytes:deltaPayload(old.manifest,next.manifest).reusedBytes+(await binaryPatches(old.directory,next.directory,old.manifest,next.manifest,deltaPayload(old.manifest,next.manifest).changed)).reusedBytes};
 await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));await fs.writeFile('.local/latest-installer-upgrade-smoke.json',JSON.stringify({root},null,2));console.log(JSON.stringify(report,null,2));
}finally{
 if(running?.exitCode===null)running.kill();
 if(unrelated?.exitCode===null)unrelated.kill();if(locker?.exitCode===null)locker.kill();
 const uninstall=path.join(install,'卸载开黑搭子.exe');if(await fs.stat(uninstall).then(()=>true,()=>false))await run(uninstall,['/S','_?='+install],{windowsVerbatimArguments:true});
}
