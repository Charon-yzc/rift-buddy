import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {clientSnapshot,sanitizeSession} from '../services/lcu.mjs';
import {normalizeChampionIds,pickEligibilityContext,localPickEligibility} from '../src/core/pick-eligibility.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';
import {restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {restorePlayerPosition,reconcileClientDraft} from '../src/core/draft.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
const {champions}=JSON.parse(await fs.readFile('data/game.json'));
const key=id=>champions.find(c=>c.id===id).key;
const time=Date.now();
const raw={gameId:'12345',localPlayerCellId:1,myTeam:[{cellId:1,championId:0,assignedPosition:'MIDDLE'},{cellId:2,championId:key('Vi'),assignedPosition:'JUNGLE'}],theirTeam:[],bans:{myTeamBans:[],theirTeamBans:[]}};
function fixture({session=raw,pickable=[key('Ahri')],disabled=[],phase='ChampSelect',nextSession=session,nextPhase=phase,fail={}}={}){
 const calls=[];let phaseReads=0,sessionReads=0;
 return {calls,discover:async()=>({port:12345,password:'mock-only-secret'}),now:()=>time,request:async(_auth,route,method='GET')=>{
  calls.push({route,method});const endpoint=route.split('/').at(-1);if(fail[endpoint])throw Object.assign(Error('mock unavailable'),{status:fail[endpoint]});
  if(endpoint==='gameflow-phase')return phaseReads++?nextPhase:phase;
  if(route==='/lol-champ-select/v1/session')return structuredClone(sessionReads++?nextSession:session);
  if(endpoint==='pickable-champion-ids')return structuredClone(pickable);
  if(endpoint==='disabled-champion-ids')return structuredClone(disabled);
  return {gameData:{gameId:12345,queue:{id:420},gameMode:'CLASSIC'}};
 }};
}
const board=()=>createSlots().map(s=>({...s,party:['jungle','mid'].includes(s.role)}));
const input=extra=>({slots:board(),champions,scope:'party',limit:3,pool:['Ahri','Lux','Vi','JarvanIV','LeeSin'],poolMode:'only',...extra});
const available=(session=sanitizeSession(raw),extra={})=>({connected:true,phase:'ChampSelect',session,eligibility:{context:pickEligibilityContext(session),localPlayerCellId:session.localPlayerCellId,receivedAt:new Date(time).toISOString(),pickable:[key('Ahri')],disabled:[],...extra}});

test('only exact bounded champion id arrays distinguish unknown from a known empty list',()=>{
 assert.deepEqual(normalizeChampionIds([]),[]);assert.deepEqual(normalizeChampionIds([2,1,2]),[1,2]);
 for(const value of [null,{},['1'],[0],[1.5],[-1],Array(5001).fill(1)])assert.equal(normalizeChampionIds(value),null);
});
test('snapshot reads only allowlisted public eligibility endpoints, strips secrets and keeps public identity',async()=>{
 const mock=fixture(),client=await clientSnapshot('',mock);
 assert.equal(client.connected,true);assert.equal(client.session.gameId,'12345');assert.deepEqual(client.eligibility.pickable,[key('Ahri')]);
 assert.ok(mock.calls.every(c=>c.method==='GET'));assert.equal(mock.calls.filter(c=>c.route.endsWith('pickable-champion-ids')).length,1);
 assert.equal(mock.calls.filter(c=>c.route.endsWith('disabled-champion-ids')).length,1);assert.ok(!JSON.stringify(client).includes('mock-only-secret'));
});
test('unavailable and malformed optional lists do not disconnect or invent an empty owned pool',async()=>{
 for(const config of [{fail:{'pickable-champion-ids':404,'disabled-champion-ids':408}},{pickable:{champions:[]},disabled:[-1]}]){
  const client=await clientSnapshot('',fixture(config)),state=localPickEligibility(client,board(),champions,{now:time});
  assert.equal(client.connected,true);assert.equal(state.status,'unknown');assert.deepEqual(state.eligibleByRole,{});
 }
 const client=await clientSnapshot('',fixture({pickable:[],disabled:[]}));assert.deepEqual(localPickEligibility(client,board(),champions,{now:time}).eligibleByRole.mid,[]);
});
test('partial responses apply only the known local restrictions and label the unknown part',async()=>{
 const client=await clientSnapshot('',fixture({fail:{'pickable-champion-ids':404},disabled:[key('Ahri')]}));
 const state=localPickEligibility(client,board(),champions,{now:time});assert.equal(state.status,'partial');assert.ok(!state.eligibleByRole.mid.includes('Ahri'));assert.ok(state.eligibleByRole.mid.includes('Lux'));assert.match(state.message,/拥有\/周免范围未核对/);
});
test('auth changes fail the snapshot; no eligibility is read outside champion selection',async()=>{
 const failed=await clientSnapshot('',fixture({fail:{'pickable-champion-ids':401}}));assert.equal(failed.connected,false);assert.equal(failed.phase,'Offline');
 const mock=fixture({phase:'Lobby'}),client=await clientSnapshot('',mock);assert.equal(client.eligibility,null);assert.ok(!mock.calls.some(c=>c.route.includes('champ-select')));
});
test('a phase or public draft change during optional reads discards the old eligibility',async()=>{
 for(const config of [{nextPhase:'Lobby'},{nextSession:{...raw,gameId:'67890'}},{nextSession:{...raw,myTeam:raw.myTeam.map(p=>p.cellId===1?{...p,championId:key('Lux')}:p)}}]){
  const client=await clientSnapshot('',fixture(config));assert.equal(client.connected,true);assert.equal(client.eligibility,null);
 }
});
test('own eligibility affects only the confirmed local position and intersects all manual pools',()=>{
 const state=localPickEligibility(available(),board(),champions,{now:time});assert.deepEqual(state.eligibleByRole,{mid:['Ahri']});assert.match(state.message,/朋友的可选范围未知/);
 const rows=recommend(input({eligibleByRole:state.eligibleByRole}));assert.ok(rows.length);assert.ok(rows.every(r=>r.slots[2].champion==='Ahri'));assert.ok(rows.some(r=>r.slots[1].champion!=='Ahri'));
 assert.throws(()=>recommend(input({eligibleByRole:state.eligibleByRole,pool:['Lux','Vi'],rolePools:{mid:{mode:'only',heroes:['Lux']}}})),/中路没有可选英雄.*本局可选范围/);
});
test('known empty and disabled local intersections never fall back to unsupported heroes or curated seeds',()=>{
 for(const extra of [{pickable:[]},{pickable:[key('Ahri')],disabled:[key('Ahri')]}]){
  const state=localPickEligibility(available(undefined,extra),board(),champions,{now:time});assert.deepEqual(state.eligibleByRole.mid,[]);
  assert.throws(()=>recommend(input({eligibleByRole:state.eligibleByRole})),/中路没有可选英雄/);
 }
});
test('locked local picks survive pickable lists that omit already selected heroes',()=>{
 const slots=board();Object.assign(slots[2],{champion:'Lux',locked:true});
 const rows=recommend(input({slots,eligibleByRole:{mid:[]},confirmedPick:{role:'mid',champion:'Lux'}}));assert.ok(rows.length);assert.ok(rows.every(r=>r.slots[2].champion==='Lux'));
 assert.throws(()=>recommend(input({slots,eligibleByRole:{mid:[]}})),/不在本机当前可选范围/,'A hypothetical locked pick cannot bypass the known local list');
 const session=sanitizeSession({...raw,myTeam:raw.myTeam.map(p=>p.cellId===1?{...p,championId:key('Lux')}:p)}),state=localPickEligibility(available(session),slots,champions,{now:time});assert.deepEqual(state.confirmedPick,{role:'mid',champion:'Lux'});
 const favorite={scope:'party',slots,configurations:[]};assert.equal(restoreTeamFavorite(favorite,slots,champions,session,{eligibleByRole:{mid:[]},confirmedPick:state.confirmedPick}).loadedMembers,1);
});
test('manual local cell binding wins over declared lane without restricting friends',()=>{
 const slots=board();Object.assign(slots[0],{clientCellId:1,manualPosition:true});
 const state=localPickEligibility(available(),slots,champions,{now:time});assert.deepEqual(state.eligibleByRole,{top:['Ahri']});assert.equal(slots[0].manualPosition,true);
});
test('an explicit local lane survives prospective plan replacement and later public champion selection',()=>{
 const playerPosition={role:'top',cellId:1},slots=board();Object.assign(slots[0],{champion:'Ahri',locked:true});
 const state=localPickEligibility(available(),slots,champions,{playerPosition,now:time});assert.deepEqual(state.eligibleByRole,{top:['Ahri']});
 const session={...sanitizeSession(raw),myTeam:raw.myTeam.map(p=>p.cellId===1?{...p,championId:key('Lux')}:p)},moved=restorePlayerPosition(slots.map(s=>s.role==='mid'?{...s,champion:'Lux'}:s),session,champions,playerPosition);
 assert.equal(moved[0].champion,'Lux');assert.equal(moved[0].manualPosition,true);assert.equal(moved[0].clientCellId,1);assert.equal(slots[0].champion,'Ahri');
 const imported=restorePlayerPosition(slots,session,champions,playerPosition);assert.equal(imported[0].champion,'Lux');assert.equal(imported[0].clientCellId,1);
 const collision=slots.map(s=>s.role==='top'?{...s,clientCellId:2}:s);assert.equal(restorePlayerPosition(collision,session,champions,playerPosition),collision,'A public teammate cannot be overwritten by a remembered local role');
 assert.equal(restorePlayerPosition(slots,session,champions,{role:'top',cellId:8}),slots);
 const stored=validateState({...defaultState(),draft:{slots,scope:'party',style:'fun',clientGameId:'12345',playerPosition}});assert.deepEqual(stored.draft.playerPosition,playerPosition);
 assert.equal(reconcileClientDraft(stored.draft,'67890').draft.playerPosition,undefined);
});
test('unknown-position party does not guess account ownership; unknown-position solo candidates are all local',()=>{
 const session=sanitizeSession({...raw,myTeam:raw.myTeam.map(p=>({...p,assignedPosition:''}))}),client=available(session);
 assert.equal(localPickEligibility(client,board(),champions,{now:time}).status,'position');
 assert.deepEqual(localPickEligibility(client,board(),champions,{now:time}).eligibleByRole,{});
 const solo=localPickEligibility(client,board(),champions,{scope:'solo',now:time});assert.equal(Object.keys(solo.eligibleByRole).length,5);
 const rows=recommend(input({scope:'solo',eligibleByRole:solo.eligibleByRole}));assert.ok(rows.length);assert.ok(rows.every(r=>r.slots.find(s=>s.role===r.soloRole).champion==='Ahri'));
});
test('stale, disconnected, other-cell and other-draft lists become explicit manual fallback',()=>{
 for(const client of [{...available(),connected:false},available(undefined,{receivedAt:new Date(time-16000).toISOString()}),available(undefined,{localPlayerCellId:2}),available(undefined,{context:'another draft'})]){
  const state=localPickEligibility(client,board(),champions,{now:time});assert.deepEqual(state.eligibleByRole,{});assert.notEqual(state.status,'checked');
 }
});
test('eligibility changes invalidate accepted results while refresh timestamps alone do not',()=>{
 const make=client=>input({eligibleByRole:localPickEligibility(client,board(),champions,{now:time}).eligibleByRole});
 const first=make(available()),refreshed=make(available(undefined,{receivedAt:new Date(time+1).toISOString()})),changed=make(available(undefined,{pickable:[key('Lux')]}));
 assert.equal(recommendationKey(first),recommendationKey(refreshed));assert.notEqual(recommendationKey(first),recommendationKey(changed));
 assert.notEqual(recommendationKey(first),recommendationKey({...first,publicBans:['Ahri']}));
});
test('public bans and non-mirror enemy picks cannot be bypassed by locked or fully locked boards',()=>{
 for(const restriction of [{publicBans:['Ahri']},{enemy:['Ahri']}])for(const all of [false,true]){
  const slots=board();Object.assign(slots[2],{champion:'Ahri',locked:true});if(all)Object.assign(slots[1],{champion:'Vi',locked:true});
  assert.throws(()=>recommend(input({...restriction,slots})),/中路.*(禁用|敌方选走)/);assert.equal(slots[2].champion,'Ahri');
 }
 const slots=board();Object.assign(slots[2],{champion:'Ahri',locked:true});assert.ok(recommend(input({slots,visibleEnemies:['Ahri'],enemy:[]})).length);
 assert.ok(recommend(input({slots,excluded:['Ahri']})).length,'Personal exclusions do not erase a pre-existing locked pick');
});
test('an unavailable unlocked target is replaced rather than freezing the whole draft',()=>{
 const slots=board();Object.assign(slots[2],{champion:'Ahri',locked:false});const rows=recommend(input({slots,publicBans:['Ahri']}));assert.ok(rows.every(r=>r.slots[2].champion!=='Ahri'));
});
test('favorites skip public bans and non-mirror picks with no incompatible member configurations',()=>{
 const savedSlots=board();Object.assign(savedSlots[2],{champion:'Ahri',locked:true});const favorite={scope:'party',slots:savedSlots,configurations:[{id:'Ahri',role:'mid',mode:'rift'}]};
 for(const session of [{...sanitizeSession(raw),bans:[key('Ahri')]},{...sanitizeSession(raw),allowDuplicatePicks:false,theirTeam:[{cellId:6,championId:key('Ahri')}]}]){
  const result=restoreTeamFavorite(favorite,board(),champions,session);assert.equal(result.slots[2].champion,null);assert.equal(result.loadedMembers,0);assert.deepEqual(result.configurations,[]);assert.equal(result.conflicts[0].reason,'unavailable');
 }
 const mirrored=restoreTeamFavorite(favorite,board(),champions,{...sanitizeSession(raw),allowDuplicatePicks:true,theirTeam:[{cellId:6,championId:key('Ahri')}]});assert.equal(mirrored.loadedMembers,1);
 const own=restoreTeamFavorite(favorite,board(),champions,null,{eligibleByRole:{mid:['Lux']}});assert.equal(own.loadedMembers,0);
});
test('loading an old favorite never overwrites a locked friend; explicit unlock permits replacement',()=>{
 const slots=board();Object.assign(slots[2],{champion:'Lux',locked:true,party:true});const before=structuredClone(slots),saved=board();Object.assign(saved[2],{champion:'Ahri',locked:true});
 const result=restoreTeamFavorite({scope:'party',slots:saved},slots,champions);assert.deepEqual(result.slots[2],before[2]);assert.equal(result.loadedMembers,0);assert.equal(result.conflicts[0].reason,'locked');assert.deepEqual(slots,before);
 slots[2].locked=false;assert.equal(restoreTeamFavorite({scope:'party',slots:saved},slots,champions).slots[2].champion,'Ahri');
});
