import test from 'node:test';import assert from 'node:assert/strict';
import {championUsageView} from '../src/champion-usage-view.mjs';
import {createHistoryController} from '../src/match-history-controller.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
const data={champions:[{id:'Ahri',key:103,name:'阿狸'},{id:'Ashe',key:22,name:'艾希'},{id:'Nami',key:267,name:'娜美'}]},a='a'.repeat(32),b='b'.repeat(32),client={connected:true,playerName:'同一显示昵称'};
const summary={status:'ready',session:a,scanned:100,identified:100,target:500,complete:true,source:'lcu',usage:{sampled:100,counts:{Ahri:60,Ashe:40}}};
const page=(session=a)=>({session,handle:session,server:'KR',localServer:'KR',cross:false,player:{name:'本人',puuid:'mock-current-player'},source:'lcu',start:0,count:20,games:[],hasMore:false});
test('compact usage strip shows real counts and precise separate weights with details collapsed',()=>{
 const html=championUsageView(summary,data);assert.match(html,/近 100 场/);assert.match(html,/60 场/);assert.match(html,/51\.00%/);assert.match(html,/34\.00%/);assert.match(html,/value="85"/);assert.match(html,/未玩英雄合计 15%/);assert.match(html,/不是胜率/);assert.ok(!/<details[^>]* open/.test(html));assert.equal(championUsageView({status:'offline'},data),'');
 const loading=championUsageView({...summary,status:'loading',complete:false},data);assert.match(loading,/正在读取 100 \/ 500 场/);assert.match(loading,/<progress/);assert.match(loading,/aria-label="刷新英雄统计" disabled/);
});
test('empty, partial and unidentified histories keep distinct honest states',()=>{
 const empty=championUsageView({...summary,scanned:0,identified:0,usage:{sampled:0,counts:{}}},data);assert.match(empty,/暂无历史场次/);
 const unknown=championUsageView({...summary,identified:0,usage:{sampled:0,counts:{}}},data);assert.match(unknown,/近 100 场 · 可用 0 场/);assert.ok(!unknown.includes('暂无历史场次'));
 const partial=championUsageView({...summary,status:'partial',error:'稍后重试'},data);assert.match(partial,/未读完/);assert.match(partial,/aria-label="重试英雄统计"/);
});

test('cached and screenshot summaries show their source without claiming recent500 or unplayed heroes',()=>{
 const html=championUsageView({...summary,status:'partial',cached:true,basis:'current-season-screenshot',updatedAt:Date.parse('2026-10-20'),error:'暂时无法更新'},data);
 assert.match(html,/本地缓存 · 100 场 · 当前赛季/);assert.match(html,/仅含已展示英雄/);assert.match(html,/未收录英雄合计 15%/);assert.match(html,/导入我的统计/);assert.ok(!/近 100 场|未玩英雄/.test(html));assert.ok(!/<details[^>]* open/.test(html));
 const cached=championUsageView({...summary,cached:true,status:'loading'},data);assert.match(cached,/本地缓存/);assert.match(cached,/正在更新 100 \/ 500 场/);assert.match(cached,/完整读取后替换/);
});
test('automatic own history starts once the account is confirmed and reuses the actual local-server tab',async()=>{
 const calls=[],history=createHistoryController({request:async(op,p)=>{calls.push({op,p});return op==='profile'?{}:page();}});
 await history.autoLoadOwn(client,{...summary,status:'loading',session:''});assert.equal(calls.length,0,'an unconfirmed account must not load a page');
 await history.autoLoadOwn(client,{...summary,status:'loading'});assert.deepEqual(calls.map(c=>c.op),['page','profile'],'a confirmed account must not wait for the usage scan');assert.equal(calls[0].p.server,'');
 await history.autoLoadOwn(client,summary);await history.open({source:'auto',server:''});assert.equal(history.state.tabs.length,1);assert.equal(calls.filter(c=>c.op==='page').length,1);
});
test('the own history page is read once per confirmed account, not once per scan batch',async()=>{
 const calls=[],history=createHistoryController({request:async(op,p)=>{calls.push({op,p});return op==='profile'?{}:page();}});
 for(const scanned of [0,100,200,300,400])await history.autoLoadOwn(client,{...summary,status:'loading',scanned});
 assert.deepEqual(calls.map(c=>c.op),['page','profile'],'the running scan must not repeat the page read');
 await history.autoLoadOwn(client,{...summary,status:'ready'});assert.equal(calls.filter(c=>c.op==='page').length,1);
 await history.autoLoadOwn(client,{...summary,session:b,status:'loading'});
 assert.equal(history.state.tabs.length,1,'a new account replaces the old tab');
 assert.equal(calls.filter(c=>c.op==='page').length,2,'one new page for the new account');
});
test('early or cached summaries preserve the user source policy instead of forcing their old source',async()=>{
 for(const source of ['auto','lcu','sgp'])for(const status of ['loading','partial']){
  const calls=[],history=createHistoryController({request:async(op,p)=>{calls.push({op,p});return op==='profile'?{}:page();}});history.state.source=source;
  await history.autoLoadOwn(client,{...summary,cached:true,status,source:source==='sgp'?'lcu':'sgp'});
  assert.equal(calls.find(c=>c.op==='page').p.source,source);
 }
});
test('a refresh bypasses the page cache exactly once',async()=>{
 const calls=[];
 const history=createHistoryController({request:async(op,p)=>{calls.push({op,p:{...p}});return op==='profile'?{}:page();}});
 await history.open({source:'auto',server:''});
 await history.load(history.current(),{fresh:true});
 await history.load(history.current(),{});
 const pages=calls.filter(c=>c.op==='page');
 assert.equal(pages.at(-2).p.fresh,true,'the refresh asks for a fresh page');
 assert.notEqual(pages.at(-1).p.fresh,true,'the flag must not stick to later loads');
});
test('automatic own tab does not take focus from an explicit player search or use its chosen region',async()=>{
 const calls=[],history=createHistoryController({request:async(op,p)=>{calls.push({op,p});return op==='profile'?{}:{...page(),cross:p.server==='TW2',server:p.server||'KR'};}});
 await history.open({query:'已搜索玩家',server:'TW2'});const current=history.state.current;await history.autoLoadOwn(client,summary);assert.equal(history.state.current,current);assert.equal(history.state.tabs.length,2);assert.equal(calls.filter(c=>c.op==='page').at(-1).p.server,'');
});
test('disconnect and opaque account change revoke old pages even with unchanged display names',async()=>{
 let release;const history=createHistoryController({request:async(op,p)=>op==='profile'?{}:p.query==='slow'?new Promise(resolve=>release=resolve):page(b)});
 history.observeClient({...client,historySession:a});const pending=history.open({query:'slow'});history.observeClient({connected:false});assert.equal(history.state.tabs.length,0);release(page(a));await pending;assert.equal(history.state.tabs.length,0);
 await history.autoLoadOwn(client,{...summary,session:b});assert.equal(history.current().page.session,b);history.observeClient({...client,historySession:a});assert.equal(history.state.tabs.length,0);
});
test('automatic own loading preserves a pending search and already displayed search candidates',async()=>{
 let release;const history=createHistoryController({request:async(op)=>op==='search'?new Promise(resolve=>release=resolve):op==='profile'?{}:page()});
 history.observeClient({...client,historySession:a});history.state.query='搜索';const search=history.search();assert.equal(history.state.searching,true);await history.autoLoadOwn(client,summary);assert.equal(history.state.searching,true);
 const players=[{name:'搜索玩家',puuid:'mock-search-player'}];release({players});await search;assert.deepEqual(history.state.searchResults,players);await history.autoLoadOwn(client,{...summary,status:'partial'});assert.deepEqual(history.state.searchResults,players);
});
test('only the adjustable familiarity mass is saved, never counts, raw records or player identity',()=>{
 assert.equal(defaultState().preferences.familiarityMass,.85);
 const clean=validateState({...defaultState(),championUsage:{...summary,puuid:'private'},preferences:{...defaultState().preferences,familiarityMass:.9,championUsage:summary.usage}});assert.equal(clean.preferences.familiarityMass,.9);assert.ok(!JSON.stringify(clean).includes('championUsage'));assert.ok(!JSON.stringify(clean).includes('private'));
 for(const mass of [0,1])assert.equal(validateState({...defaultState(),preferences:{familiarityMass:mass}}).preferences.familiarityMass,mass);
 for(const bad of [NaN,Infinity,'0.85',-1,1.1])assert.equal(validateState({...defaultState(),preferences:{familiarityMass:bad}}).preferences.familiarityMass,.85);
});
