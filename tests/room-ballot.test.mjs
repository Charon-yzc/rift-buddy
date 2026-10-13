import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sanitizeShare,proposalKey,sanitizeRoomBallot} from '../src/core/room.mjs';
import {relayWelcome,sanitizeRelayState} from '../src/core/room-relay.mjs';
import {roomBallotBoard,createBallotRoundObserver,lineupFit} from '../src/core/room-ballot.mjs';
import {createRoomService} from '../services/room.mjs';
const {champions}=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const a={lineup:[{role:'mid',champion:'Ahri'},{role:'bottom',champion:'Ashe'},{role:'support',champion:'Braum'}],mode:'rift'};
const b={lineup:[{role:'mid',champion:'Galio'},{role:'bottom',champion:'Jinx'},{role:'support',champion:'Lulu'}],mode:'rift'};
const state=(proposal,vote)=>({lineup:[],pick:null,mode:'rift',ballot:{version:1,proposal,vote}});

test('same heroes with different routes stay distinct on every member ordering',()=>{
 const runes={primaryStyleId:8000,subStyleId:8300,selectedPerkIds:[8005,8009,9104,8014,8304,8345,5005,5008,5001]};
 const config={champion:'Ahri',role:'mid',mode:'rift',patch:'16.20',start:[1056],items:[6655,3089],boots:[3020],runes,spells:['SummonerFlash','SummonerIgnite'],skills:'QWE',priority:'QWE',first:'QWE'};
 const first={...a,configurations:[config]},second={...a,configurations:[{...config,items:[6653,3137]}]};
 const keyA=proposalKey(first),keyB=proposalKey(second);assert.ok(keyA);assert.notEqual(keyA,keyB);
 const members=[{nick:'甲',self:true,share:state(first,keyA)},{nick:'乙',share:state(second,keyB)}];
 const left=roomBallotBoard({members},[],champions),right=roomBallotBoard({members:[...members].reverse()},[],champions);
 assert.equal(left.length,2);assert.deepEqual(left,right);assert.deepEqual(left.map(row=>row.voters.length),[1,1]);
 assert.equal(proposalKey({...first,lineup:[...first.lineup].reverse()}),keyA,'Transport array ordering does not change a vote');
});

test('ballots survive the lobby-to-draft handoff but clear after a game or a direct new game',()=>{
 const observe=createBallotRoundObserver(),snap=(phase,id)=>({connected:true,phase,session:id?{gameId:id}:null});
 assert.equal(observe(snap('Lobby')),false);assert.equal(observe(snap('ChampSelect',1)),false);
 assert.equal(observe({connected:false,phase:'Offline'}),false);assert.equal(observe(snap('ChampSelect',1)),false);
 assert.equal(observe(snap('ChampSelect',2)),true);assert.equal(observe(snap('InProgress',2)),false);
 assert.equal(observe(snap('Lobby')),true);assert.equal(observe(snap('ChampSelect',3)),false);
});

test('a party hero in another proposed lane is a role mismatch, not a missing hero',()=>{
 const current=[{role:'mid',champion:'Ahri',party:true,clientCellId:0},{role:'support',champion:'Nami',party:true,clientCellId:1},{role:'bottom',champion:null,party:false}];
 const fit=lineupFit([{role:'bottom',champion:'Ahri'},{role:'support',champion:'Nami'}],current,champions);
 assert.equal(fit.compatible,true);assert.equal(fit.exact,false);assert.match(fit.reason,/已选英雄 40\/40/);
});

test('manual fixed heroes affect compatibility and ranking while unconfirmed assistant choices stay replaceable',()=>{
 const current=a.lineup.map(s=>({...s,party:true,locked:true}));
 const changed={...a,lineup:a.lineup.map(s=>s.role==='mid'?{...s,champion:'Annie'}:s)};
 const room={members:[{nick:'甲',share:state(a,null)},{nick:'乙',share:state(changed,proposalKey(changed))}]};
 const rows=roomBallotBoard(room,current,champions);
 assert.equal(rows[0].key,proposalKey(a));assert.equal(rows[1].fit.compatible,false);assert.equal(rows[1].fit.exact,false);
 assert.ok(rows[0].fit.score>rows[1].fit.score);assert.doesNotMatch(rows[1].fit.reason,/尚未选人/);
 const moved=a.lineup.map(s=>s.role==='mid'?{...s,role:'top'}:s),fit=lineupFit(moved,current,champions);
 assert.equal(fit.compatible,true);assert.equal(fit.exact,false);assert.match(fit.reason,/已选英雄 40\/40/);
 const proposals=current.map(s=>({...s,automaticPosition:true}));
 assert.equal(lineupFit(changed.lineup,proposals,champions).compatible,true);
 proposals[0].clientCellId=1;assert.equal(lineupFit(changed.lineup,proposals,champions).compatible,false,'Real client picks remain fixed even if they originated in a proposal');
});
test('relay preserves bounded proposal and votes without forwarding arbitrary private data',()=>{
 const raw={kind:'state',v:1,from:'甲',at:1,...state(a,proposalKey(a.lineup)),riotId:'private'};
 const read=JSON.parse(sanitizeRelayState(JSON.stringify(raw),'甲'));
 assert.deepEqual(read.ballot,raw.ballot);assert.equal(read.riotId,undefined);assert.equal(relayWelcome('123456',[]).ballots,1);
 assert.equal(sanitizeRoomBallot({version:1,proposal:{lineup:[...a.lineup,{role:'mid',champion:'Ahri'}]},vote:null}),null);
 assert.equal(sanitizeShare({...raw,ballot:{version:1,proposal:null,vote:'x'.repeat(1000)}}),null);
});
test('one vote per connected member, ties deterministic, actual picks override compatibility',()=>{
 const room={members:[{nick:'甲',self:true,share:state(a,proposalKey(a.lineup))},{nick:'乙',share:state(b,proposalKey(a.lineup))},{nick:'丙',share:state(null,proposalKey(b.lineup))}]};
 let rows=roomBallotBoard(room,[],champions);assert.equal(rows[0].voters.length,2);assert.equal(rows[0].mine,true);
 room.members[1].share.ballot.vote=proposalKey(b.lineup);rows=roomBallotBoard(room,[],champions);assert.equal(rows[0].key,proposalKey(b.lineup));assert.equal(rows[0].voters.length,2);
 const current=[{role:'mid',champion:'Ahri',party:true,clientCellId:1}];rows=roomBallotBoard(room,current,champions);assert.equal(rows[0].key,proposalKey(a.lineup));assert.equal(rows[1].fit.compatible,false);assert.match(rows[0].fit.reason,/不是胜率/);
 room.members.pop();rows=roomBallotBoard(room,current,champions);assert.equal(rows[1].voters.length,1);
});
test('LAN host/guest round trip broadcasts votes and late joiners receive proposals',async()=>{
 const host=createRoomService({nick:'甲',listenHost:'127.0.0.1',discovery:false}),guest=createRoomService({nick:'乙',discovery:false}),late=createRoomService({nick:'丙',discovery:false});
 const until=async fn=>{for(let i=0;i<80;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('room did not converge');};
 try{const h=await host.host();const target={host:'127.0.0.1',port:h.port,room:h.room,pin:h.pin};
  await guest.join(target);assert.equal(guest.snapshot().ballots,true);
  host.publish(state(a,proposalKey(a.lineup)));guest.publish(state(null,proposalKey(a.lineup)));
  await until(()=>roomBallotBoard(host.snapshot(),[],champions)[0]?.voters.length===2);
  await late.join(target);await until(()=>roomBallotBoard(late.snapshot(),[],champions)[0]?.voters.length===2);
 }finally{host.dispose();guest.dispose();late.dispose();}
});
