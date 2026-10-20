import test from 'node:test';import assert from 'node:assert/strict';
import {createChampionUsageCollector} from '../services/champion-usage-collector.mjs';
import {createMatchHistoryService} from '../services/match-history.mjs';
const a='a'.repeat(32),b='b'.repeat(32),client={connected:true,phase:'Lobby',own:{summonerId:1}},heroes=[{id:'Ahri',key:103},{id:'Ashe',key:22}],pause=()=>new Promise(resolve=>setImmediate(resolve));
const result=(session,scanned=100,complete=false,counts={103:scanned})=>({session,cursor:scanned.toString(16).padStart(32,'0'),target:500,source:'lcu',scanned,identified:Object.values(counts).reduce((sum,n)=>sum+n,0),complete,counts});
function fixture({request,transportCurrent=()=>true,onChange=()=>{}}={}){
 let time=1000,session=a,pages=0,contexts=0;const events=[],offsets=new Map();
 const collector=createChampionUsageCollector({champions:()=>heroes,now:()=>time,onChange:event=>{events.push(event);onChange(event);},transportCurrent,request:async(t,op,p)=>{
  if(op==='own-summary-context'){contexts++;return request?request(t,op,p,{session}):{session,server:'TENCENT_HN10'};}
  pages++;if(request)return request(t,op,p,{session});const n=Math.min(500,(p.cursor?offsets.get(p.session)||0:0)+100);offsets.set(p.session,n);return result(p.session,n,n===500);
 }});
 return {collector,events,session:value=>session=value,time:value=>time=value,pages:()=>pages,contexts:()=>contexts};
}
test('one collector progressively supplies both windows and never restarts a completed scan for ordinary status',async()=>{
 const f=fixture(),transport={};const first=f.collector.observe(client,transport),second=f.collector.observe(client,transport);assert.equal(first,second);await first;
 assert.equal(f.pages(),5);assert.deepEqual(f.collector.snapshot().usage,{sampled:500,counts:{Ahri:500}});assert.deepEqual(f.events.filter(e=>e.scanned).map(e=>e.scanned),[100,200,300,400,500]);
 await f.collector.observe(client,transport);assert.equal(f.pages(),5);assert.equal(f.contexts(),2);assert.ok(!/summonerId|puuid|cursor|TENCENT|transport/.test(JSON.stringify(f.events)));
});

test('a throttled status without optional IDs does not erase a known identity or restart its500 scan',async()=>{
 const f=fixture(),transport={};await f.collector.observe(client,transport);await f.collector.observe({connected:true,phase:client.phase},transport);assert.equal(f.pages(),5);assert.equal(f.collector.snapshot().session,a);
});

test('same-session refresh preserves history tabs while confirmed account replacement and disconnect clear them',async()=>{
 const {createHistoryController}=await import('../src/match-history-controller.mjs');
 const history=createHistoryController({request:async()=>({})}),transport={},f=fixture({onChange:value=>history.observeClient({...client,historySession:value.session})});
 await f.collector.observe(client,transport);await history.open({query:'other-player'});const original=history.current();
 await f.collector.observe(client,transport,{refresh:true});assert.equal(history.current(),original);assert.equal(history.state.tabs.length,1);
 f.session(b);await f.collector.observe(client,transport);assert.equal(history.state.tabs.length,0);
 await history.open({query:'other-player'});history.observeClient({connected:false});assert.equal(history.state.tabs.length,0);
});
test('status returns while the first page is pending, and disconnect clears before a late reply',async()=>{
 let release;const f=fixture({request:(_t,op)=>op==='own-summary-context'?{session:a,server:'KR'}:new Promise(resolve=>release=resolve)}),transport={};
 const old=f.collector.observe(client,transport);while(!release)await pause();assert.equal(f.collector.snapshot().status,'loading');await f.collector.observe({connected:false},null);assert.equal(f.collector.snapshot().status,'offline');release(result(a,100,true));await old;assert.equal(f.collector.snapshot().usage.sampled,0);assert.equal(f.collector.snapshot().session,'');
});
test('new transport can finish while the old one is pending and old results cannot clear it',async()=>{
 const ta={},tb={};let release;const f=fixture({request:(t,op)=>op==='own-summary-context'?{session:t===ta?a:b,server:'KR'}:t===ta?new Promise(resolve=>release=resolve):result(b,7,true,{22:7})});
 const old=f.collector.observe(client,ta);while(!release)await pause();await f.collector.observe(client,tb);release(result(a,100,true));await old;
 assert.equal(f.collector.snapshot().session,b);assert.deepEqual(f.collector.snapshot().usage,{sampled:7,counts:{Ashe:7}});
});
test('cached display identity cannot conceal a changed actual account or region context',async()=>{
 const f=fixture(),transport={};await f.collector.observe(client,transport);f.session(b);await f.collector.observe(client,transport);assert.equal(f.pages(),10);assert.equal(f.collector.snapshot().session,b);assert.equal(f.events.filter(e=>e.session===b&&e.scanned===100).length,1);
});
test('explicit own identity changes clear statistics before the new context has responded',async()=>{
 let pending=false,release;const f=fixture({request:(_t,op,p)=>op==='own-summary-context'?(pending?new Promise(resolve=>release=resolve):{session:a,server:'KR'}):result(p.session,1,true)}),transport={};await f.collector.observe(client,transport);pending=true;
 const next=f.collector.observe({...client,own:{summonerId:2}},transport);assert.equal(f.collector.snapshot().usage.sampled,0);while(!release)await pause();release({session:b,server:'KR'});await next;assert.equal(f.collector.snapshot().session,b);assert.equal(f.collector.snapshot().usage.sampled,1);
});
test('failed later pages keep confirmed partial counts and retry only on later status after backoff',async()=>{
 let calls=0,broken=true;const f=fixture({request:(_t,op)=>op==='own-summary-context'?{session:a,server:'KR'}:++calls===1?result(a):broken?Promise.reject(Error('mock private token must never leave')):result(a,120,true)}),transport={};
 await f.collector.observe(client,transport);assert.equal(f.collector.snapshot().status,'partial');assert.equal(f.collector.snapshot().usage.sampled,100);await f.collector.observe(client,transport);assert.equal(calls,2);assert.ok(!JSON.stringify(f.events).includes('mock private token'));
 broken=false;f.time(7000);await f.collector.observe(client,transport);assert.equal(f.collector.snapshot().usage.sampled,120);assert.equal(f.collector.snapshot().status,'ready');
});
test('failure to confirm the account discards partial counts instead of sharing them as current',async()=>{
 let contexts=0,pages=0;const f=fixture({request:(_t,op)=>{if(op==='own-summary-context'){if(++contexts>1)throw Error('identity not available');return {session:a,server:'KR'};}if(++pages>1)throw Error('page failed');return result(a);}}),transport={};await f.collector.observe(client,transport);assert.equal(f.collector.snapshot().usage.sampled,0);assert.equal(f.collector.snapshot().status,'error');assert.ok(f.collector.snapshot().error);
});
test('zero history is a successful empty result and unknown future heroes do not become current champions',async()=>{
 for(const counts of [{},{103:10,9999:90}]){const scanned=Object.values(counts).reduce((s,n)=>s+n,0),f=fixture({request:(_t,op)=>op==='own-summary-context'?{session:a,server:''}:result(a,scanned,true,counts)});await f.collector.observe(client,{});assert.equal(f.collector.snapshot().status,'ready');assert.equal(f.collector.snapshot().usage.sampled,counts[103]||0);assert.ok(!Object.hasOwn(f.collector.snapshot().usage.counts,'9999'));}
});
test('invalid or nonprogressing summary cannot loop forever or mutate accepted counts',async()=>{
 for(const invalid of [{...result(a),scanned:501},{...result(a),counts:{103:501}},{...result(a),session:b},{...result(a),cursor:'bad'},result(a,0,false,{})]){const f=fixture({request:(_t,op)=>op==='own-summary-context'?{session:a,server:'KR'}:invalid});await f.collector.observe(client,{});assert.equal(f.pages(),1);assert.equal(f.collector.snapshot().usage.sampled,0);assert.equal(f.collector.snapshot().status,'error');}
});
test('a revoked channel is cleared before any of its successful late data is published',async()=>{
 let valid=true,release;const f=fixture({transportCurrent:()=>valid,request:(_t,op)=>op==='own-summary-context'?{session:a,server:'KR'}:new Promise(resolve=>release=resolve)}),work=f.collector.observe(client,{});while(!release)await pause();valid=false;release(result(a,100,true));await work;assert.equal(f.collector.snapshot().status,'offline');assert.equal(f.collector.snapshot().usage.sampled,0);
});
test('new match completion and explicit refresh rescan, while repeated EndOfGame observations do not',async()=>{
 const f=fixture(),transport={};await f.collector.observe(client,transport);await f.collector.observe({...client,phase:'EndOfGame'},transport);assert.equal(f.pages(),10);await f.collector.observe({...client,phase:'EndOfGame'},transport);assert.equal(f.pages(),10);await f.collector.observe({...client,phase:'EndOfGame'},transport,{refresh:true});assert.equal(f.pages(),15);
});
test('real service plus collector recovers when a committed second-page response is lost in transport',async()=>{
 const own={puuid:'mock-public-own-player'},rows=Array.from({length:500},(_,i)=>({gameId:i+1,participants:[{participantId:1,championId:103}],participantIdentities:[{participantId:1,player:own}]}));let listReads=0,dropped=false,time=1000;
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'synthetic',region:'UNKNOWN'}),request:async(_a,route)=>{if(route.includes('current-summoner'))return own;const q=new URLSearchParams(route.split('?')[1]);listReads++;return {games:{games:rows.slice(Number(q.get('begIndex')),Number(q.get('endIndex'))+1)}};}});
 const collector=createChampionUsageCollector({champions:()=>heroes,now:()=>time,request:async(_t,op,p)=>{const answer=await service.execute(op,p);if(op==='own-summary-page'&&answer.scanned===200&&!dropped){dropped=true;throw Error('lost after commit');}return answer;}}),transport={};
 await collector.observe(client,transport);assert.equal(collector.snapshot().usage.sampled,100);assert.equal(collector.snapshot().status,'partial');time=7000;await collector.observe(client,transport);
 assert.equal(collector.snapshot().status,'ready');assert.deepEqual(collector.snapshot().usage,{sampled:500,counts:{Ahri:500}});assert.equal(listReads,5,'replay must not read or count the committed page again');
});
