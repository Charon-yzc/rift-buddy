import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import game from '../data/game.json' with {type:'json'};
import {BUNDLED_CATALOG,catalogIssues} from '../src/core/catalog.mjs';
import {createSlots,createRecommendationSearch} from '../src/core/recommend.mjs';
import {recommendationMembers} from '../src/core/recommendation-diversity.mjs';
import {shareFromSlots,proposalKey} from '../src/core/room.mjs';
import {publicClientGameId} from '../src/core/draft.mjs';
import {roomBallotBoard} from '../src/core/room-ballot.mjs';
import {roomBallotView} from '../src/room-ballot-view.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {companionView} from '../src/companion-view.mjs';
import {communityCombinationBadge} from '../src/community-combination-view.mjs';

const status=catalogIssues(BUNDLED_CATALOG,game).status,data={...game,catalog:BUNDLED_CATALOG,catalogInfo:{status}};
const key=id=>Number(game.champions.find(c=>c.id===id).key);
const picks={top:'Akali',jungle:'Shaco',mid:'Zed',bottom:'Jhin'};
const slots=createSlots().map(s=>({...s,party:s.role==='support',...(picks[s.role]?{champion:picks[s.role],locked:true}:{})}));
const input={slots,champions:game.champions,patch:game.patch,catalogStatus:status,scope:'context',minimumFitScore:60,rolePools:{support:{mode:'only',heroes:['Lux']}}};
const candidate=()=>createRecommendationSearch(input).advance({limit:6}).rows[0];
const options={scope:'context',soloRole:'support',patch:game.patch,catalogStatus:status};
const number=html=>Number(html.match(/class="lineup-fit-number"[^>]*>契合 (\d+)/)?.[1]);
const plain=value=>JSON.parse(JSON.stringify(value));

test('both real result surfaces visibly label a community exception while displaying its unchanged score below 60',()=>{
 const row=candidate(),saved={favorites:[],preferences:{},draft:{slots,scope:'context'}};
 assert.ok(row.recommendationFit.score<60);
 const card=renderResultCard(row,0,data,saved);
 const companion=companionView({data,client:{connected:false,phase:'Offline'},slots,unassigned:[],scope:'context',soloRole:'support',style:'fun',tab:'recommend',results:[row]});
 for(const html of [card,companion]){
  assert.match(html,/class="community-combination-badge"[^>]*>社区组合<\/span>/);
  assert.match(html,/社区玩法可优先展示，低于60分也保留实际契合分/);
  assert.equal(number(html),row.recommendationFit.score);
  assert.doesNotMatch(html,/本批候选按契合分降序|低于60分不推荐/);
 }
 const forged={...row,communityCombinationId:'invented',communityRecommendation:{...row.communityRecommendation,id:'invented'}};
 assert.equal(communityCombinationBadge(forged,data),'');
 assert.equal(communityCombinationBadge({...row,communityRecommendation:true},data),'');
 const changed={...row,slots:row.slots.map(s=>s.role==='support'?{...s,champion:'Lulu'}:s)};
 assert.equal(communityCombinationBadge(changed,data),'');
 assert.equal(communityCombinationBadge(row,{...data,catalogInfo:{status:{}}}),'');
});

test('a shared community proposal keeps its exact members, portraits, configuration and identity across automatic candidate changes',()=>{
 const row=candidate(),config={champion:'Lux',role:'support',mode:'rift',patch:game.patch,start:[3850],items:[6655],boots:[3020],runes:null,spells:['SummonerFlash','SummonerExhaust'],skills:'QWE',priority:'QWE',first:'QWE'};
 const proposal={lineup:row.slots.filter(s=>s.champion).map(({role,champion})=>({role,champion})),mode:'rift',configurations:[config]};
 const room={mode:'client',ballots:true,members:[{nick:'我',self:true,share:{lineup:[],pick:null,ballot:{version:1,proposal,votes:[]}}}]};
 const before=structuredClone(proposal),identity=proposalKey(proposal),first=roomBallotView(room,slots,game.champions,options);
 assert.match(first,/class="community-combination-badge"[^>]*>社区组合<\/span>/);
 assert.equal(number(first),row.recommendationFit.score);
 for(const mid of ['Ahri','Annie','Orianna']){
  const current=createSlots().map(s=>({...s,party:true,automaticPosition:true,champion:s.role==='mid'?mid:s.role==='bottom'?'Ashe':s.role==='support'?'Nami':null}));
  const [board]=roomBallotBoard(room,current,game.champions,options),html=roomBallotView(room,current,game.champions,options);
  assert.equal(board.key,identity);assert.deepEqual(board.proposal,before);
  const portraits=text=>[...text.matchAll(/data-action="room-ballot-hero"[^>]*data-id="([^"]+)"[^>]*data-role="([^"]+)"/g)].map(m=>m.slice(1));
  assert.deepEqual(portraits(html),portraits(first));
  assert.match(html,new RegExp('data-proposal-key="'+identity+'"'));
 }
 assert.deepEqual(proposal,before);
});

test('only actual public bans or incompatible locks invalidate a frozen proposal',()=>{
 const row=candidate(),proposal={lineup:row.slots.filter(s=>s.champion).map(({role,champion})=>({role,champion})),mode:'rift'};
 const room={members:[{nick:'我',share:{ballot:{version:1,proposal,votes:[]}}}]};
 const session={localPlayerCellId:0,myTeam:[{cellId:0,championId:0}],theirTeam:[{cellId:5,championId:key('Lux'),pickState:'selecting'}],allowDuplicatePicks:false,actions:[[{type:'pick',actorCellId:5,championId:key('Lux'),completed:false}]]};
 assert.equal(roomBallotBoard(room,slots,game.champions,{...options,clientSession:session}).length,1);
 session.theirTeam[0].pickState='locked';session.actions[0][0].completed=true;
 assert.deepEqual(roomBallotBoard(room,slots,game.champions,{...options,clientSession:session}),[]);
 session.allowDuplicatePicks=true;
 assert.equal(roomBallotBoard(room,slots,game.champions,{...options,clientSession:session}).length,1,'Blind-pick mirrors remain legal');
 session.bans=[key('Lux')];assert.deepEqual(roomBallotBoard(room,slots,game.champions,{...options,clientSession:session}),[]);
 session.bans=[];session.actions=[[{type:'ban',actorCellId:1,championId:key('Jhin'),completed:false}]];
 assert.equal(roomBallotBoard(room,slots,game.champions,{...options,clientSession:session}).length,1);
 session.actions[0][0].completed=true;assert.deepEqual(roomBallotBoard(room,slots,game.champions,{...options,clientSession:session}),[]);
 assert.equal(room.members[0].share.ballot.proposal,proposal,'Invalidate availability without rewriting the submitted snapshot');
});

const app=fs.readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const proposalFunction=app.slice(app.indexOf('const resultProposalSnapshots='),app.indexOf('function roomSharePayload(){'));
const proposeAction=app.slice(app.indexOf(" if(action==='propose-result'){"),app.indexOf(" if(action==='room-ballot-details'){"));
function application(){
 const row=candidate(),received=[];
 const context=vm.createContext({structuredClone,data,results:[row],resultsSignature:'current',recommendationKey:()=> 'current',recommendationInput:()=>({}),
  room:{mode:'client',room:'123456',transport:'relay',relayUrl:'wss://example.test'},client:{connected:true,phase:'ChampSelect',session:{gameId:'100'}},publicClientGameId,windowLayout:{docked:false},preparations:{},guideSelection:null,resultCreativePlan:()=>null,recommendationMembers,shareFromSlots,
  captureRoomConfigurations:()=>structuredClone(context.configurations),roomCompatiblePlan:value=>value,configurations:[{champion:'Lux',role:'support',mode:'rift',patch:game.patch,start:[1056],items:[6655],boots:[3020],runes:null,spells:['SummonerFlash','SummonerExhaust'],skills:'QWE',priority:'QWE',first:'QWE'}],
  proposalKey,api:{roomBallot:async value=>{received.push(structuredClone(value));return {mode:'client'};}},applyRoomSnapshot(){},render(){},toast(){}});
 vm.runInContext(proposalFunction+`async function propose(){const action='propose-result',el={dataset:{index:'0'}};${proposeAction}}`,context);
 return {context,row,received};
}
test('the actual propose action freezes only the successfully sent configuration and rerenders reuse its identity',async()=>{
 const {context,row,received}=application();await context.propose();
 assert.equal(received.length,1);const original=plain(received[0].proposal),id=proposalKey(original);
 context.configurations[0].items=[3089];context.guideSelection={id:'Lux',role:'support',coreIndex:3};
 row.slots.find(s=>s.role==='support').champion='Nami';
 const cached=context.roomResultProposal(row);assert.deepEqual(plain(cached),original);assert.equal(proposalKey(cached),id);
 cached.lineup[0].champion='Ahri';cached.configurations[0].items=[3003];
 assert.deepEqual(plain(context.roomResultProposal(row)),original,'Callers cannot mutate the frozen snapshot through returned references');
 context.results=[candidate()];context.results[0].slots.find(s=>s.role==='support').champion='Lulu';
 assert.equal(context.roomResultProposal(row).lineup.find(s=>s.role==='support').champion,'Lux');
 assert.equal(context.roomResultProposal(context.results[0]).lineup.find(s=>s.role==='support').champion,'Lulu');
});
test('a failed proposal does not freeze an unsent configuration',async()=>{
 const {context,row}=application();context.api.roomBallot=async()=>{throw Error('offline');};
 await assert.rejects(context.propose(),/offline/);
 context.configurations[0].items=[3089];assert.deepEqual([...context.roomResultProposal(row).configurations[0].items],[3089]);
});
test('submitted snapshot caches never leak into another game, room or relay',async()=>{
 for(const transition of ['game','room','relay','in-flight-game']){
  const {context,row}=application();
  if(transition==='in-flight-game')context.api.roomBallot=async()=>{context.client.session.gameId='101';return {mode:'client'};};
  await context.propose();context.configurations[0].items=[3089];
  if(transition==='game')context.client.session.gameId='101';
  if(transition==='room')context.room.room='654321';
  if(transition==='relay')context.room.relayUrl='wss://other.test';
  assert.deepEqual([...context.roomResultProposal(row).configurations[0].items],[3089],transition);
 }
});
