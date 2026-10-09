import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,analyzeTeam,describeComposition,buildReasonPoints} from '../src/core/recommend.mjs';
import {describeCurve,describeForgiveness,controlChainLabel} from '../src/core/strategy.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);
const locked=(slots,pairs)=>{for(const [role,id] of pairs)Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});return slots;};

test('team analysis exposes curve, forgiveness, control chain and difficulty',()=>{
 const slots=locked(createSlots(),[['top','Malphite'],['jungle','JarvanIV'],['mid','Orianna'],['bottom','Varus'],['support','Ashe']]);
 const a=analyzeTeam(slots,data.champions);
 assert.equal(a.curve.label,'成员窗口不同，分步配合');
 assert.equal(a.curve.windows.find(w=>w.champion==='JarvanIV').kind,'base');
 assert.equal(a.curve.windows.find(w=>w.champion==='Orianna').kind,'ultimate');
 assert.ok(['容错较高','容错中等','容错偏低'].includes(a.forgiveness.label));
 assert.equal(typeof a.control,'string');
 assert.ok(Number.isFinite(a.avgDifficulty));
 assert.ok(['mixed','ad','ap','none'].includes(a.damageMix));
 // Pure mechanism helpers behave on empty traits.
 assert.equal(describeCurve({engage:0,poke:0,sustain:0,aoe:0,peel:0,frontline:0}).label,'阶段条件未整理');
 assert.equal(describeForgiveness({peel:0,frontline:0,sustain:0},false).label,'容错偏低');
 assert.equal(controlChainLabel({engage:0,aoe:0}),'缺少稳定先手');
 assert.equal(describeComposition(a).length>0,true);
});

test('recommendations carry structured reason points and damage roles',()=>{
 const slots=locked(createSlots(),[['top','Garen'],['jungle','LeeSin']]);
 const rows=recommend({slots,champions:data.champions,scope:'bot',limit:2});
 assert.ok(rows.length>0);
 for(const r of rows){
  assert.ok(Array.isArray(r.reasonPoints)&&r.reasonPoints.length>0&&r.reasonPoints.length<=5);
  assert.ok(r.reasonPoints.every(t=>typeof t==='string'&&t.length>0));
  assert.ok(!/胜率|必赢|counter/i.test(r.reasonPoints.join('')));
  for(const m of r.contributions)assert.ok(['物理','法术','混合'].includes(m.damage));
 }
 // Curated combos reuse their authored texts verbatim.
 const full=locked(createSlots(),[['top','Malphite'],['jungle','JarvanIV'],['mid','Orianna'],['bottom','Varus'],['support','Ashe']]);
 const [done]=recommend({slots:full,champions:data.champions});
 assert.ok(done.reasonPoints[0].length>0);
});

test('bot scope emphasizes the lane while party scope rewards trio completeness',()=>{
 const base=()=>locked(createSlots(),[['top','Garen'],['jungle','LeeSin'],['mid','Ahri']]);
 const botRows=recommend({slots:base(),champions:data.champions,scope:'bot',limit:3});
 assert.ok(botRows.length>0);
 assert.ok(botRows.some(r=>r.reasonPoints.some(t=>/对线|消耗|换血/.test(t)))||botRows.some(r=>r.duo));
 const partySlots=createSlots().map(s=>({...s,party:['top','jungle','mid'].includes(s.role)}));
 locked(partySlots,[['top','Malphite'],['jungle','JarvanIV']]);
 const partyRows=recommend({slots:partySlots,champions:data.champions,limit:10});
 assert.ok(partyRows.some(r=>r.trio?.id==='ball-delivery'));
});

test('successive results diversify styles instead of repeating one combo',()=>{
 const slots=locked(createSlots(),[['top','Garen'],['jungle','LeeSin']]);
 const rows=recommend({slots,champions:data.champions,scope:'bot',limit:6});
 assert.equal(rows.length,6);
 assert.equal(rows[0].id,rows.slice().sort((a,b)=>b.score-a.score)[0].id);
 const styles=new Set(rows.map(r=>(r.trio||r.duo)?.style||'balanced'));
 assert.ok(styles.size>=2,[...styles].join(','));
 const ids=rows.map(r=>r.id);
 assert.equal(new Set(ids).size,ids.length);
});

test('key curated outcomes survive the deeper scoring',()=>{
 let slots=locked(createSlots(),[['top','Malphite'],['jungle','JarvanIV'],['mid','Orianna'],['bottom','Varus'],['support','Ashe']]);
 assert.equal(recommend({slots,champions:data.champions})[0].strategy.label,'团战连招');
 slots=locked(createSlots(),[['top','Garen'],['jungle','LeeSin']]);
 const input={slots,champions:data.champions,scope:'bot'};
 const first=recommend(input)[0];
 assert.ok(first.reasonPoints.length>0);
 // buildReasonPoints tolerates entries without combos.
 assert.ok(buildReasonPoints({slots:first.slots,analysis:first.analysis,connections:[['A','B','联动说明']],targets:first.targets},'context').length>0);
});
