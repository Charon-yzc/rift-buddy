import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {buildAugmentDescriptions,fieldHash} from '../services/augments.mjs';
import {buildAugmentCounterBasis} from '../services/augment-counter-source.mjs';
import {validAugmentCounterBasis} from '../src/core/augment-counter-basis.mjs';
import {communityHexAugmentFingerprint} from '../src/core/community-augment-review.mjs';
import {collectSnapshot} from '../services/data.mjs';
import {pureGameSnapshot,validateGenerationGame} from '../services/data-generation.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/augment-buff-counter-16.21.json',import.meta.url))),game=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),source=()=>structuredClone(fixture),render=f=>buildAugmentDescriptions(f.catalog,f.bin,f.entries)[0],spell=f=>Object.values(f.bin).find(v=>v.mSpell).mSpell,basis=f=>render(f).tooltipCounterBasis;

test('Kiwi named buff counter records static 60 plus 3 per opaque stack without resolving the live value or using Arena overrides',()=>{
 const f=source(),before=structuredClone(f),row=render(f),{tooltipCounterBasis,...original}=row;assert.deepEqual(original,f.catalog[0]);assert.deepEqual(f,before);assert(validAugmentCounterBasis(row));assert.equal(row.tooltip.status,'partial');assert.match(row.tooltip.description,/当前技能急速：〔动态数值〕/);assert.deepEqual(row.tooltip.unresolved,['CurrentHaste']);assert.deepEqual(tooltipCounterBasis.entries,[{token:'CurrentHaste',calculationKey:fieldHash('CurrentHaste'),kind:'linear-buff-counter',constant:60,terms:[{buff:'{95ab772f}',coefficient:3}],calculationHash:'0299ecadf2eecf0f'}]);
 assert.equal(communityHexAugmentFingerprint(row,game,'complete'),null);assert.equal(communityHexAugmentFingerprint(row,game,'dynamic-counters'),null);assert.match(communityHexAugmentFingerprint(row,game,'buff-counter'),/^[a-f0-9]{16}$/);
});

test('source aliases are order-independent, preserve raw sequences and never revive conflicting values or calculations',()=>{
 const f=source(),s=spell(f),haste=s.DataValues[0],hash=fieldHash(haste.name);s.DataValues.push({...structuredClone(haste),name:hash.toUpperCase()});assert.equal(basis(f).entries.length,1);
 const good=source();spell(good).mSpellCalculations[fieldHash('CurrentHaste')]=structuredClone(spell(good).mSpellCalculations.CurrentHaste);assert.equal(basis(good).entries.length,1);
 for(const reverse of [false,true])for(const mutate of [
  s=>s.DataValues.push({...structuredClone(s.DataValues[0]),name:hash,values:[4,4,4,4,4,4,4]}),
  s=>s.DataValues.push({...structuredClone(s.DataValues[0]),name:hash,values:[3]}),
  s=>s.DataValues[0].values=[3,3,3,3,3,3,3.00000001],
  s=>s.mSpellCalculations[fieldHash('CurrentHaste')]={...structuredClone(s.mSpellCalculations.CurrentHaste),mExpandedTooltipCalculationDisplay:4},
 ]){const f=source(),s=spell(f);mutate(s);if(reverse){s.DataValues.reverse();s.mSpellCalculations=Object.fromEntries(Object.entries(s.mSpellCalculations).reverse());}assert.deepEqual(basis(f).entries,[]);}
 const conflict=source(),cs=spell(conflict);cs.DataValues.push({...structuredClone(cs.DataValues[0]),name:hash,values:[4]},{...structuredClone(cs.DataValues[0])});assert.deepEqual(basis(conflict).entries,[]);
});

test('unknown calculation shapes, modes, missing numeric fields and bounds remain unsupported rather than becoming valid counters',()=>{
 const mutations=[
  s=>s.mSpellCalculations.CurrentHaste.mMultiplier={__type:'NumberCalculationPart',mNumber:2},
  s=>s.mSpellCalculations.CurrentHaste.mDisplayAsPercent=true,
  s=>s.mSpellCalculations.CurrentHaste.mRangedMultiplier={__type:'NumberCalculationPart',mNumber:2},
  s=>s.mSpellCalculations.CurrentHaste.__type='GameCalculationModified',
  s=>s.mSpellCalculations.CurrentHaste.mFormulaParts.push({__type:'NumberCalculationPart'}),
  s=>s.mSpellCalculations.CurrentHaste.mFormulaParts.push({__type:'NumberCalculationPart',mNumber:Infinity}),
  s=>s.mSpellCalculations.CurrentHaste.mFormulaParts.push({__type:'NumberCalculationPart',mNumber:1e10}),
  s=>s.mSpellCalculations.CurrentHaste.mFormulaParts[0].mCondition=true,
  s=>s.mSpellCalculations.CurrentHaste.mFormulaParts[0].mBuffName='',
  s=>s.mSpellCalculations.CurrentHaste.mFormulaParts.push(structuredClone(s.mSpellCalculations.CurrentHaste.mFormulaParts[0])),
  s=>s.mSpellCalculations.CurrentHaste.mFormulaParts.shift(),
  s=>s.mSpellCalculations.CurrentHaste.mFormulaParts=[{__type:'SumOfSubPartsCalculationPart',mSubparts:s.mSpellCalculations.CurrentHaste.mFormulaParts}],
  s=>s.DataValuesModeOverride.kiwi=s.DataValuesModeOverride.cherry,
  s=>s.DataValuesModeOverride.unknown=s.DataValuesModeOverride.cherry,
  s=>s.DataValuesModeOverride.cherry.SpellDataValues[0].extra=true,
  s=>s.DataValues[0].__type='Unknown',s=>s.DataValues[0].values=[],
 ];
 for(const mutate of mutations){const f=source();mutate(spell(f));assert.deepEqual(basis(f).entries,[]);}
 const explicit=source(),s=spell(explicit);s.mSpellCalculations.CurrentHaste.mFormulaParts[1]={__type:'NumberCalculationPart',mNumber:0};assert.equal(basis(explicit).entries[0].constant,0);s.mSpellCalculations.CurrentHaste.mFormulaParts[0].mDataValue='Missing';assert.deepEqual(basis(explicit).entries,[]);
});

test('scoped review binds the counter structure and full source while malformed or stale metadata cannot authorize it',()=>{
 const row=render(source()),approved=communityHexAugmentFingerprint(row,game,'buff-counter');assert(approved);
 for(const mutate of [a=>delete a.tooltipCounterBasis,a=>a.tooltipCounterBasis.revision++,a=>a.tooltipCounterBasis.mode='cherry',a=>a.tooltipCounterBasis.augmentKey='Other',a=>a.tooltipCounterBasis.effectSourceHash='0'.repeat(64),a=>a.tooltipCounterBasis.extra=true,a=>a.tooltipCounterBasis.entries[0].token='Unknown',a=>a.tooltipCounterBasis.entries[0].calculationKey=fieldHash('Unknown'),a=>a.tooltipCounterBasis.entries[0].terms[0].buff='',a=>a.tooltipCounterBasis.entries[0].constant=NaN,a=>a.tooltipCounterBasis.entries.push(structuredClone(a.tooltipCounterBasis.entries[0])),a=>a.tooltip.unresolved.push('Another')]){const bad=structuredClone(row);mutate(bad);assert.equal(communityHexAugmentFingerprint(bad,game,'buff-counter'),null);}
 for(const mutate of [a=>a.tooltipCounterBasis.entries[0].terms[0].coefficient=4,a=>a.tooltipCounterBasis.entries[0].constant=20,a=>a.tooltipCounterBasis.entries[0].terms[0].buff='{00000000}',a=>a.tooltipCounterBasis.entries[0].calculationHash='0'.repeat(16),a=>a.effectSourceHash=a.tooltipCounterBasis.effectSourceHash='0'.repeat(64)]){const changed=structuredClone(row);mutate(changed);assert.notEqual(communityHexAugmentFingerprint(changed,game,'buff-counter'),approved);}
 const f=source();f.catalog=[row];assert.equal(buildAugmentDescriptions(f.catalog,{},f.entries)[0].tooltipCounterBasis,undefined);delete f.bin[Object.values(f.bin).find(v=>v.RootSpell).RootSpell];assert.equal(render(f).tooltipCounterBasis,undefined);
 const unsupported=source();spell(unsupported).mSpellCalculations.CurrentHaste.mMultiplier={__type:'NumberCalculationPart',mNumber:2};const next=render(unsupported);assert(validAugmentCounterBasis(next),'An empty result records completed classification, not an approval');assert.equal(communityHexAugmentFingerprint(next,game,'buff-counter'),null);
});

test('same-patch parser-5 cache completes counters atomically once, retries failure and preserves future records after snapshot round trip',async()=>{
 const now=Date.parse('2026-10-25T02:19:14Z'),previous={...structuredClone(game),contentRevision:17,contentCheckedAt:new Date(now).toISOString(),augments:[...fixture.catalog]},before=structuredClone(previous),calls=[];let partial=true;
 const readJSON=async url=>{calls.push(url);if(url.endsWith('/versions.json'))return [previous.version];if(url.includes('/heroList/'))return {hero:[]};if(url.endsWith('/kiwi.bin.json'))return partial?{}:fixture.bin;if(url.endsWith('/lol.stringtable.json'))return {entries:fixture.entries};throw Error('Unexpected request '+url);};
 const failed=await collectSnapshot(()=>{},previous,{clock:()=>now,readJSON});assert.deepEqual(failed.augments,previous.augments);assert.equal(failed.contentRevision,17);assert.equal(calls.length,4);assert.deepEqual(previous,before);
 const incomplete=source();spell(incomplete).DataValues=spell(incomplete).DataValues.filter(v=>v.name!=='StartingHaste');const degraded=await collectSnapshot(()=>{},previous,{clock:()=>now,readJSON:async url=>url.endsWith('/kiwi.bin.json')?incomplete.bin:readJSON(url)});assert.deepEqual(degraded.augments,previous.augments);assert.equal(degraded.contentRevision,17,'HTTP success with a missing static value cannot complete migration');
 partial=false;calls.length=0;const migrated=await collectSnapshot(()=>{},failed,{clock:()=>now,readJSON});assert.equal(calls.length,4);assert.equal(migrated.contentRevision,18);assert(migrated.augments.every(validAugmentCounterBasis));assert.deepEqual(previous,before);
 const restarted=JSON.parse(JSON.stringify(pureGameSnapshot(migrated)));validateGenerationGame(restarted);assert.deepEqual(restarted.augments,migrated.augments);calls.length=0;const warm=await collectSnapshot(()=>{},restarted,{clock:()=>now,readJSON});assert.equal(calls.length,2);assert.deepEqual(warm.augments,migrated.augments);
 const future=structuredClone(restarted);future.contentRevision=19;future.augments.push({...structuredClone(future.augments[0]),id:99991,key:'Future',tooltipCounterBasis:{revision:2,future:'preserve'}});future.augments.push({...structuredClone(future.augments[0]),id:99992,key:'FutureParser',tooltipParserRevision:6});delete future.augments[0].tooltipCounterBasis;calls.length=0;const repaired=await collectSnapshot(()=>{},future,{clock:()=>now,readJSON});assert.equal(calls.length,4);assert.equal(repaired.contentRevision,19);assert.deepEqual(repaired.augments.slice(1),future.augments.slice(1));assert(validAugmentCounterBasis(repaired.augments[0]));
});
