import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {getBuild} from '../src/core/builds.mjs';
import {profile} from '../src/core/rules.mjs';
import {LOADOUTS} from '../src/core/loadouts.mjs';
import {BUNDLED_CATALOG,validateCatalog} from '../src/core/catalog.mjs';
import {purchasePlan} from '../src/core/purchase.mjs';
import {SITUATION_ITEMS} from '../src/core/live-situation.mjs';
const root=path.resolve('.');let checked=0;const errors=[];
async function syntax(folder){for(const item of await fs.readdir(folder,{withFileTypes:true})){
 const file=path.join(folder,item.name);if(item.isDirectory())await syntax(file);
 else if(/\.(mjs|cjs|js)$/.test(file)){try{execFileSync(process.execPath,['--check',file],{stdio:'pipe'});checked++;}catch(e){errors.push(`${path.relative(root,file)}: ${e.stderr}`);}}
}}
for(const folder of ['src','electron','services','tests'])await syntax(folder);
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
validateCatalog(BUNDLED_CATALOG,data);
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
data.hexBuilds=JSON.parse(await fs.readFile('data/hex-builds.json','utf8')).entries;
const assets=new Set(data.champions.map(c=>`champion/${c.id}.png`));
for(const id of SITUATION_ITEMS)assets.add(`item/${id}.png`);
for(const config of LOADOUTS)for(const id of config.champions)for(const role of config.roles){
 const c=data.champions.find(c=>c.id===id);if(!c){errors.push(`Missing loadout champion: ${id}`);continue;}
 const build=getBuild(c,role,data,{loadoutId:config.id});if(build.missing.length)errors.push(`Unavailable loadout items: ${config.id}`);
 for(const item of [...build.items,...build.start,...build.early]){assets.add(`item/${item.id}.png`);if(item.purchaseBase)assets.add(`item/${item.purchaseBase.id}.png`);}
 for(const plan of purchasePlan(build.items,data.items))for(const component of [...plan.components,...plan.choices])assets.add(`item/${component.id}.png`);
 for(const spell of build.summoners)assets.add(`spell/${spell}.png`);
}
for(const c of data.champions)for(const mode of ['rift','hex'])for(const role of mode==='hex'?[profile(c).roles[0]]:profile(c).roles)for(let coreIndex=0;coreIndex<3;coreIndex++){
 const build=getBuild(c,role,data,{mode,coreIndex});
 for(const item of [...build.items,...build.start,...build.early]){assets.add(`item/${item.id}.png`);if(item.purchaseBase)assets.add(`item/${item.purchaseBase.id}.png`);}
 for(const plan of purchasePlan(build.items,data.items))for(const component of [...plan.components,...plan.choices])assets.add(`item/${component.id}.png`);
 for(const id of build.summoners)assets.add(`spell/${id}.png`);
}
for(const [id,role] of [['Ahri','mid'],['Vi','jungle'],['Lulu','support'],['Malphite','top'],['Cassiopeia','mid']]){const c=data.champions.find(c=>c.id===id);const b=getBuild(c,role,data,{conditions:['ap','ad','control','heal','burst']});for(const item of [...b.items,...b.early,...b.granted])assets.add('item/'+item.id+'.png');}
for(const tree of data.runes)for(const slot of tree.slots)for(const rune of slot.runes)assets.add(`rune/${rune.id}.png`);
for(const a of data.augments){assets.add(`augment/${a.id}.png`);if(!a.description)errors.push(`Missing augment text: ${a.name}`);if(/@[^@]+@|<[^>]+>/.test(a.description))errors.push(`Unrendered augment text: ${a.name}`);}
for(const name of assets){try{const stat=await fs.stat(path.join('data/images',name));if(stat.size<100)errors.push(`Empty asset: ${name}`);}catch{errors.push(`Missing asset: ${name}`);}}
console.log(`Checked ${checked} JavaScript files, ${data.champions.length} champions, ${Object.keys(data.builds).length} role builds, ${Object.keys(data.hexBuilds).length} Hex builds, ${assets.size} referenced images.`);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('All checks passed.');
