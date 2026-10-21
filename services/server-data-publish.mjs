import fs from 'node:fs/promises';
import {renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {createPrivateKey,createPublicKey,sign,randomUUID} from 'node:crypto';
import {loadServerData} from './server-data-store.mjs';
import {DATA_FEED_NAMES,feedHash,verifyFeedEnvelope,validateFeedBundle,validateFeedManifest,validFeedPatch,decodeFeedFile} from './data-feed.mjs';
import {GENERATION_MAX_MANIFEST,compareGenerationVersions,projectGenerationBundle,packGenerationBundle,generationRelease,validateGenerationRecipe,validateGenerationManifest,verifyGenerationEnvelope,decodeGenerationAssets} from './data-generation.mjs';

const signManifest=(manifest,key,keyId)=>{const payload=Buffer.from(JSON.stringify(manifest));return {keyId,payload:payload.toString('base64'),signature:sign(null,payload,key).toString('base64')};};
async function publishedFolder(folder){await fs.mkdir(folder,{recursive:true});const stat=await fs.lstat(folder);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('公开资料目录无效');await fs.chmod(folder,0o755);}
async function putAsset(folder,file,bytes){
 if(bytes.length!==file.bytes||feedHash(bytes)!==file.sha256)throw Error('发布源文件校验失败');
 const output=path.join(folder,file.file);
 try{await fs.writeFile(output,bytes,{flag:'wx',mode:0o644});}catch(error){if(error.code!=='EEXIST')throw error;const stat=await fs.lstat(output);if(!stat.isFile()||stat.isSymbolicLink()||feedHash(await fs.readFile(output))!==file.sha256)throw Error('既有公开文件校验失败');}
 await fs.chmod(output,0o644);
}
async function commitManifests(entries,promote){
 const prepared=[],keep=new Set();let committed=0;
 try{
  // Prepare every replacement and rollback before changing either pointer.
  for(const {destination,envelope} of entries){
   const id=randomUUID(),item={destination,temporary:destination+'.'+id+'.tmp',backup:destination+'.'+id+'.rollback',existed:false};prepared.push(item);
   try{const stat=await fs.lstat(destination);if(!stat.isFile()||stat.isSymbolicLink())throw Error('公开清单文件无效');await fs.writeFile(item.backup,await fs.readFile(destination),{flag:'wx',mode:0o644});item.existed=true;}
   catch(error){if(error.code!=='ENOENT')throw error;}
   await fs.writeFile(item.temporary,JSON.stringify(envelope),{flag:'wx',mode:0o644});await fs.chmod(item.temporary,0o644);
  }
  // Each rename is atomic. Handled I/O failure rolls back earlier renames;
  // a process crash can still leave the two complete protocols on different
  // generations. Neither protocol ever points at an incomplete asset set.
  try{for(const item of prepared){promote(item.temporary,item.destination);committed++;}}
  catch(error){
   const failures=[];
   for(const item of prepared.slice(0,committed).reverse())try{if(item.existed)promote(item.backup,item.destination);else unlinkSync(item.destination);}catch(failure){if(item.existed)keep.add(item.backup);failures.push(failure);}
   if(failures.length)throw new AggregateError([error,...failures],'清单提交及恢复失败，已保留恢复文件和全部资产，停止清理');
   throw error;
  }
 }finally{for(const item of prepared)for(const filename of [item.temporary,item.backup])if(!keep.has(filename))await fs.unlink(filename).catch(()=>{});}
}
async function prepareGeneration(candidate,status,publicRoot,privateKey,keyId,keys,clock){
 const recipe=status.generationRecipe,game=candidate.bundle.game,started=Date.parse(status.startedAt);
 if(status.generationError||!recipe||recipe.baseSha256!==candidate.manifest.files.game.rawSha256||!Number.isFinite(started)||started<0||started>clock())throw Error('整套资料缺少完整采集记录');
 validateGenerationRecipe(recipe,game.patch);
 const totals={game:1,rankings:recipe.rankings.length,builds:recipe.builds.length,'hex-builds':recipe.hex.length};
 const datasets=status.datasets||{};
 // Hero offer observations are optional; their presence must not block the
 // four required datasets or let other/mislabeled datasets evade coverage.
 if(Object.keys(datasets).some(name=>!Object.hasOwn(totals,name)&&(name!=='hex-pools'||datasets[name]?.optional!==true))||Object.entries(totals).some(([name,total])=>{const d=datasets[name],checked=Date.parse(d?.checkedAt);return !d||d.state!=='ok'||d.total!==total||d.checked!==total||d.failed!==0||d.skipped!==0||!Number.isFinite(checked)||checked<started||checked>clock();}))throw Error('整套资料本轮采集未完整完成');
 const bundle=projectGenerationBundle(candidate.bundle,recipe),{files,assets}=packGenerationBundle(bundle,recipe),destination=path.join(publicRoot,'v2','latest.json');let prior=null;
 try{prior=verifyGenerationEnvelope(JSON.parse(await fs.readFile(destination,'utf8')),{keys});}catch(error){if(error.code!=='ENOENT')throw error;}
 if(prior&&(compareGenerationVersions(game.version,prior.version)<0||started<Date.parse(prior.checkedAt)))throw Error('整套资料版本或复查时间倒退');
 const identity={version:game.version,patch:game.patch,files,recipe},release=generationRelease(identity),changed=prior?.release!==release,checkedAt=new Date(started).toISOString(),refreshed=prior?.checkedAt!==checkedAt;
 const manifest=changed||refreshed?validateGenerationManifest({schema:2,...identity,release,sequence:Math.max(clock(),(prior?.sequence||0)+1),publishedAt:changed?new Date(clock()).toISOString():prior.publishedAt,checkedAt}):prior;
 const envelope=signManifest(manifest,privateKey,keyId);verifyGenerationEnvelope(envelope,{keys});
 return {destination,manifest,envelope,assets,changed,refreshed};
}
async function pruneGeneration(publicRoot,expected,keys){
 const base=await fs.realpath(publicRoot),folder=path.join(base,'v2','assets');
 for(const dir of [path.join(base,'v2'),folder]){const stat=await fs.lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('公开整套资料目录无效');}
 const manifest=verifyGenerationEnvelope(JSON.parse(await fs.readFile(path.join(base,'v2','latest.json'),'utf8')),{keys});
 if(manifest.release!==expected.release||manifest.sequence!==expected.sequence)throw Error('公开整套资料已变化，本轮不清理');
 const assets={};for(const file of Object.values(manifest.files)){const filename=path.join(folder,file.file),stat=await fs.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==file.bytes)throw Error('公开整套资料文件无效');assets[file.sha256]=await fs.readFile(filename);}
 await decodeGenerationAssets(manifest,assets);
 const keep=new Set(Object.values(manifest.files).map(f=>f.file)),removed=[];
 for(const entry of await fs.readdir(folder,{withFileTypes:true}))if(entry.isFile()&&!entry.isSymbolicLink()&&!keep.has(entry.name)&&/^[a-f0-9]{64}\.json\.gz$/.test(entry.name)){await fs.unlink(path.join(folder,entry.name));removed.push('v2/assets/'+entry.name);}
 return removed;
}

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
export async function publishServerData({root,publicRoot,keyFile,keyId='data-20261014',clock=()=>Date.now(),maxBytes=256*1024*1024,generations=false,promote=renameSync}){
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
 // The start is a conservative lower bound for every successful source check
 // in this complete round. Never promote a partial round or its end time.
 const roundStart=Date.parse(status.startedAt),priorCheck=Date.parse(prior?.checkedAt),validRound=Number.isFinite(roundStart)&&roundStart>=0&&roundStart<=clock();
 if(changed&&validRound&&Number.isFinite(priorCheck)&&roundStart<priorCheck)throw Error('采集轮次早于已发布复查时间，保留现有资料');
 const checkedAt=validRound?new Date(Math.max(roundStart,Number.isFinite(priorCheck)?priorCheck:0)).toISOString():changed?undefined:prior?.checkedAt;
 const refreshed=!!checkedAt&&checkedAt!==prior?.checkedAt;
 const manifest=changed||refreshed?validateFeedManifest({schema:1,patch:source.patch,release,sequence:Math.max(clock(),(prior?.sequence||0)+1),publishedAt:changed?new Date(clock()).toISOString():prior.publishedAt,files,...(checkedAt?{checkedAt}:{})}):prior;
 const envelope=signManifest(manifest,privateKey,keyId);
 verifyFeedEnvelope(envelope,{keys});
 // Prepare and validate both protocols before publishing either pointer.
 const generation=generations?await prepareGeneration(candidate,status,publicRoot,privateKey,keyId,keys,clock):null;
 if(await sizeOf(publicRoot)+Object.values(files).reduce((n,f)=>n+f.bytes,0)+65536+(generation?Object.values(generation.manifest.files).reduce((n,f)=>n+f.bytes,0)+GENERATION_MAX_MANIFEST:0)>maxBytes)throw Error('公开资料目录达到存储上限');
 const assets=path.join(publicRoot,'v1','assets');
 for(const folder of [publicRoot,path.join(publicRoot,'v1'),assets,path.join(publicRoot,'v1','patches'),path.dirname(destination)])await publishedFolder(folder);
 if(generation)for(const folder of [path.join(publicRoot,'v2'),path.join(publicRoot,'v2','assets')])await publishedFolder(folder);
 for(const name of DATA_FEED_NAMES){
  const file=files[name],bytes=await fs.readFile(path.join(root,'releases',source.release,source.files[name].file));
  await putAsset(assets,file,bytes);
 }
 if(generation){
  for(const file of Object.values(generation.manifest.files))await putAsset(path.join(publicRoot,'v2','assets'),file,generation.assets[file.sha256]);
 }
 await commitManifests([...(generation&&(generation.changed||generation.refreshed)?[generation]:[]),...(changed||refreshed?[{destination,envelope}]:[])],promote);
 // Commit is complete. Cleanup errors must never roll back to asset sets
 // that a preceding cleanup may already have removed.
 const removed=await prunePublishedData(publicRoot,manifest,keys);
 return {changed,refreshed,manifest,removed,...(generation?{generation:{changed:generation.changed,refreshed:generation.refreshed,manifest:generation.manifest,removed:await pruneGeneration(publicRoot,generation.manifest,keys)}}:{})};
}
