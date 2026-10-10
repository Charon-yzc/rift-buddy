import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {writeRunePage,lcuRequest} from '../services/lcu.mjs';import {getBuild} from '../src/core/builds.mjs';
import {createRuneApplicationState} from '../src/core/preparation.mjs';
const data=JSON.parse(await fs.readFile('data/game.json')),page=getBuild(data.champions.find(c=>c.id==='Ashe'),'bottom',data).runePage;
const draft=(change={})=>({connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{gameId:1501},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:106,assignedPosition:'top'}]},...change});
test('a checked rune click survives ordinary polls but not a different public client context',()=>{
 for(const next of [draft({connected:false}),draft({phase:'Lobby',session:null}),draft({phase:'InProgress',session:null}),draft({game:{gameId:1502}}),draft({session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:22,assignedPosition:'bottom'}]}}),draft({mode:{id:'hex'}})]){
  const state=createRuneApplicationState();state.observe(draft());assert.equal(state.confirm(state.begin('Volibear:top:page')),true);
  state.observe({...draft(),receivedAt:Date.now()});assert.equal(state.has('Volibear:top:page'),true,'Ordinary polling erased this click');
  state.observe(next);state.observe(draft());assert.equal(state.has('Volibear:top:page'),false,'A previous context was treated as current');
 }
});
test('late or failed writes cannot confirm a newer session or supersede a newer click',()=>{
 const state=createRuneApplicationState();state.observe(draft());const old=state.begin('old');state.observe(draft({game:{gameId:1502}}));assert.equal(state.confirm(old),false);
 const pending=state.begin('first'),current=state.begin('second');assert.equal(state.confirm(pending),false);assert.equal(state.confirm(current),true);assert.equal(state.has('second'),true);
 state.clear();assert.equal(state.has('second'),false);assert.equal(state.confirm(current),false);
 state.observe(draft({connected:false}));assert.equal(state.confirm(state.begin('offline')),false);
});
function fixture({selectOnWrite=false,switchFailure=false,switchIgnored=false,phaseChanged=false,corruptOnSwitch=false,create=false}={}){
 const preset={id:8000,isEditable:false,current:true,selectedPerkIds:[1]},editable={id:12,isEditable:true,current:false,selectedPerkIds:[2]};let pages=[preset,...(create?[]:[editable])],written=false;const calls=[];
 return {calls,pages:()=>structuredClone(pages),discover:async()=>({port:12345,password:'test-only'}),request:async(_auth,route,method='GET',body)=>{
  calls.push({route,method,body});
  if(route==='/lol-gameflow/v1/gameflow-phase')return phaseChanged&&written?'InProgress':'ChampSelect';
  if(route==='/lol-champ-select/v1/session')return {localPlayerCellId:1,myTeam:[{cellId:1,championId:22,assignedPosition:'bottom'}]};
  if(method==='GET'&&route==='/lol-perks/v1/pages')return structuredClone(pages);
  if(method==='PUT'&&route==='/lol-perks/v1/currentpage'){
   if(switchFailure){const error=Error('Selection refused');error.status=409;throw error;}
   if(!switchIgnored)pages=pages.map(p=>({...p,current:p.id===body,...(corruptOnSwitch&&p.id===body?{selectedPerkIds:[3]}:{})}));return null;
  }
  const id=method==='POST'?777:Number(route.split('/').at(-1));assert.ok(method==='POST'&&route==='/lol-perks/v1/pages'||method==='PUT'&&id===12,'Unexpected content mutation');
  written=true;if(selectOnWrite)pages=pages.map(p=>({...p,current:false}));pages=[...pages.filter(p=>p.id!==id),{...body,id,isEditable:true,current:selectOnWrite}];return {id};
 }};
}
test('saved rune content is explicitly selected when the client ignores the payload current flag',async()=>{
 const client=fixture();const result=await writeRunePage({page,ownedPageId:12,trees:data.runes},client);assert.equal(result.pageId,12);
 assert.deepEqual(client.calls.filter(c=>c.method!=='GET').map(c=>[c.route,c.body?.selectedPerkIds?null:c.body]),[['/lol-perks/v1/pages/12',null],['/lol-perks/v1/currentpage',12]]);
 assert.equal(client.pages().find(p=>p.id===12).current,true);assert.deepEqual(client.pages().find(p=>p.id===8000).selectedPerkIds,[1]);
});
test('a confirmed selected page does not cause another selection mutation',async()=>{
 const client=fixture({selectOnWrite:true});await writeRunePage({page,ownedPageId:12,trees:data.runes},client);assert.equal(client.calls.filter(c=>c.method!=='GET').length,1);
});
test('selection refusal or ignored selection is a partial-save failure rather than successful application',async()=>{
 for(const options of [{switchFailure:true},{switchIgnored:true}]){const client=fixture(options);await assert.rejects(writeRunePage({page,ownedPageId:12,trees:data.runes},client),/已保存.*(?:选用|切换)/);assert.deepEqual(client.pages().find(p=>p.id===12).selectedPerkIds,page.selectedPerkIds);assert.equal(client.calls.filter(c=>c.method==='POST').length,0);}
});
test('entering a game after saving cancels the selection fallback',async()=>{
 const client=fixture({phaseChanged:true});await assert.rejects(writeRunePage({page,ownedPageId:12,trees:data.runes},client),/已保存.*选用/);assert.equal(client.calls.filter(c=>c.route==='/lol-perks/v1/currentpage').length,0);
});
test('selection readback also rechecks the complete rune content',async()=>{
 const client=fixture({corruptOnSwitch:true});await assert.rejects(writeRunePage({page,ownedPageId:12,trees:data.runes},client),/未确认完整符文页/);
});
test('a newly created page is selected without replacing a read-only preset',async()=>{
 const client=fixture({create:true});const result=await writeRunePage({page,trees:data.runes},client);assert.equal(result.pageId,777);assert.equal(client.pages().find(p=>p.id===777).current,true);assert.deepEqual(client.pages().find(p=>p.id===8000).selectedPerkIds,[1]);
});
test('the selection route only accepts a positive numeric page id',()=>{
 for(const body of ['12',0,-1,Infinity,null,{}])assert.throws(()=>lcuRequest({port:12345,password:'test-only'},'/lol-perks/v1/currentpage','PUT',body),/不支持/);
});
