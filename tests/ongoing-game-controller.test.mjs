import test from 'node:test';
import assert from 'node:assert/strict';
import {createOngoingGameController} from '../src/ongoing-game-controller.mjs';
const member={key:'mock-public-player-1',puuid:'mock-public-player-1',name:'本人',self:true,team:'LOBBY'};
const roster=(key='one')=>({key,session:'account-one',phase:'lobby',queue:430,players:[member],teams:{LOBBY:[member.key]},selfPuuid:member.puuid});
const page={handle:'handle-one',games:[],count:20,start:0,hasMore:false,player:{puuid:member.puuid}};
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
test('a quiet tick still clears a resolved failure so the page stops claiming an error',async()=>{
 let fail=true,changes=0;const good=roster();
 const c=createOngoingGameController({request:async(op)=>{if(op==='roster'){if(fail)throw Error('读取未完成');return good;}return op==='page'?page:{};},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[],onChange:()=>{changes++;}});
 await c.refresh();assert.match(c.state.error,/读取未完成/);const afterError=changes;
 fail=false;await c.refresh({background:true});
 assert.equal(c.state.error,'','A successful background read clears the stale message');assert.ok(changes>afterError,'Clearing the message repaints once');
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
