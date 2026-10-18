import test from 'node:test';
import assert from 'node:assert/strict';
import {rankedDraftPolicy,publicDraftTeam,publicRankedDraft} from '../src/core/ranked-draft.mjs';
import {sanitizeSession} from '../services/lcu.mjs';
import {pregameIntentChoice} from '../src/core/pregame-intent.mjs';
import {pregameControls} from '../src/pregame-controls-view.mjs';
import {rankedEnemyRoster} from '../src/ranked-draft-view.mjs';
import {companionHeroAction} from '../src/core/companion-action.mjs';
import {confirmedPlayerPick,localPickLocked,clientRecommendationDraft} from '../src/core/draft-intents.mjs';

const champions=Array.from({length:10},(_,i)=>({id:'Hero'+i,key:i+1,name:'英雄'+i}));
const client={connected:true,phase:'ChampSelect',game:{queueId:420,mapId:11,gameMode:'CLASSIC'},mode:{id:'rift'},session:{localPlayerCellId:0,myTeam:[{cellId:0,championId:0}],theirTeam:[{cellId:5,championId:0}],actions:[]}};
test('ranked policy requires supported explicit ranked queue metadata',()=>{
 for(const queueId of [420,440])assert.equal(rankedDraftPolicy({...client,game:{...client.game,queueId}}).ranked,true);
 for(const queueId of [400,430,490,450,2400,undefined])assert.equal(rankedDraftPolicy({...client,game:{...client.game,queueId}}).ranked,false);
 assert.equal(rankedDraftPolicy({...client,game:{...client.game,mapId:12}}).ranked,false);
 assert.equal(rankedDraftPolicy({...client,game:{...client.game,modeConflict:true}}).ranked,false);
});
test('completed public actions fill lagging rows without consuming intent or unfinished picks',()=>{
 const session={...client.session,theirTeam:[{cellId:5,championId:0,championPickIntent:2},{cellId:6,championId:0}],actions:[[{type:'pick',actorCellId:5,championId:1,completed:true},{type:'pick',actorCellId:6,championId:2,completed:false,isInProgress:true}]]};
 const rows=publicDraftTeam(session,'theirTeam');assert.equal(rows[0].championId,1);assert.equal(rows[0].pickState,'locked');assert.equal(rows[0].role,null);assert.equal(rows[1].championId,0);assert.equal(rows[1].pickState,'empty');
 const sanitized=sanitizeSession(session);assert.equal(sanitized.theirTeam[0].championId,1);assert.equal(sanitized.theirTeam[0].pickState,'locked');
 assert.equal(session.theirTeam[0].championId,0);
});
test('roster trades take precedence over original completed actions; contradictory completed actions do not establish a lock',()=>{
 const session={myTeam:[{cellId:0,championId:1}],actions:[{type:'pick',actorCellId:0,championId:2,completed:true}]};
 assert.equal(publicDraftTeam(session)[0].championId,1);assert.equal(publicDraftTeam(session)[0].pickState,'locked');
 session.actions.push({type:'pick',actorCellId:0,championId:3,completed:true});assert.equal(publicDraftTeam(session)[0].pickState,'selecting');
});
test('unknown queue cannot consume a saved lobby intent',()=>{
 for(const queueId of [undefined,null,'',NaN]){
  const unknown={...client,game:{mapId:11,gameMode:'CLASSIC',queueId}};
  assert.equal(rankedDraftPolicy(unknown).consumePreselection,false);assert.equal(pregameIntentChoice({role:'mid',champion:'Hero0',kind:'hero'},unknown,{champions}).waiting,true);
 }
});
test('traded current champion remains locked and configurable, original champion is blocked',()=>{
 const session={...client.session,myTeam:[{cellId:0,championId:2,assignedPosition:'MID'}],actions:[{type:'pick',actorCellId:0,championId:1,completed:true}]},current={...client,session};
 assert.equal(companionHeroAction(current,champions[1]).prepare,true);assert.equal(companionHeroAction(current,champions[0]).blocked,true);assert.equal(localPickLocked(session),true);assert.equal(confirmedPlayerPick(session.myTeam[0],session),true);
 const draft=clientRecommendationDraft([{role:'mid',champion:'Hero0',clientCellId:0,party:true}],session,champions);assert.equal(draft.slots[0].champion,'Hero1');assert.equal(draft.slots[0].locked,true);
 session.actions.push({type:'pick',actorCellId:0,championId:3,completed:true});assert.equal(localPickLocked(session),false);assert.equal(confirmedPlayerPick(session.myTeam[0],session),false);
});
test('curve readiness requires ten known unique confirmed champions, never timer or mere hovering',()=>{
 const rows=champions.map((c,i)=>({cellId:i,championId:c.key,pickState:'locked'}));
 const ready={...client,session:{...client.session,myTeam:rows.slice(0,5),theirTeam:rows.slice(5)}};
 assert.equal(publicRankedDraft(ready,champions).complete,true);
 ready.session.theirTeam[0]={...rows[5],pickState:'selecting'};assert.equal(publicRankedDraft(ready,champions).complete,false);
 ready.session.theirTeam[0]={...rows[5],championId:1};assert.equal(publicRankedDraft(ready,champions).complete,false);
 ready.session.theirTeam[0]=rows[5];assert.equal(publicRankedDraft({...ready,connected:false},champions).complete,false);assert.equal(publicRankedDraft({...ready,phase:'Lobby'},champions).complete,false);
});
test('ranked omits preselection controls and cannot consume a saved lobby intent',()=>{
 const markup=pregameControls({ranked:true,includePreselected:true});assert.doesNotMatch(markup,/id="solo-role"|id="include-preselected"|data-action="pregame-hero"/);assert.match(markup,/推荐风格/);
 assert.match(pregameControls(),/id="include-preselected"/);
 assert.equal(pregameIntentChoice({role:'mid',champion:'Hero0',kind:'hero'},client,{champions}).champion,null);
});
test('enemy roster shows public champions and unknown lanes without invented position icons',()=>{
 const markup=rankedEnemyRoster({...client,session:{...client.session,theirTeam:[{cellId:5,championId:1,pickState:'locked'}]}},{champions});
 assert.match(markup,/英雄0/);assert.match(markup,/分路未知/);assert.equal((markup.match(/class="ranked-enemy-cell"/g)||[]).length,5);assert.doesNotMatch(markup,/roster-role-mark/);
 assert.equal(rankedEnemyRoster({...client,game:{...client.game,queueId:430}},{champions}),'');
});
