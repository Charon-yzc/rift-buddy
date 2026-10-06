import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {decodeHydration,itemRows,separateComponents,resolveReferences} from '../services/source-parser.mjs';
import {parseBuildPage,parseBuildJSON,BUILD_PARSER_VERSION} from '../services/build-sources.mjs';
import {parseHexBuildPage} from '../services/hex-sources.mjs';
import {validHexReference,getBuild} from '../src/core/builds.mjs';
import {RUNE_PLANS} from '../src/core/loadouts.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const item=(id,quantity=1)=>['$','$1',`${id}-0`,{children:[{metaType:'item',metaId:id},{className:'absolute bottom-0 right-0',children:quantity}]}];
const row=(name,items)=>['$','tr',name,{children:[...items,['$','strong',null,{children:'40%'}],['$','span',null,{children:['2,345',' ','Games']}]]}];
const hydration=values=>`<script>self.__next_f.push([1,${JSON.stringify(Object.entries(values).map(([key,value])=>`${key}:${JSON.stringify(value)}`).join('\n'))}])</script>`;
test('later item table keeps inline game counts and never calls win rate popularity',()=>{
 const value=['$','tr','depth_4_item_0',{children:[{metaType:'item',metaId:3075},['$','strong',null,{children:'55.68%'}],['$','span',null,{children:'731 Games'}]]}];
 const {nodes,refs}=decodeHydration(hydration({1:value}));
 assert.deepEqual(itemRows(nodes,refs,'depth_4_item_'),[{items:[3075],samples:731,pickRate:null,winRate:55.68}]);
});
test('structured source expands unique cores, complete runes and partial skill sequences with honest denominators',()=>{
 const champion=data.champions.find(c=>c.id==='Ashe'),leaf=(page,play)=>({primary_page_id:page.primaryStyleId,secondary_page_id:page.subStyleId,primary_rune_ids:page.selectedPerkIds.slice(0,4),secondary_rune_ids:page.selectedPerkIds.slice(4,6),stat_mod_ids:page.selectedPerkIds.slice(6),play,win:Math.floor(play/2),pick_rate:.9});
 const source={summary:{id:22,positions:[{name:'ADC'}]},core_items:[{ids:[6672,3031,3046],play:1000,win:510,pick_rate:.4},{ids:[3070,3042,3142,3814],play:800,win:410,pick_rate:.3}],boots:[],starter_items:[],last_items:[{ids:[3075],play:731,win:407,pick_rate:.1}],rune_pages:[{builds:[leaf(RUNE_PLANS.lethal.page,200),leaf(RUNE_PLANS.press.page,100),leaf(RUNE_PLANS.lethal.page,200)]}],runes:[{...leaf(RUNE_PLANS.lethal.page,200),pick_rate:.2}],skills:[{order:['W','Q','E','W','W','R'],play:100,win:50}],summoner_spells:[]};
 const raw={meta:{version:data.patch},data:source},options={champion,role:'bottom',data,url:'https://op.gg/lol/champions/ashe/build'};
 const ref=parseBuildJSON(raw,options);assert.equal(ref.core.length,2);assert.deepEqual(ref.core[1].early,[3070]);assert.equal(ref.runeOptions.length,2);assert.equal(ref.runeOptions[0].pickRate,20);assert.equal(ref.runeOptions[1].pickRate,null);assert.equal(ref.laterBasis,'all-orders');assert.equal(ref.later[0][0].samples,731);assert.equal(ref.skillOptions[0].order,'WQEWWR');
 assert.throws(()=>parseBuildJSON({...raw,meta:{version:'16.18'}},options),/版本/);assert.throws(()=>parseBuildJSON(raw,{...options,role:'support'}),/英雄和位置/);
 assert.throws(()=>parseBuildJSON({...raw,data:{...source,rune_pages:[]}},options),/完整/);
});
test('source reader resolves deferred item rows and preserves quantities and samples',()=>{
 const html=hydration({'1':row('starter_items_0',['$L2','$3']),2:item(2003,2),3:item(1056)});
 const {nodes,refs}=decodeHydration(html);const result=itemRows(nodes,refs,'starter_items_');
 assert.deepEqual(result,[{items:[2003,2003,1056],samples:2345,pickRate:40,winRate:null}]);
});
test('source references cannot execute strings or recurse forever',()=>{
 const refs=new Map([['1',{next:'$2'}],['2',{next:'$1'}]]);
 const resolved=resolveReferences('$1',refs);assert.equal(typeof resolved.next.next,'string');
 assert.equal(resolveReferences('$1:__proto__',refs),null);
 assert.throws(()=>decodeHydration('<script>alert(1)</script>'),/格式/);
});
test('component and transformation paths are separated from the three core items',()=>{
 const result=separateComponents({items:[3070,3004,3078,6694],samples:1},data);
 assert.deepEqual(result.items,[3004,3078,6694]);assert.deepEqual(result.early,[3070]);
 const seraph=separateComponents({items:[3070,3040,3118,3089]},data);assert.deepEqual(seraph.early,[3070]);
});
test('rift parser rejects another champion, another role or another patch',()=>{
 const champion=data.champions.find(c=>c.id==='Ashe');
 const make=context=>hydration({1:context});
 assert.throws(()=>parseBuildPage(make({championId:champion.key,position:'support',patch:data.patch,type:'ranked'}),{champion,role:'bottom',data,url:'https://op.gg'}),/英雄和位置/);
 assert.throws(()=>parseBuildPage(make({championId:champion.key,position:'adc',patch:'16.18',type:'ranked'}),{champion,role:'bottom',data,url:'https://op.gg'}),/版本/);
});
test('rift parser keeps distinct full rune choices, orders samples and drops invalid duplicates',()=>{
 const champion=data.champions.find(c=>c.id==='Ashe');
 const html=hydration({1:{championId:champion.key,position:'adc',patch:data.patch,type:'ranked',region:'global',tier:'emerald_plus'},
  2:{rune_pages:[{play:90,importClientData:RUNE_PLANS.press.page},{play:400,importClientData:RUNE_PLANS.lethal.page},{play:80,importClientData:RUNE_PLANS.press.page},{play:9999,importClientData:{...RUNE_PLANS.press.page,selectedPerkIds:[0]}}]},
  3:row('core_items_0',[item(6672),item(3031),item(3046)])});
 const ref=parseBuildPage(html,{champion,role:'bottom',data,url:'https://op.gg/lol/champions/ashe/build'});
 assert.equal(ref.parserVersion,BUILD_PARSER_VERSION);assert.equal(ref.runeOptions.length,2);assert.deepEqual(ref.runeOptions.map(o=>o.familySamples),[400,90]);assert.ok(ref.runeOptions.every(o=>o.samples===0&&o.sampleScope==='family'));assert.deepEqual(ref.runePage,ref.runeOptions[0].page);
});
test('hex parser never accepts the ordinary ARAM or Arena page',()=>{
 const champion=data.champions.find(c=>c.id==='Ashe');
 for(const mode of ['aram','arena','aram-mayhem-classic'])assert.throws(()=>parseHexBuildPage(`<link rel="canonical" href="https://op.gg/lol/modes/${mode}/ashe/build"/>`,{champion,data,url:'https://op.gg'}),/海克斯大乱斗/);
});
test('cached hex data is mode-specific and cannot supply a regular rune page',async()=>{
 const cache=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url),'utf8')).entries;
 for(const [id,ref] of Object.entries(cache)){const champion=data.champions.find(c=>c.id===id);assert.ok(validHexReference(ref,champion,data),id);}
 const build=getBuild(data.champions.find(c=>c.id==='Ashe'),'bottom',{...data,hexBuilds:cache},{mode:'hex'});
 assert.ok(build.reference);assert.equal(build.runePage,null);assert.ok(build.items.every(i=>i.maps['12']));assert.match(build.sourceNote,/海克斯大乱斗/);
});

test('rift source excludes a mutually exclusive tear route while keeping the other complete core and rune pages',()=>{
 const champion=data.champions.find(c=>c.id==='Kassadin');
 const html=hydration({1:{championId:champion.key,position:'mid',patch:data.patch,type:'ranked',region:'global',tier:'emerald_plus'},2:{rune_pages:[{play:10,importClientData:RUNE_PLANS.electro.page}]},3:row('core_items_0',[item(6657),item(3040),item(3042)]),4:row('core_items_1',[item(6657),item(3040),item(3118)])});
 const ref=parseBuildPage(html,{champion,role:'mid',data,url:'https://op.gg/lol/champions/kassadin/build/mid'});assert.deepEqual(ref.core.map(r=>r.items),[[6657,3040,3118]]);assert.ok(ref.runeOptions.length);
});
