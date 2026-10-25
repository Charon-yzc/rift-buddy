import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareClientSelection} from '../services/client-preparation.mjs';
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
 return {own,session,calls,deps,valueFor,run:id=>prepareClientSelection({value:valueFor(id),data,ownedPageId:11},deps)};
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
 await assert.rejects(f.run('Caitlyn'),/不在备选池/);
 assert.ok(!f.calls.some(c=>c.method!=='GET'));
});

test('hex hover rejects unknown heroes and non-hover requests',async()=>{
 const f=hexHoverFixture();
 await assert.rejects(f.deps.request&&prepareClientSelection({value:{...f.valueFor('Ashe'),champion:'NoSuch'},data,ownedPageId:11}),/请在选人阶段核对英雄/);
 const full=hexHoverFixture();
 await assert.rejects(prepareClientSelection({value:{...full.valueFor('Ashe'),preselectOnly:false},data,ownedPageId:11},full.deps),/峡谷|预选/);
});
