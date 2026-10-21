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
test('collecting for one champion scans bounded pages until the requested sample or end',async()=>{
 const c=createHistoryController({request:async(op,p)=>op==='profile'?{}:{...page('one'),start:p.start||0,count:p.count||20,hasMore:(p.start||0)<40,games:Array.from({length:20},(_,i)=>({id:(p.start||0)+i+1,self:{champion:(p.start||0)>0?99:22}}))}});
 await c.open();await c.collect({champion:99,expectedCount:25});assert.equal(c.current().page.games.length,60);assert.equal(c.current().filter.champion,99);
});
test('long ASCII names still use name search while structured PUUID input opens the player',async()=>{
 const calls=[],c=createHistoryController({request:async(op,p)=>{calls.push([op,p]);return op==='search'?{players:[]}:op==='profile'?{}:page('one');}});
 c.state.query='SixteenLetterName';await c.search();assert.equal(calls[0][0],'search');c.state.query='12345678-1234-1234-1234-123456789abc';await c.search();assert.equal(calls.find(([op])=>op==='page')[1].puuid,c.state.query);
});
test('page changes release deep-analysis and challenge loading flags and ignore their old results',async()=>{
 const releases=[],c=createHistoryController({request:async op=>op==='page'?page('one'):op==='profile'?{}:new Promise(resolve=>releases.push(resolve))});
 const tab=await c.open();const a=c.loadAnalysisDetails(),b=c.challenges();await c.load(tab);assert.equal(tab.analysisLoading,false);assert.equal(tab.challengesLoading,false);for(const release of releases)release({timeline:{frames:[],events:[]}});await Promise.all([a,b]);assert.equal(tab.challenges,undefined);
});
test('refresh and details keep complete analysis on the active filtered subset',async()=>{
 const games=[{...page('one').games[0],id:1,self:{champion:22}},{...page('one').games[0],id:2,self:{champion:99}}],c=createHistoryController({request:async op=>op==='page'?{...page('one'),games}:op==='profile'?{}:{game:games[0]},analyze:rows=>rows.map(g=>g.id)});
 const tab=await c.open();c.filter('champion',22);await c.load(tab);assert.deepEqual(tab.analysis,[1]);await c.detail(1);assert.deepEqual(tab.analysis,[1]);
});
test('filtered collection rescans from the first page and counts full nested-filter matches',async()=>{
 const starts=[],c=createHistoryController({request:async(op,p)=>op==='profile'?{}:(starts.push(p.start||0),{...page('one'),start:p.start||0,count:p.count||20,hasMore:(p.start||0)<40,games:Array.from({length:20},(_,i)=>({id:(p.start||0)+i+1,self:{kills:i%2,champion:22}}))})});
 const tab=await c.open({start:40});c.filter('advanced',{rules:[{field:'kills',operator:'=',value:1}]});await c.collect({useFilters:true,scanFromStart:true,expectedCount:15});assert.deepEqual(starts,[40,0,20]);assert.equal(tab.page.games.length,15);assert.equal(tab.collectionResult.scanned,40);assert.equal(tab.collectionResult.matched,15);
});
test('opening the same public player and region reuses a tab and supports background opening',async()=>{
 let reads=0;const c=createHistoryController({request:async op=>op==='profile'?{}:(reads++,page('one'))});
 const a=await c.open({puuid:'mock-public-player-one',server:'TENCENT_HN10'});const b=await c.open({puuid:'mock-public-player-two',server:'TENCENT_HN10',background:true});assert.equal(c.state.current,a.id);const same=await c.open({puuid:'mock-public-player-one',server:'TENCENT_HN10'});assert.equal(same,a);assert.equal(c.state.tabs.length,2);assert.equal(reads,2);assert.notEqual(b.id,a.id);
});
test('replay download progress polls a read-only operation after the click and stops when ready',async()=>{
 let tick,cleared=false;const calls=[],c=createHistoryController({request:async(op)=>{calls.push(op);return op==='page'?page('one'):op==='profile'?{}:op==='detail'?{game:page('one').games[0]}:op==='replay'?{state:'downloading',progress:20}:{state:'watch',progress:100};},setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>cleared=true});
 await c.open();await c.detail(1);assert.equal(tick,undefined);await c.replay(1,'download');assert.equal(typeof tick,'function');await tick();assert.equal(c.current().details[1].replay.state,'watch');assert.ok(cleared);assert.equal(calls.filter(op=>op==='replay').length,1);assert.equal(calls.at(-1),'replay-status');
});
test('reusing a player after a data-source switch creates a fresh query target',async()=>{
 const calls=[],c=createHistoryController({request:async(op,p)=>op==='profile'?{}:(calls.push(p),{...page('one'),server:'NA1'})});const a=await c.open({puuid:'mock-public-player-one',server:'NA1',source:'lcu'});const b=await c.open({puuid:'mock-public-player-one',server:'NA1',source:'sgp'});assert.equal(b,a);assert.equal(calls.length,2);assert.equal(calls[1].source,'sgp');assert.equal(calls[1].handle,undefined);
});
test('the actual search flow applies the currently selected data source to reused tabs',async()=>{
 const calls=[],c=createHistoryController({request:async(op,p)=>op==='profile'?{}:(calls.push(p),{...page('one'),server:'NA1'})});c.state.server='NA1';c.state.query='12345678-1234-1234-1234-123456789abc';c.state.source='lcu';await c.search();c.state.source='sgp';await c.search();assert.equal(calls.length,2);assert.equal(calls[1].source,'sgp');
});

test('postgame review selects and refreshes own history before opening the exact match',async()=>{
 const calls=[];let latest=1;
 const c=createHistoryController({request:async(op,p)=>{calls.push({op,p});if(op==='profile')return {};if(op==='page')return page(p.query||'self',latest);if(op==='detail')return {game:{...page('self',99).games[0]}};throw Error('Unexpected operation');}});
 await c.open();await c.open({query:'other'});latest=99;await c.openOwnGame('99');
 assert.equal(c.current().page.player.name,'self');assert.equal(c.current().options.query,undefined);assert.equal(c.current().options.start,0);assert.equal(c.current().page.games[0].id,99);assert.ok(c.current().details[99].complete);assert.ok(c.current().page.games.some(g=>g.id===99));
 const detailCall=calls.find(v=>v.op==='detail');assert.equal(detailCall.p.handle,'self');
});

test('a not-yet-synchronized settlement shows a useful own-history status without bypassing the loaded-game boundary',async()=>{
 let detailReads=0;const c=createHistoryController({request:async(op)=>{if(op==='profile')return {};if(op==='detail'){detailReads++;throw Error('Must not read');}return page('self',1);}});await c.openOwnGame(99);assert.equal(c.current().page.player.name,'self');assert.match(c.current().error,/尚未同步/);assert.equal(detailReads,0);
});
