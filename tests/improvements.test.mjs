import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSlots,recommend,currentCombo,replaceMember} from '../src/core/recommend.mjs';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {conventionalRole} from '../src/core/rules.mjs';
import {BUNDLED_CATALOG,validateCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {createCatalogStore} from '../services/catalog-store.mjs';
import {sanitizeSession} from '../services/lcu.mjs';
import {clientDraftStatus,moveChampion} from '../src/core/draft.mjs';
import {itemConflicts} from '../src/core/mechanics.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(h=>h.id===id),clone=()=>structuredClone(BUNDLED_CATALOG);
test('a simultaneous trio and bot pair route each member to their own playable loadout',()=>{
 const slots=createSlots();for(const [role,id] of [['top','Malphite'],['jungle','JarvanIV'],['mid','Orianna'],['bottom','Varus'],['support','Ashe']])Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});
 assert.equal(currentCombo(slots, 'Orianna','mid').id,'ball-delivery');
 const duo=currentCombo(slots,'Varus','bottom');assert.notEqual(duo.id,'ball-delivery');assert.equal(currentCombo(slots,'Varus','bottom',{'jarvan-varus-ashe':{invalid:true}}).id,'arrows-ice');
 const b=getBuild(hero('Varus'),'bottom',data,{comboId:duo.id});assert.equal(b.loadoutId,'spell-lethality');assert.ok(b.selectionWarnings.every(w=>w.includes('组合整理于')));
 assert.equal(recommend({slots,champions:data.champions})[0].strategy.label,'团战连招');
});
test('bot preferences affect results, and replacing a bot position works when it is marked teammate',()=>{
 const slots=createSlots().map(s=>({...s,party:false}));const input={slots,scope:'bot',champions:data.champions};
 const protect=recommend({...input,play:{tempo:'protect'}}),poke=recommend({...input,play:{tempo:'poke'}});
 assert.notDeepEqual(protect.map(r=>r.id),poke.map(r=>r.id));
 const replacement=replaceMember(protect[0],'bottom',input);assert.ok(replacement.length);
 for(const r of replacement){assert.notEqual(r.slots[3].champion,protect[0].slots[3].champion);assert.equal(r.slots[4].champion,protect[0].slots[4].champion);}
});
test('unconventional preference controls all candidates but preserves an explicitly locked unusual hero',()=>{
 const slots=createSlots();let rows=recommend({slots,champions:data.champions,scope:'bot',play:{unusual:false},limit:40});
 assert.ok(rows.every(r=>r.contributions.every(m=>conventionalRole(hero(m.hero),m.role))));
 Object.assign(slots[3],{champion:'Chogath',locked:true});rows=recommend({slots,champions:data.champions,scope:'bot',play:{unusual:false}});assert.ok(rows.every(r=>r.slots[3].champion==='Chogath'));
});
test('conditions change equipment, remove family conflicts, keep rune choice, and restore the original route',()=>{
 const original=structuredClone(data.builds['Ahri:mid']);
 const base=getBuild(hero('Ahri'),'mid',data),runeId=base.runeOptions.at(-1).id;
 const adjusted=getBuild(hero('Ahri'),'mid',data,{conditions:['ap','heal','burst'],runeId});
 for(const id of [3102,3165,3157])assert.ok(adjusted.items.some(i=>i.id===id));
 assert.equal(adjusted.selectedRuneId,runeId);assert.equal(adjusted.source,'局势调整路线');assert.match(adjusted.sourceNote,/样本不代表当前调整路线/);
 assert.deepEqual(getBuild(hero('Ahri'),'mid',data).items,base.items);assert.deepEqual(data.builds['Ahri:mid'],original);
 const fighter=getBuild(hero('Vi'),'jungle',data,{loadoutId:'trio-ad-diver',conditions:['ap','heal','burst']});
 assert.ok(fighter.items.some(i=>i.id===3156));assert.ok(!fighter.items.some(i=>i.id===3053));
 const seen=[];for(const i of fighter.items){assert.equal(itemConflicts(i.id,seen),false);seen.push(i.id);}assert.ok(seen.length<=6);assert.ok(!seen.includes(3033)||!seen.includes(3071));
 const senna=getBuild(hero('Senna'),'support',{...data,builds:{}},{conditions:['heal']});assert.ok(senna.items.some(i=>i.id===3033));assert.ok(!senna.items.some(i=>i.id===3071));
 const snake=getBuild(hero('Cassiopeia'),'mid',data,{conditions:['ad','control','ap']});assert.ok(snake.items.some(i=>i.tags.includes('Boots')));assert.equal(snake.boots,3111);
});
test('support task item is granted separately, and combination configs reject invalid mechanics',()=>{
 const b=getBuild(hero('Lulu'),'support',data);assert.ok(b.granted.some(i=>i.id===3865));assert.ok(!b.start.some(i=>i.id===3865));assert.match(buildAsText(b,hero('Lulu'),data),/位置任务/);
 const c=clone();c.loadouts[0].items=[3036,3033,6694];assert.throws(()=>validateCatalog(c,data),/互斥/);
 const unsupported=clone();unsupported.loadouts[0].champions=['KogMaw'];unsupported.loadouts[0].runes=['aftershock'];assert.throws(()=>validateCatalog(unsupported,data),/硬控/);
});
test('config review dates remain independent and all ten three-position groups have authored cards',()=>{
 const c=clone();assert.equal(new Set(c.trios.map(t=>t.members.map(m=>m.role).sort().join('+'))).size,10);
 assert.ok(new Set(c.trios.map(t=>t.economy)).size>=45);assert.ok(new Set(c.trios.map(t=>t.early)).size>=45);
 c.loadouts.find(l=>l.id==='trio-ball').patch='16.18';const s=catalogIssues(c,data);assert.ok(s.status['ball-delivery'].stale);assert.ok(s.loadoutStatus['trio-ball'].stale);assert.equal(s.status['ball-delivery'].invalid,false);
});
test('default library checks work without a URL, provide version evidence and stay inert until apply',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-default-update-'));
 const old=clone();old.version='old';old.trios=old.trios.slice(0,25);await fs.writeFile(path.join(root,'combinations.json'),JSON.stringify({schema:1,installed:old,personal:{duos:[],trios:[],loadouts:[],runes:{}}}));
 const s=await createCatalogStore({root,getData:()=>data,download:async url=>{assert.equal(url,'https://ddragon.leagueoflegends.com/api/versions.json');return ['16.20.1'];}});
 const p=await s.check();assert.equal(p.maintenance.latestPatch,'16.20');assert.equal(s.summary().catalog.trios.length,25);assert.ok(p.changes.some(c=>c.kind==='trios'&&c.type==='added'));
 await s.apply(p.token);assert.equal(s.summary().catalog.trios.length,BUNDLED_CATALOG.trios.length);await s.rollback();assert.equal(s.summary().catalog.trios.length,25);
 const offline=await createCatalogStore({root:await fs.mkdtemp(path.join(os.tmpdir(),'buddy-offline-')),getData:()=>data,download:async()=>{throw Error('offline');}});assert.match((await offline.check()).maintenance.warning,/离线/);
});
test('sanitized public pick state distinguishes hover and confirms manual role mismatch without changing positions',()=>{
 const session=sanitizeSession({myTeam:[{cellId:0,championId:22,assignedPosition:'BOTTOM',puuid:'private'},{cellId:1,championId:0,championPickIntent:1,displayName:'private'}],actions:[[{actorCellId:0,type:'pick',completed:true,championId:22,private:'secret'}]],localPlayerCellId:0,timer:{phase:'FINALIZATION',adjustedTimeLeftInPhase:30000}});
 assert.equal(session.myTeam[0].pickState,'locked');assert.ok(!JSON.stringify(session).includes('private'));assert.ok(!JSON.stringify(session).includes('secret'));
 const slots=createSlots();Object.assign(slots[3],{champion:'Ashe',locked:true,clientCellId:0,manualPosition:true});const moved=moveChampion(slots,'bottom','support');
 const status=clientDraftStatus({session,receivedAt:'2026-10-05T00:00:00Z'},moved,data.champions,Date.parse('2026-10-05T00:00:05Z'));
 assert.deepEqual(status.hover,[{id:'Annie',local:false}]);assert.equal(status.remaining,25);assert.deepEqual(status.mismatch,[{champion:'Ashe',local:'support',assigned:'bottom'}]);assert.equal(moved[4].champion,'Ashe');
});
