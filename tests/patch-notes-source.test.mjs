import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseOfficialPatchNotes,fetchPatchNotes,patchNotesURL} from '../services/patch-notes.mjs';
import {validPatchNotes,preferredPatchNotes} from '../src/core/patch-notes.mjs';
const game=JSON.parse(await fs.readFile('data/game.json'));
const pages=Object.fromEntries(await Promise.all(['16.21','16.22'].map(async patch=>[patch,await fs.readFile(`tests/fixtures/official-patch-notes/riot-26.${patch.split('.')[1]}.html`,'utf8')])));
const parse=patch=>parseOfficialPatchNotes(pages[patch],patch,game);

test('actual official 26.22 markup retains all Rift rows, standalone paragraphs, reworks and split cooldown lines',()=>{
 const result=parse('16.22');assert.equal(result.champions.length,14);assert.equal(result.items.length,2);assert.equal(result.systems.length,0);
 assert.deepEqual(result.items.map(row=>row.sourceName||row.item),["Doran's Bow","Overlord's Bloodmail"]);
 const hero=id=>result.champions.find(row=>row.champion===id),words=id=>hero(id).changes.map(change=>change.text).join('\n');
 assert.match(words('Corki'),/Big One Damage.*200 \/ 380 \/ 560/);
 assert.match(words('Locke'),/Maximum Stack Damage/);assert.match(words('Rumble'),/Maximum Damage/);
 assert.match(words('Mel'),/new|Nova|nova/);assert.ok(hero('Mel').changes.length>=20);
 assert.match(words('Zaahen'),/10 \/ 9 \/ 8 \/ 7 \/ 6s\n⇒ 8 \/ 7.5 \/ 7 \/ 6.5 \/ 6s/);
 assert.match(result.items[1].changes.map(change=>change.text).join('\n'),/Retribution/);
 assert.doesNotMatch(result.champions.map(row=>JSON.stringify(row)).join('\n'),/Headliners|New Augments|Classic/);
 assert.equal(result.publishedAt,'2026-11-03T19:00:00.000Z');
});
test('26.21 resolves champion names rather than duplicated HTML ids, retains behavior changes and appends dated hotfixes',()=>{
 const result=parse('16.21');assert.equal(result.champions.length,25);assert.equal(result.items.length,4);
 assert.ok(result.champions.some(row=>row.champion==='Locke'));assert.ok(result.champions.some(row=>row.champion==='LeeSin'));assert.ok(result.champions.some(row=>row.champion==='Nunu'));assert.ok(result.champions.some(row=>row.champion==='MonkeyKing'));
 const varus=result.champions.find(row=>row.champion==='Varus'),hotfix=varus.changes.filter(change=>change.note);
 assert.equal(hotfix.length,2);assert.match(hotfix[0].note,/October 22, 2026/);assert.match(hotfix[1].text,/50 - 230 ⇒ 50 - 250/);
 assert.ok(varus.changes.some(change=>!change.note&&/230/.test(change.text)));assert.match(varus.note,/reduced damage to subsequent targets/);
 for(const id of ['Taric','TwistedFate'])assert.ok(result.champions.find(row=>row.champion===id).changes.some(change=>!change.text.includes('⇒')));
});
test('a changed page identity, unknown hero or missing Rift boundary fails instead of relabeling or partially importing',()=>{
 for(const html of [pages['16.22'].replaceAll('26.22','26.23'),pages['16.22'].replaceAll('Aurelion Sol','Invented Hero'),pages['16.22'].replaceAll('ARAM: Mayhem','Unknown Mode')])assert.throws(()=>parseOfficialPatchNotes(html,'16.22',game));
 assert.throws(()=>parseOfficialPatchNotes('<html>network login page</html>','16.22',game));
});
test('each refresh rechecks two bounded canonical pages, retaining only exact-patch regional annotations',async()=>{
 const previous={schema:1,scope:'summoners-rift',patches:[parse('16.22'),parse('16.21')]};
 previous.patches[0].regionalNotes=[{text:'国服公告附注，并非应用实测',sourceURL:'https://lol.qq.com/gicp/news/410/37101296.html'}];
 const calls=[],fetcher=async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');const patch=url===patchNotesURL('16.22')?'16.22':'16.21';return new Response(pages[patch]);};
 const result=await fetchPatchNotes(game,{fetcher,previous});assert.deepEqual(calls,['16.22','16.21'].map(patchNotesURL));assert.ok(validPatchNotes(result,game));assert.deepEqual(result.patches[0].regionalNotes,previous.patches[0].regionalNotes);assert.equal(result.patches[1].regionalNotes,undefined);
 const chosen=preferredPatchNotes(game,result,previous);assert.equal(chosen.patches[0],result.patches[0]);
 await assert.rejects(fetchPatchNotes(game,{previous,fetcher:async()=>new Response('limited',{status:429})}));assert.deepEqual(previous.patches[0].regionalNotes,result.patches[0].regionalNotes);
});
