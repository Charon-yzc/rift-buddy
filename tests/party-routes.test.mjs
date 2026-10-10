import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,selectPartyRoute,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {resultActionsView} from '../src/cooperation-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const setup=picks=>createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role]}));

test('teamfight preference retains every actual ball route and every supported alternative through adoption and disk',async()=>{
 const slots=setup({top:'Ornn',jungle:'Sejuani',mid:'Orianna',bottom:'Jinx',support:'Lulu'});
 const [result]=recommend({slots,champions:data.champions,scope:'party',play:{tempo:'teamfight'}}),plan=captureCreativePlan(result,data);
 assert.equal(plan.tempo,'teamfight');assert.equal(result.strategy.matched,true);
 for(const id of ['ball:Orianna:Ornn','ball:Orianna:Sejuani','tactical:protect','tactical:growth'])assert.ok(plan.shared.routes.some(r=>r.id===id),id);
 assert.ok(plan.shared.routes.length>2);
 const selected=selectPartyRoute(plan,'ball:Orianna:Sejuani'),configs=captureTeamConfigurations({...result,creativePlan:selected},data,createPreparationStore());
 const root=await fs.mkdtemp(path.resolve('.local/all-party-routes-'));
 await saveState(root,{...defaultState(),draft:{slots,scope:'party',style:'fun',creativePlan:selected},favorites:[{id:'all-routes',type:'team',title:selected.name,slots,scope:'party',style:'fun',createdAt:selected.createdAt,version:data.version,creativePlan:selected,configurations:configs}]});
 const saved=await readState(root),restored=restoreTeamFavorite(saved.favorites[0],createSlots(),data.champions);
 assert.deepEqual(restored.creativePlan,selected);
 for(const route of restored.creativePlan.shared.routes){const switched=selectPartyRoute(restored.creativePlan,route.id);assert.equal(switched.shared.routes[0].id,route.id);assert.deepEqual(validateCreativePlan(switched),switched);}
 for(const config of saved.favorites[0].configurations){const guide=createGuideModel(data,selectGuide(null,config),null,{...config,comboKnown:true});assert.equal(guide.combo.ownJob,selected.ordered.find(m=>m.champion===config.id).job);}
});

test('four-person side pressure assigns the split, support and holding jobs without contradicting later regrouping',()=>{
 const slots=setup({top:'Fiora',jungle:'Graves',mid:'TwistedFate',support:'Bard'}),[result]=recommend({slots,champions:data.champions,scope:'party'}),original=captureCreativePlan(result,data),plan=selectPartyRoute(original,'side-pressure');
 assert.match(plan.ordered.find(m=>m.champion==='Fiora').job,/安全边线.*多人消失/);
 assert.match(plan.ordered.find(m=>m.champion==='TwistedFate').job,/实际传送范围.*留守/);
 assert.match(plan.ordered.find(m=>m.champion==='Graves').job,/中路与边线之间的入口/);
 assert.match(plan.ordered.find(m=>m.champion==='Bard').job,/守中路与撤退口/);
 assert.match(plan.stagePlan.later.window,/分区行动.*不要求全员同时到同侧/);
 assert.equal(plan.stagePlan.later.exit,plan.shared.routes[0].failure);
 assert.deepEqual(plan.stagePlan.opening,original.stagePlan.opening);
 assert.deepEqual(plan.stagePlan.later.memberJobs,original.stagePlan.later.memberJobs);
 const summary=resultActionsView(result,data,{compact:true});
 assert.doesNotMatch(summary,/等主线实际生效/);for(const key of ['Q','金牌'])assert.ok(summary.includes(key),key);
 assert.equal(captureCreativePlan(recommend({slots:setup({top:'Garen',jungle:'Graves',mid:'TwistedFate',support:'Bard'}),champions:data.champions,scope:'party'})[0],data).shared.routes.some(r=>r.id==='side-pressure'),false);
});

test('Malphite Diana Yasuo have an ordered main line and conditional backup without asking for a second Yasuo ultimate',()=>{
 const slots=setup({top:'Malphite',jungle:'Diana',mid:'Yasuo'}),[result]=recommend({slots,champions:data.champions,scope:'party'}),plan=captureCreativePlan(result,data);
 assert.equal(plan.archetype,'cooperation');assert.equal(plan.steps.length,3);
 const jobs=new Map(plan.ordered.map(m=>[m.champion,m.job]));
 assert.match(jobs.get('Malphite'),/R 实际击飞.*亚索接一次 R.*取消/);
 assert.match(jobs.get('Yasuo'),/同一轮不安排两次自己的 R/);
 assert.match(jobs.get('Diana'),/等亚索落地再 R.*不要求他再接 R.*备用仅在墨菲特未开成/);
 for(const config of captureTeamConfigurations({...result,creativePlan:plan},data,createPreparationStore())){const guide=createGuideModel(data,selectGuide(null,config),null,{...config,comboKnown:true});assert.equal(guide.combo.ownJob,jobs.get(config.id));assert.deepEqual(guide.combo.steps,plan.steps);}
});

test('a trio retains its original relay and can explicitly adopt side pressure without inventing absent teammates',()=>{
 const slots=setup({top:'Jax',jungle:'Sejuani',mid:'Ahri'}),[result]=recommend({slots,champions:data.champions,scope:'party'}),original=captureCreativePlan(result,data);
 assert.equal(original.archetype,'cooperation');assert.match(original.name,/近战叠霜/);
 const plan=selectPartyRoute(original,'side-pressure');assert.equal(plan.archetype,'shared');assert.equal(plan.members.length,3);assert.equal(plan.shared.bonus,0);
 assert.match(plan.ordered.find(m=>m.champion==='Sejuani').job,/实际步行到场时间.*不假定有全图转场/);
 assert.match(plan.ordered.find(m=>m.champion==='Ahri').job,/安全中线/);
 assert.doesNotMatch(plan.steps.join(' '),/射手负责|辅助负责/);
 const persisted=validateCreativePlan(JSON.parse(JSON.stringify(plan)));assert.deepEqual(persisted,plan);
 for(const m of plan.members){const model=createGuideModel(data,{...selectGuide(null,{id:m.champion,role:m.role,mode:'rift',comboId:plan.id,creativePlan:persisted}),stage:'later'});assert.equal(model.stageHint.play.window,plan.shared.routes[0].condition);assert.equal(model.stageHint.play.exit,plan.shared.routes[0].failure);}
});
