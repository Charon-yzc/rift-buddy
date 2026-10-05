import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,mergeClientSession,clearClientPicks,validateSlots} from '../src/core/recommend.mjs';
import {moveChampion,assignClientChampion,draftTargets,scopeSlots} from '../src/core/draft.mjs';
import {DUOS,CROSS_SYNERGIES} from '../src/core/rules.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {currentPlayerSelection} from '../src/core/guide.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const key=id=>data.champions.find(c=>c.id===id).key;
const session=(a='Ashe',b='Lux')=>({myTeam:[{cellId:1,championId:key(a),assignedPosition:'BOTTOM'},{cellId:2,championId:key(b),assignedPosition:'UTILITY'}],localPlayerCellId:1});

test('drag swaps champion bindings and locks but leaves ownership attached to positions',()=>{
 const initial=mergeClientSession(createSlots(),session(),data.champions).slots;initial[4].party=false;
 const moved=moveChampion(initial,'bottom','support');
 assert.equal(moved[3].champion,'Lux');assert.equal(moved[4].champion,'Ashe');assert.equal(moved[3].party,true);assert.equal(moved[4].party,false);
 assert.equal(moved[3].clientCellId,2);assert.equal(moved[4].clientCellId,1);assert.ok(moved[3].manualPosition&&moved[4].manualPosition);
 assert.equal(initial[3].champion,'Ashe');validateSlots(moved,data.champions);
 const toEmpty=moveChampion(moved,'support','top');assert.equal(toEmpty[0].champion,'Ashe');assert.equal(toEmpty[4].champion,null);assert.equal(toEmpty[0].party,false);
 assert.throws(()=>moveChampion(toEmpty,'support','top'),/已选英雄/);
});
test('manual client positions follow changed champions and atomic champion exchanges',()=>{
 let draft=moveChampion(mergeClientSession(createSlots(),session(),data.champions).slots,'bottom','top');
 draft=mergeClientSession(draft,session('Jhin'),data.champions).slots;
 assert.equal(draft[0].champion,'Jhin');assert.equal(draft[3].champion,null);assert.equal(draft[0].manualPosition,true);
 assert.equal(currentPlayerSelection(session('Jhin'),data.champions,draft).role,'top');
 draft=moveChampion(draft,'support','mid');draft=mergeClientSession(draft,session('Lux','Jhin'),data.champions).slots;
 assert.equal(draft[0].champion,'Lux');assert.equal(draft[2].champion,'Jhin');validateSlots(draft,data.champions);
});
test('manual position reservations survive temporary unselection, restart and later selection',()=>{
 let draft=moveChampion(mergeClientSession(createSlots(),session(),data.champions).slots,'bottom','mid');
 const changed=session();changed.myTeam[0].championId=0;draft=mergeClientSession(draft,changed,data.champions).slots;
 assert.equal(draft[2].champion,null);assert.equal(draft[2].clientCellId,1);
 const restored=validateState({...defaultState(),draft:{slots:draft,style:'fun',scope:'bot'}}).draft;
 assert.equal(restored.scope,'bot');assert.equal(restored.slots[2].manualPosition,true);
 assert.equal(mergeClientSession(restored.slots,session('Jhin'),data.champions).slots[2].champion,'Jhin');
 assert.equal(clearClientPicks(restored.slots)[2].clientCellId,undefined);
});
test('unassigned public picks require a chosen empty position and retain client ownership',()=>{
 const s=session();s.myTeam.forEach(p=>p.assignedPosition='');const result=mergeClientSession(createSlots(),s,data.champions);
 assert.equal(result.unassigned.length,2);assert.equal(result.slots.filter(s=>s.champion).length,0);
 const assigned=assignClientChampion(result.slots,result.unassigned[0],'jungle');
 assert.equal(assigned[1].clientCellId,1);assert.equal(assigned[1].manualPosition,true);
 assert.equal(mergeClientSession(assigned,{...s,myTeam:[{...s.myTeam[0],championId:key('Jhin')},s.myTeam[1]]},data.champions).slots[1].champion,'Jhin');
 assert.throws(()=>assignClientChampion(assigned,result.unassigned[1],'jungle'),/空位置/);
});
test('three scopes have distinct context while only our positions or the bot pair are targets',()=>{
 const slots=createSlots();slots[0].champion='Garen';slots[0].locked=true;slots[1].champion='LeeSin';slots[1].locked=true;slots[2].champion='Zed';slots[2].locked=true;slots[3].champion='Jhin';slots[3].locked=true;
 assert.deepEqual(draftTargets(slots,'context'),['support']);assert.deepEqual(draftTargets(slots,'party'),['support']);
 assert.equal(scopeSlots(slots,'context').length,5);assert.equal(scopeSlots(slots,'party').length,3);
 slots[4].party=false;assert.deepEqual(draftTargets(slots,'context'),[]);assert.deepEqual(draftTargets(slots,'bot'),['support']);
 for(const scope of ['context','party','bot'])for(const r of recommend({slots,champions:data.champions,scope,limit:3})){
  assert.deepEqual(r.slots.slice(0,4),slots.slice(0,4));assert.equal(r.scope,scope);validateSlots(r.slots,data.champions);
  assert.ok(r.analysis.members.every(m=>scope==='context'||scope==='party'&&m.party||scope==='bot'&&['bottom','support'].includes(m.role)));
 }
});
test('party and bot scoring ignore outside positions but still prohibit duplicate champions',()=>{
 const slots=createSlots();slots[0].champion='Garen';slots[0].locked=true;slots[1].champion='LeeSin';slots[1].locked=true;slots[2].champion='Zed';slots[2].locked=true;slots[3].champion='Jhin';slots[3].locked=true;
 const other=structuredClone(slots);other[0].champion='Lissandra';other[1].champion='Diana';
 const pool=['Lulu','Nami','Alistar','Zyra','Nautilus'];
 for(const scope of ['party','bot']){
  const options={champions:data.champions,scope,pool,poolMode:'only',limit:5};
  const a=recommend({...options,slots}),b=recommend({...options,slots:other});
  assert.deepEqual(a.map(r=>[r.slots[4].champion,r.score]),b.map(r=>[r.slots[4].champion,r.score]));
 }
 const outside=structuredClone(slots);outside[0].champion='Lulu';
 for(const r of recommend({slots:outside,champions:data.champions,scope:'bot',pool,poolMode:'only',limit:5}))assert.notEqual(r.slots[4].champion,'Lulu');
});
test('bot scope only replaces bot slots, preserves fixed picks and obeys pool, bans and exclusions',()=>{
 const slots=createSlots().map(s=>({...s,party:false}));slots[0].champion='Garen';slots[0].locked=false;
 slots[3].champion='Jhin';slots[3].locked=true;
 const results=recommend({slots,champions:data.champions,scope:'bot',pool:['Jhin','Zyra','Nami','Lux','Ashe'],poolMode:'only',excluded:['Zyra'],enemy:['Lux'],limit:3});
 assert.equal(results.length,2);for(const r of results){assert.deepEqual(r.slots.slice(0,3),slots.slice(0,3));assert.equal(r.slots[3].champion,'Jhin');assert.ok(['Nami','Ashe'].includes(r.slots[4].champion));assert.deepEqual(r.targets,['support']);}
});
test('expanded library entries reference real distinct champions and explain mechanism, play and risk',()=>{
 const ids=new Set(data.champions.map(c=>c.id));assert.ok(DUOS.length>23);assert.ok(CROSS_SYNERGIES.length>12);
 assert.equal(new Set(DUOS.map(d=>d.id)).size,DUOS.length);assert.equal(new Set(DUOS.map(d=>`${d.carry}:${d.support}`)).size,DUOS.length);
 for(const d of DUOS){assert.notEqual(d.carry,d.support);for(const id of [d.carry,d.support,...d.partners])assert.ok(ids.has(id),id);for(const key of ['why','plan','risk'])assert.ok(d[key].length>10,`${d.id}:${key}`);assert.ok(['balanced','fun','wild'].includes(d.style));}
 assert.equal(new Set(CROSS_SYNERGIES.map(([a,b])=>[a,b].sort().join(':'))).size,CROSS_SYNERGIES.length);
 for(const [a,b,text] of CROSS_SYNERGIES){assert.ok(ids.has(a)&&ids.has(b));assert.notEqual(a,b);assert.ok(text.trim().length>0);}
});
test('every viable curated bot pair remains reachable instead of only minor top-ranked variants',()=>{
 const all=recommend({slots:createSlots(),champions:data.champions,scope:'bot',limit:240});
 const seen=new Set(all.map(r=>r.duo?.id));for(const d of DUOS)assert.ok(seen.has(d.id),d.id);
});
test('recommending a replacement never gives the suggestion the old client cell binding',()=>{
 const slots=mergeClientSession(createSlots(),session(),data.champions).slots;slots[3].locked=false;
 for(const r of recommend({slots,champions:data.champions,scope:'bot',limit:3})){assert.equal(r.slots[3].clientCellId,undefined);assert.equal(r.slots[3].manualPosition,undefined);assert.equal(r.slots[4].clientCellId,2);}
});
