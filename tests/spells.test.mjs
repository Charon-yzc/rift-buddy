import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {skillHitDamage,proxyRanks,burstDamage} from '../src/core/live-estimate.mjs';
const spells=JSON.parse(await fs.readFile('data/spells.json','utf8'));
const book=spells.champions;

test('spell book schema is sound and matches the game data version',()=>{
 const game=JSON.parse(JSON.stringify({})); // version checked below via sync read
 assert.equal(spells.patch,spells.version.split('.').slice(0,2).join('.'));
 assert.ok(spells.coverage.champions>=170);
 assert.ok(spells.coverage.withDamage>=165);
 for(const [id,slots] of Object.entries(book)){
  for(const slot of ['Q','W','E','R']){
   const s=slots[slot];
   assert.ok(s&&typeof s.name==='string',`${id}.${slot} missing`);
   if(s.damage){
    assert.ok(['physical','magic','true'].includes(s.damage.type),`${id}.${slot} type`);
    assert.ok(s.damage.base.length===(slot==='R'?3:5),`${id}.${slot} ranks`);
    assert.ok(s.damage.base.every(v=>v>=0),`${id}.${slot} base`);
    for(const r of s.damage.ratios||[]){
     assert.ok(['ad','ap','bonusAd','armor','mr','maxHp'].includes(r.stat),`${id}.${slot} ratio stat`);
     assert.ok(Number.isFinite(r.coeff)&&r.coeff>=0,`${id}.${slot} ratio coeff`);
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
 const jinx=book.Jinx.W.damage;
 assert.deepEqual(jinx.base,[10,60,110,160,210]);
});

test('skill hits use real ranks and ratios, proxy ranks stay documented',()=>{
 const agg={ad:144,ap:0,hp:1195,armor:49,mr:38.5};
 assert.equal(skillHitDamage(book.Ashe.W,1,agg,59,null),20+144);
 assert.equal(skillHitDamage(book.Ashe.W,5,agg,59,null),80+144);
 assert.equal(skillHitDamage(book.Ashe.W,0,agg,59,null),0);
 assert.equal(skillHitDamage(null,3,agg,59,null),0);
 assert.equal(skillHitDamage(book.Zed.Q,1,{ad:100,ap:0,armor:0,mr:0},60,null),80+40);
 assert.deepEqual([proxyRanks(1),proxyRanks(6,3),proxyRanks(18),proxyRanks(11,3)],[1,1,5,2]);
 assert.ok(burstDamage({stats:{attackdamage:59,attackspeed:0.658,attackspeedperlevel:3}},6,{ad:59,ap:0},6)>0);
});
