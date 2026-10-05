import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const keyPattern=/^(champion|item|rune|spell|augment)\/[A-Za-z0-9_-]+$/;
const imageHosts=new Set(['ddragon.leagueoflegends.com','raw.communitydragon.org','game.gtimg.cn']);
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
export function imageEntries(data){
 const dd='https://ddragon.leagueoflegends.com';
 return [
  ...data.champions.map(c=>[`champion/${c.id}`,c.icon]),
  ...Object.values(data.items).filter(i=>i.maps?.['11']||i.maps?.['12']).map(i=>[`item/${i.id}`,i.icon]),
  ...data.augments.map(a=>[`augment/${a.id}`,a.icon]),
  ...Object.entries(data.spells).map(([id,s])=>[`spell/${id}`,`${dd}/cdn/${data.version}/img/spell/${s.image.full}`]),
  ...data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[`rune/${r.id}`,`${dd}/cdn/img/${r.icon}`]))),
 ].filter(([key,url])=>keyPattern.test(key)&&typeof url==='string');
}
async function exists(filename){try{return (await fs.stat(filename)).size>100;}catch{return false;}}
export async function loadImageOverrides(root,data){
 const overrides={};
 for(const [key] of imageEntries(data)){
  const filename=path.join(root,`${key}.png`);
  if(await exists(filename))overrides[key]=pathToFileURL(filename).href;
 }
 return overrides;
}
export async function cacheMissingImages({root,bundleRoot,data,progress=()=>{},fetchImage=fetch,budgetMs=60000}){
 const jobs=[];
 for(const [key,url] of imageEntries(data)){
  if(await exists(path.join(bundleRoot,`${key}.png`))||await exists(path.join(root,`${key}.png`)))continue;
  let parsed;try{parsed=new URL(url);}catch{continue;}if(parsed.protocol!=='https:'||!imageHosts.has(parsed.hostname))continue;
  jobs.push({key,url});
 }
 let index=0,saved=0,failed=0;const deadline=Date.now()+budgetMs;
 if(jobs.length)progress(`正在缓存 ${jobs.length} 张新增资料图片`);
 await Promise.all(Array.from({length:4},async()=>{
  while(index<jobs.length&&Date.now()<deadline){
   const {key,url}=jobs[index++];
   const filename=path.join(root,`${key}.png`),temporary=`${filename}.${crypto.randomBytes(6).toString('hex')}.tmp`;
   try{
    const response=await fetchImage(url,{signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});
    if(!response.ok||Number(response.headers.get('content-length'))>2_000_000)throw Error('图片不可用');
    const reader=response.body.getReader(),chunks=[];let size=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>2_000_000){await reader.cancel();throw Error('图片过大');}chunks.push(chunk.value);}
    const bytes=Buffer.concat(chunks);if(bytes.length<100||!bytes.subarray(0,8).equals(pngSignature))throw Error('图片格式不匹配');
    await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(temporary,bytes);await fs.rename(temporary,filename);saved++;
   }catch{failed++;await fs.unlink(temporary).catch(()=>{});}
  }
 }));
 return {saved,failed:failed+jobs.length-index,total:jobs.length,overrides:await loadImageOverrides(root,data)};
}
