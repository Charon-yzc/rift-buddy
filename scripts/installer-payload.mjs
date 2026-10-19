import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseDeltaManifest} from '../src/core/app-update.mjs';
import {INSTALL_MANIFEST,payloadPath,validateInstallManifest,installManifestText} from '../src/core/install-manifest.mjs';
export {INSTALL_MANIFEST,payloadPath,validateInstallManifest,installManifestText};
export const manifestHash=value=>crypto.createHash('sha256').update(installManifestText(value)).digest('hex');
export function appendDeltaPackage(previous,entry,version){
 const release={version},packages=previous?parseDeltaManifest(previous,release).packages:[];
 return parseDeltaManifest(JSON.stringify({schema:1,version,packages:[...packages,entry]}),release);
}
export async function payloadManifest(directory,currentVersion){
 const files=[];
 async function walk(root){for(const entry of await fs.readdir(root,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('安装文件不能是符号链接');const file=path.join(root,entry.name);
  if(entry.isDirectory())await walk(file);else{const name=path.relative(directory,file).split(path.sep).join('/');if(name===INSTALL_MANIFEST||name==='卸载开黑搭子.exe')continue;const bytes=await fs.readFile(file);files.push({name:payloadPath(name),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
 }}
 await walk(directory);return validateInstallManifest({schema:1,appId:'rift-buddy',version:currentVersion,files:files.sort((a,b)=>a.name.localeCompare(b.name,'en'))});
}
export function deltaPayload(base,target){
 validateInstallManifest(base);validateInstallManifest(target);
 const old=new Map(base.files.map(row=>[row.name,row]));
 const unchanged=target.files.filter(row=>old.get(row.name)?.sha256===row.sha256&&old.get(row.name)?.bytes===row.bytes);
 const reused=new Set(unchanged.map(row=>row.name));
 return {baseVersion:base.version,baseManifestSha256:manifestHash(base),changed:target.files.filter(row=>!reused.has(row.name)),unchanged,removed:base.files.filter(row=>!target.files.some(next=>next.name===row.name)).map(row=>row.name),reusedBytes:unchanged.reduce((sum,row)=>sum+row.bytes,0)};
}
