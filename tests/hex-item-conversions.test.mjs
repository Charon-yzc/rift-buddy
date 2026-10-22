import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {buildAugmentDescriptions} from '../services/augments.mjs';
import {hexItemConversions} from '../src/core/hex-item-conversions.mjs';
import {hexItemSynergies} from '../src/core/hex-item-synergies.mjs';
import {hexMechanismMicroRoutes,rankHexMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {renderHexRoutes} from '../src/hex-routes-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex-item-conversions-16.21.json',import.meta.url)));
const run=extra=>hexItemConversions({data,hero:'Elise',owned:[1205],preparedItems:[1036],...extra}),item=row=>row.gear.flatMap(g=>g.items)[0];

test('four source-bound conversions show a single item input and output, never duplicate the old stat or independent bonuses',()=>{
 const cases=[[1205,1036,10,16.67,'法术强度'],[1205,3078,36,60,'法术强度'],[1205,3031,75,125,'法术强度'],[3063,3116,400,20,'穿甲'],[3059,3803,375,30,'法术强度'],[3058,1036,10,17.5,'攻击速度']];
 for(const [id,gear,input,output,stat]of cases){const [row]=run({owned:[id],preparedItems:[gear]});assert(row);assert.deepEqual(item(row).conversion,{input,output,inputStat:id===3063?'装备生命值':id===3059?'装备法力值':'装备攻击力',outputStat:stat,unit:id===3058?'%':'',basis:'catalogue-example'});assert.match(item(row).brief,/图鉴基础项示例.*原属性转出，非本局增量/);assert.match(row.basis,/未核对本模式装备修正/);assert.equal(row.equipmentState,'prepared');assert.match(row.gear[0].when,/若购买/);assert.equal(row.heroReviewed,undefined);assert.equal(row.priority,undefined);}
 const d=structuredClone(data);d.items[3031].stats.FlatPhysicalDamageMod=80;const [tickle]=run({data:d,owned:[3058],preparedItems:[3031]});assert.equal(item(tickle).conversion.output,140);assert.notEqual(item(tickle).conversion.output,144);assert.match(tickle.caution,/1\.75%.*1\.8%为舍入/);
});

test('conversion facts work across all current heroes without certifying their skills or mutating settings and data',()=>{
 const before=JSON.stringify(data);for(const hero of data.champions){for(const [id,gear]of [[1205,1036],[3063,3116],[3059,3803],[3058,1036]]){const [row]=run({hero:hero.id,owned:[id],preparedItems:[gear]});assert(row,hero.id+':'+id);assert.match(row.basis,/不代表英雄适配/);}}
 assert.equal(JSON.stringify(data),before);assert.deepEqual(run({hero:'Unknown'}),[]);
});

test('read complete matching inventory separately from plans; duplicate copies are still per-item examples',()=>{
 const inventory=[{id:1036,count:2},{id:3078,count:1}],preparedItems=[1036,'1036',{id:1036},3031],before=JSON.stringify({inventory,preparedItems});
 const [row]=run({inventory,preparedItems,inventoryKnown:true});assert.equal(row.equipmentState,'mixed');assert.deepEqual(row.gear[0].items.map(i=>i.id),[1036,3078]);assert.deepEqual(row.gear[1].items.map(i=>i.id),[3031]);assert.equal(item(row).conversion.output,16.67,'Two long swords are not a 33.33 total claim');
 assert.equal(run({inventory,inventoryKnown:false})[0].equipmentState,'prepared');assert.deepEqual(run({inventory,inventoryKnown:false,preparedItems:[]}),[]);assert.deepEqual(run({inventory:[{id:1036,count:0}],inventoryKnown:true,preparedItems:[]}),[]);assert.equal(JSON.stringify({inventory,preparedItems}),before);
 const [offered]=run({owned:[],options:[1205]});assert.equal(offered.state,'offered');assert.match(item(offered).brief,/若选择/);assert.deepEqual(run({owned:[],options:[1002,1996,1129,1205]}),[]);
});

test('version, source, raw coefficient, text and explicit stat boundaries withdraw only unsupported facts',()=>{
 for(const mutate of [d=>d.patch='16.22',d=>d.version='16.20.1',d=>d.augmentError='Incomplete',d=>d.augmentVersion='16.20.1',d=>d.sources.items='https://example.invalid/items',d=>d.sources.augmentDescriptions='https://example.invalid/augments',d=>delete d.augments.find(a=>a.id===1205).effectSourceHash,d=>d.augments.find(a=>a.id===1205).effectSourceHash='0'.repeat(64),d=>d.augments.find(a=>a.id===1205).description+=' drift',d=>d.augments.find(a=>a.id===1205).tooltip.description+=' drift',d=>d.items[1036].maps['12']=false,d=>d.items[1036].inStore=false,d=>d.items[1036].gold.purchasable=false,d=>d.items[1036].stats.FlatPhysicalDamageMod='10',d=>d.items[1036].stats.FlatPhysicalDamageMod=NaN,d=>d.items[1036].stats.FlatPhysicalDamageMod=100001]){const d=structuredClone(data);mutate(d);assert.deepEqual(run({data:d}),[]);}
 assert.deepEqual(run({mode:'rift'}),[]);const d=structuredClone(data);d.items[1036].stats.FlatPhysicalDamageMod=12;assert.equal(item(run({data:d})[0]).conversion.output,20,'A new explicit stat remains a current-source numeric input, not a frozen authored item effect');
 const disabled=structuredClone(data);disabled.augments.find(a=>a.id===1205).catalogEnabled=false;assert(run({data:disabled})[0].catalogDisabled);assert.deepEqual(run({data:disabled,owned:[],options:[1205]}),[]);
});

test('another conversion stops numeric composition, even when the other effect has no supported calculator',()=>{
 const both=run({owned:[1205,3058],preparedItems:[1036]});assert.equal(both.length,2);assert(both.every(r=>item(r).conversion===null));assert(both.every(r=>/暂停单件换算/.test(r.play[0])));
 assert.equal(item(run({owned:[1205,1206]})[0]).conversion,null);assert(item(run({owned:[1205,1002]})[0]).conversion);
 const marks=[...data.augments.filter(a=>![1002,1205,1206,3058,3059,3063].includes(a.id)&&!/转化为|转为|转换为/.test(a.description.replace(/\s+/g,''))).slice(0,31).map(a=>a.id),1205];assert.equal(run({owned:marks}).length,1);assert.deepEqual(run({owned:[...marks.slice(0,31),1002,1205]}),[]);
});

test('raw source hash changes even if a coefficient drift rounds to the same visible card value',()=>{
 const before=structuredClone(fixture),initial=buildAugmentDescriptions(fixture.catalog,fixture.bin,fixture.entries);for(const row of initial){const bundled=data.augments.find(a=>a.id===row.id);assert.deepEqual(row.tooltip,bundled.tooltip);assert.equal(row.effectSourceHash,bundled.effectSourceHash);assert.match(row.effectSourceHash,/^[a-f0-9]{64}$/);assert.equal(row.tooltip.status,'partial');}
 const raw=structuredClone(fixture.bin),a=Object.values(raw).find(a=>a?.AugmentNameId==='TickleMonster'),value=raw[a.RootSpell].mSpell.DataValues.find(v=>v.name==='CalcASVal');value.values=value.values.map(()=>.0176);const changed=buildAugmentDescriptions(fixture.catalog,raw,fixture.entries).find(a=>a.id===3058),old=initial.find(a=>a.id===3058);assert.equal(changed.tooltip.description,old.tooltip.description);assert.notEqual(changed.effectSourceHash,old.effectSourceHash);const d=structuredClone(data);d.augments=d.augments.map(a=>a.id===3058?{...a,...changed}:a);assert.deepEqual(run({data:d,owned:[3058]}),[]);assert.deepEqual(fixture,before);
 const missing=structuredClone(fixture.bin);delete missing[a.RootSpell];const withdrawn=buildAugmentDescriptions(initial,missing,fixture.entries).find(a=>a.id===3058);assert.equal(withdrawn.effectSourceHash,undefined);
});

test('full guide projection and existing micro rows carry each item conversion with no added always-visible copy',()=>{
 const [route]=hexItemSynergies({data,hero:'Elise',owned:[1205],preparedItems:[1036]});assert(route.conversion);const [micro]=hexMechanismMicroRoutes([route]);assert(micro.conversion);assert.match(micro.items[0].brief,/当前方案.*图鉴.*约16\.67法术强度.*非本局增量/);assert.equal(micro.items[0].core,false);
 assert.equal(route.id,'Elise-item-1205');const html=renderHexRoutes([route],{guide:true,image:()=>''});assert.match(html,/已选强化 · 属性转换/);assert.match(html,/data-action="hex-source" data-id="Elise-item-1205"/);assert.match(html,/每件基础属性与条件/);assert.match(html,/图鉴基础项示例：10攻击力→约16\.67法术强度/);
 const ordinary={...micro,id:'ordinary',conversion:undefined};assert.equal(rankHexMicroRoutes([ordinary,micro],{owned:[1205]})[0].id,micro.id);assert.deepEqual(hexItemSynergies({data,hero:'Elise',owned:[],preparedItems:[1036]}),[]);
});
