import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {itemReferenceView,referenceItemTiles} from '../src/item-reference-view.mjs';
import {gameTooltipView} from '../src/game-tooltip-view.mjs';

const item=(id,name,extra={})=>({id,name,description:'10 攻击力',maps:{11:true,12:true},inStore:true,gold:{purchasable:true,total:0},from:[],into:[],...extra});
const fixture=()=>({patch:'16.22',version:'16.22.1',champions:[{id:'Example',name:'示例英雄'}],runes:[],spells:{},items:{
 1001:item(1001,'基础装备',{gold:{purchasable:true,total:300}}),
 2001:item(2001,'免费饰品'),
 3001:item(3001,'英雄专属',{requiredChampion:'Example'}),
 4001:item(4001,'任务升级鞋',{tags:['Boots'],from:['1001']}),
 5001:item(5001,'转化成装',{inStore:false,gold:{purchasable:false,total:300},specialRecipe:1001,into:['5002']}),
 5002:item(5002,'后续任务形态',{inStore:false,gold:{purchasable:false,total:0},from:['5001']}),
 6001:item(6001,'<rarityLegendary>鼓舞士气</rarityLegendary><br><subtitleLeft><silver>500银蛇币 & 附注</silver></subtitleLeft>',{inStore:false,gold:{purchasable:false,total:0},requiredChampion:'Example'}),
 7001:item(7001,'未知商店状态',{inStore:undefined}),
 7002:item(7002,'未知购买状态',{gold:{total:300}}),
 7003:item(7003,'字段冲突',{inStore:true,gold:{purchasable:false,total:300}}),
 8001:item(8001,'海克斯专属',{maps:{11:false,12:true}}),
 9001:item(9001,'其他模式',{maps:{11:false,12:false}}),
}});
const ids=html=>[...html.matchAll(/class="item-reference-tile[^"]*"[^>]*data-id="(\d+)"/g)].map(match=>match[1]).sort();
const count=html=>Number(html.match(/data-item-reference-count[^>]*>(\d+)</)?.[1]);

test('shop defaults to explicit map and purchase flags, retaining free, champion-specific and quest equipment',()=>{
 const data=fixture(),expected=['1001','2001','3001','4001'];
 assert.deepEqual(ids(referenceItemTiles(data)),expected);assert.deepEqual(ids(referenceItemTiles(data,{scope:'unknown'})),expected);
 const html=itemReferenceView(data);assert.equal(count(html),4);assert.match(html,/data-item-reference-scope="shop"/);
 assert.deepEqual(ids(referenceItemTiles(data,{mode:'hex'})),[...expected,'8001']);
});

test('all records, search results and displayed count share the chosen mode and scope',()=>{
 const data=fixture(),all=['1001','2001','3001','4001','5001','5002','6001','7001','7002','7003'];
 assert.deepEqual(ids(referenceItemTiles(data,{scope:'all'})),all);
 for(const options of [{scope:'all'},{scope:'all',query:'未知'},{scope:'shop',query:'未知'},{scope:'all',mode:'hex',query:'8001'},{scope:'all',query:'rarityLegendary'}]){
  const html=itemReferenceView(data,options);assert.equal(count(html),ids(html).length);
 }
 assert.equal(count(itemReferenceView(data,{scope:'all',query:'未知'})),2);
 assert.equal(count(itemReferenceView(data,{scope:'shop',query:'未知'})),0);
 assert.equal(count(itemReferenceView(data,{scope:'all',query:'rarityLegendary'})),0,'Source formatting tags are not searchable equipment names');
});

test('shop filtering never blocks selected transformed details or their mode-valid relationships',()=>{
 const data=fixture(),before=structuredClone(data),html=itemReferenceView(data,{scope:'shop',id:'5001'});
 assert.deepEqual(ids(html),['1001','2001','3001','4001']);assert.match(html,/<b>转化成装<\/b>/);
 assert.match(html,/item-reference-related[^>]*data-action="reference-item" data-id="1001"/);
 assert.match(html,/item-reference-related[^>]*data-action="reference-item" data-id="5002"/);
 assert.match(itemReferenceView(data,{scope:'all',id:'7001'}),/购买状态未收录/);
 assert.match(itemReferenceView(data,{scope:'all',id:'9001'}),/未列入召唤师峡谷资料/);
 assert.deepEqual(data,before);
});

test('item names are safe plain text in lists, relationships and both tooltip sizes without changing source data',()=>{
 const data=fixture(),before=structuredClone(data);data.items[5001].from=['6001'];before.items[5001].from=['6001'];
 for(const html of [referenceItemTiles(data,{scope:'all',query:'鼓舞士气 500银蛇币'}),itemReferenceView(data,{scope:'all',id:'6001'}),itemReferenceView(data,{id:'5001'}),gameTooltipView(data,'item','6001',{compact:true,mode:'hex'})]){
  assert.match(html,/鼓舞士气 500银蛇币 &amp; 附注/);assert.doesNotMatch(html,/rarityLegendary|subtitleLeft|&lt;br|<silver>/);
 }
 assert.deepEqual(data,before);
});

const appSource=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
function appFixture(){
 const data=fixture(),controls=new Map();let html='',listScroll=130;
 const grid={innerHTML:'',get scrollTop(){return listScroll;},set scrollTop(value){listScroll=value;},querySelectorAll:()=>ids(grid.innerHTML).map(id=>({dataset:{id}}))},counter={textContent:''};
 const detail={focus(options){assert.equal(options.preventScroll,true);},getBoundingClientRect:()=>({top:10,height:100})};
 const document={getElementById:id=>id==='item-reference-grid'?grid:id==='item-reference-detail'?detail:null,querySelector:selector=>selector==='[data-item-reference-count]'?counter:controls.get(selector)||null};
 const context=vm.createContext({data,itemReferenceView,referenceItemTiles,document,referenceItemScope:'shop',render(){html=vm.runInContext('renderReference()',context);grid.innerHTML=html;listScroll=0;},window:{innerHeight:720}});
 const start=appSource.indexOf("let referenceKind='champions'"),end=appSource.indexOf('const rankingPending=',start);
 vm.runInContext(appSource.slice(start,end),context);vm.runInContext("referenceKind='items';",context);
 const actionStart=appSource.indexOf(" if(action==='reference-item-mode')"),actionEnd=appSource.indexOf(" if(action==='reference-back')",actionStart);
 vm.runInContext('function click(action,el){'+appSource.slice(actionStart,actionEnd)+'}',context);
 const input=appSource.split('\n').find(line=>line.includes("if(event.target.id==='item-reference-search')"));
 vm.runInContext('function input(event){'+input+'}',context);
 return {context,data,grid,counter,state:()=>vm.runInContext('({mode:referenceItemMode,scope:referenceItemScope,query:referenceItemQuery,id:referenceItem})',context),html:()=>html,
  click(action,value){let focused=false;const field=action==='reference-item-mode'?'mode':'scope';controls.set(`[data-action="${action}"][data-${field}="${value}"]`,{focus(options){assert.equal(options.preventScroll,true);focused=true;}});context.click(action,{dataset:{[field]:value}});return focused;},
  input(value){context.input({target:{id:'item-reference-search',value}});},select(id){context.click('reference-item',{dataset:{id}});}};
}

test('actual scope/mode handlers retain list reading position and focus, and search updates its scoped count',()=>{
 const f=appFixture();assert.equal(f.click('reference-item-scope','all'),true);assert.equal(f.state().scope,'all');assert.equal(f.grid.scrollTop,130);
 f.grid.scrollTop=90;assert.equal(f.click('reference-item-mode','hex'),true);assert.equal(f.grid.scrollTop,90);assert.equal(f.state().mode,'hex');assert.equal(count(f.html()),11);
 f.input('未知');assert.equal(f.counter.textContent,'2');assert.equal(f.grid.scrollTop,90);assert.deepEqual(ids(f.grid.innerHTML),['7001','7002']);
 assert.equal(f.click('reference-item-scope','shop'),true);assert.equal(count(f.html()),0);assert.equal(f.state().query,'未知');
 f.input('免费');assert.equal(f.counter.textContent,'1');assert.deepEqual(ids(f.grid.innerHTML),['2001']);
 f.click('reference-item-scope','invalid');assert.equal(f.state().scope,'shop');
});

test('actual item navigation opens a non-shop relationship without loosening the selected-mode boundary',()=>{
 const f=appFixture();f.select('5001');assert.equal(f.state().scope,'shop');assert.equal(f.state().id,'5001');assert.match(f.html(),/<b>转化成装<\/b>/);
 f.select('5002');assert.equal(f.state().id,'5002');f.select('9001');assert.equal(f.state().id,'5002');
});
