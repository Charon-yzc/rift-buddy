import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import {normalizeClientDictionary,installClientDictionary,clientChampion,clientItem,championIcon} from '../src/core/client-dictionary.mjs';
import {liveClientDictionary} from '../services/lcu.mjs';
import {configureAssets,asset,portrait} from '../src/ui.mjs';
import {historyAsset,historyTooltipView} from '../src/match-history-hover.mjs';
import {selectedBuildReference} from '../src/core/build-source.mjs';

const auth={port:23456,password:'isolated-only'};
const champions=[{id:999999,alias:'FutureHero',name:'新英雄',title:'新称号',token:'PRIVATE'}];
const items=[{id:999998,name:'新装备',price:1500,description:'公开效果',iconPath:'/lol-game-data/assets/ASSETS/Items/Icons2D/fixture_item.png',token:'PRIVATE'}];
const reply=(_auth,route)=>Promise.resolve(route.endsWith('items.json')?items:champions);

test('the display dictionary is bounded, deduplicated and cannot supply arbitrary image origins or private fields',()=>{
 const value=normalizeClientDictionary([...champions,...champions,{id:-1},{id:999997,alias:'../../evil',name:'x\nname'}],[...items,...items,{id:999996,name:'unknown',iconPath:'/lol-game-data/assets/ASSETS/Items/Icons2D/../secret.png'},{id:999995,iconPath:'https://evil.invalid/a.png',price:-1}]);
 assert.equal(value.champions.length,2);assert.equal(value.items.length,3);assert.equal(value.champions[1].id,'Champion999997');assert.equal(value.champions[1].name,'xname');
 assert.equal(value.items[1].icon,'');assert.equal(value.items[2].icon,'');assert.equal(value.items[2].gold,undefined);assert.doesNotMatch(JSON.stringify(value),/PRIVATE|token|evil\.invalid|\.\.\//);
 assert.equal(championIcon('Ahri'),'');assert.equal(championIcon(-1),'');assert.equal(normalizeClientDictionary(Array(501).fill(champions[0]),Array(25001).fill(items[0])),null);
});

test('installing public display metadata preserves the signed atlas, known records and its recommendation roster',()=>{
 const data=structuredClone(game),before=JSON.stringify(data),heroArray=data.champions,itemMap=data.items,value=normalizeClientDictionary(champions,items);
 assert.equal(installClientDictionary(data,value),true);assert.equal(installClientDictionary(data,structuredClone(value)),false);
 assert.equal(data.champions,heroArray);assert.equal(data.items,itemMap);assert.equal(data.champions.some(c=>c.key===999999),false);assert.equal(data.items[999998],undefined);
 assert.equal(clientChampion(data,999999).name,'新英雄');assert.equal(clientItem(data,999998).name,'新装备');assert.equal(clientChampion(data,data.champions[0].key),data.champions[0]);
 delete data.clientDictionary;assert.equal(JSON.stringify(data),before);assert.equal(installClientDictionary(data,null),false);
});

test('failed and partial reads retry while concurrent reads coalesce, and complete success has a bounded lifetime',async()=>{
 let time=0,calls=0,fail=true,partial=false;const request=(a,r)=>{calls++;return fail||partial&&r.endsWith('items.json')?Promise.reject(Error('temporary')):reply(a,r);};
 const read=()=>liveClientDictionary(auth,{request,now:()=>time});assert.equal(await read(),null);await read();assert.equal(calls,2);
 time=2001;fail=false;partial=true;const first=await read();assert.equal(first.champions.length,1);assert.equal(first.items.length,0);await read();assert.equal(calls,4);
 time+=5001;partial=false;const result=await Promise.all([read(),read(),read()]);assert.equal(calls,6);assert.equal(result[0],result[1]);assert.equal(result[0].items.length,1);
 time+=300001;await read();assert.equal(calls,8);
});

test('a later client connection revokes a delayed dictionary, and different request implementations never share cached results',async()=>{
 const pending=[];const request=(a,r)=>a.port===auth.port?new Promise(resolve=>pending.push(()=>reply(a,r).then(resolve))):reply(a,r);
 const old=liveClientDictionary(auth,{request});await Promise.resolve();const current=await liveClientDictionary({...auth,port:23457,password:'new-isolated'},{request});
 pending.forEach(resolve=>resolve());assert.equal(await old,null);assert.equal(current.champions[0].name,'新英雄');
 const other=await liveClientDictionary({...auth,port:23457,password:'new-isolated'},{request:()=>Promise.resolve([])});assert.equal(other,null);
});

test('new item icons use the client-provided validated path, unknown entries remain visible, and hero fallbacks use numeric keys',()=>{
 const data={...game,clientDictionary:normalizeClientDictionary(champions,items)};configureAssets(data);
 assert.match(asset('item',999998),/src="https:\/\/raw\.communitydragon\.org\/latest\/plugins\/rcp-be-lol-game-data\/global\/default\/assets\/items\/icons2d\/fixture_item\.png"/);
 assert.match(portrait(clientChampion(data,999999)),/src="https:\/\/raw\.communitydragon\.org[^" ]+\/999999\.png"/);
 assert.match(historyAsset(data,'item',999998),/fixture_item\.png/);assert.match(historyTooltipView(data,{kind:'item',id:999998}),/新装备|公开效果/);assert.match(historyTooltipView(data,{kind:'item',id:999998}),/客户端公开资料/);
 assert.match(historyAsset(data,'item',999997),/>999997<\/span>/);assert.doesNotMatch(historyAsset(data,'item',999997),/icons2d\/999997\.png/);configureAssets(game);
});

test('compound schema keys still obey region, tier, patch and unscoped-source selection',()=>{
 const ref=(region,tier,patch)=>({champion:'Ahri',role:'mid',region,tier,patch});const good=ref('global','emerald_plus',game.patch);
 const data={patch:game.patch,buildSource:{region:'global',tier:'emerald_plus'},builds:{'Ahri:mid:kr:diamond_plus:99.1':ref('kr','diamond_plus','99.1'),['Ahri:mid:global:diamond_plus:'+game.patch]:ref('global','diamond_plus',game.patch)},buildSources:{good}};
 assert.equal(selectedBuildReference(data,'Ahri','mid'),good);data.buildSources={};assert.equal(selectedBuildReference(data,'Ahri','mid'),undefined);
 data.builds={['Ahri:mid:global:emerald_plus:'+game.patch]:good};assert.equal(selectedBuildReference(data,'Ahri','mid'),good);
 data.builds={future:ref('global','emerald_plus','99.1'),opponent:{...good,scope:'opponent',opponent:'Lux'}};assert.equal(selectedBuildReference(data,'Ahri','mid'),undefined);
});
