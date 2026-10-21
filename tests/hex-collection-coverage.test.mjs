import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {setImmediate} from 'node:timers/promises';
import {collectSnapshot} from '../services/data.mjs';import {validateGenerationGame} from '../services/data-generation.mjs';
const game=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url))),formula=JSON.parse(fs.readFileSync(new URL('./fixtures/hex-augment-formulas-16.20.json',import.meta.url)));
async function collect(t,change){
 t.mock.timers.enable({apis:['setTimeout']});
 const keys=formula.catalog.slice(0,2).map(a=>a.key),pool=keys.map(key=>'Maps/ModeSpecificData/KIWI/Augments/'+key),catalog=formula.catalog.map(a=>({id:a.id,augmentNameId:a.key,nameTRA:a.name,rarity:a.rarity,augmentSmallIconPath:'/lol-game-data/assets/ASSETS/Icons/test.png'}));
 if(change==='missing')catalog.splice(0,1);if(change==='duplicate')catalog.push({...catalog[0]});if(change==='pool duplicate')pool.push(pool[0]);if(change==='id duplicate')catalog[1].id=catalog[0].id;
 const readJSON=async url=>{
  if(url.endsWith('/versions.json'))return [game.version];
  if(url.endsWith('/championFull.json'))return {data:Object.fromEntries(game.champions.map(c=>[c.id,{...c,key:String(c.key),passive:c.mechanicSource.passive,spells:c.mechanicSource.spells,image:{full:c.id+'.png'}}]))};
  if(url.endsWith('/item.json'))return {data:Object.fromEntries(Object.entries(game.items).map(([id,item])=>[id,{...item,image:{full:id+'.png'}}]))};
  if(url.endsWith('/runesReforged.json'))return game.runes;
  if(url.endsWith('/summoner.json'))return {data:game.spells};
  if(url.includes('/heroList/'))return {hero:[],version:game.patch};
  if(url.includes('/game/data/characters/')){const id=url.split('/').at(-2),c=game.champions.find(c=>c.id.toLowerCase()===id);return {['Characters/'+id+'/CharacterRecords/Root']:{mCharacterName:c.id,damagePerLevelModifiable:c.stats.attackdamageperlevel,attackSpeedRatioModifiable:c.stats.attackspeedratio,purchaseIdentities:c.stats.attacktype==='adaptive'?['Melee','Ranged']:[c.stats.attacktype==='melee'?'Melee':'Ranged']}};}
  if(url.endsWith('/items.cdtb.bin.json'))return {};
  if(url.endsWith('/lol.stringtable.json'))return {entries:formula.entries};
  if(url.endsWith('/augment-lists.json'))return [{modeName:'KIWI',augmentList:pool}];
  if(url.endsWith('/cherry-augments.json'))return catalog;
  if(url.endsWith('/kiwi.bin.json'))return formula.bin;
  throw Error('Unexpected isolated source '+url);
 };
 let settled=false;const pending=collectSnapshot(()=>{},null,{readJSON,recheckVersion:true,clock:()=>Date.parse('2026-10-21T00:00:00Z')});pending.finally(()=>settled=true).catch(()=>{});
 for(let n=0;n<250&&!settled;n++){t.mock.timers.runAll();await setImmediate();}
 assert.ok(settled,'isolated collection did not settle');return pending;
}
test('the full collector uses this pool coverage instead of a fixed historical augment count',async t=>{
 const result=await collect(t);assert.equal(result.augmentError,null);assert.equal(result.augments.length,2);assert.ok(result.augments.every(a=>a.descriptionStatus==='complete'));assert.doesNotThrow(()=>validateGenerationGame(result));
});
for(const change of ['missing','duplicate','pool duplicate','id duplicate'])test('the full collector rejects '+change+' KIWI coverage before a new base can activate',async t=>{
 const result=await collect(t,change);assert.match(result.augmentError||'',/海克斯.*(?:缺失|重复|完整)/);assert.equal(result.sources.augments,null);assert.throws(()=>validateGenerationGame(result),/来源不完整/);
});
