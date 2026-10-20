import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {installerScript} from './installer-script.mjs';
import {payloadManifest,installManifestText,INSTALL_MANIFEST,deltaPayload} from './installer-payload.mjs';
const baseline=process.argv.includes('--baseline'),preflightOnly=process.argv.includes('--preflight-only'),root=await fs.mkdtemp(path.resolve('.local/installer-integration-')),cases=[];
const compiler=process.env.RIFT_BUDDY_MAKENSIS||path.resolve('.local/tooling/nsis-3.12/makensis.exe');
const run=async(file,args,options={})=>{const child=spawn(file,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],...options});let output='';child.stdout?.on('data',chunk=>output+=chunk);child.stderr?.on('data',chunk=>output+=chunk);const [code]=await once(child,'exit');if(code!==0)throw Error(file+' failed ('+code+')\n'+output);return output;};
let generate=installerScript,source=await fs.readFile('scripts/installer-lifecycle.ps1','utf8');
if(baseline){
 const ref='a3c7c2a577236db536380f1c3bbf568f8a9fe678',file=path.join(root,'baseline-generator.mjs');
 await fs.writeFile(file,execFileSync('git',['show',ref+':scripts/installer-script.mjs']));generate=(await import(pathToFileURL(file).href)).installerScript;
 source=execFileSync('git',['show',ref+':scripts/installer-lifecycle.ps1'],{encoding:'utf8'});
}
const helper=path.join(root,'fixture.ps1');
await fs.writeFile(helper,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(String.raw`
param([string]$Mode,[string]$Id,[string]$Hint)
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding $false
if($Id -cnotmatch '^RiftBuddy-Fixture-[a-f0-9]{10}$'){throw 'Not an isolated fixture identity'}
$Registry=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryView]::Registry32)
$Paths=@(('Software\'+$Id),('Software\Microsoft\Windows\CurrentVersion\Uninstall\'+$Id))
$Links=@((Join-Path ([Environment]::GetFolderPath('Desktop')) ($Id+'.lnk')),(Join-Path ([Environment]::GetFolderPath('StartMenu')) ('Programs\'+$Id+'\开黑搭子.lnk')),(Join-Path ([Environment]::GetFolderPath('StartMenu')) ('Programs\'+$Id+'\卸载.lnk')))
$Shell=New-Object -ComObject WScript.Shell
try {
 if($Mode -eq 'Seed'){
  $Key=$Registry.CreateSubKey($Paths[0]);try{$Key.SetValue('InstallDir',$Hint,[Microsoft.Win32.RegistryValueKind]::ExpandString);$Key.SetValue('FixtureNote','keep player preferences',[Microsoft.Win32.RegistryValueKind]::String)}finally{$Key.Dispose()}
  $Key=$Registry.OpenSubKey($Paths[1],$true);if($Key){try{$Key.DeleteValue('NoRepair',$false);$Key.SetValue('DisplayIcon','%USERPROFILE%\fixture.ico',[Microsoft.Win32.RegistryValueKind]::ExpandString);$Key.SetValue('CustomBinary',[byte[]]@(1,2,3),[Microsoft.Win32.RegistryValueKind]::Binary);$Key.SetValue('CustomNames',[string[]]@('raw','%APPDATA%'),[Microsoft.Win32.RegistryValueKind]::MultiString);$Key.SetValue('PSPlayerNote','keep raw value',[Microsoft.Win32.RegistryValueKind]::String)}finally{$Key.Dispose()}}
  $Link=$Shell.CreateShortcut($Links[0]);try{$Link.TargetPath=Join-Path $Hint '开黑搭子.exe';$Link.Arguments='--fixture-old';$Link.WorkingDirectory=$Hint;$Link.Save()}finally{$null=[Runtime.InteropServices.Marshal]::FinalReleaseComObject($Link)}
 }elseif($Mode -eq 'SeedNested'){
  $Key=$Registry.CreateSubKey($Paths[1]+'\FixtureRecovery');try{$Key.SetValue('Keep','nested player fixture',[Microsoft.Win32.RegistryValueKind]::String)}finally{$Key.Dispose()}
 }elseif($Mode -eq 'Clear'){
  foreach($KeyPath in $Paths){$Registry.DeleteSubKeyTree($KeyPath,$false)}
  foreach($File in $Links){if(Test-Path -LiteralPath $File -PathType Leaf){Remove-Item -LiteralPath $File -Force}}
  $Folder=Split-Path -Parent $Links[1];if((Test-Path -LiteralPath $Folder) -and !(Get-ChildItem -LiteralPath $Folder -Force)){Remove-Item -LiteralPath $Folder}
 }elseif($Mode -eq 'Snapshot'){
  $Keys=@();foreach($KeyPath in $Paths){$Key=$Registry.OpenSubKey($KeyPath);try{$Values=@();$Children=@();if($Key){foreach($Name in $Key.GetValueNames()|Sort-Object){$Values+=@{name=$Name;kind=$Key.GetValueKind($Name).ToString();value=$Key.GetValue($Name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)}};foreach($Name in $Key.GetSubKeyNames()|Sort-Object){$Child=$Key.OpenSubKey($Name);try{$Children+=@{name=$Name;keep=$Child.GetValue('Keep')}}finally{$Child.Dispose()}}};$Keys+=@{path=$KeyPath;exists=($null -ne $Key);values=$Values;children=$Children}}finally{if($Key){$Key.Dispose()}}}
  $Files=@();foreach($File in $Links){$Exists=Test-Path -LiteralPath $File -PathType Leaf;$Info=@{path=$File;exists=$Exists};if($Exists){$Link=$Shell.CreateShortcut($File);try{$Info.hash=(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash;$Info.target=$Link.TargetPath;$Info.directory=$Link.WorkingDirectory}finally{$null=[Runtime.InteropServices.Marshal]::FinalReleaseComObject($Link)}};$Files+=$Info}
  @{keys=$Keys;links=$Files}|ConvertTo-Json -Depth 20 -Compress
 }else{throw 'Unknown fixture action'}
}finally{$Registry.Dispose();$null=[Runtime.InteropServices.Marshal]::FinalReleaseComObject($Shell)}
`)]));
const inspect=async(c,mode='Snapshot',hint='')=>{const output=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Mode',mode,'-Id',c.id,'-Hint',hint]);return mode==='Snapshot'?JSON.parse(output):null;};
const exists=file=>fs.stat(file).then(()=>true,()=>false),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function bundle(version){const directory=path.join(root,version);await fs.mkdir(path.join(directory,'resources'),{recursive:true});await fs.writeFile(path.join(directory,'开黑搭子.exe'),Buffer.alloc(2048,version.endsWith('0')?65:66));await fs.writeFile(path.join(directory,'resources/app.asar'),version);await fs.writeFile(path.join(directory,version.endsWith('0')?'retired.txt':'added.txt'),version);const manifest=await payloadManifest(directory,version);await fs.writeFile(path.join(directory,INSTALL_MANIFEST),installManifestText(manifest));return {directory,manifest};}
const old=await bundle('98.1.0'),next=await bundle('98.1.1');
function faultSource(kind,c){
 if(!kind||baseline||kind==='nested')return source;
 if(kind==='backup-existing'){const anchor="$Backup=CheckedRoot ($Old+'.rollback-'+[Guid]::NewGuid().ToString('N'))";assert.ok(source.includes(anchor));return source.replace(anchor,"$Backup=CheckedRoot '"+path.join(c.root,'existing-backup').replaceAll("'","''")+"'");}
 if(kind.startsWith('backup-')){const anchor='Copy-Item -LiteralPath $From -Destination $To -Force}',folder=kind==='backup-files'?'files':'shortcuts';assert.ok(source.includes(anchor));return source.replace(anchor,`Copy-Item -LiteralPath $From -Destination $To -Force;if($To -like '*.rollback-*\\${folder}\\*'){throw 'Synthetic backup failure'}}`);}
 if(kind==='shortcut'){const anchor='$Readback=$Shell.CreateShortcut($File)';assert.ok(source.includes(anchor));return source.replace(anchor,"throw 'Synthetic shortcut failure'\n  "+anchor);}
 const start=source.indexOf('function WriteRegistration('),end=source.indexOf('\nfunction RestoreRegistration(',start);assert.ok(start>0&&end>start);
 const anchor='$Key.SetValue($Row.name,$Row.value,$Row.kind);CheckRegistryValue $Key $Row',part=source.slice(start,end);assert.ok(part.includes(anchor));
 let result=source.slice(0,start)+part.replace(anchor,"$Key.SetValue($Row.name,$Row.value,$Row.kind);if($Row.name -eq 'DisplayVersion'){throw 'Synthetic registration failure'};CheckRegistryValue $Key $Row")+source.slice(end);
 if(kind==='recovery')result=result.replace('function RestoreRegistration($Snapshot){',"function RestoreRegistration($Snapshot){\n if($Snapshot.path -eq $UninstallKey){throw 'Synthetic registration recovery failure'}");
 return result;
}
async function compile(c,bundle,kind='',base=null){
 const name=path.join(c.root,(bundle===old?'old':'next')+(kind?'-'+kind:'')),lifecycle=name+'.ps1',output=name+'.exe';let text=faultSource(kind,c);
 if(kind==='nested'||kind.startsWith('backup-')){const anchor='function StopInstalled([string]$Root){';assert.ok(text.includes(anchor));text=text.replace(anchor,anchor+"\n [IO.File]::WriteAllText('"+path.join(c.root,'stop-called.txt').replaceAll("'","''")+"','STOP')");}
 await fs.writeFile(lifecycle,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)]));
 let script=generate({version:bundle.manifest.version,directory:bundle.directory,output,icon:path.resolve('assets/icon.ico'),files:bundle.manifest.files.map(f=>f.name).concat(INSTALL_MANIFEST),lifecycle,registryId:c.id,shortcutName:c.id,diagnosticFile:name+'.log',...(base?{baseManifest:path.join(base.directory,INSTALL_MANIFEST),payloadFiles:deltaPayload(base.manifest,bundle.manifest).changed.map(f=>f.name).concat(INSTALL_MANIFEST)}:{})});
 if(baseline&&kind){assert.ok(script.includes('  IfErrors 0 +5'));script=script.replace('  IfErrors 0 +5','  SetErrors\n  IfErrors 0 +5');}
 await fs.writeFile(name+'.nsi',script);await run(compiler,['/NOCONFIG','/INPUTCHARSET','UTF8',name+'.nsi']);return {output,log:name+'.log'};
}
const install=async(pkg,target)=>run(pkg.output,['/S','/D='+target],{windowsVerbatimArguments:true});
async function createCase(name){const folder=path.join(root,name);await fs.mkdir(folder);const c={name,root:folder,id:'RiftBuddy-Fixture-'+crypto.randomBytes(5).toString('hex'),a:path.join(folder,'old app'),b:path.join(folder,'new app')};cases.push(c);return c;}
async function checkPayload(target,bundle){for(const row of bundle.manifest.files)assert.equal(hash(await fs.readFile(path.join(target,row.name))),row.sha256);}
async function noNewPayload(target){for(const name of [...next.manifest.files.map(row=>row.name),INSTALL_MANIFEST,'卸载开黑搭子.exe'])assert.equal(await exists(path.join(target,name)),false,'Failed installation retained '+name);}
try {
 const preflightNames=['backup-files','backup-shortcuts','backup-existing'],names=baseline?['upgrade-registry']:preflightOnly?preflightNames:['upgrade-shortcut','upgrade-registry','migration-registry','first-shortcut','first-registry','first-empty-registry','recovery','migration-success','nested-registration',...preflightNames];
 for(const name of names){
  const c=await createCase(name),fresh=name.startsWith('first-');
  if(!fresh){await install(await compile(c,old),c.a);await inspect(c,'Seed',c.a);}else if(name==='first-registry'){await inspect(c,'Seed',path.join(c.root,'saved install hint'));}
  if(name==='nested-registration')await inspect(c,'SeedNested');
  const unowned=path.join(c.root,'existing-backup');if(name==='backup-existing'){await fs.mkdir(unowned);await fs.writeFile(path.join(unowned,'player-note.txt'),'not this invocation');}
  const target=name.startsWith('migration')?c.b:c.a;await fs.mkdir(target,{recursive:true});const player=path.join(target,'player-file.txt'),preferences=path.join(c.root,'preferences.json');await fs.writeFile(player,'player-owned fixture');await fs.writeFile(preferences,'{"favorites":["Ashe"]}');
  const before=await inspect(c),kind=name==='migration-success'?'':name==='nested-registration'?'nested':name.startsWith('backup-')?name:name.includes('shortcut')?'shortcut':name==='recovery'?'recovery':'registry',pkg=await compile(c,next,kind,name==='upgrade-registry'?old:null);
  if(!kind){
   await install(pkg,target);await checkPayload(target,next);const after=await inspect(c);
   assert.equal(after.keys[0].values.find(v=>v.name==='InstallDir').value,target);assert.equal(after.keys[1].values.find(v=>v.name==='DisplayVersion').value,'98.1.1');assert.equal(after.keys[1].values.find(v=>v.name==='UninstallString').value,'"'+path.join(target,'卸载开黑搭子.exe')+'"');
   for(const [i,link] of after.links.entries()){assert.equal(link.target,path.join(target,i===2?'卸载开黑搭子.exe':'开黑搭子.exe'));assert.equal(link.directory,target);}
   for(const row of old.manifest.files)assert.equal(await exists(path.join(c.a,row.name)),false);
  }else{
   await assert.rejects(install(pkg,target));
   const log=await fs.readFile(pkg.log,'utf8');
   if(!baseline)assert.match(log,kind==='nested'?/registration has nested entries/:kind==='backup-existing'?/^1[\r\n]/:/Synthetic (shortcut|registration|backup) failure/);
   if(kind==='nested'||kind.startsWith('backup-'))assert.equal(await exists(path.join(c.root,'stop-called.txt')),false,'Preflight rejection must precede stopping the old app');
   if(kind==='backup-existing')assert.equal(await fs.readFile(path.join(unowned,'player-note.txt'),'utf8'),'not this invocation');
   if(kind==='backup-files'||kind==='backup-shortcuts')assert.match(log,/Previous installation was not changed/);
   if(baseline){await fs.writeFile(path.join(root,'baseline-observed.json'),JSON.stringify({baseline,expectedVersion:old.manifest.version,observedVersion:await fs.readFile(path.join(target,'resources/app.asar'),'utf8'),backupDirectories:(await fs.readdir(c.root)).filter(n=>n.includes('.rollback-'))},null,2));}
   if(!fresh)await checkPayload(c.a,old);else await noNewPayload(target);
   if(target!==c.a)await noNewPayload(target);
   if(kind==='recovery'){
    assert.match(log,/Recovery requires attention; backup:/);const backups=(await fs.readdir(c.root)).filter(n=>n.startsWith('old app.rollback-'));assert.equal(backups.length,1);const backup=path.join(c.root,backups[0]);assert.ok(await exists(path.join(backup,'registration.xml')));for(const row of old.manifest.files)assert.equal(hash(await fs.readFile(path.join(backup,'files',row.name))),row.sha256);
    const after=await inspect(c);assert.deepEqual(after.links,before.links);assert.deepEqual(after.keys[0],before.keys[0]);
   }else{assert.deepEqual(await inspect(c),before);assert.equal((await fs.readdir(c.root)).some(n=>n.includes('.rollback-')),false);}
  }
  assert.equal(await fs.readFile(player,'utf8'),'player-owned fixture');assert.equal(await fs.readFile(preferences,'utf8'),'{"favorites":["Ashe"]}');c.passed=true;console.log(JSON.stringify({case:name,passed:true,id:c.id}));
 }
 const proof={passed:true,baseline,preflightOnly,root,sourceSha256:hash(Buffer.from(source)),cases:cases.map(c=>({name:c.name,passed:c.passed,id:c.id})),realProductInstalled:false,clientWrites:0};await fs.writeFile(path.join(root,'report.json'),JSON.stringify(proof,null,2));await fs.writeFile('.local/latest-installer-integration-smoke.json',JSON.stringify({root},null,2));console.log(JSON.stringify(proof));
}finally{
 for(const c of cases){for(const folder of [c.a,c.b]){const uninstaller=path.join(folder,'卸载开黑搭子.exe');if(await exists(uninstaller))await run(uninstaller,['/S','_?='+folder],{windowsVerbatimArguments:true});}await inspect(c,'Clear');}
}
