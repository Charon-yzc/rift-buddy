// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {BUNDLED_CATALOG,configureCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {TRIOS,DUOS} from '../src/core/rules.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,selectPartyRoute} from '../src/core/creative-plan.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {objectiveRhythm} from '../src/core/live-rhythm.mjs';
import {objectiveCoordination} from '../src/core/objective-coordination.mjs';
import {renderGuide as renderGuideActual} from '../src/guide-view.mjs';
const renderGuide=(snapshot,...rest)=>renderGuideActual({...snapshot,model:snapshot?.model?{...snapshot.model,compact:false}:snapshot?.model},...rest);
const data=JSON.parse(fs.readFileSync('tests/fixtures/snapshot-16.20/game.json'));data.builds=JSON.parse(fs.readFileSync('tests/fixtures/snapshot-16.20/builds.json')).entries;data.catalog=configureCatalog(BUNDLED_CATALOG);data.catalogInfo=catalogIssues(data.catalog,data);
const resource={id:'dragon',name:'元素亚龙',remaining:50,state:'prepare'};
const slotsFor=members=>createSlots().map(s=>({...s,champion:members.find(m=>m.role===s.role)?.champion||null,party:members.some(m=>m.role===s.role),locked:members.some(m=>m.role===s.role)}));
const curated=combo=>{const members=combo.members||[{champion:combo.carry,role:'bottom'},{champion:combo.support,role:'support'}];return captureCreativePlan({scope:'party',slots:slotsFor(members),...(members.length===3?{trio:combo}:{duo:combo})},data);};
const shared=picks=>{const slots=slotsFor(Object.entries(picks).map(([role,champion])=>({role,champion})));const [r]=recommend({slots,champions:data.champions,scope:'party',builds:data.builds,patch:data.patch,catalogStatus:data.catalogInfo.status});return captureCreativePlan(r,data);};
const live=id=>({matched:true,available:true,champion:id,mode:'rift',at:Date.now(),queueId:420,mapId:11,gameTime:250,objectives:{available:true,historyComplete:true,events:[{kind:'GameStart',time:0}]},level:6,gold:400,inventory:[],skills:{Q:3,W:1,E:1,R:1},enemies:[],allies:[]});
test('adopted engage and protection trios produce different resource arrangements and exact saved jobs',()=>{
 const engage=curated(TRIOS.find(t=>t.id==='ball-delivery')),protect=curated(TRIOS.find(t=>t.members.some(m=>m.champion==='KogMaw')&&t.members.some(m=>m.champion==='Lulu')&&t.tempo==='protect'));
 for(const plan of [engage,protect]){const own=plan.members[0],before=structuredClone(plan),c=objectiveCoordination({plan,champion:own.champion,role:own.role,resource,data});assert(c);assert.equal(c.jobs.length,3);for(const job of c.jobs)assert.equal(job.tactic,plan.ordered.find(m=>m.role===job.role).job);assert.deepEqual(plan,before);assert.match(c.intro,/阵容尚未确认/);assert.match(c.unknown,/未读取队友技能冷却/);}
 const e=objectiveCoordination({plan:engage,...{champion:engage.members[0].champion,role:engage.members[0].role},resource,data});
 const p=objectiveCoordination({plan:protect,champion:'KogMaw',role:'bottom',resource,data});assert.notEqual(e.approach,p.approach);assert.match(e.approach,/先手和接力顺序/);assert.match(p.approach,/克格莫/);assert.match(p.ownJob.resourceJob,/输出候选/);assert.match(p.stop,/保护交空/);
});
test('four/five party side-pressure uses the same actual side/mover as the adopted route and preserves alternate route changes',()=>{
 for(const picks of [{top:'Fiora',jungle:'Nocturne',mid:'TwistedFate',support:'Janna'},{top:'Fiora',jungle:'Nocturne',mid:'TwistedFate',support:'Janna',bottom:'Ashe'}]){
  const plan=shared(picks),routes=(plan.shared||plan.cooperation).routes;assert(routes.some(r=>r.id==='side-pressure'));
  const side=selectPartyRoute(plan,'side-pressure'),c=objectiveCoordination({plan:side,champion:'Fiora',role:'top',resource,data});assert.equal(c.kind,'side-pressure');assert.equal(c.jobs.length,Object.keys(picks).length);assert.match(c.ownJob.resourceJob,/取消前压/);assert.match(c.approach,/继续分线.*取消分线会合/);assert.match(c.stop,/魔腾/);
  const alternate=routes.find(r=>r.id!=='side-pressure'),other=selectPartyRoute(side,alternate.id),d=objectiveCoordination({plan:other,champion:'Fiora',role:'top',resource,data});assert.notEqual(d.kind,'side-pressure');assert.notEqual(c.approach,d.approach);assert.equal(d.jobs.find(m=>m.champion==='Fiora').tactic,other.ordered.find(m=>m.champion==='Fiora').job);
 }
});
test('two-player guidance never assigns unknown teammates and rejects missing or unrelated adopted members',()=>{
 const plan=curated(DUOS.find(d=>d.tempo==='protect')),own=plan.members[0];const c=objectiveCoordination({plan,champion:own.champion,role:own.role,resource,protectId:'Unknown',data});assert.equal(c.jobs.length,2);assert.match(c.unknown,/未选路人/);assert(!JSON.stringify(c).includes('Unknown'));
 for(const value of [undefined,{...plan,id:'bad'}])assert.equal(objectiveCoordination({plan:value,champion:own.champion,role:own.role,resource,data}),null);
 assert.equal(objectiveCoordination({plan,champion:'Azir',role:'mid',resource,data}),null);
});
test('actual guide model and rhythm UI retain adopted plan context; unconfirmed queues and wrong live context do not activate it',()=>{
 const plan=curated(TRIOS.find(t=>t.id==='ball-delivery')),selection={id:'Orianna',role:'mid',mode:'rift',comboId:plan.id,creativePlan:plan},guide=selectGuide(null,selection);
 const m=createGuideModel(data,guide,live('Orianna'));const dragon=m.objectives.rows.find(r=>r.id==='dragon');assert.equal(dragon.coordination.planId,plan.id);assert.equal(dragon.coordination.ownJob.champion,'Orianna');
 const html=renderGuide({model:m},'rhythm',false,()=>'<img>');assert.match(html,/本轮你怎么做/);assert.match(html,/取消／换收益/);assert.match(html,/采用的技能职责/);assert.match(html,/阵容尚未确认/);
 const unsupported=objectiveRhythm({live:{...live('Orianna'),queueId:480},plan,champion:'Orianna',role:'mid',patch:data.patch,data});assert.equal(unsupported.available,false);assert.equal(unsupported.rows.length,0);
 const mismatch=createGuideModel(data,guide,live('Ashe'));assert.equal(mismatch.objectives.available,false);assert.equal(mismatch.objectives.rows.length,0);
});
