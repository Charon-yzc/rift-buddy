import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {normalizeAbilityReference} from './ability-reference-normalize.mjs';
import {validAbilityReference} from '../src/core/abilities.mjs';
import {atomicJSON} from '../services/data.mjs';
import {cacheMissingImages} from '../services/image-cache.mjs';
const game=JSON.parse(await fs.readFile('data/game.json','utf8'));
const cacheArg=process.argv.indexOf('--cache-dir'),root=path.resolve(cacheArg>=0?process.argv[cacheArg+1]:`.local/ability-sources/${game.patch}`);
await fs.mkdir(root,{recursive:true});const sources=[];
async function get(file,url,maxBytes=4000000){
 const filename=path.join(root,file);let bytes;
 try{bytes=await fs.readFile(filename);}catch{
  const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(`${url}: ${r.status}`);
  const reader=r.body.getReader(),chunks=[];let size=0;
  while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>maxBytes){await reader.cancel();throw Error('Source size limit');}chunks.push(p.value);}bytes=Buffer.concat(chunks);
  JSON.parse(bytes);await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,bytes);
 }
 if(bytes.byteLength>maxBytes)throw Error('Source size limit');const raw=JSON.parse(bytes),source={url,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};sources.push(source);return {raw,source};
}
const {raw:overview}=await get('dd-overview.json',`https://ddragon.leagueoflegends.com/cdn/${game.version}/data/zh_CN/champion.json`);
const records=new Map();let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<game.champions.length){const h=game.champions[cursor++];records.set(h.id,await get(`tencent-abilities/${h.id}.json`,`https://game.gtimg.cn/images/lol/act/img/js/hero/${h.key}.js`));}}));
const bins=new Map();
let binCursor=0;
await Promise.all(Array.from({length:4},async()=>{while(binCursor<game.champions.length){const id=game.champions[binCursor++].id,alias=id.toLowerCase(),{raw}=await get(`${id}-bin.json`,`https://raw.communitydragon.org/${game.patch}/game/data/characters/${alias}/${alias}.bin.json`);bins.set(id,raw);}}));
const dictionarySource=await get('zh-cn-stringtable.json',`https://raw.communitydragon.org/${game.patch}/game/zh_cn/data/menu/en_us/lol.stringtable.json`,40000000);
if(!dictionarySource.raw.entries.spell_apheliosq_tooltip_2?.includes('ApheliosSeverumQ:TotalDamage'))throw Error('Review Severum tooltip binding');
let fetchedAt=new Date().toISOString();try{const index=JSON.parse(await fs.readFile(path.join(root,'tencent-abilities-index.json'),'utf8'));if(index.patch===game.patch)fetchedAt=index.at;}catch{}
const reference=normalizeAbilityReference(game,records,{overview,bins,sources,fetchedAt,dictionary:dictionarySource.raw.entries});
// These Tencent icon references are missing or JPEGs. Use the exact current
// Riot PNG fields, retaining that source alongside the champion text source.
for(const [id,keys] of Object.entries({Aurora:['P'],Janna:['P','Q','W','E','R'],Lillia:['P'],Locke:['P'],Naafiri:['P'],TahmKench:['W','R']})){
 const result=await get(`dd-icons/${id}.json`,`https://ddragon.leagueoflegends.com/cdn/${game.version}/data/zh_CN/champion/${id}.json`);
 if(result.raw.version!==game.version)throw Error('Icon source version mismatch');const dd=result.raw.data[id],hero=reference.champions.find(c=>c.id===id);
 for(const key of keys){const index=['P','Q','W','E','R'].indexOf(key),icon=(index?dd.spells[index-1]:dd.passive).image.full;hero.abilities[index].icon=`https://ddragon.leagueoflegends.com/cdn/${game.version}/img/${index?'spell':'passive'}/${icon}`;hero.abilities[index].iconSource=result.source;}
}
if(!validAbilityReference(reference,game))throw Error('Generated ability reference is incomplete');
await atomicJSON('data/abilities.json',reference);
console.log(JSON.stringify({patch:reference.patch,champions:reference.champions.length,abilities:reference.champions.length*5,variants:reference.champions.reduce((n,c)=>n+c.abilities.reduce((n,a)=>n+a.variants.length,0),0),corrections:reference.corrections.length}));
const images=await cacheMissingImages({root:path.resolve('data/images'),bundleRoot:path.resolve('data/images'),data:{...game,abilityReference:reference},budgetMs:180000,progress:console.log});
console.log(JSON.stringify({abilityImages:{saved:images.saved,failed:images.failed,total:images.total}}));
if(images.failed)throw Error('Some reference icons remain unavailable; rerun before packaging');
