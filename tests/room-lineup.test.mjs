import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {adoptRoomLineup,roomLineupIdentity} from '../src/core/room-lineup.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {captureRoomConfigurations} from '../src/core/room-configuration.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const hero=id=>data.champions.find(c=>c.id===id),members=[['jungle','Diana'],['mid','Yasuo'],['support','Rakan']];
const lineup=rows=>createSlots().map(s=>({...s,champion:rows.find(([role])=>role===s.role)?.[1]||null,party:rows.some(([role])=>role===s.role),locked:rows.some(([role])=>role===s.role)}));
function share(rows=members){const slots=lineup(rows),[result]=recommend({slots,champions:data.champions,scope:'party'}),strategy=captureCreativePlan(result,data);assert.ok(strategy);return {kind:'state',v:1,from:'队友',at:1000,mode:'rift',lineup:slots.map(({role,champion})=>({role,champion})),strategy,configurations:captureRoomConfigurations(slots,data,createPreparationStore(),{creativePlan:strategy})};}
const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:77,localPlayerCellId:0,allowDuplicatePicks:false,myTeam:[{cellId:0,championId:0,assignedPosition:'JUNGLE'}],theirTeam:[],bans:[],actions:[]}};

test('explicit room adoption preserves concrete equipment, rune, skill and D/F choices through save and reshare',()=>{
 const incoming=share();incoming.configurations[0].items.reverse();
 const current=createSlots(),before=structuredClone({incoming,current,client}),adopted=adoptRoomLineup(incoming,data,current,client);
 assert.deepEqual({incoming,current,client},before);assert.equal(adopted.loadedMembers,3);assert.equal(adopted.creativePlan.id,incoming.strategy.id);assert.equal(adopted.configurations.length,3);assert.deepEqual(adopted.conflicts,[]);
 const state=validateState({...defaultState(),preparations:adopted.configurations,draft:{slots:adopted.slots,scope:'party',creativePlan:adopted.creativePlan}}),store=createPreparationStore(state.preparations);
 for(const config of incoming.configurations){const selection=adopted.configurations.find(s=>s.id===config.champion),build=getBuild(hero(selection.id),selection.role,data,selection);assert.deepEqual(build.items.map(i=>Number(i.id)),config.items);assert.deepEqual({primaryStyleId:build.runePage.primaryStyleId,subStyleId:build.runePage.subStyleId,selectedPerkIds:build.runePage.selectedPerkIds},config.runes);assert.equal(build.skillOrder,config.skills);assert.deepEqual(build.summoners,config.spells);}
 store.restore(state.preparations);const outgoing=captureRoomConfigurations(adopted.slots,data,store,{creativePlan:adopted.creativePlan});
 for(const config of incoming.configurations)assert.deepEqual(outgoing.find(c=>c.champion===config.champion).items,config.items);
});

test('public selected heroes and manual lanes survive a conflicting room plan; failed duties are not claimed active',()=>{
 const incoming=share(),current=lineup([['top','Garen'],['jungle','Graves']]);current[1]={...current[1],clientCellId:0,manualPosition:true,partyManual:true};
 const live={...client,session:{...client.session,myTeam:[{cellId:0,championId:hero('Graves').key,assignedPosition:'MIDDLE'},{cellId:1,championId:hero('Ahri').key,assignedPosition:'MIDDLE'}]}};
 const adopted=adoptRoomLineup(incoming,data,current,live);assert.equal(adopted.slots.find(s=>s.clientCellId===0).champion,'Graves');assert.equal(adopted.slots.find(s=>s.clientCellId===0).role,'jungle');assert.equal(adopted.slots.find(s=>s.clientCellId===1).champion,'Ahri');assert.equal(adopted.slots[0].champion,'Garen');assert.equal(adopted.creativePlan,null);assert.ok(adopted.conflicts.some(c=>c.kind==='plan'));assert.equal(adopted.configurations.some(c=>['Diana','Yasuo'].includes(c.id)),false);
});

test('an accepted prospective lineup can be replaced, while a manual lock and public unavailable choices stay protected',()=>{
 const current=lineup([['jungle','Nocturne'],['mid','Ahri'],['support','Lulu']]).map(s=>({...s,automaticPosition:!!s.champion}));
 const adopted=adoptRoomLineup(share(),data,current,client);assert.equal(adopted.loadedMembers,3);assert.deepEqual(adopted.slots.filter(s=>s.champion).map(s=>s.champion),['Diana','Yasuo','Rakan']);
 const locked=structuredClone(current);delete locked[1].automaticPosition;assert.equal(adoptRoomLineup(share(),data,locked,client).slots[1].champion,'Nocturne');
 const banned={...client,session:{...client.session,bans:[hero('Diana').key],theirTeam:[{championId:hero('Yasuo').key}]}};const blocked=adoptRoomLineup(share(),data,createSlots(),banned);assert.equal(blocked.slots[1].champion,null);assert.equal(blocked.slots[2].champion,null);assert.equal(blocked.creativePlan,null);
});

test('room adoption rejects conflicting public hovers before saving a plan and allows cleared or matching hovers',()=>{
 const current=createSlots(),incoming=share(),live=structuredClone(client);
 live.session.myTeam.push({cellId:1,championId:0,championPickIntent:hero('Lux').key,assignedPosition:'MIDDLE'});
 const before=structuredClone({current,incoming,live});
 assert.throws(()=>adoptRoomLineup(incoming,data,current,live),/已预选拉克丝/);assert.deepEqual({current,incoming,live},before);
 live.session.myTeam[1].championPickIntent=hero('Yasuo').key;
 assert.equal(adoptRoomLineup(incoming,data,current,live).creativePlan.id,incoming.strategy.id);
 live.session.myTeam[1].championPickIntent=0;
 assert.equal(adoptRoomLineup(incoming,data,current,live).creativePlan.id,incoming.strategy.id);
 live.session.myTeam[0].championPickIntent=hero('Lux').key;
 assert.throws(()=>adoptRoomLineup(incoming,data,current,live,{}, {ownRole:'mid'}),/已预选拉克丝/);
});

test('lineup-only relay adoption requires an explicit current Rift interpretation and does not forge missing configurations',()=>{
 const incoming=share();delete incoming.mode;delete incoming.configurations;delete incoming.strategy;
 for(const invalid of [null,{...client,connected:false},{...client,mode:{id:'hex'}},{...client,phase:'Lobby'}])assert.throws(()=>adoptRoomLineup(incoming,data,createSlots(),invalid),/模式/);
 const current=createSlots();current[0].partyManual=true;current[0].party=true;
 const adopted=adoptRoomLineup(incoming,data,current,client);assert.equal(adopted.modeAssumed,true);assert.equal(adopted.configurations.length,0);assert.equal(adopted.loadedMembers,3);assert.equal(adopted.slots[0].partyManual,true);assert.equal(adopted.slots[0].party,true);
 assert.throws(()=>adoptRoomLineup({...incoming,mode:'hex'},data,current,client),/模式/);
 assert.throws(()=>adoptRoomLineup({...incoming,mode:'rift'},data,current,{...client,mode:{id:'hex'}}),/模式/);
 const stale=share();stale.configurations[0].patch='16.19';const partial=adoptRoomLineup(stale,data,createSlots(),client);assert.equal(partial.configurationErrors.length,1);assert.equal(partial.configurations.length,2);
});

test('two, four and five member plans keep their original roles and frozen duties when explicitly adopted',()=>{
 for(const rows of [[['jungle','Graves'],['mid','Vex']],[['top','Garen'],['jungle','Graves'],['mid','Vex'],['support','Taric']],[['top','Garen'],['jungle','Graves'],['mid','Vex'],['bottom','Ashe'],['support','Taric']]]){
  const incoming=share(rows),adopted=adoptRoomLineup(incoming,data,createSlots(),client);assert.equal(adopted.loadedMembers,rows.length);assert.equal(adopted.configurations.length,rows.length);assert.deepEqual(adopted.creativePlan.ordered,incoming.strategy.ordered);
 }
});

test('repeated room stamps do not create a new proposal; changed content or sender does',()=>{
 const incoming=share();assert.equal(roomLineupIdentity(incoming),roomLineupIdentity({...incoming,at:2000}));assert.notEqual(roomLineupIdentity(incoming),roomLineupIdentity({...incoming,from:'另一个队友'}));const changed=structuredClone(incoming);changed.configurations[0].items.reverse();assert.notEqual(roomLineupIdentity(incoming),roomLineupIdentity(changed));
 const {kind,v,from,...body}=incoming;assert.equal(roomLineupIdentity(body,from),roomLineupIdentity(incoming));assert.notEqual(roomLineupIdentity(body,from),roomLineupIdentity(body,'另一个队友'));
});

test('older room messages may omit empty lanes without preventing explicit lineup adoption',()=>{
 const incoming=share();incoming.lineup=incoming.lineup.filter(s=>s.champion);
 const adopted=adoptRoomLineup(incoming,data,createSlots(),client);assert.equal(adopted.slots.length,5);assert.equal(adopted.loadedMembers,3);assert.equal(adopted.configurations.length,3);
});

test('explicit party exclusions and public party matching cannot silently become sender strategy membership',()=>{
 const incoming=share(),current=createSlots();current.find(s=>s.role==='support').partyManual=true;current.find(s=>s.role==='support').party=false;
 const manual=adoptRoomLineup(incoming,data,current,client);assert.equal(manual.creativePlan,null);assert.ok(manual.conflicts.some(c=>c.kind==='plan'));assert.equal(manual.slots.find(s=>s.role==='support').party,false);assert.equal(manual.configurations.length,3);assert.ok(manual.configurations.every(c=>!c.creativePlan));
 const matched=adoptRoomLineup(incoming,data,createSlots(),client,{}, {autoParty:true,party:{status:'known',members:[{cellId:0,local:true,firstPosition:'JUNGLE'}]}});assert.equal(matched.creativePlan,null);assert.ok(matched.conflicts.some(c=>c.kind==='plan'));assert.equal(matched.slots.filter(s=>s.party).length,1);
});
