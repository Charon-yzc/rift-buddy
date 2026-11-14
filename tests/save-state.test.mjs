import test from 'node:test';
import assert from 'node:assert/strict';
import {rollbackUnacceptedState} from '../src/core/save-state.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {moveChampion} from '../src/core/draft.mjs';
import {rebaseWindowState} from '../src/core/window-state.mjs';

const hero=(id,extra={})=>({id,role:'mid',mode:'rift',runeId:'confirmed',...extra});
const state=()=>({preferences:{play:{difficulty:'any',tempo:'any'}},draft:{soloRole:'mid',slots:[]},preparations:[hero('Ahri'),hero('Annie')],favorites:[],excluded:[]});

test('a failed swap cannot duplicate players when a later swap shares its endpoint',()=>{
 const before=state();before.draft.slots=createSlots().map((slot,i)=>({...slot,champion:['Garen','LeeSin','Ahri','Ashe','Lulu'][i],locked:true,clientCellId:i,party:i===0,partyManual:true}));
 before.draft.playerPosition={role:'top',cellId:0};before.draft.soloRole='top';before.draft.partyCount=1;
 const failed=structuredClone(before);failed.draft.slots=moveChampion(failed.draft.slots,'top','mid');failed.draft.playerPosition.role='mid';failed.draft.soloRole='mid';
 const later=structuredClone(failed);later.draft.slots=moveChampion(later.draft.slots,'mid','jungle');later.draft.playerPosition.role='jungle';later.draft.soloRole='jungle';
 later.preferences.play.tempo='fast';
 const restored=rollbackUnacceptedState(before,failed,later),queued=rollbackUnacceptedState(before,failed,later);
 for(const value of [restored,queued,rebaseWindowState(before,queued,before)]){
  assert.deepEqual(value.draft,later.draft);assert.equal(new Set(value.draft.slots.map(slot=>slot.clientCellId)).size,5);assert.equal(value.draft.slots.filter(slot=>slot.party).length,1);
 }
 assert.equal(restored.preferences.play.tempo,'fast');
 assert.deepEqual(rollbackUnacceptedState(before,queued,restored).draft,before.draft,'If the later queued save also fails, the whole placement returns coherently');
});

test('a rejected swap still rolls back when later edits are unrelated to its players',()=>{
 const before=state();before.draft.slots=createSlots().map((slot,i)=>({...slot,champion:['Garen','LeeSin','Ahri','Ashe','Lulu'][i],locked:true,clientCellId:i}));
 const failed=structuredClone(before);failed.draft.slots=moveChampion(failed.draft.slots,'top','mid');
 const later=structuredClone(failed);later.draft.slots=moveChampion(later.draft.slots,'bottom','support');
 const restored=rollbackUnacceptedState(before,failed,later);
 for(const role of ['top','mid'])assert.deepEqual(restored.draft.slots.find(slot=>slot.role===role),before.draft.slots.find(slot=>slot.role===role));
 for(const role of ['bottom','support'])assert.deepEqual(restored.draft.slots.find(slot=>slot.role===role),later.draft.slots.find(slot=>slot.role===role));
});
test('rejected rune and draft choices return to the confirmed state without mutating inputs',()=>{
 const before=state(),failed=structuredClone(before);failed.preparations[0].runeId='failed';failed.draft.soloRole='top';
 assert.deepEqual(rollbackUnacceptedState(before,failed,failed),before);assert.equal(failed.preparations[0].runeId,'failed');
});
test('rejected rune does not erase later equipment edits to the same hero or another hero',()=>{
 const before=state(),failed=structuredClone(before);failed.preparations[0].runeId='failed';
 const later=structuredClone(failed);later.preparations.reverse();later.preparations.find(p=>p.id==='Ahri').laterIds=['3102'];later.preparations.find(p=>p.id==='Annie').runeId='new';later.preparations.push(hero('Lux'));
 const restored=rollbackUnacceptedState(before,failed,later);assert.equal(restored.preparations.find(p=>p.id==='Ahri').runeId,'confirmed');assert.deepEqual(restored.preparations.find(p=>p.id==='Ahri').laterIds,['3102']);assert.equal(restored.preparations.find(p=>p.id==='Annie').runeId,'new');assert.ok(restored.preparations.some(p=>p.id==='Lux'));
});
test('a later deliberate change to the rejected field survives',()=>{
 const before=state(),failed=structuredClone(before);failed.preparations[0].runeId='failed';const later=structuredClone(failed);later.preparations[0].runeId='retry-new';assert.deepEqual(rollbackUnacceptedState(before,failed,later),later);
});
test('unrelated queued preferences do not resubmit the failed choice',()=>{
 const before=state(),failed=structuredClone(before);failed.preferences.play.difficulty='easy';const queued=structuredClone(failed);queued.preferences.play.tempo='growth';queued.excluded=['Zed'];
 const restored=rollbackUnacceptedState(before,failed,queued);assert.equal(restored.preferences.play.difficulty,'any');assert.equal(restored.preferences.play.tempo,'growth');assert.deepEqual(restored.excluded,['Zed']);
});
test('failed additions and deletions restore independently of preparation recency',()=>{
 const before=state(),failed=structuredClone(before);failed.preparations=[hero('Ahri'),hero('Lux')];const later=structuredClone(failed);later.preparations.reverse();
 assert.deepEqual(new Set(rollbackUnacceptedState(before,failed,later).preparations.map(p=>p.id)),new Set(['Ahri','Annie']));
});
test('later edits to a new hero keep its identity without inheriting its rejected rune',()=>{
 const before=state(),failed=structuredClone(before);failed.preparations.push(hero('Lux',{runeId:'failed'}));const later=structuredClone(failed);later.preparations.at(-1).laterIds=['3102'];
 const restored=rollbackUnacceptedState(before,failed,later).preparations.find(p=>p.id==='Lux');assert.equal(restored.runeId,undefined);assert.equal(restored.role,'mid');assert.deepEqual(restored.laterIds,['3102']);
});

test('slot rollback follows role identity and preserves later edits to another lane or field',()=>{
 const before=state();before.draft.slots=createSlots();const failed=structuredClone(before);failed.draft.slots.find(slot=>slot.role==='bottom').champion='Ahri';
 const later=structuredClone(failed);later.draft.slots.reverse();later.draft.slots.find(slot=>slot.role==='top').champion='Garen';later.draft.slots.find(slot=>slot.role==='bottom').party=false;
 const restored=rollbackUnacceptedState(before,failed,later);assert.equal(restored.draft.slots.find(slot=>slot.role==='bottom').champion,null);assert.equal(restored.draft.slots.find(slot=>slot.role==='bottom').party,false);assert.equal(restored.draft.slots.find(slot=>slot.role==='top').champion,'Garen');assert.equal(later.draft.slots.find(slot=>slot.role==='bottom').champion,'Ahri');
 const deliberate=structuredClone(later);deliberate.draft.slots.find(slot=>slot.role==='bottom').champion='Jinx';assert.equal(rollbackUnacceptedState(before,failed,deliberate).draft.slots.find(slot=>slot.role==='bottom').champion,'Jinx');
});

test('a later swapped hero keeps its lock and client binding through rollback and rebase',()=>{
 const before=state();before.draft.slots=createSlots();Object.assign(before.draft.slots.find(slot=>slot.role==='top'),{champion:'Garen',locked:true,clientCellId:0});
 const failed=structuredClone(before);Object.assign(failed.draft.slots.find(slot=>slot.role==='bottom'),{champion:'Ahri',locked:true,clientCellId:4});
 const later=structuredClone(failed);later.draft.slots=moveChampion(later.draft.slots,'bottom','top');
 const restored=rollbackUnacceptedState(before,failed,later),rebased=rebaseWindowState(before,restored,before);
 for(const value of [restored,rebased])for(const role of ['top','bottom'])assert.deepEqual(value.draft.slots.find(slot=>slot.role===role),later.draft.slots.find(slot=>slot.role===role));
 assert.equal(failed.draft.slots.find(slot=>slot.role==='bottom').champion,'Ahri');
});

test('a later selection is coherent while an inherited rejected party change is undone',()=>{
 const before=state();before.draft.slots=createSlots();const failed=structuredClone(before),slot=failed.draft.slots.find(slot=>slot.role==='bottom');
 Object.assign(slot,{champion:'Ahri',locked:true,clientCellId:4,automaticPosition:true,party:!slot.party});
 const later=structuredClone(failed),choice=later.draft.slots.find(slot=>slot.role==='bottom');Object.assign(choice,{champion:'Jinx',manualPosition:true});delete choice.automaticPosition;
 const restored=rollbackUnacceptedState(before,failed,later).draft.slots.find(slot=>slot.role==='bottom');
 assert.deepEqual(restored,{...choice,party:before.draft.slots.find(slot=>slot.role==='bottom').party});
});
