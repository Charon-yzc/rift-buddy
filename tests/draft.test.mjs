import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,mergeClientSession,clearClientPicks,validateSlots} from '../src/core/recommend.mjs';
import {moveChampion,moveDisplayedChampion,assignClientChampion,draftTargets,scopeSlots} from '../src/core/draft.mjs';
import {clientRecommendationDraft} from '../src/core/draft-intents.mjs';
import {DUOS,CROSS_SYNERGIES} from '../src/core/rules.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {currentPlayerSelection} from '../src/core/guide.mjs';
import {comboMembers,comboKey} from '../src/core/combo-members.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const key=id=>data.champions.find(c=>c.id===id).key;
const session=(a='Ashe',b='Lux')=>({myTeam:[{cellId:1,championId:key(a),assignedPosition:'BOTTOM'},{cellId:2,championId:key(b),assignedPosition:'UTILITY'}],localPlayerCellId:1});

test('drag keeps live member ownership with champion bindings without changing group size',()=>{
 const initial=mergeClientSession(createSlots(),session(),data.champions).slots;initial[4].party=false;
 const moved=moveChampion(initial,'bottom','support');
 assert.equal(moved[3].champion,'Lux');assert.equal(moved[4].champion,'Ashe');assert.equal(moved[3].party,false);assert.equal(moved[4].party,true);
 assert.equal(moved[3].clientCellId,2);assert.equal(moved[4].clientCellId,1);assert.ok(moved[3].manualPosition&&moved[4].manualPosition);
 assert.equal(initial[3].champion,'Ashe');validateSlots(moved,data.champions);
 const toEmpty=moveChampion(moved,'support','top');assert.equal(toEmpty[0].champion,'Ashe');assert.equal(toEmpty[4].champion,null);assert.equal(toEmpty[0].party,true);
 assert.equal(toEmpty.filter(s=>s.party).length,initial.filter(s=>s.party).length);
 assert.throws(()=>moveChampion(toEmpty,'support','top'),/已选英雄/);
});
test('dragging a public preview moves its member reservation without persisting an unconfirmed champion',()=>{
 const initial=mergeClientSession(createSlots(),session(),data.champions).slots;
 initial[4].party=false;initial[4].partyManual=true;
 initial[3]={...initial[3],champion:null,locked:false};
 const visible=structuredClone(initial);visible[3]={...visible[3],champion:'Ashe',publicIntent:true};
 const before=structuredClone(initial),moved=moveDisplayedChampion(initial,visible,'bottom','support');
 assert.deepEqual(initial,before);assert.equal(moved[3].champion,'Lux');assert.equal(moved[3].clientCellId,2);
 assert.equal(moved[4].champion,null);assert.equal(moved[4].clientCellId,1);assert.equal(moved[4].manualPosition,true);
 assert.equal(moved[4].party,initial[3].party);assert.equal(moved[3].party,initial[4].party);
 assert.equal(moved[3].partyManual,true);assert.equal(moved[4].partyManual,undefined);
 const restored=validateState({...defaultState(),draft:{slots:moved}}).draft.slots;
 const hovering=session();hovering.myTeam[0].championId=0;hovering.myTeam[0].championPickIntent=key('Ashe');
 const view=clientRecommendationDraft(restored,hovering,data.champions,{includePreselected:true}).slots;
 assert.equal(view[4].champion,'Ashe');assert.equal(view[4].publicIntent,true);
 assert.equal(mergeClientSession(restored,session(),data.champions).slots[4].champion,'Ashe');
 assert.deepEqual(moveDisplayedChampion(initial,visible,'bottom','bottom'),initial);
 assert.throws(()=>moveDisplayedChampion(initial,visible.map(s=>s.role==='bottom'?{...s,clientCellId:undefined}:s),'bottom','support'),/选人已变化/);
});

test('offline hero swaps preserve lane range and every explicit live range retains its count',()=>{
 const planned=createSlots().map(s=>({...s,party:s.role==='bottom',...(s.role==='support'?{partyManual:true}:{}),champion:s.role==='bottom'?'Ashe':s.role==='support'?'Lux':null}));
 const offline=moveChampion(planned,'bottom','support');assert.equal(offline[3].champion,'Lux');assert.equal(offline[4].champion,'Ashe');
 assert.deepEqual(offline.map(s=>[s.party,s.partyManual]),planned.map(s=>[s.party,s.partyManual]));
 const live=mergeClientSession(createSlots(),session(),data.champions).slots;
 for(let mask=0;mask<32;mask++){
  const before=live.map((s,i)=>({...s,party:!!(mask&(1<<i)),partyManual:true})),moved=moveChampion(before,'bottom','support');
  assert.equal(moved.filter(s=>s.party).length,before.filter(s=>s.party).length);
  for(const cellId of [1,2])assert.equal(moved.find(s=>s.clientCellId===cellId).party,before.find(s=>s.clientCellId===cellId).party);
  assert.deepEqual(moveChampion(moved,'support','bottom'),before.map(s=>Number.isInteger(s.clientCellId)?{...s,manualPosition:true}:s));
 }
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
test('manual arrangement opt-out keeps an explicit empty-position fallback and client ownership',()=>{
 const s=session();s.myTeam.forEach(p=>p.assignedPosition='');const result=mergeClientSession(createSlots(),s,data.champions,{autoArrange:false});
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
 assert.equal(new Set(DUOS.map(d=>d.id)).size,DUOS.length);assert.equal(new Set(DUOS.map(comboKey)).size,DUOS.length);
 for(const d of DUOS){const members=comboMembers(d);assert.equal(new Set(members.map(m=>m.champion)).size,2);for(const id of [...members.map(m=>m.champion),...(d.partners||[])])assert.ok(ids.has(id),id);for(const key of ['why','plan','risk'])assert.ok(d[key].length>10,`${d.id}:${key}`);assert.ok(['balanced','fun','wild'].includes(d.style));}
 assert.equal(new Set(CROSS_SYNERGIES.map(([a,b])=>[a,b].sort().join(':'))).size,CROSS_SYNERGIES.length);
 for(const [a,b,text] of CROSS_SYNERGIES){assert.ok(ids.has(a)&&ids.has(b));assert.notEqual(a,b);assert.ok(text.trim().length>0);}
});
test('automatic recommendations do not reserve catalogue slots and every shown catalogue binding matches actual members',()=>{
 const all=recommend({slots:createSlots(),champions:data.champions,patch:data.patch,scope:'bot',limit:240});
 assert(all.length>0);assert.equal(new Set(all.map(r=>r.id)).size,all.length);
 for(const row of all)if(row.duo){assert.equal(row.duo.patch,data.patch);for(const m of comboMembers(row.duo)){assert(['bottom','support'].includes(m.role));assert.equal(row.slots.find(s=>s.role===m.role).champion,m.champion);}}
 // Explicit picks remain executable without requiring the library to buy an automatic slot.
 for(const pair of DUOS.filter(d=>comboMembers(d).every(m=>['bottom','support'].includes(m.role))).slice(0,10)){
  const members=comboMembers(pair),rolePools=Object.fromEntries(members.map(m=>[m.role,{mode:'only',heroes:[m.champion]}]));
  const [row]=recommend({slots:createSlots(),champions:data.champions,patch:data.patch,scope:'bot',rolePools,limit:1});assert(row,pair.id);
  for(const m of members)assert.equal(row.slots.find(s=>s.role===m.role).champion,m.champion);
 }
});

test('recommending a replacement never gives the suggestion the old client cell binding',()=>{
 const slots=mergeClientSession(createSlots(),session(),data.champions).slots;slots[3].locked=false;
 for(const r of recommend({slots,champions:data.champions,scope:'bot',limit:3})){assert.equal(r.slots[3].clientCellId,undefined);assert.equal(r.slots[3].manualPosition,undefined);assert.equal(r.slots[4].clientCellId,2);}
});
