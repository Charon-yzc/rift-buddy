import fs from 'node:fs/promises';
import path from 'node:path';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {atomicJSON} from './data.mjs';
import {createServerDataFetch} from './server-data-fetch.mjs';
import {DATA_FEED_KEYS} from './data-feed.mjs';
import {fetchNationalReference} from './national-reference.mjs';
import {NATIONAL_TIERS} from '../src/core/national-reference.mjs';
import {compareBuildPatches} from '../src/core/builds.mjs';
import {validateNationalFeed,verifyNationalEnvelope,NATIONAL_FEED_PATH} from './national-feed.mjs';

// Called under the existing data service flock. Independent of the legacy
// OP.GG generations: failures never replace either source with the other.
export async function publishNationalFeed({data,publicRoot,keyFile,keyId='data-20261014',keys=DATA_FEED_KEYS,clock=()=>new Date().toISOString(),network=createServerDataFetch({maxRequests:8,maxBytes:4e6,durationMs:120000}),fetchReference=fetchNationalReference}){
 const entries={};
 for(const tier of NATIONAL_TIERS){const ref=await fetchReference({kind:'rankings',tier:tier.id},data,{fetcher:network.fetcher,clock});entries[ref.key]=ref;}
 const privateKey=createPrivateKey(await fs.readFile(keyFile));if(privateKey.asymmetricKeyType!=='ed25519')throw Error('国服资料签名密钥类型不正确');
 if(!Object.hasOwn(keys,keyId)||!createPublicKey(privateKey).export({format:'der',type:'spki'}).equals(createPublicKey(keys[keyId]).export({format:'der',type:'spki'})))throw Error('国服签名密钥与固定公钥不一致');
 const destination=path.join(publicRoot,NATIONAL_FEED_PATH.slice(1));
 let prior=null;try{prior=verifyNationalEnvelope(JSON.parse(await fs.readFile(destination)),undefined,{keys});}catch(error){if(error.code!=='ENOENT')throw error;}
 if(prior&&compareBuildPatches(data.patch,prior.patch)<0)throw Error('拒绝国服资料补丁回退');
 const publishedAt=clock(),sequence=Math.max(Date.parse(publishedAt),(prior?.sequence||0)+1),payload=validateNationalFeed({schema:1,kind:'national-rankings',provider:'tencent101',patch:data.patch,publishedAt,sequence,entries},data);
 if(prior?.patch===data.patch&&Object.entries(entries).some(([key,ref])=>!prior.entries[key]||ref.sourceDate<prior.entries[key].sourceDate))throw Error('国服来源日期倒退，保留已发布资料');
 const bytes=Buffer.from(JSON.stringify(payload)),envelope={keyId,payload:bytes.toString('base64'),signature:sign(null,bytes,privateKey).toString('base64')};verifyNationalEnvelope(envelope,data,{keys});
 // The service uses a restrictive umask. Make only the public feed readable
 // by Caddy, and set file permissions before its atomic promotion.
 const folder=path.dirname(destination);await fs.mkdir(folder,{recursive:true});
 for(const dir of [path.dirname(folder),folder])await fs.chmod(dir,0o755);
 await atomicJSON(destination,envelope,{mode:0o644});return {patch:payload.patch,publishedAt,sequence,counts:Object.fromEntries(Object.entries(entries).map(([key,ref])=>[key,Object.values(ref.boards).reduce((n,rows)=>n+rows.length,0)])),network:network.stats()};
}
