import test from 'node:test';
import assert from 'node:assert/strict';
import {advancedHistoryFilters} from '../src/match-history-filters-view.mjs';
import {matchesRules} from '../src/core/match-history/filters.mjs';

const editor=()=>import('../src/match-history-filter-tree.mjs');
const rule={field:'kills',operator:'>=',value:5};

test('tree editor keeps nested NOT and same-player scope semantics through immutable edits',async()=>{
 const {updateHistoryFilterTree:update}=await editor();
 const original={type:'and',children:[rule,{type:'not',child:{field:'vision',operator:'=',value:0}},{type:'scope',scope:'ally',child:{field:'item',operator:'=',value:1055}}]};
 const before=JSON.stringify(original);
 let tree=update(original,{action:'kind',path:'2.0',kind:'or'});
 tree=update(tree,{action:'add',path:'2.0',kind:'rule'});
 tree=update(tree,{action:'set',path:'2.0.1',field:'field',value:'deaths'});
 tree=update(tree,{action:'set',path:'2.0.1',field:'value',value:'3'});
 assert.equal(tree.children[2].child.children[1].value,3);
 assert.equal(tree.children[2].child.children[1].field,'deaths');
 assert.equal(tree.children[2].scope,'ally');
 assert.equal(JSON.stringify(original),before);
 const self={id:1,team:'TEAM-100',kills:8,items:[1055],deaths:4};
 assert.equal(matchesRules({self,participants:[self]},{tree}),false,'unknown vision underneath NOT must still fail');
 tree=update(tree,{action:'remove',path:'1'});
 assert.equal(matchesRules({self,participants:[self]},{tree}),true);
});

test('removing the only child prunes empty groups and paths cannot mutate object properties',async()=>{
 const {updateHistoryFilterTree:update}=await editor();
 assert.equal(update({type:'not',child:{type:'or',children:[rule]}},{action:'remove',path:'0.0'}),null);
 assert.throws(()=>update(rule,{action:'set',path:'__proto__.0',field:'value',value:0}));
 assert.throws(()=>update(rule,{action:'set',path:'0',field:'value',value:0}));
 assert.throws(()=>update(rule,{action:'set',field:'__proto__',value:{}}));
 let tree=rule;for(let i=0;i<7;i++)tree={type:'not',child:tree};
 assert.throws(()=>update(tree,{action:'kind',kind:'and'}),/上限/);
 assert.throws(()=>update({type:'and',children:Array.from({length:20},()=>({...rule}))},{action:'add'}),/20/);
 assert.equal(update({type:'broken'},{action:'remove'}),null,'an invalid imported root can still be cleared');
});

test('resource edits choose valid field defaults and optional slots remain removable',async()=>{
 const {updateHistoryFilterTree:update}=await editor();
 let tree=update(rule,{action:'set',field:'field',value:'item'});
 assert.equal(tree.operator,'=');
 tree=update(tree,{action:'set',field:'value',value:'3006'});
 tree=update(tree,{action:'set',field:'minQuantity',value:'2'});
 tree=update(tree,{action:'set',field:'slot',value:'0'});
 assert.equal(tree.value,3006);assert.equal(tree.minQuantity,2);assert.equal(tree.slot,0);
 tree=update(tree,{action:'set',field:'slot',value:''});assert.ok(!Object.hasOwn(tree,'slot'));
 tree=update(tree,{action:'set',field:'field',value:'result'});
 assert.equal(tree.value,'win');assert.ok(!Object.hasOwn(tree,'minQuantity'));
 assert.throws(()=>update(tree,{action:'set',field:'value',value:''}));
});

test('scope edits can return to inherited players without keeping a hidden named anchor',async()=>{
 const {updateHistoryFilterTree:update}=await editor();
 const scoped={...rule,scope:'named',player:'known-player-id',quantifier:'all'};
 const inherited=update(scoped,{action:'set',field:'scope',value:''});
 assert.deepEqual(inherited,rule);
 const group={type:'scope',scope:'named',player:'known-player-id',child:rule};
 assert.equal(update(group,{action:'set',field:'scope',value:'self'}).scope,'self');
});

test('runtime presets snapshot only bounded filters and relative shortcuts use calendar dates',async()=>{
 const {saveHistoryFilterPreset:save,loadHistoryFilterPreset:load,removeHistoryFilterPreset:remove,historyRelativeTimeRange:range}=await editor();
 const filter={result:'win',excludePve:true,advanced:{mode:'all',rules:[],tree:{...rule}},page:{games:[{private:true}]}};
 let presets=save([],'我的筛选',filter);filter.advanced.tree.value=99;
 assert.equal(load(presets,'我的筛选').advanced.tree.value,5);
 assert.ok(!Object.hasOwn(load(presets,'我的筛选'),'page'));
 const restored=load(presets,'我的筛选');restored.advanced.tree.value=100;
 assert.equal(load(presets,'我的筛选').advanced.tree.value,5);
 for(let i=0;i<15;i++)presets=save(presets,'筛选 '+i,{queue:420});
 assert.equal(presets.length,12);
 assert.equal(remove(presets,'筛选 14').length,11);
 assert.throws(()=>save(presets,'x'.repeat(65),{}));
 const now=new Date(2026,9,17,13,30).getTime();
 assert.deepEqual(range('7d',now),{from:'2026-10-11',to:'2026-10-17'});
 assert.deepEqual(range('today',now),{from:'2026-10-17',to:'2026-10-17'});
 assert.deepEqual(range('all',now),{from:'',to:''});
 assert.throws(()=>range('999999d',now));
});

test('visual editor exposes nested numeric paths and searchable current resources without losing JSON or simple rules',()=>{
 const tab={id:7,page:{games:[{participants:[{name:'玩家<甲>#CN',puuid:'known-player-id'}]}]},filter:{advanced:{mode:'all',rules:[rule],tree:{type:'and',children:[{type:'not',child:rule},{type:'scope',scope:'named',player:'known-player-id',child:{field:'item',operator:'=',value:3006}}]}}},filterPresets:[{name:'排位',filter:{queue:420}}]};
 const html=advancedHistoryFilters(tab,{items:{3006:{id:3006,name:'狂战士胫甲'}},champions:[],runes:[],spells:{},augments:[]});
 assert.match(html,/data-history-tree-path="0.0"/);
 assert.match(html,/data-history-tree-path="1.0"/);
 assert.match(html,/data-action="history-tree-add"/);
 assert.match(html,/data-action="history-tree-kind"/);
 assert.match(html,/data-action="history-tree-remove"/);
 assert.match(html,/data-action="history-tree-preset"/);
 assert.match(html,/data-action="history-relative-time"/);
 assert.match(html,/<datalist[^>]*>[\s\S]*狂战士胫甲/);
 assert.match(html,/value="known-player-id"/);
 assert.match(html,/玩家&lt;甲&gt;#CN/);
 assert.match(html,/data-history-tool="filter-tree"/);
 assert.match(html,/data-history-rule="0"/);
 assert.ok(!html.includes('玩家<甲>'));
 assert.doesNotThrow(()=>advancedHistoryFilters({filter:{}}));
});
