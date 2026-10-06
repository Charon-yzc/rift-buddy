import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {skillHitDamage,proxySkillRanks,burstDamage,duel} from '../src/core/live-estimate.mjs';
const spells=JSON.parse(await fs.readFile('data/spells.json','utf8'));
const game=JSON.parse(await fs.readFile('data/game.json','utf8'));
const book=spells.champions;

test('spell book schema is sound and matches the bundled game version',()=>{
 assert.equal(spells.version,game.version);
 assert.equal(spells.patch,spells.version.split('.').slice(0,2).join('.'));
 assert.ok(spells.coverage.champions>=170);
 assert.ok(spells.coverage.withDamage>=165);
 for(const [id,slots] of Object.entries(book)){
  for(const slot of ['Q','W','E','R']){
   const s=slots[slot];
   assert.ok(s&&typeof s.name==='string',`${id}.${slot} missing`);
   assert.equal(typeof s.nuke,'boolean',`${id}.${slot} nuke flag`);
   assert.equal(typeof s.partial,'boolean',`${id}.${slot} partial flag`);
   if(s.damage){
    assert.ok(['physical','magic','true'].includes(s.damage.type),`${id}.${slot} type`);
    assert.ok(s.damage.base.length===(slot==='R'?3:5),`${id}.${slot} ranks`);
    assert.ok(s.damage.base.every(v=>v>=0),`${id}.${slot} base`);
    if(s.damage.hits)assert.ok(s.damage.hits.length===s.damage.base.length&&s.damage.hits.every(v=>Number.isInteger(v)&&v>=1&&v<=30),`${id}.${slot} hits`);
    for(const r of [...(s.damage.ratios||[]),...((s.damage.extra||[]).flatMap(x=>x.ratios||[]))]){
     assert.ok(['ad','ap','armor','mr','maxHp'].includes(r.stat),`${id}.${slot} ratio stat`);
     const coeffs=Array.isArray(r.coeff)?r.coeff:[r.coeff];
     assert.ok(coeffs.every(v=>Number.isFinite(v)&&v>=0),`${id}.${slot} ratio coeff`);
    }
    for(const x of s.damage?.extra||[]){
     assert.equal(typeof x.calc,'string',`${id}.${slot} extra calc`);
     assert.ok(['physical','magic','true'].includes(x.type),`${id}.${slot} extra type`);
    }
   }
  }
 }
});

test('known live values match the shipped data files',()=>{
 const w=book.Ashe.W.damage;
 assert.equal(w.type,'physical');assert.deepEqual(w.base,[20,35,50,65,80]);
 assert.deepEqual(w.ratios,[{stat:'ad',coeff:1,formula:'total'}]);
 const q=book.Annie.Q.damage;
 assert.equal(q.type,'magic');assert.deepEqual(q.base,[80,125,170,215,260]);
 assert.equal(q.ratios[0].stat,'ap');assert.ok(Math.abs(q.ratios[0].coeff-0.8)<1e-6);
 const zed=book.Zed.Q.damage;
 assert.equal(zed.type,'physical');assert.deepEqual(zed.base,[80,120,160,200,240]);
 assert.deepEqual(zed.ratios,[{stat:'ad',coeff:1,formula:'bonus'}]);
 const darius=book.Darius.R.damage;
 assert.equal(darius.type,'true');assert.deepEqual(darius.base,[125,250,375]);
 // Jinx W is total AD, not bonus: Riot names bonus explicitly (BonusADRatio,
 // BADRatio) and the wiki patch note reads "1.4 total attack damage".
 const jinx=book.Jinx.W.damage;
 assert.deepEqual(jinx.base,[10,60,110,160,210]);
 assert.deepEqual(jinx.ratios,[{stat:'ad',coeff:1.4,formula:'total'}]);
 const garen=book.Garen.E.damage;
 assert.deepEqual(garen.hits,[7,7,7,7,7]);
 // Dual-form champions stay honestly partial.
 assert.equal(book.Jayce.Q.partial,true);
});

test('skill hits use real ranks and ratios, multi-hits multiply',()=>{
 const agg={ad:144,ap:0,hp:1195,armor:49,mr:38.5};
 assert.equal(skillHitDamage(book.Ashe.W,1,agg,59,null),20+144);
 assert.equal(skillHitDamage(book.Ashe.W,5,agg,59,null),80+144);
 assert.equal(skillHitDamage(book.Ashe.W,0,agg,59,null),0);
 assert.equal(skillHitDamage(null,3,agg,59,null),0);
 assert.equal(skillHitDamage(book.Zed.Q,1,{ad:100,ap:0,armor:0,mr:0},60,null),80+40);
 // Bonus armor/mr subtract level base instead of using the total.
 assert.equal(skillHitDamage(book.Taric.E,1,{ad:60,ap:50,armor:100,mr:50},{ad:60,armor:61.5,mr:30},null),134);
 assert.equal(skillHitDamage(book.Garen.E,1,{ad:100,ap:0,armor:0,mr:0},60,null),(4+Math.round(0.4*100))*7);
 // True damage bypasses armor and MR.
 assert.equal(skillHitDamage(book.Darius.R,1,{ad:100,ap:0,armor:200,mr:200},60,3000),125+Math.round(0.75*40));
 assert.equal(skillHitDamage(book.Ahri.Q,1,{ad:60,ap:100,armor:0,mr:0},60,null),35+50);
 // Secondary segments are inspection-only and never summed (tap/hold and
 // modal forms cannot be told apart from sequential hits in the data).
 const multi={damage:{type:'physical',base:[100],ratios:[],extra:[
  {calc:'Thrust',type:'physical',base:[50],ratios:[{stat:'ad',coeff:0.5,formula:'total'}]}]}};
 assert.equal(skillHitDamage(multi,1,{ad:100,ap:0,armor:0,mr:0},{ad:60,armor:0,mr:0},null,{armor:0,mr:0}),100);
 assert.equal(skillHitDamage(book.XinZhao.W,1,{ad:100,ap:0,armor:0,mr:0},{ad:60,armor:0,mr:0},null,{armor:0,mr:0}),30+Math.round(0.3*100));
 // Missing fields never poison the chain with NaN.
 assert.ok(Number.isFinite(skillHitDamage(book.Ashe.W,1,{ad:100},60,null)));
 assert.ok(burstDamage({stats:{attackdamage:59,attackspeed:0.658,attackspeedperlevel:3}},6,{ad:59,ap:0},6)>0);
});

test('proxied enemy ranks never exceed level and gate the ultimate',()=>{
 assert.deepEqual(proxySkillRanks(1),{Q:1,W:0,E:0,R:0});
 assert.deepEqual(proxySkillRanks(5),{Q:3,W:2,E:0,R:0});
 assert.deepEqual(proxySkillRanks(6),{Q:3,W:2,E:0,R:1});
 assert.deepEqual(proxySkillRanks(11),{Q:5,W:4,E:0,R:2});
 assert.deepEqual(proxySkillRanks(16),{Q:5,W:5,E:3,R:3});
 assert.deepEqual(proxySkillRanks(18),{Q:5,W:5,E:5,R:3});
 for(const level of [1,5,6,9,11,16,18]){
  const r=proxySkillRanks(level);
  assert.ok(r.Q+r.W+r.E+r.R<=level,`level ${level} total`);
  assert.ok(r.R===0||level>=6,`level ${level} ult gate`);
  assert.ok([r.Q,r.W,r.E].every(v=>v<=Math.ceil(level/2)),`level ${level} slot cap`);
 }
});

test('duels flag approximation when the book is missing or partial',()=>{
 const ashe=game.champions.find(c=>c.id==='Ashe'),jinx=game.champions.find(c=>c.id==='Jinx');
 const agg={ad:144,ap:0,hp:1195,armor:49,mr:38.5,atkSpeed:0.8,crit:0};
 const full=duel(ashe,6,agg,{Q:3,W:2,E:1,R:0},jinx,6,game,[],book);
 // Steroid Qs (Ashe/Jinx) only parse partially, so a real book still flags approx.
 assert.equal(full.approx,true);assert.ok(full.killMine>0&&full.killTheirs>0);
 const clean={Ashe:{Q:{damage:{type:'physical',base:[10,10,10,10,10],ratios:[]},partial:false}},Jinx:{Q:{damage:{type:'physical',base:[10,10,10,10,10],ratios:[]},partial:false}}};
 const exact=duel(ashe,6,agg,{Q:1},jinx,6,game,[],clean);
 assert.equal(exact.approx,false);
 const noBook=duel(ashe,6,agg,{Q:3,W:2,E:1,R:0},jinx,6,game,[],null);
 assert.equal(noBook.approx,true);assert.ok(noBook.killMine>0);
 const jayce=game.champions.find(c=>c.id==='Jayce');
 const partial=duel(ashe,6,agg,{Q:3,W:2,E:1,R:0},jayce,6,game,[],book);
 assert.equal(partial.approx,true);
 // Isolated: clean own book vs the real Jayce book must flag from the foe side alone.
 const isolated=duel(ashe,6,agg,{Q:3,W:2,E:1,R:0},jayce,6,game,[],{Ashe:clean.Ashe,Jayce:book.Jayce});
 assert.equal(isolated.approx,true);
});

test('item attack speed and flat on-hit enter aggregates; unnumbered passives disclose',async()=>{
 const {aggregateCombatStats,itemOnHits,hasUnparsedOnHit,duel}=await import('../src/core/live-estimate.mjs');
 const yone=game.champions.find(c=>c.id==='Yone'),ahri=game.champions.find(c=>c.id==='Ahri');
 const agg=aggregateCombatStats(yone,6,[{id:'3153',count:1}],game);
 assert.ok(Math.abs(agg.atkSpeed-0.73*1.25)<0.01);
 assert.deepEqual(agg.onHit,[]);assert.equal(agg.onHitApprox,true);
 assert.deepEqual(itemOnHits([{id:'3124'}],game),[{dmg:30,type:'magic'}]);
 assert.deepEqual(itemOnHits([{id:'1043'}],game),[{dmg:15,type:'physical'}]);
 assert.equal(hasUnparsedOnHit([{id:'3124'}],game),false);
 assert.equal(hasUnparsedOnHit([{id:'3091'}],game),true);
 assert.equal(hasUnparsedOnHit([{id:'3031'}],game),false);
 assert.equal(hasUnparsedOnHit([],game),false);
 // Guinsoo flat magic feeds the window; BotRK percent stays disclosed.
 const withGuinsoo=aggregateCombatStats(yone,6,[{id:'3124',count:1}],game);
 const plain=aggregateCombatStats(yone,6,[],game);
 const d=duel(yone,6,withGuinsoo,{Q:3,W:2,E:1,R:0},ahri,6,game,[],book);
 const d0=duel(yone,6,plain,{Q:3,W:2,E:1,R:0},ahri,6,game,[],book);
 assert.ok(d.killMine>d0.killMine);
 const botrk=duel(yone,6,agg,{Q:3,W:2,E:1,R:0},ahri,6,game,[],book);
 assert.equal(botrk.approx,true);
});

test('unparsed on-hit alone forces approx even with clean spell books',async()=>{
 const {aggregateCombatStats,duel}=await import('../src/core/live-estimate.mjs');
 const ashe=game.champions.find(c=>c.id==='Ashe'),jinx=game.champions.find(c=>c.id==='Jinx');
 const slot=n=>({damage:{type:'physical',base:Array(n).fill(10),ratios:[]},partial:false});
 const cleanBook={Ashe:{Q:slot(5),W:slot(5),E:slot(5),R:slot(3)},Jinx:{Q:slot(5),W:slot(5),E:slot(5),R:slot(3)}};
 const plain=aggregateCombatStats(ashe,6,[],game);
 assert.equal(duel(ashe,6,plain,{Q:1},jinx,6,game,[],cleanBook).approx,false);
 const withOnHit={...plain,onHitApprox:true};
 assert.equal(duel(ashe,6,withOnHit,{Q:1},jinx,6,game,[],cleanBook).approx,true);
 const foeOnHit=duel(ashe,6,plain,{Q:1},jinx,6,game,[{id:'3153'}],cleanBook);
 assert.equal(foeOnHit.approx,true);
});
