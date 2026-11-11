import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validPatchNotes,championPatchNotes,itemPatchNotes,patchDirectionLabel} from '../src/core/patch-notes.mjs';
import {gameTooltipView} from '../src/game-tooltip-view.mjs';
import {patchNotesView} from '../src/patch-notes-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
data.patchNotes=JSON.parse(await fs.readFile(new URL('../data/patch-notes.json',import.meta.url)));
test('recent Rift patch records retain explicit source, official prose and known champion identities',()=>{
 assert.ok(validPatchNotes(data.patchNotes,data));
 assert.deepEqual(data.patchNotes.patches.map(p=>[p.patch,p.champions.length]),[['16.22',14],['16.21',25],['16.20',16],['16.19',17],['16.18',11]]);
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
 const old=patchNotesView({...data,patch:'16.23'});assert.match(old,/尚未收录后续版本/);
 assert.match(patchNotesView({...data,patchNotes:{...data.patchNotes,unavailable:true}}),/本轮官方改动检查未完成/);
 assert.match(patchNotesView(data,{patch:'16.20',query:'Rocketbelt'}),/海克斯科技火箭腰带/);
});
test('official prose and national-server annotations keep separate attribution without invented before values',()=>{
 const html=patchNotesView(data,{patch:'16.22',query:'Mel'});assert.match(html,/官方英文原文/);assert.match(html,/国服官方补充/);assert.match(html,/并非本应用实测/);assert.match(html,/50\/80\/110\/140\/170/);assert.match(html,/Reworked/);assert.doesNotMatch(html,/undefined/);
 for(const change of data.patchNotes.patches[0].champions.flatMap(row=>row.changes)){assert.equal(typeof change.text,'string');assert.equal(Object.hasOwn(change,'before'),false);}
 for(const sourceURL of ['https://example.org/37101296.html','https://lol.qq.com/gicp/news/410/37101296.html?token=x','http://lol.qq.com/gicp/news/410/37101296.html']){const bad=structuredClone(data.patchNotes);bad.patches[0].regionalNotes[0].sourceURL=sourceURL;assert.equal(validPatchNotes(bad,data),false);}
});
test('official item names bind the current catalog identity and tooltips retain textual mechanics',()=>{
 for(const id of ['1086','2501','2520','6621','3008','6697']){
  const rows=itemPatchNotes(data,id);assert.ok(rows.length,id);assert.ok(rows.some(row=>row.changes.some(change=>typeof change.text==='string')));
  const html=gameTooltipView(data,'item',id);assert.match(html,/近期峡谷改动/);assert.doesNotMatch(html,/undefined/);assert.ok(html.length>100);
 }
});
