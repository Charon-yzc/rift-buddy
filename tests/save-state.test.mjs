import test from 'node:test';
import assert from 'node:assert/strict';
import {rollbackUnacceptedState} from '../src/core/save-state.mjs';

const hero=(id,extra={})=>({id,role:'mid',mode:'rift',runeId:'confirmed',...extra});
const state=()=>({preferences:{play:{difficulty:'any',tempo:'any'}},draft:{soloRole:'mid',slots:[]},preparations:[hero('Ahri'),hero('Annie')],favorites:[],excluded:[]});
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
