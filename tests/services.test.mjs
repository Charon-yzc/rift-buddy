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
test('transient destination locks keep old settings intact and preserve queued saves; terminal failures do not poison the queue',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-json-lock-')),file=path.join(root,'settings.json');await atomicJSON(file,{revision:0});
 const rename=fs.rename;let calls=0;
 const transient=t.mock.method(fs,'rename',async(from,to)=>{
  if(to===file&&calls++<2){assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{revision:0});throw Object.assign(Error('isolated destination lock'),{code:'EPERM'});}
  return rename(from,to);
 });
 await Promise.all([atomicJSON(file,{revision:1}),atomicJSON(file,{revision:2})]);assert.equal(calls,4);assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{revision:2});transient.mock.restore();
 let denied=true;t.mock.method(fs,'rename',async(from,to)=>{if(to===file&&denied){denied=false;throw Object.assign(Error('isolated permanent failure'),{code:'EIO'});}return rename(from,to);});
 await assert.rejects(atomicJSON(file,{revision:99}),{code:'EIO'});assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{revision:2});
 await atomicJSON(file,{revision:3});assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{revision:3});assert.deepEqual(await fs.readdir(root),['settings.json']);
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

test('room nickname preferences sanitize, cap at 24 and fall back to the default',()=>{
 assert.equal(validateState({...defaultState(),preferences:{roomNick:' 小明 '}}).preferences.roomNick,'小明');
 assert.equal(validateState({...defaultState(),preferences:{roomNick:'队友\u202e甲'}}).preferences.roomNick,'队友甲');
 assert.equal(validateState({...defaultState(),preferences:{roomNick:'x'.repeat(25)}}).preferences.roomNick,'队友');
 assert.equal(validateState({...defaultState(),preferences:{roomNick:' '}}).preferences.roomNick,'队友');
 assert.equal(validateState(defaultState()).preferences.roomNick,'队友');
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
function fakeClient({phase='Lobby',pages=[],verify=true,capacity=Infinity,writeStatus=0}={}){
 const calls=[];let stored=structuredClone(pages);
 return {calls,pages:()=>structuredClone(stored),discover:async()=>({port:12345,password:'test-only'}),request:async(_auth,route,method='GET',payload)=>{
  calls.push({route,method,payload});if(route.endsWith('gameflow-phase'))return phase;
  if(method==='GET')return structuredClone(stored);
  if(writeStatus||method==='POST'&&stored.filter(p=>p.isEditable===true).length>=capacity){const error=Error('Client rejected write');error.status=writeStatus||400;throw error;}
  const id=method==='PUT'?Number(route.split('/').at(-1)):777;
  if(verify)stored=[...stored.filter(p=>p.id!==id),{...payload,id,isEditable:true}];return {id};
 }};
}
const page=getBuild(data.champions.find(c=>c.id==='Ashe'),'bottom',data).runePage;
test('a full rune collection replaces the current editable page without creating or backing up a page',async()=>{
 const pages=[{id:11,name:'其他旧方案',isEditable:true,current:false,selectedPerkIds:[1]},{id:12,name:'当前旧方案',isEditable:true,current:true,selectedPerkIds:[2]}],mock=fakeClient({pages,capacity:2});
 const result=await writeRunePage({page,trees:data.runes},mock);assert.equal(result.pageId,12);
 assert.deepEqual(mock.calls.filter(c=>c.method!=='GET').map(c=>[c.method,c.route]),[['PUT','/lol-perks/v1/pages/12']]);
 assert.equal(mock.pages().length,2);assert.deepEqual(mock.pages().find(p=>p.id===11),pages[0]);
 const replaced=mock.pages().find(p=>p.id===12);assert.equal(replaced.current,true);assert.deepEqual(replaced.selectedPerkIds,page.selectedPerkIds);assert.match(replaced.name,/^开黑搭子 · /);
});
test('a single occupied editable page is reusable without a blank page or spare slot',async()=>{
 const mock=fakeClient({pages:[{id:12,name:'我的常用方案',isEditable:true,selectedPerkIds:[1]}],capacity:1});
 const result=await writeRunePage({page,trees:data.runes},mock);assert.equal(result.pageId,12);assert.equal(mock.pages().length,1);
 assert.deepEqual(mock.calls.filter(c=>c.method!=='GET').map(c=>c.method),['PUT']);
});
test('rune writer reuses the last written editable page even after renaming and selection changes',async()=>{
 const mock=fakeClient({pages:[{id:11,name:'当前方案',isEditable:true,current:true},{id:12,name:'上次写入后重新命名',isEditable:true,current:false}]});
 const result=await writeRunePage({page,ownedPageId:12,trees:data.runes},mock);assert.equal(result.pageId,12);
 assert.equal(mock.calls.filter(c=>c.method==='PUT').length,1);assert.equal(mock.calls.at(-1).method,'GET');
});
test('a deleted or read-only last page falls back to another editable page and skips presets',async()=>{
 for(const ownedPageId of [999,8000]){
  const preset={id:8000,name:'客户端预设',isEditable:false,current:true,selectedPerkIds:[1]},mock=fakeClient({pages:[preset,{id:12,name:'可编辑页',isEditable:true}]});
  assert.equal((await writeRunePage({page,ownedPageId,trees:data.runes},mock)).pageId,12);
  assert.deepEqual(mock.pages().find(p=>p.id===8000),preset);assert.equal(mock.calls.find(c=>c.method==='PUT').route,'/lol-perks/v1/pages/12');
 }
});
test('only a collection without editable pages creates a new page',async()=>{
 const preset={id:8000,name:'客户端预设',isEditable:false},mock=fakeClient({pages:[preset],capacity:1});
 const result=await writeRunePage({page,trees:data.runes},mock);assert.equal(result.pageId,777);
 assert.deepEqual(mock.calls.filter(c=>c.method!=='GET').map(c=>c.method),['POST']);assert.deepEqual(mock.pages().find(p=>p.id===8000),preset);
});
test('replacement refusal does not trigger creation and errors describe the attempted operation',async()=>{
 const replacing=fakeClient({pages:[{id:12,isEditable:true}],writeStatus:409});
 await assert.rejects(writeRunePage({page,trees:data.runes},replacing),/暂不允许替换/);assert.deepEqual(replacing.calls.filter(c=>c.method!=='GET').map(c=>c.method),['PUT']);
 const creating=fakeClient({capacity:0});await assert.rejects(writeRunePage({page,trees:data.runes},creating),/没有可替换.*未能新建/);
});
test('rune writes stop before mutation during a game and fail when readback is unconfirmed',async()=>{
 const playing=fakeClient({phase:'InProgress'});await assert.rejects(writeRunePage({page,trees:data.runes},playing),/大厅或选人/);assert.equal(playing.calls.filter(c=>c.method!=='GET').length,0);
 const unconfirmed=fakeClient({verify:false});await assert.rejects(writeRunePage({page,trees:data.runes},unconfirmed),/未确认/);
});
