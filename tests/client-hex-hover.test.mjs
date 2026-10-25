import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareClientSelection} from '../services/client-preparation.mjs';
import {createHexSelectionQueue} from '../services/hex-selection-queue.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
function hexHoverFixture(){
 const heroes={Ashe:22,Caitlyn:51};
 const own={cellId:0,championId:0,championPickIntent:0,assignedPosition:'',spell1Id:0,spell2Id:0};
 const action={id:7,type:'pick',actorCellId:0,championId:0,completed:false,isInProgress:true};
 const session={gameId:999,localPlayerCellId:0,myTeam:[own],theirTeam:[],actions:[[action]],benchEnabled:true,benchChampions:[{championId:22},{championId:51}],allowDuplicatePicks:false,bans:{myTeamBans:[],theirTeamBans:[]},timer:{phase:'PLANNING'}};
 const game={gameData:{gameId:999,mapId:12,queue:{id:2400,gameMode:'ARAM'}}},calls=[];
 const request=async(auth,route,method='GET',body)=>{
  calls.push({route,method,body});
  if(route==='/lol-gameflow/v1/gameflow-phase')return 'ChampSelect';
  if(route==='/lol-gameflow/v1/session')return structuredClone(game);
  if(route==='/lol-champ-select/v1/session')return structuredClone(session);
  if(route.endsWith('/pickable-champion-ids'))return [heroes.Ashe,heroes.Caitlyn];
  if(route.endsWith('/disabled-champion-ids'))return [];
  if(route.startsWith('/lol-champ-select/v1/session/bench/swap/')&&method==='POST'){const target=Number(route.split('/').pop());assert.ok([heroes.Ashe,heroes.Caitlyn].includes(target));assert.equal(body,undefined);own.championId=target;own.championPickIntent=target;action.championId=target;return {swapped:true};}
  throw Error('Unexpected mock route '+method+' '+route);
 };
 const deps={discover:async()=>({port:1234,password:'mock-never-logged'}),request,writeRunes:async()=>{throw Error('hex hover must not write runes');},writeItems:async()=>{throw Error('hex hover must not write items');}};
 const valueFor=id=>{
  const hero=data.champions.find(c=>c.id===id);
  return {champion:id,championId:hero.key,mode:'hex',sessionGameId:'999',context:runeWriteContext({connected:true,phase:'ChampSelect',session,game:{gameId:'999'}}),preselectOnly:true};
 };
 return {own,session,game,calls,deps,valueFor,run:id=>prepareClientSelection({value:valueFor(id),data,ownedPageId:11},deps)};
}
test('hex hover switches heroes without lock, runes or items',async()=>{
 const f=hexHoverFixture();
 const first=await f.run('Ashe');
 assert.equal(first.steps.hover.status,'done');assert.equal(f.own.championPickIntent,22);
 const second=await f.run('Caitlyn');
 assert.equal(second.steps.hover.status,'done');assert.equal(f.own.championPickIntent,51);
 assert.ok(f.calls.filter(c=>c.method!=='GET').every(c=>c.route.startsWith('/lol-champ-select/v1/session/bench/swap/')));
});

test('hex hover switches heroes even after a lock without runes or items',async()=>{
 const f=hexHoverFixture();
 const first=await f.run('Ashe');
 assert.equal(first.steps.hover.status,'done');assert.equal(f.own.championPickIntent,22);
 f.own.championId=22;f.own.championPickIntent=0;f.session.actions[0][0].completed=true;f.session.actions[0][0].championId=22;
 const second=await f.run('Caitlyn');
 assert.equal(second.steps.hover.status,'done');assert.equal(f.own.championPickIntent,51);
 assert.ok(f.calls.filter(c=>c.method!=='GET').every(c=>c.route.startsWith('/lol-champ-select/v1/session/bench/swap/')));
});

test('hex hover rejects targets outside the bench without writes',async()=>{
 const f=hexHoverFixture();
 f.session.benchChampions=[{championId:22}];
 const rejected=await f.run('Caitlyn');assert.equal(rejected.complete,false);assert.match(rejected.steps.hover.message,/不在备选池/);
 assert.ok(!f.calls.some(c=>c.method!=='GET'));
});

test('hex hover rejects unknown heroes and non-hover requests',async()=>{
 const f=hexHoverFixture();
 await assert.rejects(f.deps.request&&prepareClientSelection({value:{...f.valueFor('Ashe'),champion:'NoSuch'},data,ownedPageId:11}),/请在选人阶段核对英雄/);
 const full=hexHoverFixture();
 await assert.rejects(prepareClientSelection({value:{...full.valueFor('Ashe'),preselectOnly:false},data,ownedPageId:11},full.deps),/峡谷|预选/);
});

test('Hex swaps use actual champion readback and need no draft pick action',async()=>{
 const f=hexHoverFixture();f.session.actions=[];f.own.championId=22;
 assert.equal((await f.run('Caitlyn')).complete,true);assert.equal(f.own.championId,51);
 const unconfirmed=hexHoverFixture();unconfirmed.own.championId=22;
 const request=unconfirmed.deps.request;
 unconfirmed.deps.request=async(...args)=>{const result=await request(...args);if(args[2]==='POST')unconfirmed.own.championId=22;return result;};
 const result=await unconfirmed.run('Caitlyn');assert.equal(result.complete,false);assert.equal(result.steps.hover.status,'failed');
});

test('Hex bench writes require fresh personal eligibility, no bans and no occupied target',async()=>{
 for(const mutate of [f=>{const request=f.deps.request;f.deps.request=(...args)=>args[1].endsWith('/pickable-champion-ids')?[22]:request(...args);},f=>{f.session.myTeam.push({cellId:1,championId:51});},f=>{f.session.bans.myTeamBans=[51];}]){
  const f=hexHoverFixture();mutate(f);const result=await f.run('Caitlyn');assert.equal(result.complete,false);assert(!f.calls.some(c=>c.method==='POST'));
 }
 for(const queue of [{id:420,gameMode:'CLASSIC'},{id:450,gameMode:'ARAM'}]){
  const f=hexHoverFixture();f.game.gameData.queue=queue;f.game.gameData.mapId=queue.id===420?11:12;
  await assert.rejects(f.run('Caitlyn'),/当前模式/);assert(!f.calls.some(c=>c.method==='POST'));
 }
});

test('queued Hex clicks serialize writes, discard the middle click and keep the latest hero',async()=>{
 const f=hexHoverFixture(),request=f.deps.request;let release,entered;
 const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 let posts=0,active=0,peak=0;
 f.deps.request=async(...args)=>{if(args[2]!=='POST')return request(...args);posts++;active++;peak=Math.max(peak,active);if(posts===1){entered();await gate;}try{return await request(...args);}finally{active--;}};
 const queue=createHexSelectionQueue((value,control)=>prepareClientSelection({value,data},{...f.deps,...control}));
 const first=queue(f.valueFor('Ashe'));await started;
 const middle=queue(f.valueFor('Ashe')),last=queue(f.valueFor('Caitlyn'));release();
 const results=await Promise.all([first,middle,last]);assert.equal(results[0].superseded,true);assert.equal(results[1].superseded,true);assert.equal(results[2].complete,true);
 assert.equal(f.own.championId,51);assert.equal(posts,2);assert.equal(peak,1);
});

test('queued Hex target is checked against the new session and bench before it writes',async()=>{
 for(const mutate of [f=>{f.session.gameId=1000;},f=>{f.session.benchChampions=[{championId:22}];}]){
  const f=hexHoverFixture(),request=f.deps.request;let release,entered;
  const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  f.deps.request=async(...args)=>{if(args[2]==='POST'){entered();await gate;}return request(...args);};
  const queue=createHexSelectionQueue((value,control)=>prepareClientSelection({value,data},{...f.deps,...control}));
  const first=queue(f.valueFor('Ashe'));await started;const last=queue(f.valueFor('Caitlyn'));mutate(f);release();await first;
  const result=await last.catch(error=>({complete:false,message:error.message}));assert.equal(result.complete,false);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 }
});
