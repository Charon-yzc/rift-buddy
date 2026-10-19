import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {confirmedPlayerPick,confirmedClientDraft,recommendationDraft} from '../src/core/draft-intents.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';
import {reconcilePartyRange} from '../src/core/party-range.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const hero=id=>data.champions.find(champion=>champion.id===id);
const session=()=>({localPlayerCellId:0,myTeam:[{cellId:0,championId:hero('Nami').key,championPickIntent:hero('Nami').key,assignedPosition:'UTILITY'}],theirTeam:[],actions:[[{actorCellId:0,type:'pick',completed:false,championId:hero('Nami').key}]]});

test('explicit completion confirms the current roster champion even after a trade, never an empty or unknown hero',()=>{
 const current=session(),player=current.myTeam[0];assert.equal(confirmedPlayerPick(player,current),false);
 current.actions[0][0].completed=true;assert.equal(confirmedPlayerPick(player,current),true);
 current.actions[0][0].championId=hero('Ashe').key;assert.equal(confirmedPlayerPick(player,current),true,'Completed actions keep the original pick after a champion trade');
 player.pickState='locked';assert.equal(confirmedPlayerPick(player,current),true);
 player.championId=0;assert.equal(confirmedPlayerPick(player,current),false);
});

test('unlocked imported and adopted heroes remain displayable but do not enter the search copy',()=>{
 const current=session(),slots=createSlots().map(slot=>({...slot,party:slot.role!=='jungle',partyManual:true,...(slot.role==='support'?{champion:'Nami',locked:true,clientCellId:0,manualPosition:true}:{champion:slot.role==='mid'?'Ahri':null})}));
 const before=structuredClone({slots,current}),copy=confirmedClientDraft(slots,current,data.champions);
 assert.ok(copy.slots.every(slot=>slot.champion===null&&!slot.locked));assert.equal(copy.session.myTeam[0].championId,0);assert.equal(copy.session.myTeam[0].championPickIntent,0);assert.deepEqual(copy.slots.map(slot=>[slot.role,slot.party,slot.partyManual,slot.clientCellId,slot.manualPosition]),slots.map(slot=>[slot.role,slot.party,slot.partyManual,slot.clientCellId,slot.manualPosition]));
 assert.deepEqual({slots,current},before);assert.equal(recommendationDraft(slots,current,data.champions,{ownRole:'support'}).find(slot=>slot.role==='support').champion,'Nami');
 const changed=structuredClone(current);changed.myTeam[0].championId=hero('Ashe').key;changed.myTeam[0].championPickIntent=hero('Ashe').key;changed.actions[0][0].championId=hero('Ashe').key;
 const next=confirmedClientDraft(slots,changed,data.champions);assert.equal(recommendationKey({slots:copy.slots,clientSession:copy.session,scope:'context'}),recommendationKey({slots:next.slots,clientSession:next.session,scope:'context'}));
 current.actions[0][0].completed=true;const locked=confirmedClientDraft(slots,current,data.champions);assert.equal(locked.slots.find(slot=>slot.role==='support').champion,'Nami');assert.equal(locked.slots.find(slot=>slot.role==='support').locked,true);
 const stale=slots.map(slot=>slot.role==='support'?{...slot,champion:'Lux'}:slot);assert.equal(confirmedClientDraft(stale,current,data.champions).slots.find(slot=>slot.role==='support').champion,'Nami');
 const fresh=confirmedClientDraft(createSlots(),current,data.champions);assert.equal(fresh.slots.find(slot=>slot.role==='support').champion,'Nami');
 const repeated=confirmedClientDraft(createSlots().map(slot=>slot.role==='mid'?{...slot,champion:'Nami',manualPosition:true}:slot),current,data.champions);assert.equal(repeated.slots.filter(slot=>slot.champion==='Nami').length,1);assert.equal(repeated.slots.find(slot=>slot.role==='mid').champion,'Nami');
});

test('party, context and solo searches ignore even a positive champion ID until lock confirmation',()=>{
 for(const scope of ['party','context','solo']){
  const slots=createSlots().map(slot=>({...slot,party:slot.role==='support',...(slot.role==='support'?{champion:'Nami',locked:true,clientCellId:0}:{})})),current=session();
  const input={slots,clientSession:current,champions:data.champions,scope,soloRole:'support',soloChampion:'Nami',confirmedPick:{role:'support',champion:'Nami'},publicPicks:['Nami'],publicAllies:['Nami'],rolePools:{support:{mode:'only',heroes:['Lux']}},limit:1};
  const unlocked=recommend(input);assert.ok(unlocked.length,scope);assert.equal(unlocked[0].slots.find(slot=>slot.role==='support').champion,'Lux',scope);
  current.actions[0][0].completed=true;const locked=recommend(input);assert.ok(locked.length,scope);assert.equal(locked[0].slots.find(slot=>slot.role==='support').champion,'Nami',scope);
 }
});

test('hero-only previews cannot relocate marks; explicit preselected lanes and counts still apply',()=>{
 const slots=createSlots().map(slot=>({...slot,party:['top','jungle'].includes(slot.role)})),current={localPlayerCellId:0,myTeam:[{cellId:0,championId:0,championPickIntent:hero('Ashe').key,assignedPosition:''},{cellId:1,championId:0,championPickIntent:hero('Nami').key,assignedPosition:''}],actions:[]},party={status:'known',members:[{cellId:0,local:true},{cellId:1}]};
 const first=reconcilePartyRange(slots,current,data.champions,{count:2,party});current.myTeam[0].championPickIntent=hero('Garen').key;current.myTeam[1].championPickIntent=hero('Vi').key;
 const second=reconcilePartyRange(slots,current,data.champions,{count:2,party});assert.deepEqual(second.map(slot=>slot.party),first.map(slot=>slot.party));
 const preferred=reconcilePartyRange(slots,current,data.champions,{count:2,party:{...party,members:[{cellId:0,local:true,firstPosition:'BOTTOM'},{cellId:1,firstPosition:'UTILITY'}]}});assert.equal(preferred.filter(slot=>slot.party).length,2);assert.ok(preferred.find(slot=>slot.role==='bottom').party);assert.ok(preferred.find(slot=>slot.role==='support').party);
});
