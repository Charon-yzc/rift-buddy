import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createSlots,mergeClientSession,recommend} from '../src/core/recommend.mjs';
import {initialPartyCount,selectionPartyCount,markedPartyCount,validPartyCount,reconcilePartyRange,partyRoleConflicts,movePartyMark,editPartyRange} from '../src/core/party-range.mjs';
import {reconcileClientDraft,moveChampion,moveDisplayedChampion,publicClientGameId} from '../src/core/draft.mjs';
import {companionRosterDraft} from '../src/core/draft-intents.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {partyWithPregameIntents} from '../src/core/pregame-intent.mjs';
import {rankedDraftPolicy} from '../src/core/ranked-draft.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const key=id=>data.champions.find(c=>c.id===id).key;
const roles=slots=>slots.filter(slot=>slot.party).map(slot=>slot.role);
const session=()=>({gameId:'101',localPlayerCellId:0,myTeam:[0,1,2,3,4].map(cellId=>({cellId,championId:0,championPickIntent:0,assignedPosition:''})),theirTeam:[],bans:[]});
const party=count=>({status:'known',lobbyCount:count,members:Array.from({length:count},(_,cellId)=>({cellId,local:cellId===0}))});
const merge=(slots,s,count,p=party(count),options={})=>mergeClientSession(slots,s,data.champions,{autoParty:true,party:p,partyCount:count,...options}).slots;

test('capture uses premade lobby count, never the five allies or assistant room size',()=>{
 for(let count=1;count<=5;count++){
  const s=session(),p=party(count),captured=initialPartyCount(p);
  const slots=reconcilePartyRange(createSlots(),s,data.champions,{count:captured,party:p,initial:true});
  assert.equal(captured,count);assert.deepEqual(roles(slots),['top','jungle','mid','bottom','support'].slice(0,count));
  assert.equal(initialPartyCount({...p,room:{members:Array(10)}}),count);
 }
 assert.equal(initialPartyCount({status:'unknown',members:[{cellId:0,local:true}]}),1);
});

test('fresh public lobby quantity survives hidden selection names without inferring anonymous members',()=>{
 const before={connected:true,phase:'ReadyCheck',playerName:'本人#CN1',party:{status:'lobby',lobbyCount:3,members:[]},receivedAt:new Date(10000).toISOString()};
 const current={connected:true,phase:'ChampSelect',playerName:'本人#CN1',party:{status:'unknown',members:[{cellId:0,local:true}]},receivedAt:new Date(12000).toISOString()},original=structuredClone(current);
 assert.equal(selectionPartyCount(current,before),3);assert.deepEqual(current,original);
 assert.equal(selectionPartyCount({...current,playerName:'另一位#CN1'},before),1);
 assert.equal(selectionPartyCount(current,{...before,phase:'Offline',connected:false}),1);
 assert.equal(selectionPartyCount({...current,receivedAt:new Date(30000).toISOString()},before),1);
 assert.equal(selectionPartyCount({...current,party:party(2)},before),2);
});

test('count freezes through membership polls, public collisions, hover changes and player swaps',()=>{
 const s=session(),p=party(2);let slots=reconcilePartyRange(createSlots(),s,data.champions,{count:2,party:p,initial:true});
 s.myTeam[2].championId=key('Garen');s.myTeam[2].pickState='locked';slots=merge(slots,s,2,p);
 assert.deepEqual(roles(slots),['jungle','mid']);assert.equal(slots[0].clientCellId,2);
 s.myTeam[1].championPickIntent=key('Nami');slots=merge(slots,s,2,p);
 assert.equal(markedPartyCount(slots),2);assert.deepEqual(roles(slots),['jungle','mid'],'A hero-only preview cannot move marks');
 s.myTeam[1].championId=key('Nami');s.myTeam[1].championPickIntent=0;s.myTeam[1].pickState='locked';
 slots=merge(slots,s,2,{...p,lobbyCount:5});assert.equal(markedPartyCount(slots),2);
 slots=moveChampion(slots,'support','bottom');
 for(let poll=0;poll<4;poll++)slots=merge(slots,s,2,p);
 assert.equal(markedPartyCount(slots),2);assert.ok(roles(slots).includes('bottom'));assert.equal(slots[3].clientCellId,1);
 assert.equal(slots[0].champion,'Garen');
});

test('dragging an outside teammate onto our lane moves the group range before the next recommendation',()=>{
 const s=session(),p=party(2);
 Object.assign(s.myTeam[0],{championId:key('Ashe'),pickState:'locked',assignedPosition:'BOTTOM'});
 Object.assign(s.myTeam[1],{championId:key('Ahri'),pickState:'locked',assignedPosition:'MIDDLE'});
 Object.assign(s.myTeam[2],{championId:key('Garen'),pickState:'locked',assignedPosition:'TOP'});
 const initial=merge(createSlots(),s,2,p);assert.deepEqual(roles(initial),['mid','bottom']);
 let moved=moveChampion(initial,'top','mid');
 assert.deepEqual(roles(moved),['top','bottom']);assert.equal(moved[2].champion,'Garen');assert.equal(moved[2].party,false);
 assert.equal(moved[0].champion,'Ahri');assert.equal(moved[0].party,true);
 moved=validateState({...defaultState(),draft:{slots:moved,partyCount:2,scope:'party',clientGameId:'101'}}).draft.slots;
 for(let poll=0;poll<3;poll++)moved=merge(moved,s,2,p);
 assert.deepEqual(roles(moved),['top','bottom']);assert.equal(markedPartyCount(moved),2);
 const [result]=recommend({slots:moved,champions:data.champions,scope:'party',clientSession:s,party:p,limit:1});
 assert.ok(result);assert.deepEqual(roles(result.slots),['top','bottom']);
 assert.deepEqual(result.analysis.members.map(m=>m.champion).sort(),['Ahri','Ashe']);
 const alone=initial.map(slot=>({...slot,party:slot.clientCellId===0}));
 const swapped=moveChampion(alone,'top','bottom');assert.deepEqual(roles(swapped),['top']);
 const [solo]=recommend({slots:swapped,champions:data.champions,scope:'party',clientSession:s,party:party(1),limit:1});
 assert.equal(solo.scope,'context');assert.deepEqual(roles(solo.slots),['top']);assert.equal(solo.slots[0].champion,'Ashe');
});

test('an explicitly included anonymous teammate keeps the same party mark through dragging and repeated sync',()=>{
 const s=session(),p={status:'unknown',members:[{cellId:0,local:true}]};
 for(const [cellId,id,assignedPosition]of [[0,'Ashe','BOTTOM'],[1,'Garen','TOP'],[2,'Nami','UTILITY'],[3,'Vi','JUNGLE'],[4,'Ahri','MIDDLE']])Object.assign(s.myTeam[cellId],{championId:key(id),pickState:'locked',assignedPosition});
 const originalSession=structuredClone(s),originalParty=structuredClone(p),initial=merge(createSlots(),s,1,p,{ownRole:'bottom'}),before=structuredClone(initial);
 assert.deepEqual(roles(initial),['bottom']);assert.equal(initial.find(slot=>slot.champion==='Garen').party,false);
 const included=editPartyRange(initial,'top',true,{count:1,session:s,champions:data.champions,party:p,ownRole:'bottom'});
 assert.equal(included.partyCount,2);assert.deepEqual(initial,before,'A checkbox edit must not mutate the prior board');
 let slots=moveChampion(included.slots,'top','support');
 const assertMoved=()=>{
  const garen=slots.find(slot=>slot.champion==='Garen'),nami=slots.find(slot=>slot.champion==='Nami');
  assert.equal(garen.role,'support');assert.equal(garen.clientCellId,1);assert.equal(garen.manualPosition,true);
  assert.equal(garen.party,true);assert.equal(garen.partyManual,true);
  assert.equal(nami.role,'top');assert.equal(nami.clientCellId,2);assert.equal(nami.party,false);assert.equal(nami.partyManual,undefined);
  assert.equal(markedPartyCount(slots),included.partyCount);assert.deepEqual(roles(slots),['bottom','support']);
  assert.deepEqual(slots.filter(slot=>slot.party).map(slot=>slot.champion).sort(),['Ashe','Garen']);
 };
 assertMoved();
 for(let poll=0;poll<2;poll++){
  slots=reconcilePartyRange(slots,s,data.champions,{count:included.partyCount,party:p,ownRole:'bottom'});assertMoved();
  slots=merge(slots,s,included.partyCount,p,{ownRole:'bottom'});assertMoved();
 }
 const excluded=editPartyRange(slots,'support',false,{count:included.partyCount,session:s,champions:data.champions,party:p,ownRole:'bottom'});
 assert.equal(excluded.partyCount,1);slots=excluded.slots;
 for(let poll=0;poll<2;poll++){
  slots=merge(slots,s,excluded.partyCount,p,{ownRole:'bottom'});
  const garen=slots.find(slot=>slot.champion==='Garen');
  assert.equal(garen.clientCellId,1);assert.equal(garen.role,'support');assert.equal(garen.party,false);assert.equal(garen.partyManual,true);
  assert.equal(markedPartyCount(slots),1);assert.deepEqual(roles(slots),['bottom']);
 }
 assert.deepEqual(s,originalSession);assert.deepEqual(p,originalParty,'Manual range selection must not invent premade membership');
});

test('an explicit lane mark survives a newly confirmed teammate when premade detection only knows self',()=>{
 const s=session(),p={status:'unknown',members:[{cellId:0,local:true}]};
 Object.assign(s.myTeam[0],{championId:key('Ashe'),pickState:'locked',assignedPosition:'BOTTOM'});
 const initial=merge(createSlots(),s,1,p,{ownRole:'bottom'});
 const selected=editPartyRange(initial,'top',true,{count:1,session:s,champions:data.champions,party:p,ownRole:'bottom'});
 assert.equal(selected.partyCount,2);assert.equal(selected.slots[0].partyManual,true);
 Object.assign(s.myTeam[1],{championId:key('Garen'),pickState:'locked',assignedPosition:'TOP'});
 let slots=selected.slots;
 for(let poll=0;poll<2;poll++){
  slots=merge(slots,s,selected.partyCount,p,{ownRole:'bottom'});
  const garen=slots.find(slot=>slot.champion==='Garen');
  assert.equal(garen.role,'top');assert.equal(garen.clientCellId,1);assert.equal(garen.party,true);assert.equal(garen.partyManual,true);
  assert.equal(markedPartyCount(slots),2);assert.deepEqual(roles(slots),['top','bottom']);
 }
 assert.deepEqual(p.members,[{cellId:0,local:true}]);
});

test('dragging a public group preview into an empty lane follows ownership through save and polling',()=>{
 const s=session(),p=party(2);p.members[1].firstPosition='MIDDLE';
 Object.assign(s.myTeam[0],{championId:key('Ashe'),pickState:'locked',assignedPosition:'BOTTOM'});
 Object.assign(s.myTeam[1],{championPickIntent:key('Ahri')});
 const initial=merge(createSlots(),s,2,p);assert.deepEqual(roles(initial),['mid','bottom']);
 const shown=companionRosterDraft(initial,s,data.champions,{party:p,ownRole:'bottom'});
 assert.equal(shown[2].clientCellId,1);assert.equal(shown[2].publicIntent,true);
 let moved=moveDisplayedChampion(initial,shown,'mid','jungle');
 assert.deepEqual(roles(moved),['jungle','bottom']);assert.equal(moved[1].clientCellId,1);
 assert.equal(moved[1].champion,null);assert.equal(moved[1].locked,false);
 moved=validateState({...defaultState(),draft:{slots:moved,partyCount:2,scope:'party',clientGameId:'101'}}).draft.slots;
 for(let poll=0;poll<3;poll++)moved=merge(moved,s,2,p);
 assert.deepEqual(roles(moved),['jungle','bottom']);assert.equal(moved[1].champion,null);
 Object.assign(s.myTeam[1],{championId:key('Ahri'),championPickIntent:0,pickState:'locked'});
 moved=merge(moved,s,2,p);assert.deepEqual(roles(moved),['jungle','bottom']);assert.equal(moved[1].champion,'Ahri');
 const allOff=moveChampion(moved.map(slot=>({...slot,party:false,partyManual:true})),'jungle','top');
 assert.equal(markedPartyCount(merge(allOff,s,0,p)),0,'Moving a member must not revive an explicitly cleared range');
});

test('a saved draft never pairs a stale range count with newer checkbox marks',async()=>{
 const {savedPartyCount}=await import('../src/core/party-range.mjs');
 const s=session(),p=party(3);let slots=reconcilePartyRange(createSlots(),s,data.champions,{count:3,party:p,initial:true});
 const captured=markedPartyCount(slots);assert.equal(captured,3);
 // A second window unchecks two lanes while the captured count is still 3.
 const unchecked=slots.filter(slot=>slot.party).slice(0,2).map(slot=>slot.role);
 slots=slots.map(slot=>unchecked.includes(slot.role)?{...slot,party:false,partyManual:true}:slot);
 const stale={...defaultState().draft,slots,partyCount:captured};
 assert.throws(()=>validateState({...defaultState(),draft:stale}),/勾选位置不一致/,'The stale pair must stay rejected');
 const derived=savedPartyCount(slots,captured);assert.equal(derived,captured-2);
 assert.doesNotThrow(()=>validateState({...defaultState(),draft:{...stale,partyCount:derived}}));
 assert.equal(savedPartyCount(slots,undefined),undefined,'An uncaptured range stays absent');
 assert.equal(savedPartyCount(slots.map(slot=>({...slot,party:false})),0),0,'An empty manual range still saves as zero');
});

test('only explicit checkbox changes resize the range, including clearing every mark',()=>{
 const s=session(),p=party(3);let count=3,slots=reconcilePartyRange(createSlots(),s,data.champions,{count,party:p,initial:true});
 for(const role of ['support','top','jungle','mid','support']){
  slots=slots.map(slot=>slot.role===role?{...slot,party:!slot.party,partyManual:true}:slot);count=markedPartyCount(slots);
  for(let poll=0;poll<3;poll++)slots=merge(slots,s,count,p);
  assert.equal(markedPartyCount(slots),count);
 }
 assert.equal(count,0);assert.deepEqual(roles(slots),[]);
 s.myTeam[0].championId=key('Ahri');s.myTeam[0].assignedPosition='MIDDLE';
 assert.deepEqual(roles(merge(slots,s,count,p)),[],'Client synchronization must not put self back after manual deselection');
});

test('explicit lane changes relocate a mark without changing count or reviving an all-off choice',()=>{
 const slots=createSlots().map(slot=>({...slot,party:slot.role==='top',partyManual:true}));
 const moved=movePartyMark(slots,'support','bottom');assert.deepEqual(roles(moved),['support']);assert.equal(markedPartyCount(moved),1);
 const s=session();s.myTeam[0].assignedPosition='UTILITY';
 assert.deepEqual(roles(merge(moved,s,1,party(1),{ownRole:'support'})),['support']);
 assert.deepEqual(movePartyMark(slots.map(slot=>({...slot,party:false})),'mid').filter(slot=>slot.party),[]);
 assert.equal(movePartyMark(slots,'top'),slots);
});

test('public lobby preferences win over left-to-right fallback and duplicates still fill exactly N',()=>{
 const p=party(3);p.members[0].firstPosition='BOTTOM';p.members[1].firstPosition='BOTTOM';p.members[2].firstPosition='UTILITY';
 const s=session(),slots=reconcilePartyRange(createSlots(),s,data.champions,{count:3,party:p,initial:true});
 assert.deepEqual(roles(slots),['top','bottom','support']);assert.deepEqual(partyRoleConflicts(p),['bottom']);
 assert.equal(markedPartyCount(merge(slots,s,3,p)),3);
});

test('same-game restart preserves count and manual marks; dodge/new game release all selection state',()=>{
 const s=session(),p=party(2),slots=reconcilePartyRange(createSlots(),s,data.champions,{count:2,party:p,initial:true}).map(slot=>slot.role==='support'?{...slot,party:true,partyManual:true}:slot.role==='top'?{...slot,party:false,partyManual:true}:slot);
 const draft=validateState({...defaultState(),draft:{slots,partyCount:2,clientGameId:'101',scope:'party'}}).draft;
 assert.equal(draft.partyCount,2);assert.equal(reconcileClientDraft(draft,'101').draft.partyCount,2);
 for(const phase of ['Lobby','Matchmaking','ReadyCheck','None']){
  const reset=reconcileClientDraft(draft,null,null,{phase,previousPhase:'ChampSelect'});
  assert.equal(reset.draft.partyCount,undefined);assert.ok(reset.draft.slots.every(slot=>!slot.champion&&!slot.party&&!slot.partyManual));
 }
 const next=reconcileClientDraft(draft,'202');assert.equal(next.newGame,true);assert.equal(next.draft.partyCount,undefined);
 assert.equal(markedPartyCount(merge(next.draft.slots,{...s,gameId:'202'},1,party(1))),1);
 assert.equal(reconcileClientDraft(draft,null,null,{phase:'Offline',previousPhase:'ChampSelect'}).draft,draft);
});

test('all 32 explicit ranges retain count under every public pick permutation',()=>{
 const heroes=['Garen','Vi','Ahri','Ashe','Nami'];
 for(let mask=0;mask<32;mask++)for(let offset=0;offset<5;offset++){
  const s=session(),p=party(3);let slots=createSlots().map((slot,i)=>({...slot,party:!!(mask&(1<<i)),partyManual:true}));
  const count=markedPartyCount(slots),before=structuredClone(slots);
  for(let i=0;i<5;i++)s.myTeam[(i+offset)%5].championId=key(heroes[i]);
  for(let poll=0;poll<3;poll++)slots=merge(slots,s,count,p);
  assert.equal(markedPartyCount(slots),count,`mask ${mask}, rotation ${offset}`);
  assert.equal(slots.filter(slot=>slot.champion).length,5);assert.deepEqual(roles(slots),roles(before));
 }
});

test('recommendations contain exactly the captured marked members while solo still scores known allies',()=>{
 const s=session(),p=party(1);s.myTeam[2].championId=key('Ahri');s.myTeam[2].assignedPosition='MIDDLE';s.myTeam[2].pickState='locked';
 const slots=merge(createSlots(),s,1,p),[result]=recommend({slots,champions:data.champions,scope:'party',clientSession:s,limit:1});
 assert.equal(markedPartyCount(result.slots),1);assert.equal(result.scope,'context');assert.equal(result.analysis.known,2);
 assert.equal(result.slots[2].champion,'Ahri');assert.equal(result.slots[2].party,false);
});

test('legacy single-player and duo modes cannot override a captured recommendation quantity',()=>{
 for(const count of [1,2,3,4,5])for(const scope of ['solo','bot','party','context']){
  const slots=reconcilePartyRange(createSlots(),session(),data.champions,{count,party:party(count),initial:true});
  const draft=validateState({...defaultState(),draft:{slots,partyCount:count,scope,soloRole:'top'}}).draft;
  assert.equal(draft.partyCount,count);assert.equal(draft.scope,scope==='context'?'context':'party');
  const [result]=recommend({slots:draft.slots,champions:data.champions,scope:draft.scope,soloRole:draft.soloRole,limit:1});
  assert.equal(result.slots.filter(slot=>slot.party&&slot.champion).length,count,scope+' '+count);
 }
 const allOff=createSlots().map(slot=>({...slot,party:false}));
 assert.equal(validateState({...defaultState(),draft:{slots:allOff,partyCount:0,scope:'solo'}}).draft.scope,'party');
});

test('checkbox edits preserve newer public picks and manual lanes instead of submitting old heroes',()=>{
 const s=session(),p=party(2);s.myTeam[2].championId=key('Garen');s.myTeam[2].assignedPosition='TOP';
 let slots=merge(createSlots(),s,2,p);const before=structuredClone(slots);
 let result=editPartyRange(slots,'support',true,{count:2,session:s,champions:data.champions,party:p});
 assert.equal(result.partyCount,3);assert.equal(markedPartyCount(result.slots),3);assert.equal(result.slots.find(slot=>slot.role==='top').champion,'Garen');
 assert.equal(result.slots.find(slot=>slot.role==='top').clientCellId,2);assert.deepEqual(slots,before);
 result=editPartyRange(result.slots,'support',true,{count:3,session:s,champions:data.champions,party:p});
 assert.equal(result.partyCount,3,'The same explicit mark from another window must not count twice');
 for(const role of roles(result.slots))result=editPartyRange(result.slots,role,false,{count:result.partyCount,session:s,champions:data.champions,party:p});
 assert.equal(result.partyCount,0);assert.equal(markedPartyCount(result.slots),0);assert.equal(result.slots[0].champion,'Garen');
});

test('a collision arriving before the checkbox still applies its quantity change exactly once',()=>{
 const s=session(),p=party(2);s.myTeam[2].championId=key('Garen');s.myTeam[2].assignedPosition='TOP';
 const moved=merge(createSlots(),s,2,p);assert.equal(moved[0].party,false);assert.equal(moved[0].partyManual,undefined);
 const removed=editPartyRange(moved,'top',false,{count:2,session:s,champions:data.champions,party:p});
 assert.equal(removed.partyCount,1);assert.equal(markedPartyCount(removed.slots),1);assert.equal(removed.slots[0].champion,'Garen');
 const repeat=editPartyRange(removed.slots,'top',false,{count:1,session:s,champions:data.champions,party:p});
 assert.equal(repeat.partyCount,1);assert.equal(markedPartyCount(repeat.slots),1);
});

test('automatic collision relocation stays distinct from an explicit checkbox exclusion',()=>{
 // Detected marks may relocate. An explicit checkbox is a user's lane intent,
 // and incomplete premade detection cannot override that choice.
 const s=session(),p=party(2),initial=createSlots().map(slot=>({...slot,party:['top','jungle'].includes(slot.role)}));
 s.myTeam[2].championId=key('Garen');s.myTeam[2].assignedPosition='TOP';
 const moved=merge(initial,s,2,p);assert.equal(moved[0].party,false);assert.equal(moved[0].partyManual,undefined);assert.equal(markedPartyCount(moved),2);
 const removed=editPartyRange(moved,'top',false,{count:2,session:s,champions:data.champions,party:p});
 assert.equal(removed.partyCount,1,'An automatic relocation must not look like another player already unchecked this position');
 assert.equal(markedPartyCount(removed.slots),1);assert.equal(removed.slots[0].champion,'Garen');
});

test('main range handler changes only this draft, preserves newer champions, and rejects late edits',async()=>{
 const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
 const from=source.indexOf(" guard('party-range',"),to=source.indexOf(" guard('stage-selection',",from);assert.ok(from>=0&&to>from);
 const s=session(),p=party(2);s.myTeam[2].championId=key('Garen');s.myTeam[2].assignedPosition='TOP';
 const board=merge(createSlots(),s,2,p),current=validateState({...defaultState(),draft:{slots:board,partyCount:2,clientGameId:'101',scope:'party',soloRole:''}});
 let handler;const context=vm.createContext({state:current,stateRevision:1,data,validPartyCount,editPartyRange,partyWithPregameIntents,rankedDraftPolicy,roomService:null,publicClientGameId,rankedClientRoles:()=>({}),
  latestClient:{connected:true,phase:'ChampSelect',mode:{id:'rift'},session:s,party:p},status:async()=>{},guard:(name,run)=>{assert.equal(name,'party-range');handler=run;},
  saveCurrentState:async update=>{context.state=validateState(update(structuredClone(context.state)));context.stateRevision++;}});
 vm.runInContext(source.slice(from,to),context);
 const value={role:'support',checked:true,gameId:'101',cellId:0};
 const accepted=await handler(value);assert.equal(accepted.state.draft.partyCount,3);assert.equal(accepted.state.draft.slots[0].champion,'Garen');assert.equal(accepted.state.draft.slots[0].clientCellId,2);
 const before=structuredClone(context.state);
 for(const invalid of [{...value,gameId:'102'},{...value,cellId:1},{...value,checked:'true'}])await assert.rejects(handler(invalid));
 context.latestClient.phase='Lobby';await assert.rejects(handler(value));assert.deepEqual(context.state,before);
 context.latestClient.phase='ChampSelect';context.latestClient.session=session();context.latestClient.party.members[1]={cellId:1,displayName:'Buddy',firstPosition:'UTILITY'};
 context.roomService={snapshot:()=>({members:[{nick:'Buddy#CN1',online:true,share:{intent:{role:'mid',champion:null}}}]})};
 context.state=validateState({...defaultState(),draft:{slots:createSlots().map(slot=>({...slot,party:['top','jungle'].includes(slot.role)})),partyCount:2,clientGameId:'101',scope:'party',soloRole:'bottom'}});
 const shared=await handler({...value,role:'bottom'});assert.equal(shared.state.draft.partyCount,3);assert.equal(shared.state.draft.slots[2].party,true,'The main range edit must preserve the live shared mid-lane intention');assert.equal(shared.state.draft.slots[4].party,false);
 const currentState=structuredClone(context.state);
 delete context.latestClient.session.gameId;
 await assert.rejects(handler({...value,gameId:null}),'Missing public game identity cannot establish the same selection');
 assert.deepEqual(context.state,currentState);
 context.latestClient.session=null;
 await assert.rejects(handler({...value,gameId:null,cellId:undefined}),'A missing session cannot accept an old checkbox intent');
 assert.deepEqual(context.state,currentState);

});
