import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BUNDLED_CATALOG,catalogIssues,validateCatalog} from '../src/core/catalog.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {getBuild,validateRunePage} from '../src/core/builds.mjs';
import {comboLoadout} from '../src/core/loadouts.mjs';
import {conventionalRole} from '../src/core/rules.mjs';

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
const byId=new Map(data.champions.map(c=>[c.id,c]));
const ids=[
 'party-taliyah-jhin-nautilus','party-viktor-aphelios-renata','party-hwei-varus-zyra',
 'party-tf-caitlyn-bard','party-orianna-sivir-rakan','party-azir-xayah-janna',
 'party-anivia-vayne-poppy','party-ornn-viego-ahri','party-gnar-jarvan-viktor',
 'party-renekton-elise-taliyah','party-gangplank-nocturne-tf','party-trundle-ashe-braum',
 'party-zac-jinx-thresh','party-lillia-mf-leona','party-ivern-kaisa-nautilus',
 'party-kennen-galio-rell',
];
const trios=ids.map(id=>BUNDLED_CATALOG.trios.find(t=>t.id===id));
const partySlots=roles=>createSlots().map(s=>({...s,party:roles.includes(s.role)}));

test('new trio cards have current mechanism evidence and honest scoped configurations',()=>{
 validateCatalog(BUNDLED_CATALOG,data);
 const issues=catalogIssues(BUNDLED_CATALOG,data);
 assert.ok(trios.every(Boolean),'all separately authored execution cards are bundled');
 assert.equal(new Set(trios.map(t=>t.members.map(m=>m.role).sort().join('|'))).size,4);
 for(const t of trios){
  assert.equal(t.patch,'16.20',t.id);
  assert.equal(issues.status[t.id].invalid,false,t.id);
  assert.equal(issues.status[t.id].stale,false,t.id);
  for(const m of t.members){
   assert.ok(conventionalRole(byId.get(m.champion),m.role),`${t.id}: ${m.champion}@${m.role}`);
   assert.ok(t.sources.some(s=>s.kind==='技能依据'&&s.url===`https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/${m.champion}.json`));
   if(m.loadoutId==='default')assert.match(t.economy,/默认|未新增|未另审/,t.id);
  }
  assert.ok(t.steps.length>=3&&t.steps.some(s=>/撤|退出|取消|收队|收回|停止/.test(s)),t.id);
  assert.ok(!/\d+(?:\.\d+)?\s*%|必赢|必胜/.test(t.why+t.plan+t.risk),t.id);
  for(const source of t.sources.filter(s=>s.url.startsWith('https://mobalytics.gg/')))assert.match(source.kind,/未作.*专用配装/);
 }
 // An Ivern jungle plan must not borrow the older support-only configuration.
 const ivern=trios.find(t=>t.id==='party-ivern-kaisa-nautilus').members.find(m=>m.champion==='Ivern');
 assert.equal(ivern.loadoutId,'default');
});

test('all 48 members receive their actual authored job and valid position-specific preparation',()=>{
 for(const t of trios)for(const m of t.members){
  const champion=byId.get(m.champion);
  assert.equal(comboLoadout(t,champion,m.role),m.loadoutId);
  const build=getBuild(champion,m.role,data,{comboId:t.id});
  assert.equal(build.loadoutId,m.loadoutId,`${t.id}: ${m.champion}`);
  assert.equal(build.combo?.id,t.id);
  assert.equal(build.combo?.ownJob,m.job);
  assert.deepEqual(build.combo?.steps,t.steps);
  assert.equal(build.combo?.economy,t.economy);
  assert.deepEqual(build.missing,[]);
  assert.ok(validateRunePage(build.selectedRune?.page,data.runes),`${t.id}: ${m.champion}`);
 }
});

test('each new trio remains reachable within six reroll pages around two real locked teammates',()=>{
 for(const t of trios){
  const slots=partySlots(t.members.map(m=>m.role));
  for(const m of t.members.slice(0,2))Object.assign(slots.find(s=>s.role===m.role),{champion:m.champion,locked:true});
  const before=structuredClone(slots),rows=recommend({slots,champions:data.champions,scope:'party',style:t.style,play:{unusual:false},limit:30});
  const authored=rows.find(row=>row.trio?.id===t.id);
  assert.ok(authored,`${t.id}: authored completion must be reachable without a forced hero pool`);
  assert.equal(authored.origin,'curated');
  assert.deepEqual(authored.trio.members,t.members,'discovery retains the actual authored jobs and loadout bindings');
  for(const m of t.members)assert.equal(authored.slots.find(s=>s.role===m.role).champion,m.champion);
  for(const row of rows)for(const m of t.members.slice(0,2))assert.deepEqual(row.slots.find(s=>s.role===m.role),before.find(s=>s.role===m.role));
  assert.deepEqual(slots,before);
  const blocked=recommend({slots,champions:data.champions,scope:'party',style:t.style,excluded:[t.members[2].champion],limit:2});
  assert.ok(blocked.every(row=>row.trio?.id!==t.id),`${t.id}: exclusion must still win`);
 }
});

test('unlocked party recommendations discover new authored play across four real position distributions',()=>{
 for(const roles of [['mid','bottom','support'],['top','jungle','mid'],['jungle','bottom','support'],['top','mid','support']]){
  const rows=recommend({slots:partySlots(roles),champions:data.champions,scope:'party',play:{unusual:false},limit:15});
  assert.ok(rows.some(r=>ids.includes(r.trio?.id)),roles.join('/'));
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  const authored=rows.filter(r=>r.trio);
  assert.equal(new Set(authored.map(r=>r.trio.id)).size,authored.length,'new results are different actual trios');
 }
});

test('real five- and six-result pages preserve one diverse stream across discovery boundaries',()=>{
 for(const limit of [5,6]){
  const input={slots:partySlots(['mid','bottom','support']),champions:data.champions,scope:'party',play:{unusual:false},limit};
  const stream=recommend({...input,limit:limit*3}),pages=[0,limit,limit*2].flatMap(offset=>recommend({...input,offset}));
  assert.deepEqual(pages.map(r=>r.id),stream.map(r=>r.id),'page size and diversity never change earlier candidates');
  assert.ok(pages.some(row=>ids.includes(row.trio?.id)),'the fit-ranked stream still discovers authored trios');
  assert.ok(pages.some(row=>row.creative),'creative discovery survives the real page boundary');
  assert.equal(new Set(pages.map(r=>r.id)).size,pages.length,'reroll pages must not repeat the same candidate');
 }
});
