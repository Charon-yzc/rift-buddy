import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {recommendationDraft,editableLocalDraft} from '../src/core/draft-intents.mjs';
import {shareFromSlots,sanitizeShare,ROOM_PROTOCOL} from '../src/core/room.mjs';
import {captureCreativePlan,creativePlanCompatible} from '../src/core/creative-plan.mjs';
import {captureRoomStrategy,captureRoomConfigurations,roomPlayerRole} from '../src/core/room-configuration.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {rankedDraftPolicy} from '../src/core/ranked-draft.mjs';

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const start=source.indexOf('function roomSharePayload(){'),end=source.indexOf('async function publishRoomShare(',start);
assert.ok(start>=0&&end>start);
test('room publication follows the same live hover and configuration as the visible draft without replacing the accepted plan',()=>{
 for(const previous of ['Ahri',null]){
  const slots=createSlots().map(s=>({...s,party:['mid','bottom'].includes(s.role),...(s.role==='mid'?{champion:previous,locked:!!previous,automaticPosition:true}:{})}));
  const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:83,localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:99,assignedPosition:'MIDDLE'},{cellId:2,championId:0,championPickIntent:22,assignedPosition:'BOTTOM'}],theirTeam:[],bans:[]}};
  const before=structuredClone(slots),context=vm.createContext({rankedDraftPolicy,saved:{draft:null},currentParty:()=>null,slots,client,data,activeCreativePlan:null,roomStrategySnapshot:null,guideSelection:previous?{id:previous,role:'mid',mode:'rift'}:null,buildView:null,preparations:createPreparationStore(),shareFromSlots,captureRoomStrategy,captureRoomConfigurations,
   publicDraftContext:()=>recommendationDraft(slots,client.session,data.champions,{ownRole:'mid'}),roomOwnRole:()=>roomPlayerRole(slots,data.champions,client,'mid')});
  vm.runInContext(source.slice(start,end),context);
  const share=context.roomSharePayload();
  assert.equal(share.lineup.find(s=>s.role==='mid').champion,'Lux');assert.equal(share.pick.champion,'Lux');
  assert.equal(share.lineup.find(s=>s.role==='bottom').champion,'Ashe');
  assert.deepEqual(share.configurations.map(s=>s.champion).sort(),['Ashe','Lux']);
  assert.ok(!share.strategy?.members.some(m=>m.champion==='Ahri'));assert.deepEqual(slots,before);
  client.session.myTeam[0].championPickIntent=0;
  const cleared=context.roomSharePayload();assert.equal(cleared.pick,null);assert.equal(cleared.lineup.find(s=>s.role==='mid').champion,null);
  assert.ok(!cleared.configurations.some(c=>c.role==='mid'));assert.deepEqual(slots,before,'Sharing must not erase the saved local plan');
 }
});

test('an adopted proposal and its configuration remain shared while the public pick still shows the previous unlocked hero',()=>{
 for(const field of ['championPickIntent','championId'])for(const previous of [null,'Ashe']){
  const key=id=>data.champions.find(c=>c.id===id).key;
  const slots=createSlots().map(s=>({...s,party:['mid','bottom','support'].includes(s.role),champion:({mid:'Ahri',bottom:'Jinx',support:'Braum'})[s.role]||null,locked:true,automaticPosition:true}));
  const plan=captureCreativePlan(recommend({slots,champions:data.champions,scope:'party'})[0],data),before=structuredClone(slots);
  const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:83,localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:0,[field]:previous?key(previous):0,assignedPosition:'BOTTOM'}],actions:[[{type:'pick',actorCellId:1,completed:false}]],theirTeam:[],bans:[]}};
  const context=vm.createContext({rankedDraftPolicy,saved:{draft:null},currentParty:()=>null,slots,client,data,activeCreativePlan:plan,roomStrategySnapshot:null,guideSelection:null,buildView:null,preparations:createPreparationStore(),shareFromSlots,captureRoomStrategy,captureRoomConfigurations,editableLocalDraft,recommendationDraft,creativePlanCompatible,
   taskOwnRole:()=> 'bottom',roomOwnRole:()=>roomPlayerRole(slots,data.champions,client,'bottom'),publicDraftContext:()=>recommendationDraft(slots,client.session,data.champions,{ownRole:'bottom'})});
  vm.runInContext(source.slice(start,end),context);
  const share=context.roomSharePayload();
  assert.equal(share.lineup.find(s=>s.role==='bottom').champion,'Jinx');assert.equal(share.strategy.id,plan.id);
  assert.equal(share.pick?.champion||null,previous);assert.equal(share.configurations.find(c=>c.role==='bottom').champion,'Jinx');
  assert.ok(!share.configurations.some(c=>c.champion==='Ashe'));assert.deepEqual(slots,before);
  assert.ok(sanitizeShare({...share,kind:'state',v:ROOM_PROTOCOL,from:'合成队友',at:Date.now()}),'Separate proposal and public pick must remain valid on the wire');
  // A completed client pick must win over the proposal after synchronization.
  client.session.myTeam[0].championId=key('Ashe');client.session.myTeam[0].championPickIntent=0;client.session.actions[0][0].completed=true;
  slots.find(s=>s.role==='bottom').champion='Ashe';
  const locked=context.roomSharePayload();assert.equal(locked.lineup.find(s=>s.role==='bottom').champion,'Ashe');assert.equal(locked.pick.champion,'Ashe');assert.equal(locked.strategy,undefined);
 }
});
