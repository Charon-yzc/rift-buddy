import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryController} from '../src/match-history-controller.mjs';
import {matchHistoryView} from '../src/match-history-view.mjs';
const page=(name,id=1)=>({handle:name,player:{name,puuid:'mock-public-player-'+name},games:[{id,self:{result:'win',champion:22},participants:[],teams:[],queue:420}],source:'lcu',start:0,count:20,hasMore:false,servers:[]});
test('a slow previous page cannot replace a newer query in the same tab',async()=>{
 let release;const c=createHistoryController({request:async(op,p)=>op==='profile'?{ranked:[],mastery:[]}:p.query==='slow'?new Promise(resolve=>release=resolve):page(p.query)});
 const first=c.open({query:'slow'}),tab=c.state.tabs[0];const second=c.load(tab,{query:'new',handle:undefined});await second;release(page('old'));await first;
 assert.equal(tab.page.player.name,'new');assert.equal(tab.loading,false);
});
test('switching players keeps pages isolated and closing a tab invalidates its pending result',async()=>{
 let release;const c=createHistoryController({request:async(op,p)=>op==='profile'?{ranked:[],mastery:[]}:p.query==='slow'?new Promise(resolve=>release=resolve):page(p.query)});
 await c.open({query:'one'});const pending=c.open({query:'slow'}),tab=c.state.tabs.at(-1);c.close(tab.id);release(page('old'));await pending;
 assert.equal(c.state.tabs.length,1);assert.equal(c.current().page.player.name,'one');
});
test('history view keeps failure, empty and unloaded states distinct and escapes player input',()=>{
 const c=createHistoryController({request:async()=>{throw Error('网络暂不可用');}});
 const data={champions:[],items:{},runes:[],spells:{},augments:[]};
 assert.match(matchHistoryView(c.state,data),/查询战绩/);
 const tab={id:1,options:{},filter:{},page:page('<script>'),details:{},error:'网络暂不可用'};c.state.tabs=[tab];c.state.current=1;
 const html=matchHistoryView(c.state,data);assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('网络暂不可用'));assert.ok(!html.includes('<script>'));
});
test('account observation clears cached players and pending queries on a confirmed identity change',async()=>{
 const c=createHistoryController({request:async(op)=>op==='profile'?{ranked:[],mastery:[]}:page('one')});
 c.observeClient({connected:true,playerName:'one#TEST'});await c.open();assert.equal(c.state.tabs.length,1);
 c.observeClient({connected:true,playerName:'two#TEST'});assert.equal(c.state.tabs.length,0);
});
test('batch collection never exceeds 500 games and a second click sends no further page',async()=>{
 let calls=0;const c=createHistoryController({request:async(op,p)=>op==='profile'?{}:(calls++,{...page('one'),start:p.start||0,count:p.count||20,hasMore:true,games:Array.from({length:p.count||20},(_,i)=>({id:(p.start||0)+i+1}))})});
 await c.open();await c.collect();assert.equal(c.current().page.games.length,500);const before=calls;await c.collect();assert.equal(calls,before);
});
test('refreshing an expired session creates a fresh handle and does not preserve stale account data',async()=>{
 let old=true;const c=createHistoryController({request:async(op,p)=>{if(op==='profile')return {};if(p.handle&&old)throw Error('战绩会话已失效，请重新查询');return page(old?'old':'new');}});
 await c.open();await c.load(c.current());assert.equal(c.current().error,'');assert.equal(c.current().page.player.name,'old');
 old=false;await c.load(c.current());assert.equal(c.current().page.player.name,'new');
});
test('a complete Riot ID query invalidates an earlier fuzzy name search',async()=>{
 let release;const c=createHistoryController({request:async(op,p)=>op==='profile'?{}:op==='search'?new Promise(resolve=>release=resolve):page(p.query)});
 c.state.query='old';const old=c.search();c.state.query='new#TEST';await c.search();release({players:[{name:'old'}]});await old;
 assert.equal(c.state.searchResults.length,0);assert.equal(c.current().page.player.name,'new#TEST');
});
test('repeated detail clicks share a single in-flight summary request',async()=>{
 let release,calls=0;const c=createHistoryController({request:async(op)=>op==='profile'?{}:op==='page'?page('one'):op==='detail'?(calls++,new Promise(resolve=>release=resolve)):{timeline:{frames:[],events:[]}}});
 await c.open();const a=c.detail(1,'summary'),b=c.detail(1,'stats');assert.equal(calls,1);release({game:c.current().page.games[0]});await Promise.all([a,b]);assert.equal(c.current().details[1].section,'stats');
});
test('a failed timeline flight settles waiting clicks without an automatic retry loop',{timeout:1000},async()=>{
 let release,calls=0;const c=createHistoryController({request:async(op)=>op==='profile'?{}:op==='page'?page('one'):op==='detail'?{game:page('one').games[0]}:(calls++,new Promise((_,reject)=>release=reject))});
 await c.open();const a=c.detail(1,'timeline');await new Promise(resolve=>setImmediate(resolve));const b=c.detail(1,'events');release(Error('offline'));await Promise.all([a,b]);assert.equal(calls,1);assert.match(c.current().details[1].error,/offline/);
});
test('collecting more games preserves an in-flight detail for a game still on the page',async()=>{
 let release;const c=createHistoryController({request:async(op,p)=>op==='profile'?{}:op==='page'?{...page('one'),hasMore:!p.start}:op==='detail'?{game:page('one').games[0]}:new Promise(resolve=>release=resolve)});
 await c.open();const pending=c.detail(1,'timeline');while(!release)await new Promise(resolve=>setImmediate(resolve));await c.collect();release({timeline:{frames:[],events:[]}});await pending;
 const detail=c.current().details[1];assert.equal(detail.loading,false);assert.ok(detail.timeline);
});
