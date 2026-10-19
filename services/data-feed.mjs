import {createHash,createPublicKey,verify} from 'node:crypto';
import {gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {validRankingReference,rankingKey,newerRanking} from '../src/core/rankings.mjs';
import {validReference,validHexReference,compareBuildPatches} from '../src/core/builds.mjs';
import {BUILD_REGIONS,BUILD_TIERS,DEFAULT_BUILD_SOURCE,sameBuildSource,buildSourceKey,preferBuildReference,selectBuildSource} from '../src/core/build-source.mjs';

export const DATA_FEED_ORIGIN='https://data.riftbuddy.dpdns.org';
export const DATA_FEED_KEYS=Object.freeze({'data-20261014':`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA01SEpVxVmulRWdIiVvTYKI4qcc9tb3lKgywo/9bpjOE=
-----END PUBLIC KEY-----
`});
export const DATA_FEED_NAMES=Object.freeze(['rankings','builds','hex-builds']);
export const DATA_FEED_MAX_PACKED=8*1024*1024,DATA_FEED_MAX_RAW=16*1024*1024;
const unzip=promisify(gunzip),hashPattern=/^[a-f0-9]{64}$/;
export const feedHash=value=>createHash('sha256').update(value).digest('hex');
export const validFeedPatch=value=>typeof value==='string'&&/^[1-9]\d{0,2}\.[1-9]\d{0,2}$/.test(value);

export function validateFeedManifest(value){
 if(value?.schema!==1||!validFeedPatch(value.patch)||!Number.isSafeInteger(value.sequence)||value.sequence<1||!hashPattern.test(value.release||'')||!Number.isFinite(Date.parse(value.publishedAt)))throw Error('资料清单格式无效');
 if(value.checkedAt!==undefined&&(typeof value.checkedAt!=='string'||!Number.isFinite(Date.parse(value.checkedAt))))throw Error('来源复查时间无效');
 if(!value.files||Object.keys(value.files).length!==3)throw Error('资料清单不完整');
 for(const name of DATA_FEED_NAMES){
  const file=value.files[name];
  if(!hashPattern.test(file?.sha256||'')||!hashPattern.test(file?.rawSha256||'')||file.file!==file.sha256+'.json.gz'||!Number.isSafeInteger(file.bytes)||file.bytes<=0||file.bytes>DATA_FEED_MAX_PACKED||!Number.isSafeInteger(file.rawBytes)||file.rawBytes<=0||file.rawBytes>DATA_FEED_MAX_RAW)throw Error('资料文件清单无效');
 }
 if(feedHash(JSON.stringify({patch:value.patch,files:value.files}))!==value.release)throw Error('资料版本标识不匹配');
 return value;
}
export function verifyFeedEnvelope(envelope,{keys=DATA_FEED_KEYS}={}){
 if(!envelope||typeof envelope.keyId!=='string'||!Object.hasOwn(keys,envelope.keyId)||typeof envelope.payload!=='string'||envelope.payload.length>65536||typeof envelope.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature))throw Error('资料签名格式无效');
 const payload=Buffer.from(envelope.payload,'base64'),signature=Buffer.from(envelope.signature,'base64');
 if(payload.toString('base64')!==envelope.payload)throw Error('资料清单编码无效');
 const key=createPublicKey(keys[envelope.keyId]);
 if(key.asymmetricKeyType!=='ed25519'||!verify(null,payload,key,signature))throw Error('资料签名校验失败');
 return validateFeedManifest(JSON.parse(payload));
}
export async function decodeFeedFile(bytes,file){
 if(!Buffer.isBuffer(bytes)||bytes.length!==file.bytes||bytes.length>DATA_FEED_MAX_PACKED||feedHash(bytes)!==file.sha256)throw Error('资料下载校验失败');
 const raw=await unzip(bytes,{maxOutputLength:Math.min(file.rawBytes,DATA_FEED_MAX_RAW)});
 if(raw.length!==file.rawBytes||feedHash(raw)!==file.rawSha256)throw Error('资料解压校验失败');
 return JSON.parse(raw);
}
export function validateFeedBundle(bundle,game){
 const heroes=new Map(game.champions.map(c=>[c.id,c]));
 for(const name of DATA_FEED_NAMES){
  const entries=bundle[name]?.entries;
  if(bundle[name]?.schema!==(name==='builds'?2:1)||!entries||typeof entries!=='object'||Array.isArray(entries)||!Object.keys(entries).length)throw Error('资料内容不完整');
  for(const [key,ref] of Object.entries(entries)){
   let valid=false;
   if(name==='rankings')valid=key===ref?.key&&validRankingReference(ref,game);
   if(name==='builds'){
    const champion=heroes.get(ref?.champion);
    valid=champion&&validReference(ref,champion,ref.role,game,{allowOlder:true})&&key===buildSourceKey(champion.id,ref.role,ref,ref.patch)&&ref.scope===undefined&&ref.opponent===undefined;
   }
   if(name==='hex-builds')valid=heroes.has(key)&&validHexReference(ref,heroes.get(key),game,{allowOlder:true});
   if(!valid||Object.hasOwn(ref,'serverCheckedAt'))throw Error('资料与当前游戏版本不兼容');
  }
 }
 for(const region of BUILD_REGIONS)for(const tier of BUILD_TIERS)if(!bundle.rankings.entries[rankingKey(game.patch,{region:region.id,tier:tier.id})])throw Error('资料缺少来源榜单');
 return bundle;
}
// Mutates only reference collections. Saved drafts, accepted loadouts and LCU
// state are deliberately outside this operation.
export function applyFeedBundle(data,bundle,manifest=null){
 validateFeedBundle(bundle,data);
 const rankings={...data.rankings},builds={...data.buildSources},hex={...data.hexBuilds};
 for(const [key,ref] of Object.entries(bundle.rankings.entries))if(newerRanking(ref,rankings[key]))rankings[key]=ref;
 for(const [key,ref] of Object.entries(bundle.builds.entries))if(preferBuildReference(ref,builds[key]))builds[key]=ref;
 for(const [key,ref] of Object.entries(bundle['hex-builds'].entries)){
  const old=hex[key],order=old?compareBuildPatches(ref.patch,old.patch):1;
  if(!old||order>0||order===0&&Date.parse(ref.fetchedAt)>Date.parse(old.fetchedAt))hex[key]=ref;
 }
 // Freshness authority comes only from the verified manifest. An asset may
 // retain other scopes or old patches which this collector never rechecked.
 if(manifest?.patch===data.patch&&Number.isFinite(Date.parse(manifest.checkedAt))){
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>!['fetchedAt','checkedAt','serverCheckedAt'].includes(key)).map(key=>[key,stable(value[key])])):value;
  for(const [name,target] of [['rankings',rankings],['builds',builds],['hex-builds',hex]])for(const [key,ref] of Object.entries(bundle[name].entries)){
   const local=target[key];if(!local||ref.patch!==data.patch||name==='builds'&&(!sameBuildSource(ref,DEFAULT_BUILD_SOURCE)||ref.scope!==undefined||ref.opponent!==undefined))continue;
   if(Date.parse(manifest.checkedAt)<=Math.max(Date.parse(local.fetchedAt)||0,Date.parse(local.serverCheckedAt)||0)||JSON.stringify(stable(local))!==JSON.stringify(stable(ref)))continue;
   target[key]={...local,serverCheckedAt:manifest.checkedAt};
  }
 }
 data.rankings=rankings;data.buildSources=builds;data.hexBuilds=hex;selectBuildSource(data,data.buildSource);
}
export function createDataFeedActivationGate(){
 let busy=false;
 return client=>{
  // A transient disconnect cannot clear an observed draft/game. Unknown
  // connected phases are held until the client reports an idle phase.
  if(client?.connected)busy=!['None','Lobby','EndOfGame','PreEndOfGame'].includes(client.phase);
  return !busy;
 };
}
