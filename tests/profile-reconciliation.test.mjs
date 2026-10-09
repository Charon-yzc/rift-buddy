import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {profile,PRIMARY_ROLES,conventionalRole} from '../src/core/rules.mjs';
import {analyzeTeam,createSlots,recommend} from '../src/core/recommend.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {selectBuildSource} from '../src/core/build-source.mjs';
import {summarizeEnemyTraits} from '../src/core/strategy.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);

test('current hero identities and declared primary positions are covered by the reviewed mechanism profile',()=>{
 for(const c of data.champions)assert.equal(profile(c).reviewed,true,c.id);
 for(const [id,role] of Object.entries(PRIMARY_ROLES)){
  assert.equal(profile(hero(id)).roles[0],role,id);assert.ok(conventionalRole(hero(id),role),id);
 }
 const rows=recommend({champions:data.champions,slots:createSlots(),scope:'solo',soloRole:'top',pool:['TahmKench'],poolMode:'only',play:{unusual:false},limit:1});
 assert.equal(rows[0].slots.find(s=>s.role==='top').champion,'TahmKench');
});

test('new champion mechanics participate in both allied function and public opponent analysis',()=>{
 const team=analyzeTeam(createSlots().map(s=>({...s,champion:({top:'Ornn',bottom:'Yunara',support:'Lulu'})[s.role]||null})),data.champions);
 assert.equal(team.traits.sustain,1);assert.ok(!team.warnings.some(w=>w.includes('持续输出偏少')));
 const enemy=summarizeEnemyTraits(['Yunara','Mel','Zaahen','Locke'],data.champions);
 assert.equal(enemy.sustain,3);assert.equal(enemy.poke,1);assert.equal(enemy.engage,1);assert.equal(enemy.aoe,2);
 assert.equal(profile(hero('Locke')).build,'apAssassin');assert.equal(profile(hero('Locke')).damage,'ap');
 assert.equal(profile(hero('Zaahen')).damage,'ad');
});

test('repeated attack and spell champions supply sustained damage without becoming burst-only profiles',()=>{
 for(const id of ['Trundle','Tryndamere','Olaf','Fiora','Ryze','Ezreal','Irelia']){
  assert.equal(profile(hero(id)).sustain,true,id);
  assert.equal(summarizeEnemyTraits([id],data.champions).sustain,1,id);
 }
 for(const id of ['Leblanc','Talon','Malphite'])assert.equal(profile(hero(id)).sustain,false,id);
 const slots=createSlots().map(s=>({...s,champion:s.role==='top'?'Trundle':null}));
 assert.equal(analyzeTeam(slots,data.champions).traits.sustain,1);
});

test('an uncached source uses Locke magic mechanics and an unreviewed future hero gets no fabricated fallback',()=>{
 const uncached=structuredClone(data);selectBuildSource(uncached,{region:'kr',tier:'emerald_plus'});
 const build=getBuild(hero('Locke'),'mid',uncached);
 assert.equal(build.reference,null);assert.equal(build.key,'apAssassin');
 assert.ok(build.items.slice(0,3).every(i=>!i.stats?.FlatPhysicalDamageMod));
 const future={...hero('Locke'),id:'FutureUnreviewed',name:'未整理英雄'};
 const p=profile(future);assert.equal(p.reviewed,false);assert.equal(p.frontline,null);assert.equal(p.sustain,null);assert.equal(p.damage,null);
 assert.throws(()=>getBuild(future,'mid',uncached),/英雄机制尚未整理/);
});
