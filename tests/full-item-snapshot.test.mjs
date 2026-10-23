import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {setImmediate} from 'node:timers/promises';
import {collectSnapshot} from '../services/data.mjs';
import {hasCurrentItemDescription} from '../services/item-descriptions.mjs';
import {hasItemModeTooltip,itemModeTooltip} from '../src/core/item-mode-tooltip.mjs';
import {pureGameSnapshot,validateGenerationGame} from '../services/data-generation.mjs';
import {gameReference} from '../src/core/game-reference.mjs';
import {gameTooltipView} from '../src/game-tooltip-view.mjs';

const read=async name=>JSON.parse(await fs.readFile(new URL(name,import.meta.url)));
const game=await read('../data/game.json'),items=await read('./fixtures/item-scalars-16.21.json'),augments=await read('./fixtures/hex-stat-formulas-16.21.json');
const now=Date.parse('2026-10-23T00:00:00Z');
// Use the existing real source excerpts. The remaining catalogue items have
// no formula source in this fixture and must retain only their DD fallback.
const ddItems=Object.fromEntries(Object.entries(game.items).map(([id,i])=>[id,{...Object.fromEntries(['name','description','tags','gold','maps','from','into','inStore','requiredAlly','requiredChampion','stats','specialRecipe'].filter(k=>Object.hasOwn(i,k)).map(k=>[k,i[k]])),image:{full:id+'.png'}}]));
const champions=game.champions.slice(0,150),ddChampions={data:Object.fromEntries(champions.map(c=>[c.id,{...c,passive:c.mechanicSource.passive,spells:c.mechanicSource.spells,image:{full:c.id+'.png'}}]))};
const catalog=augments.catalog.map(a=>{const known=game.augments.find(i=>i.id===a.id);assert(known);return {id:a.id,augmentNameId:a.key,nameTRA:a.name,rarity:known.rarity,augmentSmallIconPath:'/lol-game-data/assets/'+known.icon.split('/global/default/')[1]};});

function sources({missingItems=false,malformedMode=false}={}){
 const calls=[],bin=structuredClone(items.bin);if(malformedMode)bin['Items/3118'].DataValuesModeOverride.Kiwi.unreviewed=true;
 return {calls,readJSON:async url=>{
  calls.push(url);
  if(url.endsWith('/versions.json'))return [game.version];
  if(url.endsWith('/championFull.json'))return structuredClone(ddChampions);
  if(url.endsWith('/item.json'))return {data:structuredClone(ddItems)};
  if(url.endsWith('/runesReforged.json'))return structuredClone(game.runes);
  if(url.endsWith('/summoner.json'))return {data:structuredClone(game.spells)};
  if(url.includes('/heroList/'))return {hero:[]};
  if(url.endsWith('/items.cdtb.bin.json')){if(missingItems)throw Error('isolated source unavailable');return bin;}
  if(url.endsWith('/lol.stringtable.json'))return {entries:{...items.strings.entries,...augments.entries}};
  if(url.endsWith('/augment-lists.json'))return [{modeName:'KIWI',augmentList:catalog.map(a=>'Augments/'+a.augmentNameId)}];
  if(url.endsWith('/cherry-augments.json'))return catalog;
  if(url.endsWith('/kiwi.bin.json'))return augments.bin;
  const c=champions.find(c=>url.endsWith('/'+c.id.toLowerCase()+'.bin.json'));
  assert(c,'Unexpected source '+url);
  return {['Characters/'+c.id+'/CharacterRecords/Root']:{mCharacterName:c.id,damagePerLevelModifiable:{baseValue:c.stats.attackdamageperlevel},attackSpeedRatioModifiable:{baseValue:c.stats.attackspeedratio},purchaseIdentities:c.stats.attacktype==='adaptive'?['Melee','Ranged']:[c.stats.attacktype==='ranged'?'Ranged':'Melee']}};
 }};
}
async function collect(t,previous,options={}){
 let settled=false;
 const result=collectSnapshot(()=>{},previous,{clock:()=>now,...options}).finally(()=>{settled=true;});
 // Advance only the collector's between-champion pacing; no real waits,
 // source calls, client connections or changes to the production delay.
 for(let tick=0;!settled&&tick<200;tick++){t.mock.timers.tick(1200);await setImmediate();}
 assert(settled,'Full collection did not settle');return result;
}

test('fresh, forced and daily full collection retain base parser markers and Kiwi formulas through signed projection and warm reuse',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const kind of ['fresh','forced','daily']){
  const previous=kind==='fresh'?null:{...game,contentCheckedAt:new Date(kind==='forced'?now:now-2*86400000).toISOString()},before=structuredClone(previous),source=sources();
  const result=await collect(t,previous,{readJSON:source.readJSON,recheckVersion:kind==='forced'});
  assert(source.calls.some(url=>url.endsWith('/championFull.json')));assert.equal(result.contentRevision,17);assert.equal(result.itemTooltipRevision,1);
  for(const id of Object.keys(items.items)){
   assert.equal(result.items[id].tooltipParserRevision,2,kind+' lost parser marker '+id);
   assert(hasCurrentItemDescription(result.items[id],game.patch));assert(hasItemModeTooltip(result.items[id],game.patch));
  }
  assert.match(result.items[3118].tooltip.description,/每秒造成60 \+ 5%法术强度/);
  assert.match(itemModeTooltip(result.items[3118],game.patch,'hex').description,/每秒造成40 \+ 2\.8%法术强度/);
  assert.match(result.items[3118].modeTooltips.hex.description,/600法力/);
  const projected=pureGameSnapshot(result);validateGenerationGame(projected);assert.deepEqual(projected.items,result.items);
  const reference=gameReference(projected,'item',3118,'hex');assert.match(gameTooltipView(reference,'item',3118,{mode:'hex'}),/<strong>40<\/strong> \+ <strong>2.8%<\/strong>法术强度/);
  source.calls.length=0;const warm=await collectSnapshot(()=>{},projected,{clock:()=>now,readJSON:source.readJSON});
  assert.equal(source.calls.length,2,kind+' unnecessarily reparsed item sources');assert.deepEqual(warm.items,result.items);assert.deepEqual(previous,before);
 }
});

test('full collection keeps missing and malformed item sources explicitly incomplete instead of inventing a mode layer',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const options of [{missingItems:true},{malformedMode:true}]){
  const source=sources(options),result=await collect(t,null,{readJSON:source.readJSON});
  assert.equal(result.contentRevision,options.missingItems?11:15);assert.equal(itemModeTooltip(result.items[3118],game.patch,'hex'),null);
  if(options.missingItems){assert.equal(result.itemTooltipRevision,0);assert.equal(result.items[3118].tooltip,undefined);assert.equal(result.items[3118].tooltipParserRevision,undefined);}
  else {assert.equal(result.itemTooltipRevision,1);assert.equal(result.items[3118].tooltipParserRevision,2);assert.match(result.items[3118].tooltip.description,/600法力/);assert(!hasItemModeTooltip(result.items[3118],game.patch));}
 }
});
