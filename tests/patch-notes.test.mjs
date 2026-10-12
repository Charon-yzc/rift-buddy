import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validPatchNotes,championPatchNotes,patchDirectionLabel} from '../src/core/patch-notes.mjs';
import {patchNotesView} from '../src/patch-notes-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
data.patchNotes=JSON.parse(await fs.readFile(new URL('../data/patch-notes.json',import.meta.url)));
test('recent three Rift patch records retain explicit source, before/after values and known champion identities',()=>{
 assert.ok(validPatchNotes(data.patchNotes,data));
 assert.deepEqual(data.patchNotes.patches.map(p=>[p.patch,p.champions.length]),[['16.20',16],['16.19',17],['16.18',11]]);
 for(const patch of data.patchNotes.patches)assert.match(patch.sourceURL,/leagueoflegends\.com/);
 const altered=structuredClone(data.patchNotes);altered.patches[0].mode='aram';assert.equal(validPatchNotes(altered,data),false);
 const unknown=structuredClone(data.patchNotes);unknown.patches[0].champions[0].champion='Invented';assert.equal(validPatchNotes(unknown,data),false);
});
test('mixed changes remain adjustments and an incomplete old formula is explicitly retained as unknown',()=>{
 assert.equal(championPatchNotes(data,'Vayne')[0].direction,'adjustment');
 assert.equal(championPatchNotes(data,'Swain')[0].direction,'adjustment');
 const viego=championPatchNotes(data,'Viego').find(p=>p.patch==='16.18');
 assert.ok(viego.changes.some(c=>/未展开/.test(c.before)));
 assert.equal(patchDirectionLabel('adjustment'),'调整');
});
test('patch view searches hero aliases and warns when patch coverage trails the game snapshot',()=>{
 const filtered=patchNotesView(data,{patch:'16.20',query:'Vayne'});assert.match(filtered,/薇恩/);assert.match(filtered,/成长/);assert.doesNotMatch(filtered,/卡西奥佩娅/);
 const old=patchNotesView({...data,patch:'16.21'});assert.match(old,/尚未收录后续版本/);
 assert.match(patchNotesView(data,{patch:'16.20',query:'Rocketbelt'}),/海克斯科技火箭腰带/);
});
