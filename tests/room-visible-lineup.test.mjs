import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createSlots} from '../src/core/recommend.mjs';
import {recommendationDraft} from '../src/core/draft-intents.mjs';
import {shareFromSlots} from '../src/core/room.mjs';
import {captureRoomStrategy,captureRoomConfigurations,roomPlayerRole} from '../src/core/room-configuration.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const start=source.indexOf('function roomSharePayload(){'),end=source.indexOf('async function publishRoomShare(',start);
assert.ok(start>=0&&end>start);
test('room publication follows the same live hover and configuration as the visible draft without replacing the accepted plan',()=>{
 for(const previous of ['Ahri',null]){
  const slots=createSlots().map(s=>({...s,party:['mid','bottom'].includes(s.role),...(s.role==='mid'?{champion:previous,locked:!!previous,automaticPosition:true}:{})}));
  const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:83,localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:99,assignedPosition:'MIDDLE'},{cellId:2,championId:0,championPickIntent:22,assignedPosition:'BOTTOM'}],theirTeam:[],bans:[]}};
  const before=structuredClone(slots),context=vm.createContext({slots,client,data,activeCreativePlan:null,roomStrategySnapshot:null,guideSelection:previous?{id:previous,role:'mid',mode:'rift'}:null,buildView:null,preparations:createPreparationStore(),shareFromSlots,captureRoomStrategy,captureRoomConfigurations,
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
