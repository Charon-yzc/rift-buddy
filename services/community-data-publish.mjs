import fs from 'node:fs/promises';import path from 'node:path';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';import {gzipSync} from 'node:zlib';
import {atomicJSON} from './data.mjs';import {DATA_FEED_KEYS,feedHash} from './data-feed.mjs';
import {validateCommunityData,verifyCommunityEnvelope,decodeCommunityData} from './community-data.mjs';
import {communityHexItemFingerprint} from '../src/core/community-item-review.mjs';

// Caller holds collect.lock, also used by the existing statistical service.
export async function publishCommunityData({publicRoot,keyFile,game,catalog,hexRoutes,minimumApp,keys=DATA_FEED_KEYS,keyId='data-20261014',clock=()=>Date.now(),write=atomicJSON}){
 publicRoot=path.resolve(publicRoot);keyFile=path.resolve(keyFile);
 if(keyFile===publicRoot||keyFile.startsWith(publicRoot+path.sep))throw Error('签名密钥不可位于公开目录');
 const value=validateCommunityData({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:hexRoutes.reviewedAt,catalog,hexRoutes},game);
 for(const route of hexRoutes.routes)if(route.itemReview)for(const [id,hash]of Object.entries(route.itemReview.items))if(!game.items[id]?.maps?.['12']||!game.items[id]?.inStore||game.items[id]?.gold?.purchasable===false||hash!==communityHexItemFingerprint(game.items[id],game.patch))throw Error('社区配套尚未通过当前装备复核');
 const requiredApp=hexRoutes.routes.some(r=>r.itemReview!==undefined)?'0.59.33':hexRoutes.routes.some(r=>r.communitySource?.url.startsWith('https://deeparam.com/'))?'0.59.32':hexRoutes.routes.some(r=>r.gear.some(g=>g.length===4))?'0.59.31':hexRoutes.routes.some(r=>r.communitySource?.medium==='text')?'0.59.29':'0.59.28';minimumApp??=requiredApp;
 const number=p=>p.split('.').map(Number).reduce((n,v)=>n*1000+v,0);
 if(!/^\d+\.\d+\.\d+$/.test(minimumApp)||number(minimumApp)<number(requiredApp))throw Error('社区资料需要支持所用格式的版本');
 const key=createPrivateKey(await fs.readFile(keyFile));
 if(key.asymmetricKeyType!=='ed25519'||!Object.hasOwn(keys,keyId)||!createPublicKey(key).export({format:'der',type:'spki'}).equals(createPublicKey(keys[keyId]).export({format:'der',type:'spki'})))throw Error('签名密钥与固定公钥不一致');
 const root=path.join(publicRoot,'community','v1'),assetRoot=path.join(root,'assets'),destination=path.join(root,'latest.json');
 for(const dir of [publicRoot,path.dirname(root),root,assetRoot]){await fs.mkdir(dir,{recursive:true});const stat=await fs.lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('公开资料目录无效');await fs.chmod(dir,0o755);}
 let prior;try{const stat=await fs.lstat(destination);if(!stat.isFile()||stat.isSymbolicLink())throw Error('清单目标无效');prior=verifyCommunityEnvelope(JSON.parse(await fs.readFile(destination)),{keys});}catch(e){if(e.code!=='ENOENT')throw e;}
 if(prior&&(number(value.patch)<number(prior.patch)||value.reviewedAt<prior.reviewedAt||value.version.localeCompare(prior.version,undefined,{numeric:true})<0))throw Error('拒绝社区资料回退');
 const raw=Buffer.from(JSON.stringify(value)),packed=gzipSync(raw),hash=feedHash(packed),now=clock(),manifest={schema:1,kind:value.kind,patch:value.patch,version:value.version,reviewedAt:value.reviewedAt,minimumApp,sequence:Math.max(now,(prior?.sequence||0)+1),publishedAt:new Date(now).toISOString(),file:hash+'.json.gz',sha256:hash,bytes:packed.length,rawSha256:feedHash(raw),rawBytes:raw.length};
 const bytes=Buffer.from(JSON.stringify(manifest)),envelope={keyId,payload:bytes.toString('base64'),signature:sign(null,bytes,key).toString('base64')};
 verifyCommunityEnvelope(envelope,{keys});decodeCommunityData(manifest,packed,game);
 const file=path.join(assetRoot,manifest.file);try{await fs.writeFile(file,packed,{flag:'wx',mode:0o644});}catch(e){if(e.code!=='EEXIST')throw e;const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||feedHash(await fs.readFile(file))!==hash)throw Error('既有社区资产不一致');}await fs.chmod(file,0o644);
 await write(destination,envelope,{mode:0o644});return manifest;
}
