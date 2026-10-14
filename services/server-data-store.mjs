import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {atomicJSON,validSnapshot} from './data.mjs';
import {hasCurrentCombatStats} from './champion-stats.mjs';
import {validRankingReference} from '../src/core/rankings.mjs';
import {validReference,validHexReference,compareBuildPatches} from '../src/core/builds.mjs';
import {buildSourceKey,BUILD_REGIONS,BUILD_TIERS} from '../src/core/build-source.mjs';
import {rankingKey} from '../src/core/rankings.mjs';

export const SERVER_DATA_FILES=Object.freeze(['game','rankings','builds','hex-builds']);
const zip=promisify(gzip),unzip=promisify(gunzip),hashPattern=/^[a-f0-9]{64}$/;
const releasePattern=/^\d+\.\d+\.\d+-[a-f0-9]{16}$/;
const json=value=>Buffer.from(JSON.stringify(value));
export const dataHash=bytes=>createHash('sha256').update(bytes).digest('hex');
// A successful recheck is recorded separately. It must not create new copies
// merely because a local fetch timestamp changed.
export function contentEqual(left,right){
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().filter(key=>!['fetchedAt','checkedAt'].includes(key)).map(key=>[key,stable(value[key])])):value;
 return JSON.stringify(stable(left))===JSON.stringify(stable(right));
}
export function validateServerGame(game){
 if(!validSnapshot(game)||game.contentRevision<7||game.augmentError||!game.augments.length||!game.sources.augmentDescriptions||!game.champions.every(c=>hasCurrentCombatStats(c,game.patch)))throw Error('基础资料不完整');
 return true;
}
export function validateServerData(bundle){
 const game=bundle?.game;validateServerGame(game);
 const heroes=new Map(game.champions.map(c=>[c.id,c]));
 for(const name of SERVER_DATA_FILES.slice(1)){
  const entries=bundle[name]?.entries;
  if(bundle[name]?.schema!==(name==='builds'?2:1)||!entries||typeof entries!=='object'||Array.isArray(entries)||!Object.keys(entries).length)throw Error(name+' 缺少有效资料');
  for(const [key,ref] of Object.entries(entries)){
   let valid=false;
   if(name==='rankings')valid=key===ref?.key&&validRankingReference(ref,game);
   if(name==='builds'){
    const hero=heroes.get(ref?.champion);
    valid=hero&&validReference(ref,hero,ref.role,game,{allowOlder:true})&&key===buildSourceKey(hero.id,ref.role,ref,ref.patch)&&ref.scope===undefined&&ref.opponent===undefined;
   }
   if(name==='hex-builds')valid=heroes.has(key)&&validHexReference(ref,heroes.get(key),game,{allowOlder:true});
   if(!valid)throw Error(name+' 含有不匹配或无效的资料');
  }
 }
 for(const region of BUILD_REGIONS)for(const tier of BUILD_TIERS)if(!bundle.rankings.entries[rankingKey(game.patch,{region:region.id,tier:tier.id})])throw Error('排行榜尚未覆盖全部来源筛选');
 return true;
}
async function readBounded(file,limit){
 const stat=await fs.stat(file);if(!stat.isFile()||stat.size>limit)throw Error('资料文件超限');
 const bytes=await fs.readFile(file);if(bytes.length>limit)throw Error('资料文件超限');return bytes;
}
async function loadRelease(root,pointer){
 if(pointer?.schema!==1||!releasePattern.test(pointer.release||'')||!hashPattern.test(pointer.manifestSha256||''))throw Error('资料指针无效');
 const dir=path.join(root,'releases',pointer.release),bytes=await readBounded(path.join(dir,'manifest.json'),65536);
 if(dataHash(bytes)!==pointer.manifestSha256)throw Error('资料清单校验失败');
 const manifest=JSON.parse(bytes),bundle={};
 if(manifest.schema!==1||manifest.release!==pointer.release||!manifest.files||Object.keys(manifest.files).length!==4)throw Error('资料清单格式无效');
 for(const name of SERVER_DATA_FILES){
  const file=manifest.files[name];
  if(file?.file!==name+'.json.gz'||!hashPattern.test(file.sha256||'')||!hashPattern.test(file.rawSha256||'')||!Number.isSafeInteger(file.bytes)||file.bytes<=0||file.bytes>16*1024*1024||!Number.isSafeInteger(file.rawBytes)||file.rawBytes<=0||file.rawBytes>32*1024*1024)throw Error('资料文件清单无效');
  const packed=await readBounded(path.join(dir,file.file),16*1024*1024);
  if(packed.length!==file.bytes||dataHash(packed)!==file.sha256)throw Error('资料压缩文件校验失败');
  const raw=await unzip(packed,{maxOutputLength:32*1024*1024});
  if(raw.length!==file.rawBytes||dataHash(raw)!==file.rawSha256)throw Error('资料内容校验失败');
  bundle[name]=JSON.parse(raw);
 }
 validateServerData(bundle);
 if(manifest.version!==bundle.game.version||manifest.patch!==bundle.game.patch)throw Error('资料版本不匹配');
 return {pointer,manifest,bundle};
}
export async function loadServerData(root){
 let pointer;try{pointer=JSON.parse(await readBounded(path.join(root,'current.json'),65536));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
 return loadRelease(root,pointer);
}
async function storageBytes(root){
 let total=0;for(const entry of await fs.readdir(root,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
  const file=path.join(root,entry.name);if(entry.isDirectory())total+=await storageBytes(file);else if(entry.isFile())total+=(await fs.stat(file)).size;
 }return total;
}
export async function stageServerData(root,bundle,{expectedRelease,maxBytes=512*1024*1024,clock=()=>new Date().toISOString()}={}){
 validateServerData(bundle);
 const current=await loadServerData(root);
 if(expectedRelease!==undefined&&(current?.pointer.release||null)!==expectedRelease)throw Error('已有另一轮资料更新完成，本轮不覆盖');
 if(current){
  const next=bundle.game.version.split('.').map(Number),prior=current.bundle.game.version.split('.').map(Number);
  const order=next[0]-prior[0]||next[1]-prior[1]||next[2]-prior[2];
  if(order<0||compareBuildPatches(bundle.game.patch,current.bundle.game.patch)<0)throw Error('拒绝资料版本回退');
  if(contentEqual(bundle,current.bundle))return {...current,changed:false};
 }
 const files={},packedFiles={};
 for(const name of SERVER_DATA_FILES){
  const raw=json(bundle[name]);if(raw.length>32*1024*1024)throw Error('资料内容超限');
  const packed=await zip(raw);if(packed.length>16*1024*1024)throw Error('压缩资料超限');
  files[name]={file:name+'.json.gz',bytes:packed.length,sha256:dataHash(packed),rawBytes:raw.length,rawSha256:dataHash(raw)};
  packedFiles[name]=packed;
 }
 const release=bundle.game.version+'-'+dataHash(json(files)).slice(0,16);
 const manifest={schema:1,release,version:bundle.game.version,patch:bundle.game.patch,createdAt:clock(),status:'candidate-needs-release-review',files};
 const manifestBytes=json(manifest),pointer={schema:1,release,manifestSha256:dataHash(manifestBytes),previousRelease:current?.pointer.release||null};
 const folder=path.join(root,'releases');await fs.mkdir(folder,{recursive:true});
 const existing=await fs.readFile(path.join(folder,release,'manifest.json')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(existing){
  pointer.manifestSha256=dataHash(existing);const saved=await loadRelease(root,pointer);
  if(!contentEqual(saved.bundle,bundle))throw Error('既有资料版本不匹配');
 }else{
  const extra=Object.values(packedFiles).reduce((sum,bytes)=>sum+bytes.length,0)+manifestBytes.length+65536;
  if(await storageBytes(root)+extra>maxBytes)throw Error('资料存储达到上限，保留所有有效版本');
  const temporary=await fs.mkdtemp(path.join(folder,'.staging-'));
  try{
   for(const name of SERVER_DATA_FILES)await fs.writeFile(path.join(temporary,files[name].file),packedFiles[name],{flag:'wx'});
   await fs.writeFile(path.join(temporary,'manifest.json'),manifestBytes,{flag:'wx'});
   await fs.rename(temporary,path.join(folder,release));
  }catch(error){await fs.rm(temporary,{recursive:true,force:true});throw error;}
 }
 // Recheck the pointer after the slow compression / file writes.
 const latest=await loadServerData(root);
 if((latest?.pointer.release||null)!==(current?.pointer.release||null))throw Error('已有另一轮资料更新完成，本轮不覆盖');
 await atomicJSON(path.join(root,'current.json'),pointer);
 return {...await loadRelease(root,pointer),changed:true};
}
