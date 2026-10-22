import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {buildAugmentDescriptions,AUGMENT_TOOLTIP_PARSER_REVISION} from '../services/augments.mjs';
import {pureGameSnapshot,validateGenerationGame} from '../services/data-generation.mjs';
import {collectSnapshot} from '../services/data.mjs';
import {hexAugmentDetail} from '../src/core/hex-augment-detail.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex-augment-details-16.21.json',import.meta.url))),render=()=>buildAugmentDescriptions(fixture.catalog,fixture.bin,fixture.entries);

test('full current source tooltips expose static coefficients without changing the independent summaries',()=>{
 const [bonk,basics,sheen]=render();assert.doesNotMatch(bonk.description,/30%/);assert.equal(bonk.descriptionStatus,'partial');assert.match(bonk.tooltip.description,/30%/);assert.match(bonk.tooltip.description,/适用技能/);assert.match(bonk.tooltip.description,/〔动态数值〕/);assert.deepEqual(bonk.tooltip.unresolved,['SpellName','f1']);assert.equal(bonk.tooltip.status,'partial');
 assert.doesNotMatch(basics.description,/35%|70/);assert.match(basics.tooltip.description,/35%.*70技能急速/);assert.equal(basics.tooltip.status,'complete');assert.equal(basics.descriptionStatus,'complete');assert.deepEqual(basics.unresolved,[]);
 assert.match(sheen.tooltip.description,/4%生命值/);assert.match(sheen.tooltip.description,/3\.5%生命值/);assert.equal(sheen.tooltip.status,'partial');assert.deepEqual(sheen.tooltip.unresolved,['f1','f2']);assert.equal(sheen.descriptionStatus,'complete','Runtime counters do not make the independent summary incomplete');
 for(const row of render()){assert.equal(row.tooltip.revision,1);assert.equal(row.tooltipParserRevision,AUGMENT_TOOLTIP_PARSER_REVISION);assert.equal(row.tooltip.sourceKey,fixture.bin[Object.keys(fixture.bin).find(k=>fixture.bin[k]?.AugmentNameId===row.key)].AugmentTooltipTra);assert.doesNotMatch(row.tooltip.description,/@[^@]+@|<[^>]*>/);}
});

test('missing full text withdraws a previously cached tooltip, and display fallback preserves official correction reviews',()=>{
 const rows=render(),bin=structuredClone(fixture.bin);delete bin[Object.keys(bin).find(k=>bin[k]?.AugmentNameId===rows[0].key)].AugmentTooltipTra;
 const next=buildAugmentDescriptions(rows,bin,fixture.entries);assert.equal(next[0].tooltip,undefined);assert.equal(next[0].tooltipParserRevision,undefined);assert.deepEqual(hexAugmentDetail(next[0]),{description:next[0].description,partial:true});assert.equal(hexAugmentDetail(rows[1]).description,rows[1].tooltip.description);
 const corrected={...rows[0],description:'经官方补丁校正后的当前效果',review:{patch:'16.21'},descriptionStatus:'complete'};assert.deepEqual(hexAugmentDetail(corrected),{description:corrected.description,partial:false});
 const gone=buildAugmentDescriptions(rows,{},fixture.entries);assert(gone.every(row=>!row.tooltip&&!row.tooltipParserRevision&&row.descriptionStatus==='missing'));
 const missingSpell=structuredClone(fixture.bin);delete missingSpell[Object.values(missingSpell).find(a=>a?.AugmentNameId===rows[0].key).RootSpell];assert.equal(buildAugmentDescriptions(rows,missingSpell,fixture.entries)[0].tooltipParserRevision,undefined);
 const counters=structuredClone(fixture.bin),bonk=Object.values(counters).find(a=>a?.AugmentNameId==='Bonk');counters[bonk.RootSpell].mSpell.DataValues.push({name:'f1',values:[999]});const [unknown]=buildAugmentDescriptions(fixture.catalog,counters,fixture.entries);assert(unknown.tooltip.unresolved.includes('f1'));assert.doesNotMatch(unknown.tooltip.description,/999/,'A default source counter cannot stand in for this game');
 counters[bonk.RootSpell].mSpell.DataValues.push({name:'f1.1',values:[999]});const entries={...fixture.entries,[bonk.AugmentTooltipTra.toLowerCase()]:'@f1.1@ / @f1.1*100@ / @f1@'},[formattedCounters]=buildAugmentDescriptions(fixture.catalog,counters,entries);assert.deepEqual(formattedCounters.tooltip.unresolved,['f1.1','f1.1*100','f1']);assert.doesNotMatch(formattedCounters.tooltip.description,/999/,'Formatted or scaled live counters remain unknown even if a default field is present');
});

test('same-version cached collection adds complete detail without refetching every champion and retains old data on failure',async()=>{
 const offline=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),reviewed=JSON.parse(await fs.readFile(new URL('./fixtures/hex-routes-16.21.json',import.meta.url))).game;
 const now=Date.parse('2026-10-22T00:00:00Z'),previous={...offline,...reviewed,contentRevision:10,contentCheckedAt:new Date(now).toISOString(),augments:render().map(({tooltip,...summary})=>summary)},before=JSON.stringify(previous),requested=[];
 const readJSON=async url=>{requested.push(url);if(url.endsWith('/versions.json'))return [previous.version];if(url.includes('/heroList/'))return {hero:[]};if(url.endsWith('/kiwi.bin.json'))return fixture.bin;if(url.endsWith('/lol.stringtable.json'))return {entries:fixture.entries};throw Error('Unexpected collection '+url);};
 const next=await collectSnapshot(()=>{},previous,{readJSON,clock:()=>now});assert.equal(next.contentRevision,14);assert(next.augments.every(a=>a.tooltip?.description&&a.tooltipParserRevision===AUGMENT_TOOLTIP_PARSER_REVISION));assert.equal(requested.length,4);assert.equal(JSON.stringify(previous),before);assert.deepEqual(next.champions,previous.champions);
 requested.length=0;const warm=await collectSnapshot(()=>{},next,{readJSON,clock:()=>now});assert.equal(requested.length,2);assert.deepEqual(warm.augments,next.augments);
 const failed=await collectSnapshot(()=>{},previous,{readJSON:async url=>{if(url.endsWith('/kiwi.bin.json'))throw Error('Unavailable');return readJSON(url);},clock:()=>now});assert.equal(failed.contentRevision,10);assert.deepEqual(failed.augments,previous.augments);assert.equal(JSON.stringify(previous),before);
});

// Both collectors can succeed or fail independently during the same check.
test('detail completion cannot mark failed revision-8 item formulas complete, and item recovery still retries',async()=>{
 const offline=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),items=JSON.parse(await fs.readFile(new URL('./fixtures/item-ap-formulas-16.20.json',import.meta.url))),now=Date.parse('2026-10-22T00:00:00Z');
 const previous={...offline,contentRevision:8,contentCheckedAt:new Date(now).toISOString(),items:Object.fromEntries([2503,3100,3115].map(id=>[id,offline.items[id]])),augments:render().map(({tooltip,...summary})=>summary)},before=JSON.stringify(previous);
 let unavailable=true;const calls=[],readJSON=async url=>{calls.push(url);if(url.endsWith('/versions.json'))return [previous.version];if(url.includes('/heroList/'))return {hero:[]};if(url.endsWith('/items.cdtb.bin.json')){if(unavailable)throw Error('Item source unavailable');return items.items;}if(url.endsWith('/kiwi.bin.json'))return fixture.bin;if(url.endsWith('/lol.stringtable.json'))return {entries:{...items.entries,...fixture.entries}};throw Error('Unexpected source '+url);};
 const partial=await collectSnapshot(()=>{},previous,{readJSON,clock:()=>now});assert.equal(partial.contentRevision,8);assert.deepEqual(partial.items,previous.items);assert(partial.augments.every(a=>a.tooltip?.revision===1));assert.equal(JSON.stringify(previous),before);
 const projected=pureGameSnapshot(partial);const compatible=pureGameSnapshot({...offline,augments:offline.augments.map(a=>({...a,tooltip:{revision:1,description:a.description,status:a.descriptionStatus}}))});validateGenerationGame(compatible);assert(compatible.augments.every(a=>a.tooltip.revision===1));assert.deepEqual(projected.augments,partial.augments,'Signed/manual snapshot projections retain the nested completion marker');
 unavailable=false;calls.length=0;const restored=await collectSnapshot(()=>{},projected,{readJSON,clock:()=>now});assert.equal(restored.contentRevision,14);assert(calls.some(url=>url.endsWith('/items.cdtb.bin.json')));assert(!calls.some(url=>url.endsWith('/kiwi.bin.json')),'Completed detail is not fetched again');assert.match(restored.items[3115].tooltip.description,/15 \+ 15%法术强度/);assert.deepEqual(restored.augments,partial.augments);assert.equal(JSON.stringify(previous),before);
});

test('old parsed tooltips migrate atomically once, retry incomplete sources and preserve future parser records',async()=>{
 const offline=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),now=Date.parse('2026-10-22T00:00:00Z');
 const previous={...offline,contentRevision:13,contentCheckedAt:new Date(now).toISOString(),augments:render().map(a=>({...a,tooltipParserRevision:3}))},before=structuredClone(previous),calls=[];
 let incomplete=true;
 const partialBin=structuredClone(fixture.bin);delete partialBin[Object.values(partialBin).find(a=>a?.__type==='AugmentData').RootSpell];
 const readJSON=async url=>{calls.push(url);if(url.endsWith('/versions.json'))return [previous.version];if(url.includes('/heroList/'))return {hero:[]};if(url.endsWith('/kiwi.bin.json'))return incomplete?partialBin:fixture.bin;if(url.endsWith('/lol.stringtable.json'))return {entries:fixture.entries};throw Error('Unexpected request '+url);};
 const failed=await collectSnapshot(()=>{},previous,{clock:()=>now,readJSON});assert.deepEqual(failed.augments,previous.augments);assert.equal(failed.contentRevision,13);assert.equal(calls.length,4);assert.deepEqual(previous,before);
 incomplete=false;calls.length=0;const migrated=await collectSnapshot(()=>{},failed,{clock:()=>now,readJSON});assert.equal(calls.length,4);assert.equal(migrated.contentRevision,14);assert(migrated.augments.every(a=>a.tooltipParserRevision===AUGMENT_TOOLTIP_PARSER_REVISION));assert.deepEqual(previous,before);
 calls.length=0;const warm=await collectSnapshot(()=>{},pureGameSnapshot(migrated),{clock:()=>now,readJSON});assert.equal(calls.length,2);assert.deepEqual(warm.augments,migrated.augments);assert.deepEqual(Object.keys(pureGameSnapshot(migrated)),Object.keys(pureGameSnapshot(previous)));
 calls.length=0;const future={...migrated,contentRevision:15,augments:migrated.augments.map(a=>({...a,tooltipParserRevision:AUGMENT_TOOLTIP_PARSER_REVISION+1}))},retained=await collectSnapshot(()=>{},future,{clock:()=>now,readJSON});assert.equal(calls.length,2);assert.equal(retained.contentRevision,15);assert.deepEqual(retained.augments,future.augments);
 const mixed=structuredClone(future);mixed.augments[0].tooltip.description+=' newer parser result';delete mixed.augments[1].tooltipParserRevision;const originalMixed=structuredClone(mixed);
 const mixedFailure=await collectSnapshot(()=>{},mixed,{clock:()=>now,readJSON:async url=>url.endsWith('/kiwi.bin.json')?{}:readJSON(url)});assert.deepEqual(mixedFailure.augments,mixed.augments);assert.deepEqual(mixed,originalMixed);
 calls.length=0;const repaired=await collectSnapshot(()=>{},mixed,{clock:()=>now,readJSON});assert.equal(calls.length,4);assert.equal(repaired.contentRevision,15);assert.deepEqual(repaired.augments[0],mixed.augments[0]);assert.equal(repaired.augments[1].tooltipParserRevision,AUGMENT_TOOLTIP_PARSER_REVISION);assert.deepEqual(repaired.augments[2],mixed.augments[2]);assert.deepEqual(mixed,originalMixed);
 calls.length=0;const mixedWarm=await collectSnapshot(()=>{},repaired,{clock:()=>now,readJSON});assert.equal(calls.length,2);assert.deepEqual(mixedWarm.augments,repaired.augments);
});
