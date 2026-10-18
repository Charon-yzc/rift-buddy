import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {filePatch,binaryPatches} from '../scripts/binary-patch.mjs';
import {payloadManifest,installManifestText,INSTALL_MANIFEST} from '../scripts/installer-payload.mjs';
import {installerScript} from '../scripts/installer-script.mjs';
const base=crypto.randomBytes(2*1024*1024),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const reconstruct=(original,patch)=>Buffer.concat(patch.operations.map(op=>op.copy===undefined?Buffer.from(op.data,'base64'):original.subarray(op.copy,op.copy+op.bytes)));
test('content boundaries reuse bytes after insertion, deletion, movement and small executable metadata changes',()=>{
 const edited=Buffer.from(base);edited[180000]^=1;
 for(const target of [edited,Buffer.concat([base.subarray(0,40000),Buffer.from('insert'),base.subarray(40000)]),Buffer.concat([base.subarray(0,40000),base.subarray(40010)]),Buffer.concat([base.subarray(800000),base.subarray(0,800000)])]){
  const patch=filePatch('resources/app.asar',base,target);assert.deepEqual(reconstruct(base,patch),target);assert.equal(patch.targetSha256,sha(target));assert.ok(patch.reusedBytes>target.length*.85);assert.ok(Buffer.byteLength(JSON.stringify(patch))<target.length*.3);
 }
});
test('repeated bytes coalesce into bounded copy operations and unrelated data is not falsely reused',()=>{
 const bytes=Buffer.alloc(4*1024*1024),patch=filePatch('app.bin',bytes,bytes);assert.deepEqual(reconstruct(bytes,patch),bytes);assert.equal(patch.operations.length,1);assert.equal(patch.reusedBytes,bytes.length);
 const random=filePatch('app.bin',Buffer.alloc(base.length),base);assert.deepEqual(reconstruct(Buffer.alloc(base.length),random),base);assert.equal(random.reusedBytes,0);
 assert.throws(()=>filePatch('../player.json',base,base),/路径/);
});
async function fixture(t){
 const root=await fs.mkdtemp(path.resolve('.local/binary-patch-')),old=path.join(root,'old'),next=path.join(root,'next');await fs.mkdir(path.join(old,'resources'),{recursive:true});await fs.mkdir(path.join(next,'resources'),{recursive:true});
 const target=Buffer.concat([base.subarray(0,60000),Buffer.from('new feature'),base.subarray(60000)]);
 await fs.writeFile(path.join(old,'resources/runtime.bin'),base);await fs.writeFile(path.join(next,'resources/runtime.bin'),target);
 const before=await payloadManifest(old,'98.0.0'),after=await payloadManifest(next,'98.0.1');await fs.writeFile(path.join(old,INSTALL_MANIFEST),installManifestText(before));await fs.writeFile(path.join(next,INSTALL_MANIFEST),installManifestText(after));
 const lifecycle=path.join(root,'lifecycle.ps1');await fs.writeFile(lifecycle,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),await fs.readFile('scripts/installer-lifecycle.ps1')]));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,old,next,before,after,target,lifecycle};
}
test('patch packaging only selects verified manifested files and excludes unhelpful deltas',async t=>{
 const f=await fixture(t),result=await binaryPatches(f.old,f.next,f.before,f.after,f.after.files);assert.deepEqual([...result.patched],['resources/runtime.bin']);assert.deepEqual(reconstruct(base,result.descriptor.files[0]),f.target);
 await fs.writeFile(path.join(f.old,'resources/runtime.bin'),'modified');await assert.rejects(binaryPatches(f.old,f.next,f.before,f.after,f.after.files),/differs/);
 await fs.writeFile(path.join(f.old,'resources/runtime.bin'),Buffer.alloc(base.length));const before=await payloadManifest(f.old,'98.0.0');const unusable=await binaryPatches(f.old,f.next,before,f.after,f.after.files);assert.equal(unusable.patched.size,0);
});
const powershell=(file,args)=>new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',bytes=>output+=bytes);child.stderr.on('data',bytes=>output+=bytes);child.once('error',reject);child.once('exit',code=>resolve({code,output}));});
test('native decoder reconstructs exact changed-length bytes before installation and does not touch the base', {skip:process.platform!=='win32'},async t=>{
 const f=await fixture(t),stage=path.join(f.root,'stage'),descriptor=path.join(f.root,'blocks.json');await fs.mkdir(stage);await fs.copyFile(path.join(f.next,INSTALL_MANIFEST),path.join(stage,INSTALL_MANIFEST));await fs.writeFile(path.join(stage,'卸载开黑搭子.exe'),Buffer.alloc(2048));
 await fs.writeFile(descriptor,JSON.stringify({schema:1,files:[filePatch('resources/runtime.bin',base,f.target)]}));
 const result=await powershell(f.lifecycle,['-InstallDir',f.old,'-StagedDir',stage,'-BaseManifest',path.join(f.old,INSTALL_MANIFEST),'-BlockPatch',descriptor,'-RegistryId','RiftBuddy-Block-Fixture']);
 assert.equal(result.code,1);assert.match(result.output,/Target contains an existing file/,'Decoder must pass all hashes before hitting the intentional unowned-install guard');assert.deepEqual(await fs.readFile(path.join(stage,'resources/runtime.bin')),f.target);assert.deepEqual(await fs.readFile(path.join(f.old,'resources/runtime.bin')),base);
});
test('native decoder rejects corrupt ranges, literals, identities, collisions and links before any old-file replacement', {skip:process.platform!=='win32'},async t=>{
 const cases=['range','negative','fraction','ambiguous','literal','incomplete','identity','base','path','duplicate','collision','link','modified'];
 for(const kind of cases){
  const f=await fixture(t),stage=path.join(f.root,'stage'),descriptor=path.join(f.root,'blocks.json'),patch=filePatch('resources/runtime.bin',base,f.target);await fs.mkdir(stage);await fs.copyFile(path.join(f.next,INSTALL_MANIFEST),path.join(stage,INSTALL_MANIFEST));
  const copy=patch.operations.find(op=>op.copy!==undefined);
  if(kind==='range')copy.copy=base.length;if(kind==='negative')copy.copy=-1;if(kind==='fraction')copy.bytes=1.5;if(kind==='ambiguous')copy.data='AA==';
  if(kind==='literal')patch.operations=[{data:'AA==',bytes:f.target.length}];if(kind==='incomplete')patch.operations=[];if(kind==='identity')patch.targetSha256='0'.repeat(64);if(kind==='base')patch.baseSha256='0'.repeat(64);if(kind==='path')patch.name='../outside';
  const files=kind==='duplicate'?[patch,patch]:[patch];await fs.writeFile(descriptor,JSON.stringify({schema:1,files}));
  if(kind==='collision'){await fs.mkdir(path.join(stage,'resources'));await fs.writeFile(path.join(stage,'resources/runtime.bin'),'user stage content');}
  if(kind==='link'){const outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.symlink(outside,path.join(stage,'resources'),process.platform==='win32'?'junction':'dir');}
  if(kind==='modified')await fs.writeFile(path.join(f.old,'resources/runtime.bin'),Buffer.alloc(base.length));
  const before=await fs.readFile(path.join(f.old,'resources/runtime.bin')),result=await powershell(f.lifecycle,['-InstallDir',f.old,'-StagedDir',stage,'-BaseManifest',path.join(f.old,INSTALL_MANIFEST),'-BlockPatch',descriptor,'-RegistryId','RiftBuddy-Block-Fixture']);
  assert.equal(result.code,1,kind);assert.doesNotMatch(result.output,/ParserError|uninstaller is missing|Target contains an existing file/,kind+' must reject the patch itself');assert.deepEqual(await fs.readFile(path.join(f.old,'resources/runtime.bin')),before,kind);
  if(kind==='link')assert.deepEqual(await fs.readdir(path.join(f.root,'outside')),[]);if(kind==='collision')assert.equal(await fs.readFile(path.join(stage,'resources/runtime.bin'),'utf8'),'user stage content');
 }
});
test('installer includes the descriptor outside its target files and requires a base',()=>{
 const args={version:'98.0.1',directory:'fixture',output:'update.exe',icon:'icon.ico',files:['app.bin',INSTALL_MANIFEST],payloadFiles:[INSTALL_MANIFEST],blockPatch:'blocks.json'};
 assert.throws(()=>installerScript(args),/基线/);const script=installerScript({...args,baseManifest:'base.json'});assert.match(script,/File \/oname=block-patch.json/);assert.match(script,/-BlockPatch "\$PLUGINSDIR\\block-patch.json"/);assert.doesNotMatch(script,/File "fixture[\\/]app.bin"/);
});
