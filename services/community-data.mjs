import {createPublicKey,verify} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {DATA_FEED_KEYS,feedHash} from './data-feed.mjs';
import {validateCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {mechanicReview} from '../src/core/mechanic-review.mjs';
import {validCommunitySource} from '../src/core/community-source.mjs';
import {validCommunityItemReview} from '../src/core/community-item-review.mjs';

// A separately signed, manually reviewed snapshot. Daily statistical collection
// must never rewrite its provenance or promote unreviewed creator material.
export const COMMUNITY_MAX_RAW=3_000_000,COMMUNITY_MAX_PACKED=1_000_000;
const text=(v,max=1000)=>typeof v==='string'&&v.trim()&&v.length<=max;
export function validateCommunityData(value,data){
 if(!value||value.schema!==1||value.kind!=='community-snapshot'||value.patch!==data.patch||!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(value.version||'')||!/^\d{4}-\d{2}-\d{2}$/.test(value.reviewedAt||'')||JSON.stringify(value).length>COMMUNITY_MAX_RAW)throw Error('社区资料版本或大小无效');
 const catalog=validateCatalog(value.catalog,data),issues=catalogIssues(catalog,data),routes=value.hexRoutes;
 if(catalog.version!==value.version||!routes||routes.schema!==1||routes.patch!==value.patch||routes.reviewedAt!==value.reviewedAt||!Array.isArray(routes.routes)||routes.routes.length>100)throw Error('社区资料内容身份不一致');
 for(const entry of [...catalog.duos,...catalog.trios])if(entry.reviewedAt===value.reviewedAt&&(issues.status[entry.id]?.invalid||issues.status[entry.id]?.stale))throw Error('本轮组合尚未通过当前资料核验');
 const ids=new Set();
 for(const r of routes.routes){
  const source=r.communitySource,key=r.hero+':'+r.augment;
  if(ids.has(key)||!data.champions.some(c=>c.id===r.hero)||r.patch!==data.patch||!data.augments.some(a=>a.id===r.augment)||!Array.isArray(r.optional)||r.optional.length>20||!r.optional.every(id=>data.augments.some(a=>a.id===id))||!text(r.title,120)||!text(r.summary)||!text(r.caution)||!Array.isArray(r.play)||!r.play.length||r.play.length>6||!r.play.every(s=>text(s))||!Array.isArray(r.basicPlay)||!r.basicPlay.length||!r.basicPlay.every(s=>text(s)))throw Error('社区海克斯路线无效');
  if(!validCommunitySource(source,value.reviewedAt))throw Error('社区来源未完整记录');
  if(r.skillPriority!==undefined&&(!Array.isArray(r.skillPriority)||r.skillPriority.length<1||r.skillPriority.length>3||new Set(r.skillPriority).size!==r.skillPriority.length||!r.skillPriority.every(key=>['Q','W','E'].includes(key))))throw Error('社区加点优先级无效');
  if(r.requiresUltimate!==undefined&&typeof r.requiresUltimate!=='boolean')throw Error('社区大招条件无效');
  if(!Array.isArray(r.gear)||r.gear.length>12||!r.gear.every(g=>Array.isArray(g)&&[3,4].includes(g.length)&&text(g[0])&&text(g[2])&&Array.isArray(g[1])&&g[1].length>0&&g[1].length<=6&&g[1].every(id=>data.items[id]?.maps?.['12']&&data.items[id]?.inStore)&&(g.length===3||Array.isArray(g[3])&&g[3].length>0&&g[3].length<=20&&new Set(g[3]).size===g[3].length&&g[3].every(id=>Number.isSafeInteger(id)&&[r.augment,...r.optional].includes(id)))))throw Error('社区装备模式不符');
  if(r.itemReview!==undefined&&!validCommunityItemReview(r.itemReview,r,value.patch,value.reviewedAt))throw Error('社区装备复核无效');
  if(!routes.championReview||mechanicReview(data.champions.find(c=>c.id===r.hero),data.patch,routes.championReview)!=='current')throw Error('社区英雄机制尚未复核');
  ids.add(key);
 }
 return value;
}
export function verifyCommunityEnvelope(envelope,{keys=DATA_FEED_KEYS}={}){
 if(!envelope||!Object.hasOwn(keys,envelope.keyId)||typeof envelope.payload!=='string'||envelope.payload.length>8192||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature||''))throw Error('社区签名格式无效');
 const bytes=Buffer.from(envelope.payload,'base64');
 if(bytes.toString('base64')!==envelope.payload||!verify(null,bytes,createPublicKey(keys[envelope.keyId]),Buffer.from(envelope.signature,'base64')))throw Error('社区签名校验失败');
 const m=JSON.parse(bytes);
 if(m.schema!==1||m.kind!=='community-snapshot'||!/^\d{2}\.\d{1,2}$/.test(m.patch||'')||!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(m.version||'')||!Number.isSafeInteger(m.sequence)||m.sequence<1||!Number.isFinite(Date.parse(m.publishedAt))||!Number.isFinite(Date.parse(m.reviewedAt))||!/^\d+\.\d+\.\d+$/.test(m.minimumApp||'')||!/^[a-f0-9]{64}$/.test(m.sha256||'')||!/^[a-f0-9]{64}$/.test(m.rawSha256||'')||m.file!==m.sha256+'.json.gz'||!Number.isInteger(m.bytes)||m.bytes<1||m.bytes>COMMUNITY_MAX_PACKED||!Number.isInteger(m.rawBytes)||m.rawBytes<1||m.rawBytes>COMMUNITY_MAX_RAW)throw Error('社区签名元数据无效');
 return m;
}
export function decodeCommunitySnapshot(manifest,packed){
 if(packed.length!==manifest.bytes||feedHash(packed)!==manifest.sha256)throw Error('社区资料下载校验失败');
 const raw=gunzipSync(packed,{maxOutputLength:COMMUNITY_MAX_RAW});
 if(raw.length!==manifest.rawBytes||feedHash(raw)!==manifest.rawSha256)throw Error('社区资料解压校验失败');
 const value=JSON.parse(raw);
 if(value.schema!==1||value.kind!=='community-snapshot'||value.patch!==manifest.patch||value.version!==manifest.version||value.reviewedAt!==manifest.reviewedAt)throw Error('社区资料与签名身份不符');
 return value;
}
export function decodeCommunityData(manifest,packed,data){return validateCommunityData(decodeCommunitySnapshot(manifest,packed),data);}
