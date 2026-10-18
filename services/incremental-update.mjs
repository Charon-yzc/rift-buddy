import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {INSTALL_MANIFEST,validateInstallManifest} from '../src/core/install-manifest.mjs';
export async function installedPayload(directory,version,{expectedHash,verifyFiles=false}={}){
 if(!directory)return null;
 try{
  const root=path.resolve(directory);if((await fs.lstat(root)).isSymbolicLink()||(await fs.lstat(path.join(root,INSTALL_MANIFEST))).isSymbolicLink())return null;
  const raw=await fs.readFile(path.join(root,INSTALL_MANIFEST),'utf8'),manifest=validateInstallManifest(JSON.parse(raw));
  const hash=crypto.createHash('sha256').update(raw).digest('hex');
  if(manifest.version!==version||expectedHash&&hash!==expectedHash)return null;
  if(verifyFiles)for(const row of manifest.files){
   const file=path.resolve(root,...row.name.split('/'));if(!file.startsWith(root+path.sep))return null;
   // Check the file and every ancestor; never follow a local link as update data.
   let check=file;while(check!==root){if((await fs.lstat(check)).isSymbolicLink())return null;check=path.dirname(check);}
   const stat=await fs.stat(file);if(!stat.isFile()||stat.size!==row.bytes)return null;
   const digest=crypto.createHash('sha256'),handle=await fs.open(file);try{for await(const chunk of handle.createReadStream())digest.update(chunk);}finally{await handle.close();}
   if(digest.digest('hex')!==row.sha256)return null;
  }
  return {manifest,sha256:hash};
 }catch{return null;}
}
