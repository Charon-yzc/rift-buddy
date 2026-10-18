import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {getBuild} from '../src/core/builds.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
const hero=id=>data.champions.find(champion=>champion.id===id);
test('source core combination cannot force Yasuo to buy three non-attack-speed items before his attack-speed boots',()=>{
 const original=data.builds['Yasuo:mid'],reference={...original,core:[{...original.core[0],items:[6673,3031,6333]}],boots:[{items:[3006],samples:100}]};
 const build=getBuild(hero('Yasuo'),'mid',{...data,builds:{'Yasuo:mid':reference}});
 assert.equal(build.items[0].id,3006);assert.deepEqual(build.reference.core[0].items,[6673,3031,6333]);assert(build.adjustments.some(row=>row.title==='攻速鞋提前参考'));assert.match(build.sourceNote,/不是|不代表完整购买顺序/);
});
test('fresh bundled default roles stay champion-specific rather than sharing generic tank/enchanter fallback',()=>{
 const junglers=['Zac','Sejuani','Maokai'].map(id=>getBuild(hero(id),'jungle',data));assert(junglers.every(build=>build.reference));assert(junglers.some(build=>build.runePage.selectedPerkIds[0]!==8437));
 const supports=['Nami','Lulu','Janna'].map(id=>getBuild(hero(id),'support',data));assert(supports.every(build=>build.reference));assert(new Set(supports.map(build=>build.selectedCoreId)).size>1);
});
