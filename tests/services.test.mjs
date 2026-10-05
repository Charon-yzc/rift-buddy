import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {atomicJSON,loadSnapshot,validSnapshot} from '../services/data.mjs';
import {defaultState,validateState,saveState,readState,mergeState} from '../services/storage.mjs';
import {parseLockfile,parseCommandLine,lcuRequest,sanitizeSession,writeRunePage} from '../services/lcu.mjs';
import {createSlots,mergeClientSession,clearClientPicks} from '../src/core/recommend.mjs';
import {getBuild} from '../src/core/builds.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
test('atomic saves serialize overlapping snapshots and preserve a parseable final file',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-test-'));const file=path.join(root,'state.json');
 await Promise.all(Array.from({length:40},(_,i)=>atomicJSON(file,{i,payload:'x'.repeat(4000)})));
 assert.equal(JSON.parse(await fs.readFile(file,'utf8')).i,39);assert.deepEqual(await fs.readdir(root),['state.json']);
});
test('state round trip and strict imported collections',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-state-'));const state=defaultState();state.draft={slots:createSlots(),style:'fun'};
 await saveState(root,state);assert.deepEqual((await readState(root)).draft,{...state.draft,scope:'context'});
 const invalid={...state,favorites:[{id:'bad',title:'bad',type:'team',slots:null}]};assert.throws(()=>validateState(invalid));
 assert.throws(()=>validateState({...state,excluded:[{}]}));
 assert.throws(()=>validateState({...state,preferences:{installPath:'C:/bad\npath'}}));
 assert.equal(validateState({...state,extra:'discard'}).extra,undefined);
 await fs.writeFile(path.join(root,'settings.json'),'broken');assert.equal((await readState(root)).favorites.length,0);assert.ok((await fs.readdir(root)).some(f=>f.includes('.recovery-')));
});

test('automatic pick ownership survives restart, while loaded favorites stay manual',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-sync-restart-'));
 const slots=createSlots();slots[0]={...slots[0],champion:'Garen',locked:true};
 slots[3]={...slots[3],champion:'Ashe',locked:true,clientCellId:2};
 const state={...defaultState(),draft:{slots,style:'fun'},favorites:[{id:'team:test',type:'team',title:'Test lineup',slots,style:'fun'}]};
 await saveState(root,state);const restored=await readState(root);
 assert.equal(restored.draft.slots[3].clientCellId,2);assert.equal(restored.favorites[0].slots[3].clientCellId,undefined);
 const updated=mergeClientSession(restored.draft.slots,{myTeam:[{cellId:2,championId:202,assignedPosition:'BOTTOM'}]},data.champions).slots;
 assert.equal(updated[3].champion,'Jhin');assert.equal(updated[0].champion,'Garen');
 const cleaned=clearClientPicks(updated);assert.equal(cleaned[3].champion,null);assert.equal(cleaned[0].champion,'Garen');
});
test('corrupt game cache falls back to bundled snapshot',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-data-'));await fs.writeFile(path.join(root,'game.json'),'{}');
 const fallback=path.resolve('data');assert.equal((await loadSnapshot(root,fallback)).version,data.version);
 assert.ok(validSnapshot(data));assert.equal(validSnapshot({...data,items:null}),false);
 assert.equal(validSnapshot({...data,spells:{}}),false);
 assert.equal(validSnapshot({...data,runes:data.runes.map(t=>({...t,slots:[]}))}),false);
});

test('installing a newer bundle never lets an older cache downgrade game data',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-version-'));
 await atomicJSON(path.join(root,'game.json'),{...data,version:'16.9.1',patch:'16.9'});
 assert.equal((await loadSnapshot(root,path.resolve('data'))).version,data.version);
 await atomicJSON(path.join(root,'game.json'),{...data,contentRevision:0});
 assert.equal((await loadSnapshot(root,path.resolve('data'))).contentRevision,data.contentRevision);
 await atomicJSON(path.join(root,'game.json'),{...data,version:'16.20.1',patch:'16.20'});
 assert.equal((await loadSnapshot(root,path.resolve('data'))).version,'16.20.1');
});
test('backup imports restore preferences while retaining this machine\'s rune ownership and game path',()=>{
 const current={...defaultState(),ownedPageId:123,draft:{slots:createSlots(),style:'fun'}};
 const backup={...defaultState(),ownedPageId:999,excluded:['Ashe'],preferences:{style:'wild',autoCheck:false,autoSync:false,installPath:'X:/different-computer'}};
 const result=mergeState(current,backup,data.champions);
 assert.equal(result.ownedPageId,123);assert.equal(result.preferences.installPath,current.preferences.installPath);
 assert.equal(result.preferences.autoCheck,false);assert.equal(result.draft.style,'wild');assert.deepEqual(result.excluded,['Ashe']);
});
test('LCU parsing and request scope reject malformed parameters before network access',()=>{
 assert.deepEqual(parseLockfile('LeagueClient:1:12345:test-token:https'),{port:12345,password:'test-token'});
 for(const bad of ['','LeagueClient:1:99999:token:https','Other:1:1:token:https','LeagueClient:1:123:token:http'])assert.equal(parseLockfile(bad),null);
 assert.deepEqual(parseCommandLine('"LeagueClientUx.exe" --app-port=12345 --remoting-auth-token=test-token'),{port:12345,password:'test-token'});
 assert.throws(()=>lcuRequest({port:12345,password:'x'},'/lol-gameflow/v1/gameflow-phase','POST'));
 assert.throws(()=>lcuRequest({port:12345,password:'x'},'/arbitrary','GET'));
 assert.throws(()=>lcuRequest({port:0,password:'x'},'/lol-perks/v1/pages','GET'));
});
test('client session strips player identifiers and private data',()=>{
 const safe=sanitizeSession({myTeam:[{championId:22,cellId:0,assignedPosition:'BOTTOM',puuid:'private',summonerId:123,displayName:'private'}],theirTeam:[],bans:{myTeamBans:[1],theirTeamBans:[2]},localPlayerCellId:0});
 assert.deepEqual(safe.myTeam,[{championId:22,cellId:0,assignedPosition:'BOTTOM'}]);assert.ok(!JSON.stringify(safe).includes('private'));
});
function fakeClient({phase='Lobby',pages=[],verify=true}={}){
 const calls=[];let stored=structuredClone(pages);
 return {calls,discover:async()=>({port:12345,password:'test-only'}),request:async(_auth,route,method='GET',payload)=>{
  calls.push({route,method,payload});if(route.endsWith('gameflow-phase'))return phase;
  if(method==='GET')return structuredClone(stored);
  const id=method==='PUT'?Number(route.split('/').at(-1)):777;
  if(verify)stored=[...stored.filter(p=>p.id!==id),{...payload,id,isEditable:true}];return {id};
 }};
}
const page=getBuild(data.champions.find(c=>c.id==='Ashe'),'bottom',data).runePage;
test('rune writer creates its own page rather than overwriting a foreign page',async()=>{
 const mock=fakeClient({pages:[{id:12,name:'我自己的符文',isEditable:true}]});
 const result=await writeRunePage({page,ownedPageId:12,trees:data.runes},mock);assert.equal(result.pageId,777);
 assert.deepEqual(mock.calls.filter(c=>c.method!=='GET').map(c=>c.method),['POST']);
});
test('rune writer only updates an explicitly owned editable page, with readback',async()=>{
 const mock=fakeClient({pages:[{id:12,name:'开黑搭子 · 旧推荐',isEditable:true}]});
 const result=await writeRunePage({page,ownedPageId:12,trees:data.runes},mock);assert.equal(result.pageId,12);
 assert.equal(mock.calls.filter(c=>c.method==='PUT').length,1);assert.equal(mock.calls.at(-1).method,'GET');
});
test('rune writes stop before mutation during a game and fail when readback is unconfirmed',async()=>{
 const playing=fakeClient({phase:'InProgress'});await assert.rejects(writeRunePage({page,trees:data.runes},playing),/大厅或选人/);assert.equal(playing.calls.filter(c=>c.method!=='GET').length,0);
 const unconfirmed=fakeClient({verify:false});await assert.rejects(writeRunePage({page,trees:data.runes},unconfirmed),/未确认/);
});
