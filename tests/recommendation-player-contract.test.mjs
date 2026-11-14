import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import {createSlots,createRecommendationSearch} from '../src/core/recommend.mjs';
import {roomFamiliarityContext} from '../src/core/room-familiarity.mjs';

const roles=['top','jungle','mid','bottom','support'];
const positions=['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'];
const preferred={top:'Ornn',jungle:'Vi',mid:'Ahri',bottom:'Ashe',support:'Lulu'};
const alternative={top:'Garen',jungle:'JarvanIV',mid:'Lux',bottom:'Jinx',support:'Nami'};
const profile=(role,member='player:'+role)=>({member,mass:1,usage:{sampled:20,counts:{[preferred[role]]:20}}});
const selected=mask=>roles.filter((_,index)=>mask&(1<<index));
function fixture(controlled){
 const slots=createSlots().map((slot,index)=>({...slot,party:controlled.includes(slot.role),manualPosition:true,
  ...(controlled.includes(slot.role)?{champion:null,locked:false}:{champion:preferred[slot.role],locked:true,clientCellId:index})}));
 const rolePools=Object.fromEntries(controlled.map(role=>[role,{mode:'only',heroes:[preferred[role],alternative[role]]}]));
 return {slots,rolePools,champions:game.champions,patch:game.patch,scope:'party',randomSeed:'player-contract',minimumFitScore:0};
}
const search=input=>createRecommendationSearch(input).advance({limit:6}).rows;
function assertCandidate(row,input,controlled){
 assert.deepEqual(row.targets,controlled);
 assert.equal(new Set(row.slots.map(slot=>slot.champion)).size,5);
 for(const slot of row.slots){
  const before=input.slots.find(value=>value.role===slot.role);
  if(controlled.includes(slot.role)){
   assert.ok(input.rolePools[slot.role].heroes.includes(slot.champion));
   assert.equal(slot.clientCellId,undefined,'A candidate must not claim a real player binding');
  }else assert.deepEqual(slot,before,'Fixed public teammates and their manual positions remain exact');
 }
}

test('all 31 selected lane subsets fill their actual editable positions and preserve fixed teammates regardless of input order',()=>{
 const counts=new Set();
 for(let mask=1;mask<32;mask++){
  const controlled=selected(mask),input=fixture(controlled),before=structuredClone(input),rows=search(input);counts.add(controlled.length);
  assert.ok(rows.length,'A fixture with legal members must yield a candidate: '+controlled.join('/'));
  for(const row of rows)assertCandidate(row,input,controlled);
  const reordered={...input,slots:input.slots.toReversed(),rolePools:Object.fromEntries(Object.entries(input.rolePools).toReversed().map(([role,pool])=>[role,{...pool,heroes:pool.heroes.toReversed()}]))};
  assert.deepEqual(search(reordered),rows,'Serialization order cannot change the selected members: '+controlled.join('/'));
  assert.deepEqual(search({...input,slots:[input.slots[2],input.slots[4],input.slots[0],input.slots[3],input.slots[1]]}),rows);
  const blocked=controlled.map(role=>preferred[role]);
  for(const filter of [{publicBans:blocked},{excluded:blocked},{publicPicks:blocked}]){
   const restricted={...input,...filter},legal=search(restricted);assert.equal(legal.length,1,'Each selected position has one remaining legal hero');
   for(const row of legal){assertCandidate(row,restricted,controlled);for(const role of controlled)assert.equal(row.slots.find(slot=>slot.role===role).champion,alternative[role]);}
  }
  assert.deepEqual(input,before,'Searching must not mutate player preferences or fixed bindings');
 }
 assert.deepEqual([...counts],[1,2,3,4,5]);
});

test('one through five independent 100 percent member preferences cannot be displaced by style or diversity quotas',()=>{
 for(let mask=1;mask<32;mask++){
  const controlled=selected(mask),input=fixture(controlled),familiarityByRole=Object.fromEntries(controlled.map(role=>[role,profile(role)]));
  for(const style of ['balanced','fun','wild']){
   const rows=search({...input,style,familiarityByRole});assert.equal(rows.length,1,controlled.join('/')+' '+style);
   assertCandidate(rows[0],input,controlled);
   for(const role of controlled)assert.equal(rows[0].slots.find(slot=>slot.role===role).champion,preferred[role]);
   const exactPools=Object.fromEntries(controlled.map(role=>[role,{mode:'only',heroes:[preferred[role]]}]));
   const [ordinary]=search({...input,style,rolePools:exactPools});assert.deepEqual(rows[0].recommendationFit,ordinary.recommendationFit,'Familiarity selects the member without adding fit points');
   const engine=createRecommendationSearch({...input,style,familiarityByRole});engine.advance({limit:6});assert.deepEqual(engine.advance({limit:6}).rows,[],'An exhausted preferred population cannot be padded with zero-weight heroes');
  }
 }
});

test('real room bindings reach production search with each of two through five members owning their preferred lane',()=>{
 for(let count=2;count<=5;count++){
  const controlled=roles.slice(0,count),input=fixture(controlled);
  input.slots=input.slots.map((slot,clientCellId)=>({...slot,clientCellId}));
  const client={connected:true,phase:'ChampSelect',session:{gameId:8000+count,localPlayerCellId:0,myTeam:roles.map((role,cellId)=>({cellId,assignedPosition:positions[cellId],championId:controlled.includes(role)?0:Number(game.champions.find(hero=>hero.id===preferred[role]).key)})),theirTeam:[],actions:[]},party:{status:'known',members:controlled.map((role,cellId)=>({cellId,local:cellId===0,publicRiotId:'Player'+cellId+'#CN1'}))}};
  const room={room:'482913',mode:'client',transport:'relay',link:'connected',championUsage:true,members:controlled.map((role,index)=>({nick:'Player'+index+'#CN1',self:index===0,online:true,share:{pick:{role,champion:preferred[role]},championUsage:{version:1,mass:1,usage:profile(role).usage}}}))};
  const summary={status:'ready',session:'a'.repeat(32),usage:profile('top').usage};
  const context=roomFamiliarityContext({client,room,slots:input.slots,scope:'party',ownRole:'top',summary,mass:1});
  assert.deepEqual(Object.keys(context.familiarityByRole).sort(),[...controlled].sort());
  assert.equal(new Set(Object.values(context.familiarityByRole).map(value=>value.member)).size,count);
  const options={...input,...context,clientSession:client.session,ownRole:'top'},rows=search(options);assert.equal(rows.length,1);
  for(const role of controlled)assert.equal(rows[0].slots.find(slot=>slot.role===role).champion,preferred[role],'The shared pool cannot replace the profile belonging to '+role);
  const reordered=roomFamiliarityContext({client,room:{...room,members:room.members.toReversed()},slots:input.slots,scope:'party',ownRole:'top',summary,mass:1});
  assert.deepEqual(search({...options,...reordered}),rows,'Room serialization order cannot reassign member influence');
 }
});

test('overlapping role pools preserve separate member choices and never substitute when those choices collide',()=>{
 const controlled=['mid','support'],input=fixture(controlled);
 input.rolePools={mid:{mode:'only',heroes:['Lux','Seraphine']},support:{mode:'only',heroes:['Lux','Seraphine']}};
 for(const [mid,support] of [['Lux','Seraphine'],['Seraphine','Lux']]){
  const familiarityByRole={mid:{member:'first',mass:1,usage:{sampled:10,counts:{[mid]:10}}},support:{member:'second',mass:1,usage:{sampled:10,counts:{[support]:10}}}};
  const rows=search({...input,familiarityByRole});assert.equal(rows.length,1);assertCandidate(rows[0],input,controlled);
  assert.equal(rows[0].slots.find(slot=>slot.role==='mid').champion,mid);assert.equal(rows[0].slots.find(slot=>slot.role==='support').champion,support);
 }
 const same={mass:1,usage:{sampled:10,counts:{Lux:10}}};
 assert.deepEqual(search({...input,familiarityByRole:{mid:{...same,member:'first'},support:{...same,member:'second'}}}),[],'A duplicate hero cannot be resolved by silently discarding either member preference');
});
