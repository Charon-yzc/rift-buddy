import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import { collectSnapshot, atomicJSON, DD } from '../services/data.mjs';
const root = path.resolve('data');
const d = await collectSnapshot(console.log);
await atomicJSON(path.join(root,'game.json'),d);
// The spell book is versioned separately from game.json: refresh it right
// here so a new game version can never silently pair with stale formulas.
// A failed enrichment keeps the previous book and is reported loudly;
// scripts/check.mjs still fails the release on a version mismatch.
let spellsVersion=null;
try{spellsVersion=JSON.parse(await fs.readFile(path.join(root,'spells.json'),'utf8')).version;}catch{}
if(spellsVersion===d.version){
 console.log(`技能库已是 ${spellsVersion}，跳过刷新`);
}else{
 console.log(`技能库 ${spellsVersion||'缺失'} 与新版本 ${d.version} 不一致，开始刷新`);
 const code=await new Promise(resolve=>{
  const child=spawn(process.execPath,[path.join(path.resolve('scripts'),'enrich-spells.mjs')],{stdio:'inherit'});
  child.on('error',()=>resolve(1));child.on('close',resolve);
 });
 if(code!==0)console.error(`技能库刷新未完成（exit ${code}），已保留旧版；发布前请手动运行 pnpm spells:enrich 并通过 pnpm check`);
}
const assets = [
 ...d.champions.map(c=>[`champion/${c.id}.png`,c.icon]),
 ...Object.values(d.items).filter(i => i.maps?.['11'] || i.maps?.['12']).map(i=>[`item/${i.id}.png`,i.icon]),
 ...d.runes.flatMap(tree=>[[`rune/${tree.id}.png`,`${DD}/cdn/img/${tree.icon}`],...tree.slots.flatMap(s=>s.runes.map(r=>[`rune/${r.id}.png`,`${DD}/cdn/img/${r.icon}`]))]),
 ...Object.values(d.spells).map(s=>[`spell/${s.id}.png`,`${DD}/cdn/${d.version}/img/spell/${s.image.full}`]),
 ...d.augments.map(a=>[`augment/${a.id}.png`,a.icon]),
];
let done=0, failed=0, idx=0;
await Promise.all(Array.from({length:10}, async()=>{
 while(idx<assets.length) {
  const [name,url]=assets[idx++]; const dest=path.join(root,'images',name);
  try { await fs.access(dest); done++; continue; } catch {}
  try { const r=await fetch(url,{signal:AbortSignal.timeout(16000)}); if(!r.ok)throw Error(String(r.status));
   const bytes=Buffer.from(await r.arrayBuffer()); if(bytes.length<100)throw Error('Empty asset');
   await fs.mkdir(path.dirname(dest),{recursive:true}); await fs.writeFile(dest,bytes);
  } catch { failed++; }
  done++; if(done%100===0)console.log(`图片 ${done}/${assets.length}`);
 }
}));
console.log(JSON.stringify({version:d.version,champions:d.champions.length,items:Object.keys(d.items).length,augments:d.augments.length,failedImages:failed,augmentError:d.augmentError}));
