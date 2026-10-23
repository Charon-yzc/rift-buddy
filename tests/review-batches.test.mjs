// Historical 16.20 plan/source contract; current 4.0 bundle and migration are tested separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {generateCreativeTrios} from '../src/core/creative-trios.mjs';
import {draftTargets} from '../src/core/draft.mjs';
import {profile} from '../src/core/rules.mjs';
import {validateState} from '../services/storage.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
import {resultCooperation} from '../src/core/creative-plan.mjs';
import {escape as e} from '../src/ui.mjs';
const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/builds.json','utf8')).entries;
const locked=(slots,pairs)=>{for(const [role,id] of pairs)Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});return slots;};
const viewData={champions:data.champions,catalogInfo:{status:{}}};

test('tempo preference mismatch is exposed, not silent',()=>{
 const slots=locked(createSlots(),[['top','Malphite'],['jungle','JarvanIV'],['mid','Orianna'],['bottom','Varus'],['support','Ashe']]);
 const [row]=recommend({slots,champions:data.champions,play:{tempo:'poke'}});
 assert.equal(row.strategy.tempo,'teamfight');
 assert.equal(row.strategy.matched,false);
 assert.equal(row.strategy.preference,'控制消耗');
 const card=renderResultCard(row,0,viewData,{favorites:[]});
 assert.ok(card.includes('你偏好控制消耗'));
 const play=resultPlayCard(row,0,viewData);
 assert.ok(play.includes('偏好提示'));
});

test('cards retain structured reasons and adaptive drawers expose their underlying execution evidence',()=>{
 const slots=locked(createSlots(),[['top','Garen'],['jungle','LeeSin']]);
 const rows=recommend({slots,champions:data.champions,limit:3});
 assert.ok(rows.some(row=>resultCooperation(row))&&rows.some(row=>!resultCooperation(row)),'exercise adaptive and authored drawer paths');
 for(const row of rows){
  const card=renderResultCard(row,0,viewData,{favorites:[]}),play=resultPlayCard(row,0,viewData),execution=resultCooperation(row);
  assert.ok(row.reasonPoints.length);
  for(const point of row.reasonPoints)assert.ok(card.includes(e(point)),point);
  if(row.origin!=='adaptive')for(const point of row.reasonPoints)assert.ok(play.includes(e(point)),point);
  else{
   assert.ok(execution);
   // The adaptive drawer omits repeated summary bullets; its full execution
   // plan must still supply the actions, conditions, exits and evidence note.
   for(const text of [...execution.steps,...execution.conditions,...execution.failures,execution.sourceNote])assert.ok(play.includes(e(text)),text);
   for(const member of execution.memberJobs)assert.ok(play.includes(e(member.job)),member.champion);
  }
 }
});

test('creative ideas carry distinct per-archetype plans and visible cautions',()=>{
 const slots=createSlots();
 const targets=draftTargets(slots,'context');
 const sets={};
 for(const role of targets)sets[role]=data.champions.filter(c=>profile(c,role).roles.includes(role));
 const defs=generateCreativeTrios({targets,candidateSets:sets,champions:data.champions,style:'fun'});
 assert.ok(defs.length>=2);
 assert.equal(new Set(defs.map(d=>d.plan)).size,defs.length);
 const rows=recommend({slots:createSlots(),champions:data.champions,limit:5});
 const creative=rows.find(r=>r.creative);
 assert.ok(creative);
 assert.equal(creative.origin,'adaptive');assert.ok(creative.reasonPoints.some(t=>t.startsWith('失败就退出：')));for(const m of creative.adaptive.memberJobs)assert.match(m.job,/[QWER]|普攻/);
 const card=renderResultCard(creative,4,viewData,{favorites:[]});
 assert.ok(card.includes('未经对局验证'));
});

test('hex favorites preserve the full augment context through validation',()=>{
 const fav={id:'hex:Ashe:1-2',type:'build',title:'t',version:'1',createdAt:new Date().toISOString(),
  champion:'Ashe',role:'bottom',mode:'hex',coreIndex:0,conditions:[],augmentIds:[11,22],compareIds:[33],ownedAugmentIds:[44,55]};
 const kept=validateState({schema:1,favorites:[fav],excluded:[],preferences:{},draft:null,ownedPageId:null,guide:null}).favorites[0];
 assert.deepEqual(kept.augmentIds,[11,22]);
 assert.deepEqual(kept.compareIds,[33]);
 assert.deepEqual(kept.ownedAugmentIds,[44,55]);
 const hexFav=validateState({schema:1,favorites:[{id:'hex:Ashe:1',type:'hex',title:'h',version:'1',createdAt:new Date().toISOString(),champion:'Ashe',augments:[1],compareIds:[2,3],ownedAugmentIds:[4]}],excluded:[],preferences:{},draft:null,ownedPageId:null,guide:null}).favorites[0];
 assert.deepEqual(hexFav.compareIds,[2,3]);
 assert.deepEqual(hexFav.ownedAugmentIds,[4]);
});
