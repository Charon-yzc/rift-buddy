import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getBuild} from '../src/core/builds.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {createItemSet,validateItemSet} from '../src/core/item-sets.mjs';
import {itemSetControls} from '../src/item-sets-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;data.hexBuilds=JSON.parse(await fs.readFile('data/hex-builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id),build=s=>getBuild(hero(s.id),s.role,data,s),make=s=>createItemSet(hero(s.id),build(s),data);

test('shop set follows independent selected starter, footwear, core and late equipment; quantities and alternatives stay distinct',()=>{
 let s={id:'Volibear',role:'top',mode:'rift'},b=build(s);
 s=changeCompanionPlan(data,s,'start',b.startOptions.find(o=>o.ids.includes(1054)).id);s=changeCompanionPlan(data,s,'boots',b.bootsOptions.find(o=>o.ids.includes(3158)).id);s=changeCompanionPlan(data,s,'core','1');b=build(s);
 const later=b.laterOptions.find(o=>o.fitsRoute)?.items[0].id;assert.ok(later);s=changeCompanionPlan(data,s,'later',String(later));b=build(s);
 const set=createItemSet(hero(s.id),b,data);assert.deepEqual(set.associatedChampions,[106]);assert.deepEqual(set.associatedMaps,[11]);assert.equal(set.uid,'rift-buddy-106-top-rift');
 assert.deepEqual(set.blocks.find(g=>g.type.startsWith('出门')).items,[{id:'1054',count:1},{id:'2003',count:1}]);assert.deepEqual(set.blocks.find(g=>g.type.startsWith('鞋子')).items,[{id:'3158',count:1}]);
 assert.ok(set.blocks.find(g=>g.type.startsWith('后期计划')).items.some(i=>i.id===String(later)));assert.ok(!set.blocks.find(g=>g.type.startsWith('后期备选'))?.items.some(i=>i.id===String(later)));
 const expected=b.items.filter(i=>!i.tags.includes('Boots')&&!b.selectedLaterIds.includes(Number(i.id))).map(i=>String(i.purchaseBase?.id||i.id));assert.deepEqual(set.blocks.find(g=>g.type.startsWith('当前核心')).items.map(i=>i.id),expected);
 const duplicated=createItemSet(hero(s.id),{...b,start:[data.items[2003],data.items[2003]]},data);assert.deepEqual(duplicated.blocks[0].items,[{id:'2003',count:2}]);
 assert.equal(make({...s,role:'jungle'}).uid,'rift-buddy-106-jungle-rift');
});

test('upgrades use purchasable bases, grants stay out and older sources remain visibly labelled',()=>{
 const b=build({id:'Volibear',role:'mid',mode:'rift'}),upgraded={...b,items:[data.items[3174],data.items[3040]]};assert.equal(data.items[3174].from[0],'3047');
 const set=createItemSet(hero('Volibear'),upgraded,data);assert.ok(set.blocks.some(g=>g.items.some(i=>i.id==='3047')));assert.ok(set.blocks.every(g=>g.items.every(i=>i.id!=='3174')));
 assert.ok(set.blocks.some(g=>g.items.some(i=>i.id==='3003')));assert.ok(set.blocks.every(g=>g.items.every(i=>i.id!=='3040')));
 const support=make({id:'Nautilus',role:'support',mode:'rift'});assert.ok(support.blocks.every(g=>g.items.every(i=>i.id!=='3865')));
 const old=createItemSet(hero('Volibear'),{...b,referenceStale:true},data);assert.ok(old.title.endsWith(b.rulesPatch+' 旧版本参考'));assert.equal(old.uid,set.uid);
 const paused={...b,unavailableLaterOptions:[{id:999999,name:'已移除'}],selectedLaterIds:[]};assert.ok(createItemSet(hero('Volibear'),paused,data).blocks.every(g=>g.items.every(i=>i.id!=='999999')));
});

test('schema rejects path injection, other heroes, unavailable/map-limited items and invalid quantities, and removes unsupported fields',()=>{
 const set=make({id:'Volibear',role:'top',mode:'rift'}),bad=change=>({...structuredClone(set),...change});
 assert.throws(()=>validateItemSet(bad({uid:'../../settings'}),data),/格式/);assert.throws(()=>validateItemSet(bad({associatedChampions:[1]}),data),/格式/);assert.throws(()=>validateItemSet(bad({associatedMaps:[12]}),data),/格式/);
 const group=item=>bad({blocks:[{type:'test',items:[item]}]});
 for(const item of [{id:'2003',count:0},{id:'2003',count:6},{id:'../2003',count:1},{id:'999999',count:1},{id:'3865',count:1},{id:'3174',count:1},{id:'3040',count:1}])assert.throws(()=>validateItemSet(group(item),data),/不能购买/);
 assert.throws(()=>validateItemSet(bad({blocks:[{type:'test',items:[{id:'2003',count:1},{id:'2003',count:1}]}]}),data),/不能购买/);
 const notRift=Object.values(data.items).find(i=>i.inStore&&i.gold.purchasable!==false&&i.maps[12]&&!i.maps[11]&&!i.requiredChampion&&!i.requiredAlly);assert.ok(notRift);assert.throws(()=>validateItemSet(group({id:String(notRift.id),count:1}),data),/不能购买/);
 const result=validateItemSet(bad({filePath:'C:/Windows/anything',preferredItemSlots:[{anything:true}]}),data);assert.equal(result.filePath,undefined);assert.deepEqual(result.preferredItemSlots,[]);
});

test('all currently exposed role and Hex plans produce legal hero/map-scoped shop sets',()=>{
 for(const ref of Object.values(data.builds)){const set=make({id:ref.champion,role:ref.role,mode:'rift'});assert.ok(set.blocks.length);assert.ok(set.blocks.every(g=>g.items.every(i=>data.items[i.id].maps[11]&&data.items[i.id].inStore)));}
 for(const ref of Object.values(data.hexBuilds)){const set=make({id:ref.champion,role:'bottom',mode:'hex'});assert.deepEqual(set.associatedMaps,[12]);assert.match(set.uid,/-hex$/);}
});

test('equipment actions show persistent errors and export instructions scoped to the exact visible plan',()=>{
 const s={id:'Volibear',role:'top',mode:'rift'},b=build(s),statuses=new Map([[JSON.stringify(createItemSet(hero(s.id),b,data)),{text:'写入失败，请导出',error:true}]]);
 const html=itemSetControls(hero(s.id),b,data,{view:'companion',statuses});assert.match(html,/data-action="import-item-set"/);assert.match(html,/data-action="export-item-set"/);assert.match(html,/data-itemset-view="companion"/);assert.match(html,/写入失败，请导出/);assert.match(html,/藏品 → 装备/);
 assert.doesNotMatch(itemSetControls(hero(s.id),{...b,role:'jungle'},data,{statuses}),/写入失败，请导出/);
});

test('permission failure has an explicit authorization/import action; ordinary failure does not request elevation',()=>{
 const s={id:'Volibear',role:'top',mode:'rift'},b=build(s),key=JSON.stringify(createItemSet(hero(s.id),b,data)),statuses=new Map([[key,{text:'写入被拒绝，请点击连接授权',error:true,needsAuthorization:true}]]);
 assert.match(itemSetControls(hero(s.id),b,data,{statuses}),/data-action="authorize-item-set"/);statuses.set(key,{text:'未发现客户端',error:true});assert.doesNotMatch(itemSetControls(hero(s.id),b,data,{statuses}),/data-action="authorize-item-set"/);
});
