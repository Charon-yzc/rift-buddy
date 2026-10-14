import fs from 'node:fs/promises';
import path from 'node:path';
import {createPrivateKey,createPublicKey,sign,randomUUID} from 'node:crypto';
import {loadServerData} from './server-data-store.mjs';
import {DATA_FEED_NAMES,feedHash,verifyFeedEnvelope,validateFeedBundle,validateFeedManifest,validFeedPatch,decodeFeedFile} from './data-feed.mjs';

async function sizeOf(root){let bytes=0;for(const file of await fs.readdir(root,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){const name=path.join(root,file.name);if(file.isDirectory())bytes+=await sizeOf(name);else if(file.isFile())bytes+=(await fs.stat(name)).size;}return bytes;}
async function prunePublishedData(publicRoot,manifest,keys){
 const base=await fs.realpath(publicRoot),assets=path.join(base,'v1','assets'),patches=path.join(base,'v1','patches');
 for(const folder of [path.join(base,'v1'),assets,patches,path.join(patches,manifest.patch)]){
  const stat=await fs.lstat(folder);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('公开资料目录无效');
 }
 const current=verifyFeedEnvelope(JSON.parse(await fs.readFile(path.join(patches,manifest.patch,'latest.json'),'utf8')),{keys});
 if(current.release!==manifest.release||current.sequence!==manifest.sequence)throw Error('公开资料已变化，本轮不清理');
 // Finish verifying the active snapshot before removing any old asset.
 for(const file of Object.values(current.files))await decodeFeedFile(await fs.readFile(path.join(assets,file.file)),file);
 const keep=new Set(Object.values(current.files).map(file=>file.file)),removed=[];
 for(const entry of await fs.readdir(assets,{withFileTypes:true})){
  if(!entry.isFile()||entry.isSymbolicLink()||keep.has(entry.name)||! /^[a-f0-9]{64}\.json\.gz$/.test(entry.name))continue;
  await fs.unlink(path.join(assets,entry.name));removed.push('assets/'+entry.name);
 }
 for(const entry of await fs.readdir(patches,{withFileTypes:true})){
  if(entry.name===current.patch||!entry.isDirectory()||entry.isSymbolicLink()||!validFeedPatch(entry.name))continue;
  await fs.rm(path.join(patches,entry.name),{recursive:true});removed.push('patches/'+entry.name);
 }
 return removed;
}
// Run under the same flock as collection. A separate immutable public tree
// exposes only signed references, never operational logs or signing material.
export async function publishServerData({root,publicRoot,keyFile,keyId='data-20261014',clock=()=>Date.now(),maxBytes=256*1024*1024}){
 const outputRoot=path.resolve(publicRoot),sourceRoot=path.resolve(root),privateFile=path.resolve(keyFile);
 if(outputRoot===sourceRoot||sourceRoot.startsWith(outputRoot+path.sep)||outputRoot.startsWith(sourceRoot+path.sep)||privateFile===outputRoot||privateFile.startsWith(outputRoot+path.sep))throw Error('公开目录必须与候选和密钥分离');
 const candidate=await loadServerData(root);if(!candidate)throw Error('没有可发布的资料');
 const status=JSON.parse(await fs.readFile(path.join(root,'status.json'),'utf8'));
 if(status.state!=='ok'||status.limited||status.release!==candidate.pointer.release)throw Error('本轮采集未完整完成，保留已发布资料');
 const {manifest:source,bundle}=candidate;validateFeedBundle(bundle,bundle.game);
 const privateKey=createPrivateKey(await fs.readFile(keyFile));if(privateKey.asymmetricKeyType!=='ed25519')throw Error('资料发布密钥类型无效');
 const keys={[keyId]:createPublicKey(privateKey).export({type:'spki',format:'pem'})};
 const destination=path.join(publicRoot,'v1','patches',source.patch,'latest.json');
 let prior=null;
 try{prior=verifyFeedEnvelope(JSON.parse(await fs.readFile(destination,'utf8')),{keys});if(prior.patch!==source.patch)throw Error('已发布清单版本不符');}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const files=Object.fromEntries(DATA_FEED_NAMES.map(name=>{const file=source.files[name];return [name,{...file,file:file.sha256+'.json.gz'}];}));
 const release=feedHash(JSON.stringify({patch:source.patch,files}));
 const changed=prior?.release!==release;
 const manifest=changed?validateFeedManifest({schema:1,patch:source.patch,release,sequence:Math.max(clock(),(prior?.sequence||0)+1),publishedAt:new Date(clock()).toISOString(),files}):prior;
 const payload=Buffer.from(JSON.stringify(manifest)),envelope={keyId,payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')};
 verifyFeedEnvelope(envelope,{keys});
 if(await sizeOf(publicRoot)+Object.values(files).reduce((n,f)=>n+f.bytes,0)+65536>maxBytes)throw Error('公开资料目录达到存储上限');
 const assets=path.join(publicRoot,'v1','assets');
 for(const folder of [publicRoot,path.join(publicRoot,'v1'),assets,path.join(publicRoot,'v1','patches'),path.dirname(destination)]){await fs.mkdir(folder,{recursive:true});await fs.chmod(folder,0o755);}
 for(const name of DATA_FEED_NAMES){
  const file=files[name],bytes=await fs.readFile(path.join(root,'releases',source.release,source.files[name].file));
  if(bytes.length!==file.bytes||feedHash(bytes)!==file.sha256)throw Error('发布源文件校验失败');
  const output=path.join(assets,file.file);
  try{await fs.writeFile(output,bytes,{flag:'wx',mode:0o644});}catch(error){if(error.code!=='EEXIST')throw error;const existing=await fs.readFile(output);if(feedHash(existing)!==file.sha256)throw Error('既有公开文件校验失败');}
  await fs.chmod(output,0o644);
 }
 if(changed){
  const temporary=destination+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temporary,JSON.stringify(envelope),{flag:'wx',mode:0o644});await fs.chmod(temporary,0o644);await fs.rename(temporary,destination);}
  finally{await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 }
 const removed=await prunePublishedData(publicRoot,manifest,keys);
 return {changed,manifest,removed};
}
