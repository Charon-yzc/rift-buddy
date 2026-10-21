import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sanitizeShare,proposalKey,sanitizeRoomBallot,ballotVotes,encodeFrame,decodeFrame} from '../src/core/room.mjs';
import {relayWelcome,sanitizeRelayState} from '../src/core/room-relay.mjs';
import {roomBallotBoard,createBallotRoundObserver,lineupFit} from '../src/core/room-ballot.mjs';
import {createRoomService} from '../services/room.mjs';
import {roomBallotView,candidateBallotActions} from '../src/room-ballot-view.mjs';
const {champions}=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const a={lineup:[{role:'mid',champion:'Ahri'},{role:'bottom',champion:'Ashe'},{role:'support',champion:'Braum'}],mode:'rift'};
const b={lineup:[{role:'mid',champion:'Galio'},{role:'bottom',champion:'Jinx'},{role:'support',champion:'Lulu'}],mode:'rift'};
const state=(proposal,vote)=>({lineup:[],pick:null,mode:'rift',ballot:{version:1,proposal,vote}});

test('later public teammate picks remove conflicting proposals and votes on both compact boards',()=>{
 const key=proposalKey(a),room={mode:'client',ballots:true,members:[{nick:'甲',share:state(a,key)},{nick:'乙',share:state(b,proposalKey(b))}]};
 const current=[{role:'mid',party:true,clientCellId:0},{role:'bottom',party:true,clientCellId:1},{role:'support',party:true,clientCellId:2},{role:'top',party:false,clientCellId:3}];
 const player={cellId:3,championId:champions.find(c=>c.id==='Ashe').key,assignedPosition:'TOP',pickState:'locked'},session={localPlayerCellId:0,myTeam:[{cellId:0,championId:0},player]};
 assert.equal(roomBallotBoard(room,current,champions).length,2);
 const rows=roomBallotBoard(room,current,champions,{scope:'party',clientSession:session});assert.deepEqual(rows.map(r=>r.key),[proposalKey(b)]);assert.equal(rows[0].voters.length,1);
 const html=roomBallotView(room,current,champions,{scope:'party',clientSession:session});assert.doesNotMatch(html,new RegExp('data-proposal-key="'+key+'"'));assert.match(html,/1 套/);
 assert.equal(room.members[0].share.ballot.proposal,a,'Only filter availability; do not erase another member’s proposal');
});

test('a member choosing their proposed hero keeps the proposal, but a different fixed hero removes it',()=>{
 const room={members:[{nick:'甲',share:state(a,null)}]},current=a.lineup.map((s,i)=>({...s,champion:null,party:true,clientCellId:i})),key=champions.find(c=>c.id==='Ashe').key;
 const session={localPlayerCellId:0,myTeam:[{cellId:0,championId:0},{cellId:1,championId:key,pickState:'locked',assignedPosition:'BOTTOM'}]};
 assert.equal(roomBallotBoard(room,current,champions,{clientSession:session}).length,1);
 session.myTeam[1].championId=champions.find(c=>c.id==='Jinx').key;assert.deepEqual(roomBallotBoard(room,current,champions,{clientSession:session}),[]);
});

test('ignored hovers and incomplete identity do not withdraw proposals; preselection is explicit',()=>{
 const room={members:[{nick:'甲',share:state(a,null)}]},current=a.lineup.map((s,i)=>({...s,party:true,clientCellId:i})),key=champions.find(c=>c.id==='Ashe').key;
 const session={localPlayerCellId:0,myTeam:[{cellId:0,championId:0},{cellId:3,championId:key,assignedPosition:'TOP'}],actions:[[{type:'pick',actorCellId:3,championId:key,completed:false}]]};
 assert.equal(roomBallotBoard(room,current,champions,{clientSession:session}).length,1);assert.deepEqual(roomBallotBoard(room,current,champions,{clientSession:session,includePreselected:true}),[]);
 session.actions=[];session.myTeam[1]={cellId:3,championId:key,pickState:'locked',assignedPosition:''};assert.equal(roomBallotBoard(room,[],champions,{clientSession:session}).length,1,'Unknown ownership is not an invented lane');
 session.myTeam.push({...session.myTeam[1]});assert.equal(roomBallotBoard(room,current,champions,{clientSession:session}).length,1);
});

test('manual player positions take precedence over assigned lanes when checking proposal availability',()=>{
 const room={members:[{nick:'甲',share:state(a,null)}]},current=a.lineup.map((s,i)=>({...s,party:true,clientCellId:i,manualPosition:true})),key=champions.find(c=>c.id==='Ashe').key;
 const session={localPlayerCellId:0,myTeam:[{cellId:0,championId:0},{cellId:1,championId:key,pickState:'locked',assignedPosition:'SUPPORT'}]};
 assert.equal(roomBallotBoard(room,current,champions,{clientSession:session}).length,1);
 current[1].clientCellId=2;current[2].clientCellId=1;assert.deepEqual(roomBallotBoard(room,current,champions,{clientSession:session}),[]);
});

test('a confirmed teammate pick cannot be hidden by another member intent or unfinished pick',()=>{
 const room={members:[{nick:'甲',share:state(a,null)}]},current=a.lineup.map((s,i)=>({...s,party:true,clientCellId:i})),key=champions.find(c=>c.id==='Ashe').key;
 for(const unfinished of [false,true])for(const includePreselected of [false,true]){
  const session={localPlayerCellId:0,myTeam:[{cellId:0,championId:0},{cellId:1,championId:unfinished?key:0,championPickIntent:key},{cellId:3,championId:key,assignedPosition:'TOP',pickState:'locked'}],actions:unfinished?[[{type:'pick',actorCellId:1,championId:key,completed:false}]]:[]};
  assert.deepEqual(roomBallotBoard(room,current,champions,{clientSession:session,includePreselected}),[]);
 }
});

test('candidate actions show only the local vote state once a matching proposal is visible',()=>{
 const key=proposalKey(a),room={mode:'client',ballots:true,members:[{nick:'伙伴',share:state(a,key)},{self:true,share:state(null,null)}]};
 const actions=candidateBallotActions(room,key,3);assert.equal((actions.match(/<button /g)||[]).length,1);
 assert.match(actions,/>未投<\/button>/);assert.doesNotMatch(actions,/propose-result|已提议|未投 1/);
 room.members[1].share=state(null,key);assert.match(candidateBallotActions(room,key,3),/>已投<\/button>/);
 const unavailable=candidateBallotActions({...room,ballots:false},key,3);assert.match(unavailable,/propose-result[^>]*disabled/);assert.doesNotMatch(unavailable,/room-vote/);
});

test('another configuration for the same champions remains a separately proposable candidate',()=>{
 const config={champion:'Ashe',role:'bottom',mode:'rift',patch:'16.20',start:[1055],items:[3031,3085],boots:[3006],runes:null,spells:['SummonerFlash','SummonerBarrier'],skills:'WQEW',priority:'WQE',first:'WQE'};
 const one={...a,configurations:[config]},two={...a,configurations:[{...config,items:[3085,3031]}]},keys=[proposalKey(one),proposalKey(two)];assert.notEqual(keys[0],keys[1]);
 const room={mode:'client',ballots:true,members:[{share:state(one,keys[0])}]};
 assert.match(candidateBallotActions(room,keys[0],0),/room-vote/);assert.match(candidateBallotActions(room,keys[1],1),/propose-result/);
});

test('multi-vote sets are bounded, unique and authoritative over the legacy projection',()=>{
 const ka=proposalKey(a),kb=proposalKey(b);
 assert.deepEqual(ballotVotes(sanitizeRoomBallot({version:1,proposal:a,votes:[ka,kb,ka],vote:kb})),[ka,kb]);
 assert.deepEqual(sanitizeRoomBallot({version:1,proposal:null,votes:[],vote:ka}),{version:1,proposal:null,votes:[],vote:null});
 assert.deepEqual(ballotVotes({version:1,vote:ka}),[ka]);
 for(const votes of [null,'x',Array(13).fill(ka),['x'.repeat(261)],['invalid!']])assert.equal(sanitizeRoomBallot({version:1,proposal:null,votes}),null);
 const clean=sanitizeShare({kind:'state',v:1,from:'甲',at:1,...state(a,ka),ballot:{version:1,proposal:a,votes:[ka,kb,ka]}});
 assert.equal(clean.ballot.vote,ka);assert.deepEqual(clean.ballot.votes,[ka,kb]);
 assert.deepEqual(JSON.parse(sanitizeRelayState(JSON.stringify(clean),'甲')).ballot,clean.ballot);
 assert.deepEqual(decodeFrame(encodeFrame(clean)).ballot,clean.ballot);
 assert.equal(relayWelcome('123456',[]).multiVotes,1);
});

test('one player can support multiple lineups without amplifying either score',()=>{
 const ka=proposalKey(a),kb=proposalKey(b),self={nick:'我',self:true,share:{...state(a,ka),ballot:{version:1,proposal:a,votes:[ka,kb,ka],vote:ka}}};
 const room={mode:'client',ballots:true,multiVotes:true,members:[self,{nick:'伙伴',share:state(b,null)}]};
 let rows=roomBallotBoard(room,[],champions);assert.equal(rows.length,2);assert.ok(rows.every(row=>row.mine&&row.voters.length===1));
 for(const key of [ka,kb])assert.match(candidateBallotActions(room,key,0),/>已投<\/button>/);
 self.share.ballot.votes=[kb];rows=roomBallotBoard(room,[],champions);
 assert.equal(rows.find(row=>row.key===ka).voters.length,0);assert.equal(rows.find(row=>row.key===kb).voters.length,1);
 self.share.ballot.votes=[];assert.ok(roomBallotBoard(room,[],champions).every(row=>row.voters.length===0));
});

test('shared proposals are visible, voting is primary and adoption stays in details',()=>{
 const key=proposalKey(a),room={mode:'client',ballots:true,members:[{nick:'伙伴',share:state(a,key)},{nick:'我',self:true,share:state(null,null)}]};
 const html=roomBallotView(room,[],champions),vote=html.indexOf('data-action="room-vote"'),adopt=html.indexOf('data-action="room-adopt-ballot"'),details=html.indexOf('data-action="room-ballot-details"');
 assert.match(html,/<section class="room-ballot-board"/);assert.doesNotMatch(html,/<details class="room-ballot-board"/);assert.ok(vote<details);assert.equal(adopt,-1);
 const actions=candidateBallotActions(room,key,0);assert.doesNotMatch(actions,/propose-result/);assert.match(actions,/>未投<\/button>/);
 assert.doesNotMatch(candidateBallotActions(room,proposalKey(b),1),/room-vote/,'A different proposal cannot inherit votes');
});

test('explicit adoption is separate from voting and retains its proposal when a member changes hero or setup',()=>{
 const config={champion:'Ashe',role:'bottom',mode:'rift',patch:'16.20',start:[1055],items:[3031,3085],boots:[3006],runes:null,spells:['SummonerFlash','SummonerBarrier'],skills:'WQEW',priority:'WQE',first:'WQE'};
 const proposal={lineup:[{role:'bottom',champion:'Ashe'},{role:'support',champion:'Nami'}],mode:'rift',configurations:[config]},key=proposalKey(proposal);
 const host={nick:'甲',self:true,share:state(proposal,key)},guest={nick:'乙',share:{...state(null,key),pick:{champion:'Nami',role:'support',mode:'rift'}}};
 const room={mode:'host',ballots:true,adoptions:true,members:[host,guest]};
 assert.equal(roomBallotBoard(room,[],champions)[0].adopters.length,0,'A vote is not adoption');
 host.share.ballot.accepted={key,role:'bottom'};
 let row=roomBallotBoard(room,[],champions)[0];assert.equal(row.adopters[0].state,'pending');
 host.share.pick={champion:'Ashe',role:'bottom',mode:'rift'};host.share.configurations=[{...config,spells:config.spells.toReversed()}];
 row=roomBallotBoard(room,[],champions)[0];assert.equal(row.adopters[0].state,'matched','Each player keeps their D/F placement');
 host.share.configurations[0].items=[3085,3031];
 assert.equal(roomBallotBoard(room,[],champions)[0].adopters[0].state,'changed-configuration');
 guest.share.ballot.accepted={key,role:'support'};guest.share.pick.champion='Lulu';guest.share.lineup=[{role:'support',champion:'Lulu'}];
 row=roomBallotBoard(room,[],champions)[0];assert.equal(row.voters.length,2);assert.equal(row.adopters.find(m=>m.nick==='乙').state,'changed-pick');
 const html=roomBallotView(room,[],champions);assert.match(html,/已采用 2/);assert.match(html,/2 人已改选或调整配置/);assert.match(html,/投票仅表示意向/);
 guest.online=false;assert.equal(roomBallotBoard(room,[],champions)[0].adopters.length,1);
});

test('adoption metadata is bounded and old peers remain readable without inventing confirmation',()=>{
 const key=proposalKey(a),ballot={version:1,proposal:a,vote:key,accepted:{key,role:'bottom',riotId:'private'}};
 const clean=sanitizeRoomBallot(ballot);assert.deepEqual(clean.accepted,{key,role:'bottom'});
 assert.equal(sanitizeRoomBallot({...ballot,accepted:{key:'x'.repeat(999),role:'bottom'}}),null);
 assert.equal(sanitizeRoomBallot({...ballot,accepted:{key,role:'unknown'}}),null);
 const share=sanitizeShare({kind:'state',v:1,from:'甲',at:1,lineup:[],pick:null,ballot:clean});assert.deepEqual(share.ballot.accepted,clean.accepted);
 assert.deepEqual(JSON.parse(sanitizeRelayState(JSON.stringify(share),'甲')).ballot.accepted,clean.accepted);
 assert.equal(relayWelcome('123456',[]).adoptions,1);
 const old={mode:'client',ballots:true,members:[{nick:'甲',share:state(a,key)}]};
 assert.equal(roomBallotBoard(old,[],champions)[0].adopters.length,0);
 assert.doesNotMatch(roomBallotView(old,[],champions),/已采用/);
});

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
 assert.equal(fit.compatible,true);assert.equal(fit.exact,false);assert.match(fit.reason,/固定位置冲突/);
});

test('manual fixed heroes affect compatibility and ranking while unconfirmed assistant choices stay replaceable',()=>{
 const current=a.lineup.map(s=>({...s,party:true,locked:true}));
 const changed={...a,lineup:a.lineup.map(s=>s.role==='mid'?{...s,champion:'Annie'}:s)};
 const room={members:[{nick:'甲',share:state(a,null)},{nick:'乙',share:state(changed,proposalKey(changed))}]};
 const rows=roomBallotBoard(room,current,champions);
 assert.equal(rows[0].key,proposalKey(a));assert.equal(rows[1].fit.compatible,false);assert.equal(rows[1].fit.exact,false);
 assert.ok(rows[0].fit.score>rows[1].fit.score);assert.doesNotMatch(rows[1].fit.reason,/尚未选人/);
 const moved=a.lineup.map(s=>s.role==='mid'?{...s,role:'top'}:s),fit=lineupFit(moved,current,champions);
 assert.equal(fit.compatible,true);assert.equal(fit.exact,false);assert.match(fit.reason,/固定位置冲突/);assert.ok(fit.score<=45);
 const proposals=current.map(s=>({...s,automaticPosition:true}));
 assert.equal(lineupFit(changed.lineup,proposals,champions).compatible,true);
 proposals[0].clientCellId=1;assert.equal(lineupFit(changed.lineup,proposals,champions).compatible,false,'Real client picks remain fixed even if they originated in a proposal');
});
test('fixed compatibility is a constraint and cannot supply the old free seventy points',()=>{
 const current=[{role:'bottom',champion:'Jinx',party:true,locked:true},{role:'support',champion:'Lulu',party:true,locked:true}];
 const matching=lineupFit(current,current,champions),replace=lineupFit([{role:'bottom',champion:'Ashe'},{role:'support',champion:'Lulu'}],current,champions);
 assert.equal(matching.compatible,true);assert.equal(replace.compatible,false);assert.ok(replace.score<=20);
 const unselected=current.map(s=>({...s,champion:null,locked:false})),single=lineupFit([{role:'bottom',champion:'Jinx'}],unselected,champions);
 assert.equal(single.score,null);assert.doesNotMatch(single.reason,/70|无冲突计分/);
 assert.equal(lineupFit([],[],champions).score,null);
});

test('two or more of us exclude ally proposal positions; one of us automatically uses only real selected allies',()=>{
 const current=[{role:'bottom',champion:null,party:true},{role:'support',champion:'Lulu',party:true},{role:'top',champion:'Malphite',party:false},{role:'mid',champion:'Orianna',party:false},{role:'jungle',champion:null,party:false}];
 const left=[{role:'bottom',champion:'Jinx'},{role:'support',champion:'Lulu'},{role:'top',champion:'Teemo'}];
 const right=left.map(s=>s.role==='top'?{...s,champion:'Ornn'}:s);
 assert.equal(lineupFit(left,current,champions).score,lineupFit(right,current,champions).score);
 assert.equal(lineupFit(left,current,champions).known,2);
 const solo=current.map(s=>({...s,party:s.role==='bottom'})),automatic=lineupFit(left,solo,champions),explicit=lineupFit(left,solo,champions,{scope:'context'});
 assert.equal(automatic.scope,'context');assert.deepEqual(automatic,explicit);assert.equal(automatic.known,4);
 assert.equal(automatic.size,4,'Empty jungle is not invented as a fifth member');
 assert.equal(lineupFit(left,solo,champions).score,lineupFit(right,solo,champions).score,'An ally proposal cannot overwrite the actual Malphite');
 const changed=solo.map(s=>s.role==='support'?{...s,champion:'Xerath'}:s);
 assert.notEqual(lineupFit(left,changed,champions).rawScore,automatic.rawScore,'Actual ally changes affect contextual fit');
});

test('explicit context uses selected allies and incomplete proposals do not receive invented own picks',()=>{
 const current=[{role:'bottom',champion:'Jinx',party:true},{role:'support',champion:'Lulu',party:true},{role:'mid',champion:'Orianna',party:false},{role:'top',champion:null,party:false}];
 const proposal=[{role:'bottom',champion:'Jinx'},{role:'support',champion:'Lulu'}];
 assert.equal(lineupFit(proposal,current,champions,{scope:'party'}).known,2);
 assert.equal(lineupFit(proposal,current,champions,{scope:'context'}).known,3);
 const incomplete=lineupFit([{role:'bottom',champion:'Jinx'}],current,champions);
 assert.equal(incomplete.score,null);assert.equal(incomplete.known,1,'Missing proposed support is not filled with the current Lulu');
});

test('a single controllable pick without selected allies has no composition score',()=>{
 const current=[{role:'mid',champion:null,party:true},{role:'jungle',champion:null,party:false}];
 const fit=lineupFit([{role:'mid',champion:'Galio'},{role:'jungle',champion:'Vi'}],current,champions);
 assert.equal(fit.score,null);assert.equal(fit.known,1,'Suggested outside positions are not actual teammates');
});
test('explicit bot and solo constraints apply only to positions that scope can replace',()=>{
 const current=[{role:'mid',champion:'Ahri',party:true,locked:true},{role:'bottom',champion:'Jinx',party:false,locked:true},{role:'support',champion:'Lulu',party:false,locked:true}];
 const bot=lineupFit([{role:'bottom',champion:'Jinx'},{role:'support',champion:'Lulu'}],current,champions,{scope:'bot'});
 assert.equal(bot.compatible,true);assert.equal(bot.exact,true);assert.equal(bot.known,2);
 const changed=lineupFit([{role:'bottom',champion:'Ashe'},{role:'support',champion:'Lulu'}],current,champions,{scope:'bot'});
 assert.equal(changed.compatible,false,'Locked bot picks constrain bot scope even if their party marker is off');
 const solo=lineupFit([{role:'mid',champion:'Ahri'}],current.map(s=>({...s,party:true})),champions,{scope:'solo',soloRole:'mid'});
 assert.equal(solo.compatible,true);assert.equal(solo.exact,true);assert.equal(solo.known,3);
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
  await guest.join(target);assert.equal(guest.snapshot().ballots,true);assert.equal(guest.snapshot().multiVotes,true);
  host.publish(state(a,proposalKey(a.lineup)));guest.publish(state(null,proposalKey(a.lineup)));
  await until(()=>roomBallotBoard(host.snapshot(),[],champions)[0]?.voters.length===2);
  await late.join(target);await until(()=>roomBallotBoard(late.snapshot(),[],champions)[0]?.voters.length===2);
  late.publish(state(b,null));await until(()=>roomBallotBoard(host.snapshot(),[],champions).length===2);
  guest.publish({...state(null,null),ballot:{version:1,proposal:null,votes:[proposalKey(a),proposalKey(b),proposalKey(b)]}});
  await until(()=>roomBallotBoard(late.snapshot(),[],champions).find(row=>row.key===proposalKey(b))?.voters.length===1);
  assert.deepEqual(host.snapshot().members.find(m=>m.nick==='乙').share.ballot.votes,[proposalKey(a),proposalKey(b)]);
  guest.publish({...state(null,null),ballot:{version:1,proposal:null,votes:[proposalKey(b)]}});
  await until(()=>roomBallotBoard(host.snapshot(),[],champions).find(row=>row.key===proposalKey(a))?.voters.length===1);
  assert.equal(roomBallotBoard(host.snapshot(),[],champions).find(row=>row.key===proposalKey(b)).voters.length,1);
  host.clearBallot();await until(()=>guest.snapshot().members.find(m=>m.nick==='甲').share.ballot===undefined);
  assert.deepEqual(guest.snapshot().members.find(m=>m.self).share.ballot.votes,[proposalKey(b)],'Another member retains their votes until their own round reset');
 }finally{host.dispose();guest.dispose();late.dispose();}
});
