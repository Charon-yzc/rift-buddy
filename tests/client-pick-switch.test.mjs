import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareClientSelection} from '../services/client-preparation.mjs';
import {getBuild} from '../src/core/builds.mjs';import {createItemSet} from '../src/core/item-sets.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));data.builds=JSON.parse(fs.readFileSync(new URL('../data/builds.json',import.meta.url))).entries;
function switchFixture(){
 const heroes={Ashe:22,Caitlyn:51};
 const own={cellId:0,championId:0,championPickIntent:0,assignedPosition:'bottom',spell1Id:1,spell2Id:3};
 const action={id:4,type:'pick',actorCellId:0,championId:0,completed:false,isInProgress:true};
 const session={gameId:777,localPlayerCellId:0,myTeam:[own],theirTeam:[],actions:[[action]],allowDuplicatePicks:false,bans:{myTeamBans:[],theirTeamBans:[]},timer:{phase:'PLANNING'}};
 const game={gameData:{gameId:777,mapId:11,queue:{id:420,gameMode:'CLASSIC'}}},calls=[],pages=[{id:11,current:true,isEditable:true}];
 const request=async(auth,route,method='GET',body)=>{
  calls.push({route,method,body});
  if(route==='/lol-gameflow/v1/gameflow-phase')return 'ChampSelect';
  if(route==='/lol-gameflow/v1/session')return structuredClone(game);
  if(route==='/lol-champ-select/v1/session')return structuredClone(session);
  if(route.endsWith('/pickable-champion-ids'))return [heroes.Ashe,heroes.Caitlyn];
  if(route.endsWith('/disabled-champion-ids'))return [];
  if(route==='/lol-champ-select/v1/session/actions/4'&&method==='PATCH'){assert.deepEqual(body,{championId:body.championId,completed:false});assert.ok([heroes.Ashe,heroes.Caitlyn].includes(body.championId));action.championId=body.championId;own.championPickIntent=body.championId;return;}
  if(route==='/lol-perks/v1/pages'&&method==='GET')return structuredClone(pages);
  if(route==='/lol-perks/v1/pages/11'&&method==='PUT'){Object.assign(pages[0],body);return;}
  if(route==='/lol-champ-select/v1/session/my-selection'){if(method==='PATCH'){Object.assign(own,body);return;}return {spell1Id:own.spell1Id,spell2Id:own.spell2Id};}
  throw Error('Unexpected mock route '+method+' '+route);
 };
 const deps={discover:async()=>({port:1234,password:'mock-never-logged'}),request,writeItems:async()=>({title:'mock'})};
 const valueFor=id=>{
  const hero=data.champions.find(c=>c.id===id),build=getBuild(hero,'bottom',data);
  return {champion:id,role:'bottom',mode:'rift',sessionGameId:'777',context:runeWriteContext({connected:true,phase:'ChampSelect',session,game:{gameId:'777'}}),page:build.runePage,summoners:build.summoners,itemSet:createItemSet(hero,build,data)};
 };
 return {own,action,session,calls,deps,valueFor,run:(id,extra={})=>prepareClientSelection({value:{...valueFor(id),...extra},data,ownedPageId:11},deps)};
}
test('switching heroes keeps hover-only writes on the fast path',async()=>{
 const f=switchFixture();
 const first=await f.run('Ashe',{preselectOnly:true});
 assert.equal(first.preselectOnly,true);assert.equal(first.steps.hover.status,'done');assert.equal(f.own.championPickIntent,22);
 assert.deepEqual(f.calls.filter(c=>c.method!=='GET').map(c=>c.route),['/lol-champ-select/v1/session/actions/4']);
 const second=await f.run('Caitlyn',{preselectOnly:true});
 assert.equal(second.steps.hover.status,'done');assert.equal(f.own.championPickIntent,51);
 assert.ok(f.calls.filter(c=>c.method!=='GET').every(c=>c.route==='/lol-champ-select/v1/session/actions/4'));
});
test('a full first click followed by a fast hover-only switch changes the client hero',async()=>{
 const f=switchFixture();
 const full=await f.run('Ashe');
 assert.equal(full.complete,true);assert.equal(f.own.championPickIntent,22);
 const fast=await f.run('Caitlyn',{preselectOnly:true});
 assert.equal(fast.steps.hover.status,'done');assert.equal(f.own.championPickIntent,51);
 assert.ok(f.calls.filter(c=>c.method!=='GET').every(c=>c.route==='/lol-champ-select/v1/session/actions/4'||c.route==='/lol-champ-select/v1/session/my-selection'||c.route.startsWith('/lol-perks/v1/pages')));
});
