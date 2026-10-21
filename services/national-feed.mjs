import {createPublicKey,verify} from 'node:crypto';
import {DATA_FEED_KEYS,DATA_FEED_ORIGIN} from './data-feed.mjs';
import {readPublicJSON} from './build-json.mjs';
import {NATIONAL_TIERS,nationalKey,validNationalReference} from '../src/core/national-reference.mjs';

export const NATIONAL_FEED_PATH='/national/v1/latest.json';
export function validateNationalFeed(payload,data){
 if(!payload||Object.keys(payload).sort().join(',')!=='entries,kind,patch,provider,publishedAt,schema,sequence'||payload.schema!==1||payload.kind!=='national-rankings'||payload.provider!=='tencent101'||payload.patch!==data.patch||!Number.isSafeInteger(payload.sequence)||payload.sequence<1||!Number.isFinite(Date.parse(payload.publishedAt)))throw Error('国服签名资料版本或格式不匹配');
 const expected=NATIONAL_TIERS.map(t=>nationalKey({kind:'rankings',tier:t.id},data));
 if(!payload.entries||Object.keys(payload.entries).length!==expected.length||expected.some(key=>!validNationalReference(payload.entries[key],data)||payload.entries[key].kind!=='rankings'||payload.entries[key].key!==key))throw Error('国服签名资料未完整覆盖约定范围');
 return payload;
}
export function verifyNationalEnvelope(envelope,data,{keys=DATA_FEED_KEYS}={}){
 if(!envelope||typeof envelope.payload!=='string'||envelope.payload.length>900000||typeof envelope.signature!=='string'||!Object.hasOwn(keys,envelope.keyId)||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature))throw Error('国服资料签名格式无效');
 const bytes=Buffer.from(envelope.payload,'base64');
 if(bytes.toString('base64')!==envelope.payload||!verify(null,bytes,createPublicKey(keys[envelope.keyId]),Buffer.from(envelope.signature,'base64')))throw Error('国服资料签名校验失败');
 const payload=JSON.parse(bytes);
 if(data)return validateNationalFeed(payload,data);
 if(payload?.schema!==1||payload.kind!=='national-rankings'||payload.provider!=='tencent101'||!/^\d{1,3}\.\d{1,3}$/.test(payload.patch||'')||!Number.isSafeInteger(payload.sequence)||payload.sequence<1||!Number.isFinite(Date.parse(payload.publishedAt)))throw Error('国服资料元数据无效');
 return payload;
}
export async function fetchNationalFeed(data,{fetcher=fetch,clock=()=>new Date().toISOString()}={}){
 let envelope;
 try{envelope=await readPublicJSON(DATA_FEED_ORIGIN+NATIONAL_FEED_PATH,{fetcher,timeout:12000,limit:1000000});}
 catch(error){if(error.status===404||error.status===410||error.status>=500||error.name==='TimeoutError'||error instanceof TypeError)return null;throw error;}
 const authenticated=verifyNationalEnvelope(envelope);if(authenticated.patch!==data.patch)return null;
 const payload=validateNationalFeed(authenticated,data),age=Date.parse(clock())-Date.parse(payload.publishedAt);
 if(age<0||age>26*3600000)throw Error('国服服务器资料已超过更新周期，请保留缓存并稍后刷新');
 return {payload,envelope};
}
