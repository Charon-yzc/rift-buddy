import test from 'node:test';
import assert from 'node:assert/strict';
import {createOngoingGameController} from '../src/ongoing-game-controller.mjs';
const member={key:'mock-public-player-1',puuid:'mock-public-player-1',name:'本人',self:true,team:'LOBBY'};
const roster=(key='one')=>({key,session:'account-one',phase:'lobby',queue:430,players:[member],teams:{LOBBY:[member.key]},selfPuuid:member.puuid});
const page={handle:'handle-one',games:[],count:20,start:0,hasMore:false,player:{puuid:member.puuid}};

test('parallel timeline fallbacks retain their data warning once alongside the page warning',async()=>{
 const notice='后台时间线暂不可用，已使用客户端数据；部分属性和出装事件可能缺失';
 const c=createOngoingGameController({settings:{details:4},request:async op=>op==='roster'?roster():op==='page'?{...page,notice:'部分队伍资料不完整',games:[1,2,3,4].map(id=>({id,queue:430}))}:op==='timeline'?{timeline:{frames:[]},notice}:{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});
 await c.refresh();const entry=c.state.players[member.key];assert.equal(entry.loadedDetails,4);
 assert.equal(entry.notice,'部分队伍资料不完整；'+notice);
});

test('a cancelled timeline batch cannot repaint the replacement roster',async()=>{
 let next=roster(),paints=0;const releases=[];
 const c=createOngoingGameController({settings:{details:4},request:async op=>{
  if(op==='roster')return next;
  if(op==='page')return {...page,games:[1,2,3,4].map(id=>({id,queue:430}))};
  if(op==='timeline')return new Promise(resolve=>releases.push(()=>resolve({timeline:{frames:[]}})));
  return {};
 },analyze:()=>null,teamAnalyze:()=>null,infer:()=>[],onChange:()=>{paints++;}});
 const previous=c.refresh();while(releases.length<2)await new Promise(resolve=>setImmediate(resolve));
 for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(releases.length,2,'Samples share a bounded queue');
 next={...roster('new-game'),players:[],teams:{}};await c.refresh();const accepted=paints;
 for(const release of releases)release();await previous;
 assert.equal(c.state.roster.key,'new-game');assert.equal(paints,accepted,'Cancelled work must not replace the new page DOM');
});
test('ongoing game automatically loads each actual visible player with the bounded current roster',async()=>{
 const calls=[];const c=createOngoingGameController({request:async(op,p)=>{calls.push([op,p]);return op==='roster'?roster():op==='page'?page:{};},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});
 await c.refresh();assert.equal(c.state.players[member.key].loading,false);assert.equal(c.state.roster.key,'one');assert.equal(calls.find(([op])=>op==='page')[1].rosterKey,'one');
});
test('a background tick repaints only when the public roster actually changed',async()=>{
 let current=roster(),changes=0;
 const c=createOngoingGameController({request:async(op)=>op==='roster'?current:op==='page'?page:{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[],onChange:()=>{changes++;}});
 await c.refresh();const afterFirst=changes;
 await c.refresh({background:true});assert.equal(changes,afterFirst,'An unchanged background tick must not repaint the page');
 current={...roster(),phase:'in-champ-select'};await c.refresh({background:true});assert.ok(changes>afterFirst,'A changed roster must repaint the page');
 await c.refresh();assert.ok(c.state.loading===false);
});

test('a late or changed display name repaints once without reloading the player history',async()=>{
 let current={...roster(),players:[{...member,name:''}]},changes=0,pages=0;
 const c=createOngoingGameController({request:async op=>op==='roster'?current:op==='page'?(pages++,page):{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[],onChange:()=>{changes++;}});
 await c.refresh();const loaded=c.state.players[member.key];let prior=changes;
 for(const name of ['已补齐#TEST','更新名字#TEST']){
  current={...roster(),players:[{...member,name}]};await c.refresh({background:true});
  assert.equal(changes,prior+1,'Name-only changes must repaint exactly once');assert.equal(c.state.roster.players[0].name,name);assert.equal(c.state.players[member.key],loaded);assert.equal(pages,1);
  prior=changes;await c.refresh({background:true});assert.equal(changes,prior,'An unchanged name must still preserve the page');
 }
});
test('a quiet tick still clears a resolved failure so the page stops claiming an error',async()=>{
 let fail=true,changes=0;const good=roster();
 const c=createOngoingGameController({request:async(op)=>{if(op==='roster'){if(fail)throw Error('读取未完成');return good;}return op==='page'?page:{};},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[],onChange:()=>{changes++;}});
 await c.refresh();assert.match(c.state.error,/读取未完成/);const afterError=changes;
 fail=false;await c.refresh({background:true});
 assert.equal(c.state.error,'','A successful background read clears the stale message');assert.ok(changes>afterError,'Clearing the message repaints once');
});
test('a later snapshot that fills the Arena subteam id or role still repaints the page',async()=>{
 const good=roster(),changes=[];let current={...good,players:[{...member,group:null,role:null,level:null}]};
 const c=createOngoingGameController({request:async(op)=>op==='roster'?current:op==='page'?page:{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[],onChange:()=>{changes.push(current.players[0].group);}});
 await c.refresh();const afterFirst=changes.length;
 await c.refresh({background:true});assert.equal(changes.length,afterFirst,'An unchanged roster stays unpainted');
 current={...good,players:[{...member,group:3}]};await c.refresh({background:true});
 assert.equal(changes.at(-1),3,'A newly reported subteam id must reach the page');
});
test('a superseded foreground refresh never leaves the page painted as loading',async()=>{
 const good=roster(),paints=[];let deferNext=false,release=null;
 const c=createOngoingGameController({request:async(op)=>{if(op==='roster'){if(deferNext){deferNext=false;return new Promise(resolve=>{release=()=>resolve(good);});}return good;}return op==='page'?page:{};},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[],onChange:()=>{paints.push(c.state.loading);}});
 await c.refresh();deferNext=true;
 const pending=c.refresh();assert.equal(paints.at(-1),true,'The manual refresh paints its loading state');
 await c.refresh({background:true});   // a tick takes a newer ticket while the manual answer is in flight
 release();await pending;
 assert.equal(c.state.loading,false);assert.equal(paints.at(-1),false,'The last painted state must not still claim a load in progress');
});
test('old player data cannot enter a replacement game even when its request completes last',async()=>{
 let release,next=roster();const c=createOngoingGameController({request:async(op)=>op==='roster'?next:op==='page'?new Promise(resolve=>release=resolve):{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});
 const pending=c.refresh();while(!release)await new Promise(resolve=>setImmediate(resolve));next={...roster('two'),players:[],teams:{}};await c.refresh();release(page);await pending;
 assert.equal(c.state.roster.key,'two');assert.equal(Object.keys(c.state.players).length,0);
});
test('stopping or disabling ongoing polling invalidates late data without saving personal history',async()=>{
 let release;const c=createOngoingGameController({request:async(op)=>op==='roster'?new Promise(resolve=>release=resolve):{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});
 const pending=c.refresh();c.stop();release(roster());await pending;assert.equal(c.state.roster,null);assert.equal(c.state.loading,false);
});
test('display-only settings reuse loaded data and never restart all player queries',async()=>{
 let calls=0;const c=createOngoingGameController({request:async(op)=>{calls++;return op==='roster'?roster():op==='page'?page:{};},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});
 await c.refresh();const before=calls,entry=c.state.players[member.key];await c.configure({sort:'kda',streamer:true});assert.equal(calls,before);assert.equal(c.state.players[member.key],entry);
});
test('switching games cannot leave a refresh failure spinner or mix history from the old game',async()=>{
 let reads=0;const c=createOngoingGameController({request:async(op)=>{if(op==='roster')return roster('new-game');if(op==='page'){reads++;throw Error('history offline');}return {};},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});
 await c.refresh();assert.equal(c.state.loading,false);assert.equal(c.state.players[member.key].loading,false);assert.match(c.state.players[member.key].error,/offline/);assert.equal(reads,1);
});
test('polling keeps observing phases while player histories are pending and obeys one shared concurrency limit',async()=>{
 let tick,rosterReads=0,running=0,maxRunning=0;const releases=[];
 const members=Array.from({length:6},(_,i)=>({...member,key:member.key+i,puuid:member.puuid+i}));
 const c=createOngoingGameController({request:async(op)=>{if(op==='roster'){rosterReads++;return {...roster(),players:members,teams:{LOBBY:members.map(p=>p.key)}};}if(op==='page'){running++;maxRunning=Math.max(running,maxRunning);await new Promise(resolve=>releases.push(resolve));running--;return page;}return {};},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[],setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>{}});
 c.start();await new Promise(resolve=>setImmediate(resolve));await tick();await new Promise(resolve=>setImmediate(resolve));await tick();await new Promise(resolve=>setImmediate(resolve));
 assert.ok(rosterReads>=3);assert.ok(maxRunning<=2);c.stop();for(const release of releases)release();
});
test('a replacement account session clears personal notes and encounter records',async()=>{
 let next=roster();const c=createOngoingGameController({request:async op=>op==='roster'?next:op==='page'?page:{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});
 await c.refresh();c.note(member.key,'本次备注');c.state.met[member.puuid]={count:1};next={...roster('other'),session:'account-two'};await c.refresh();assert.deepEqual(c.state.notes,{});assert.deepEqual(c.state.met,{});
});
test('late public members are counted once in the current encounter and large teams never exceed inference bounds',async()=>{
 let next={...roster(),phase:'in-game',gameId:100};const calls=[],c=createOngoingGameController({request:async op=>op==='roster'?next:op==='page'?page:{},analyze:()=>null,teamAnalyze:()=>null,infer:(_games,ids)=>{calls.push(ids.length);if(ids.length>16)throw Error('too many');return [];}});
 await c.refresh();const others=Array.from({length:17},(_,i)=>({...member,key:'mock-roster-public-'+i,puuid:'mock-roster-public-'+i,self:false}));next={...next,key:'more',players:[member,...others],teams:{LOBBY:[member.key,...others.map(p=>p.key)]}};await c.refresh();await c.refresh();assert.equal(c.state.met[others[0].puuid].count,1);assert.ok(calls.every(v=>v<=16));assert.equal(c.state.error,'');
});
test('original historical-group times are converted to the renderer count contract',async()=>{
 const other={...member,key:'mock-second-public-player',puuid:'mock-second-public-player',self:false},c=createOngoingGameController({request:async op=>op==='roster'?{...roster(),players:[member,other],teams:{LOBBY:[member.key,other.key]}}:op==='page'?page:{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[{players:[member.puuid,other.puuid],times:5,ids:[1,2,3,4,5]}]});
 await c.refresh();assert.equal(c.state.groups[0].count,5);assert.equal(c.state.groups[0].inferred,true);
});
test('historical roster settings can reload its players and returning to the page resumes cancelled history',async()=>{
 let reads=0;const c=createOngoingGameController({request:async op=>op==='page'?(reads++,page):{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[],setTimer:()=>1,clearTimer:()=>{}}),game={id:1,map:11,queue:420,mode:'CLASSIC',self:member,participants:[{...member,champion:22,team:'TEAM-100'}]};
 await c.setDraft(game);await c.configure({count:10});assert.equal(c.state.roster.phase,'draft');assert.equal(reads,2);c.stop();c.start();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.state.roster.phase,'draft');c.stop();
});
test('clearing a historical simulation returns refresh to the live roster',async()=>{
 let reads=0;const c=createOngoingGameController({request:async op=>op==='roster'?(reads++,roster()):op==='page'?page:{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});await c.setDraft({id:1,map:11,queue:420,mode:'CLASSIC',self:member,participants:[{...member,team:'TEAM-100'}]});c.clear();await c.refresh();assert.equal(c.state.draft,false);assert.equal(reads,1);assert.equal(c.state.roster.key,'one');
});
test('Arena encounters use verified public subteams and preserve unknown relationship counts',async()=>{
 const other={...member,key:'mock-arena-other-player',puuid:'mock-arena-other-player',self:false,group:2,team:'TEAM-ALL'},unknown={...other,key:'mock-arena-unknown-player',puuid:'mock-arena-unknown-player',group:null};
 const c=createOngoingGameController({request:async op=>op==='roster'?{...roster(),gameId:100,phase:'in-game',mode:'CHERRY',players:[{...member,group:1,team:'TEAM-ALL'},other,unknown],teams:{'TEAM-ALL':[member.key,other.key,unknown.key]}}:op==='page'?page:{},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});await c.refresh();assert.equal(c.state.met[other.puuid].enemy,1);assert.equal(c.state.met[unknown.puuid].unknown,1);assert.equal(c.state.met[unknown.puuid].ally,0);
});
test('every list and rank arrives before detailed samples, which share one round-robin queue and read a shared game once',async()=>{
 const members=Array.from({length:6},(_,i)=>({...member,key:'mock-public-member-'+i,puuid:'mock-public-member-'+i,self:i===0})),timelines=[],calls=[];let running=0,maxWhileLists=0,maxAfter=0;
 // Every player's history holds the shared game 100 plus three own games.
 const games=i=>[100,...[1,2,3].map(n=>i*10+n)].map(id=>({id,queue:430}));
 const c=createOngoingGameController({settings:{details:4},request:async(op,p)=>{
  calls.push([op,p]);
  if(op==='roster')return {...roster(),players:members,teams:{LOBBY:members.map(m=>m.key)}};
  if(op==='page'){await new Promise(resolve=>setImmediate(resolve));return {...page,handle:'handle-'+p.puuid,games:games(members.findIndex(m=>m.puuid===p.puuid))};}
  if(op==='profile')return {ranked:[]};
  if(op==='timeline'){running++;const lists=Object.values(c.state.players).some(entry=>entry.loading);if(lists)maxWhileLists=Math.max(maxWhileLists,running);else maxAfter=Math.max(maxAfter,running);return new Promise(resolve=>timelines.push({id:p.id,resolve:()=>{running--;resolve({timeline:{frames:[]}});}}));}
  return {};
 },analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});
 const loading=c.refresh();
 for(let i=0;i<80&&(Object.keys(c.state.players).length<6||Object.values(c.state.players).some(entry=>entry.loading||!entry.profile));i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(members.every(m=>c.state.players[m.key].page&&c.state.players[m.key].profile&&!c.state.players[m.key].loading),'Pending samples must not hold back any list or rank');
 assert.ok(maxWhileLists<=1,'Samples yield to list reads');
 while(timelines.length){timelines.shift().resolve();for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));}
 await loading;
 const order=calls.filter(([op])=>op==='timeline').map(([,p])=>p.id);
 assert.equal(order.filter(id=>id===100).length,1,'A game in several histories is read once');
 assert.deepEqual(order.slice(0,6).sort((a,b)=>a-b),[1,11,21,31,41,51].slice(0,5).concat(100).sort((a,b)=>a-b),'Each player gets an early sample before anyone gets a second');
 assert.ok(maxAfter<=2);
 assert.ok(members.every(m=>c.state.players[m.key].loadedDetails===4&&!c.state.players[m.key].detailsLoading));
});
test('deeper history pages load in the background as one request and never hold a player slot',async()=>{
 const members=Array.from({length:3},(_,i)=>({...member,key:'mock-deeper-member-'+i,puuid:'mock-deeper-member-'+i})),calls=[],releases=[];
 const c=createOngoingGameController({settings:{concurrency:1},request:async(op,p)=>{calls.push([op,p]);if(op==='roster')return {...roster(),players:members,teams:{LOBBY:members.map(m=>m.key)}};if(op==='page')return p.start?new Promise(resolve=>releases.push(()=>resolve({...page,start:20,count:p.count,games:[]}))):{...page,hasMore:true,games:[]};if(op==='profile')return {ranked:[]};return {};},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]});
 const loading=c.refresh();
 for(let i=0;i<80&&(Object.keys(c.state.players).length<3||Object.values(c.state.players).some(entry=>!entry.profile));i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(members.every(m=>c.state.players[m.key].profile&&!c.state.players[m.key].loading&&c.state.players[m.key].detailsLoading),'Every rank shows while deeper pages are pending');
 assert.ok(releases.length<=2,'Deeper pages share the bounded background queue');
 while(releases.length){releases.shift()();for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));}
 await loading;
 assert.deepEqual(calls.filter(([op])=>op==='page').map(([,p])=>p.start+':'+p.count).sort(),['0:20','0:20','0:20','20:30','20:30','20:30']);
 assert.ok(members.every(m=>!c.state.players[m.key].detailsLoading));
});

test('player reload and full force refresh replace a fallback timeline and still coalesce shared games',async()=>{
 const members=[member,{...member,key:'mock-second',puuid:'mock-second'}];let timelineReads=0,recovered=false;
 const c=createOngoingGameController({settings:{details:1},request:async(op)=>{
  if(op==='roster')return {...roster(),players:members,teams:{LOBBY:members.map(m=>m.key)}};
  if(op==='page')return {...page,handle:'new-handle',games:[{id:1,queue:430}]};if(op==='profile')return {};
  timelineReads++;return {timeline:{frames:[],complete:recovered},notice:recovered?'':'后台时间线暂不可用，已使用客户端数据'};
 },analyze:(_games,{timelines}={})=>({complete:timelines?.[1]?.complete||false}),teamAnalyze:()=>null,infer:()=>[]});
 await c.refresh();assert.equal(timelineReads,1);assert.equal(c.state.players[member.key].analysis.complete,false);
 recovered=true;await c.reloadPlayer(member.key);assert.equal(timelineReads,2);assert.equal(c.state.players[member.key].analysis.complete,true);
 await c.refresh({force:true});assert.equal(timelineReads,3);assert(members.every(m=>c.state.players[m.key].analysis.complete));
});

test('reloading one player keeps other current players in-flight samples',async()=>{
 const members=[member,{...member,key:'mock-held-other',puuid:'mock-held-other'}],held=[];let timelineReads=0;
 const c=createOngoingGameController({settings:{details:1},request:async(op,p)=>{
  if(op==='roster')return {...roster(),players:members,teams:{LOBBY:members.map(m=>m.key)}};
  if(op==='page')return {...page,handle:p.puuid,games:[{id:p.puuid===member.puuid?1:2,queue:430}]};if(op==='profile')return {};
  const serial=++timelineReads;return new Promise(resolve=>held.push({id:p.id,serial,done:()=>resolve({timeline:{frames:[],serial}})}));
 },analyze:(_games,{timelines}={})=>({serial:Object.values(timelines||{})[0]?.serial||0}),teamAnalyze:()=>null,infer:()=>[]});
 const initial=c.refresh();for(let i=0;i<80&&held.length<2;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(held.length,2);
 const reload=c.reloadPlayer(member.key);held.find(h=>h.id===2).done();held.find(h=>h.id===1).done();
 for(let i=0;i<80&&held.length<3;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(held.length,3);held[2].done();await Promise.all([initial,reload]);
 assert.equal(c.state.players[members[1].key].loadedDetails,1);assert.equal(c.state.players[members[1].key].analysis.serial,held.find(h=>h.id===2).serial);assert.equal(c.state.players[member.key].analysis.serial,3);
});
