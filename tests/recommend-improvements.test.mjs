import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,analyzeTeam,explainContributions} from '../src/core/recommend.mjs';
import {summarizeEnemyTraits,threatNotes,strategySummary} from '../src/core/strategy.mjs';
import {compareAugments} from '../src/core/hex-compare.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
data.hexBuilds=JSON.parse(await fs.readFile('data/hex-builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);

test('mixed damage is preferred over mono damage when completing a trio',()=>{
 const slots=createSlots();
 for(const [role,id] of [['top','Garen'],['jungle','LeeSin']])Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});
 const rows=recommend({slots,champions:data.champions,scope:'bot',limit:10});
 assert.ok(rows.length>1);
 // All results carry the new analysis fields without breaking the old shape.
 for(const r of rows){
  assert.ok(Array.isArray(r.analysis.threats));
  assert.ok(Array.isArray(r.strategy.threats));
  assert.ok(Array.isArray(r.contributions)&&r.contributions.length>0);
 }
});

test('visibly picked enemies add mechanism-based threats and small robustness shifts',()=>{
 const enemies=['Malphite','Amumu','Orianna'].filter(id=>hero(id));
 assert.ok(enemies.length>=2);
 const traits=summarizeEnemyTraits(enemies,data.champions);
 assert.equal(traits.count,enemies.length);
 assert.ok(traits.engage>=2);
 const slots=createSlots();
 for(const [role,id] of [['top','Garen'],['jungle','LeeSin'],['mid','Ahri']])Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});
 const plain=recommend({slots,champions:data.champions,scope:'bot',limit:3});
 const withEnemy=recommend({slots,champions:data.champions,scope:'bot',limit:3,enemy:enemies});
 assert.ok(withEnemy.every(r=>r.strategy.threats.length>0));
 assert.ok(plain.every(r=>r.strategy.threats.length===0));
 // Threat notes never claim win rates or counters.
 for(const r of withEnemy)for(const note of r.strategy.threats)assert.ok(!/胜率|克制|必赢|counter/i.test(note));
 // Unknown enemy ids are ignored safely.
 assert.equal(summarizeEnemyTraits(['NoSuchHero',null],data.champions).count,0);
 assert.deepEqual(threatNotes({traits:{peel:0,engage:0,sustain:0,poke:0,frontline:0,aoe:0}},null),[]);
});

test('contributions use the recommendation context consistently',()=>{
 const slots=createSlots();
 for(const [role,id] of [['top','Garen'],['jungle','LeeSin']])Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});
 const [first]=recommend({slots,champions:data.champions,scope:'bot',limit:1});
 const fixed=slots.filter(s=>!['bottom','support'].includes(s.role));
 const viaContext=explainContributions(fixed,first.slots.filter(s=>!['top','jungle','mid'].includes(s.role)||s.champion),first.targets,data.champions,{catalogStatus:{}});
 assert.ok(viaContext.length>0);
 assert.ok(viaContext.every(m=>m.hero&&m.role&&m.name&&Array.isArray(m.helps)));
});

test('hex comparison stays scoreless but gains build-aware reasons',()=>{
 const champion=hero('Ashe');
 const defenseAugment=data.augments.find(a=>a.descriptionStatus!=='partial'&&/生命值|护甲|魔抗/.test(`${a.name} ${a.description}`));
 assert.ok(defenseAugment);
 const tankRows=compareAugments({champion,options:[defenseAugment.id],owned:[],augments:data.augments,buildKey:'tank'});
 assert.ok(tankRows[0].reasons.some(t=>/前排/.test(t)));
 assert.ok(!('score'in tankRows[0]));
 // Old calls without buildKey keep working.
 const legacy=compareAugments({champion,options:[defenseAugment.id],owned:[],augments:data.augments});
 assert.equal(legacy.length,1);
});

test('strategy summary keeps tempo labels with the new optional enemy argument',()=>{
 const slots=createSlots();
 for(const [role,id] of [['top','Malphite'],['jungle','JarvanIV'],['mid','Orianna'],['bottom','Varus'],['support','Ashe']])Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});
 const analysis=analyzeTeam(slots,data.champions);
 assert.equal(strategySummary(analysis,null).label,strategySummary(analysis,null,undefined,summarizeEnemyTraits([],data.champions)).label);
});
