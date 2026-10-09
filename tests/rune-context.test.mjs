import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {writeRunePage} from '../services/lcu.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {runeWriteContext,validateRuneWriteContext} from '../src/core/rune-context.mjs';
const data=JSON.parse(await fs.readFile('data/game.json')),page=getBuild(data.champions.find(c=>c.id==='Ashe'),'bottom',data).runePage;
const initial={connected:true,phase:'ChampSelect',game:{gameId:'111'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:22,championPickIntent:22,assignedPosition:'bottom'}]}};
function mock({create=false,change=()=>{},afterWrite=false,throwOnCheck=false}={}){
 const client=structuredClone(initial),calls=[];let enumerated=false,written=false,pages=[{id:8000,isEditable:false,current:true},...(create?[]:[{id:12,isEditable:true,current:false}])];
 return {client,calls,pages:()=>structuredClone(pages),discover:async()=>({port:12345,password:'isolated-test-only'}),request:async(_auth,route,method='GET',body)=>{
  calls.push({route,method});
  if(route==='/lol-gameflow/v1/gameflow-phase'){if(throwOnCheck&&enumerated)throw Error('mock disconnected');return client.phase;}
  if(route==='/lol-gameflow/v1/session')return {gameData:{gameId:client.game.gameId}};
  if(route==='/lol-champ-select/v1/session')return structuredClone(client.session);
  if(method==='GET'&&route==='/lol-perks/v1/pages'){const result=structuredClone(pages);if(!enumerated){enumerated=true;if(!afterWrite)change(client);}return result;}
  if(route==='/lol-perks/v1/currentpage'){assert.equal(method,'PUT');pages=pages.map(p=>({...p,current:p.id===body}));return null;}
  assert.ok(method==='PUT'&&route==='/lol-perks/v1/pages/12'||method==='POST'&&route==='/lol-perks/v1/pages');written=true;const id=create?777:12;pages=[...pages.filter(p=>p.id!==id),{...body,id,current:false,isEditable:true}];if(afterWrite)change(client);return {id};
 }};
}
test('the public click context excludes identifiers and binds phase, known game and own selection',()=>{
 const context=runeWriteContext({...initial,secret:'must-not-copy',session:{...initial.session,puuid:'private'}});assert.deepEqual(validateRuneWriteContext(context),context);assert.ok(!JSON.stringify(context).includes('private'));assert.ok(!JSON.stringify(context).includes('secret'));
 for(const value of [undefined,{...context,championId:'22'},{...context,gameId:'bad'},{...context,cellId:30},{...context,phase:'InProgress'}])assert.throws(()=>validateRuneWriteContext(value));
 assert.throws(()=>runeWriteContext({...initial,session:null}),/确认当前选人对象/);
});
test('target changes while enumerating pages cancel both replacement and creation with zero mutations',async()=>{
 const changes=[c=>c.phase='GameStart',c=>c.phase='InProgress',c=>c.game.gameId='222',c=>c.session.myTeam[0].championId=99,c=>c.session.myTeam[0].championPickIntent=99,c=>c.session.myTeam[0].assignedPosition='mid',c=>{c.session.localPlayerCellId=2;c.session.myTeam[0].cellId=2;}];
 for(const create of [false,true])for(const change of changes){const client=mock({create,change}),before=client.pages();await assert.rejects(writeRunePage({page,context:runeWriteContext(initial),trees:data.runes},client),/已变化|再次确认/);assert.deepEqual(client.calls.filter(c=>c.method!=='GET'),[]);assert.deepEqual(client.pages(),before);}
});
test('an already stale click or failed final phase read cannot mutate pages',async()=>{
 const stale=mock();stale.client.session.myTeam[0].championId=99;await assert.rejects(writeRunePage({page,context:runeWriteContext(initial),trees:data.runes},stale),/已变化/);assert.equal(stale.calls.filter(c=>c.method!=='GET').length,0);
 const failure=mock({throwOnCheck:true});await assert.rejects(writeRunePage({page,context:runeWriteContext(initial),trees:data.runes},failure),/再次确认/);assert.equal(failure.calls.filter(c=>c.method!=='GET').length,0);
});
test('unchanged context selects verified content while a post-dispatch change reports partial save',async()=>{
 const client=mock();const result=await writeRunePage({page,context:runeWriteContext(initial),trees:data.runes},client);assert.equal(result.pageId,12);assert.equal(client.pages().find(p=>p.id===12).current,true);
 const late=mock({afterWrite:true,change:c=>c.session.myTeam[0].championId=99});await assert.rejects(writeRunePage({page,context:runeWriteContext(initial),trees:data.runes},late),/已保存.*对象.*尚未选用/);assert.equal(late.calls.filter(c=>c.method!=='GET').length,1);assert.equal(late.pages().find(p=>p.id===12).current,false);
});
