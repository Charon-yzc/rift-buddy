import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,validateCreativePlan,selectPartyRoute,creativePlanId} from '../src/core/creative-plan.mjs';
import {createPartyCounterplay} from '../src/core/party-counterplay.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
import {createGuideModel,selectGuide,reconcileGuide} from '../src/core/guide.mjs';
import {resultMemberJobs,resultActionsView,cooperationView} from '../src/cooperation-view.mjs';
import {resultAsText} from '../src/result-text.mjs';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const stamp='2026-10-10T16:00:00.000Z';
const setup=picks=>createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role]}));
const trio={jungle:'Gragas',mid:'Yasuo',support:'Rakan'};
function result(picks=trio,enemies=[],extra={}){return recommend({slots:setup(picks),champions:data.champions,scope:'party',visibleEnemies:enemies,...extra})[0];}
const capture=r=>captureCreativePlan(r,data,stamp);

test('public Poppy changes actual trio member actions and shared stop decisions, including Rakan return and the same-field backup',()=>{
 const r=result(trio,['Poppy']),plan=capture(r),text=resultAsText({...r,creativePlan:plan},data);
 assert.deepEqual(plan.counterplay.enemies,['Poppy']);
 assert.match(plan.counterplay.rules[0].stop,/主线与备用都受同一领域限制/);
 const jobs=resultMemberJobs({...r,creativePlan:plan},data);
 assert.match(jobs.find(m=>m.champion==='Gragas').job,/E 被挡就取消.*不能催洛 W/);
 assert.match(jobs.find(m=>m.champion==='Rakan').job,/E 回友军也是突进.*不能当必能回去/);
 assert.match(jobs.find(m=>m.champion==='Yasuo').job,/R 是闪现到实际被击飞.*一次 R/);
 assert.match(text,/主线与备用都受同一领域限制/);assert.match(text,/采用时公开对手/);assert.doesNotMatch(text,/\\n/);
 assert.ok(resultActionsView({...r,creativePlan:plan},data,{compact:true}).includes('E 被挡就取消'));
 const guide=createGuideModel(data,{...selectGuide(null,{id:'Rakan',role:'support',mode:'rift',comboId:plan.id,creativePlan:plan}),stage:'key'});
 assert.match(guide.coach.action,/W 领域未处理时不补 W/);assert.match(guide.combo.play.stages.key.exit,/主线与备用都受同一领域限制/);
});

test('Janna and Morgana give different common gates instead of inferred cooldowns, guaranteed airborne or all-damage immunity',()=>{
 const wind=capture(result(trio,['Janna'])).counterplay.rules[0],shield=capture(result(trio,['Morgana'])).counterplay.rules[0];
 assert.match(wind.window,/看到一项技能用过不等于其余反开/);assert.match(wind.stop,/R 把成员或目标推离共同覆盖.*主线与备用都先取消/);
 assert.match(shield.window,/黑盾破裂或结束后.*实际生效/);assert.match(shield.stop,/不是全伤害免疫/);
 assert.match(shield.members.find(m=>m.champion==='Yasuo').action,/没有实际击飞就不接 R/);
 assert.notEqual(wind.window,shield.window);
 const duo=capture(result({jungle:'Gragas',mid:'Orianna'},['Poppy','Morgana']));
 assert.doesNotMatch(duo.counterplay.rules.map(r=>r.members.find(m=>m.champion==='Gragas').action).join(' '),/洛|亚索/,'Counterplay must not invent absent partners');
});

test('two, four and five players get each member action and keep original opening while key/later guides obey the common gates',()=>{
 for(const picks of [{jungle:'Gragas',mid:'Yasuo'},{top:'Ornn',...trio},{top:'Ornn',...trio,bottom:'Jinx'}]){
  const plain=capture(result(picks)),r=result(picks,['Poppy','Janna','Morgana']),plan=capture(r);
  assert.deepEqual(plan.stagePlan.opening,plain.stagePlan.opening);
  assert.equal(plan.counterplay.rules.length,3);assert.equal(plan.counterplay.rules[0].members.length,Object.keys(picks).length);
  for(const m of plan.members){const guide=createGuideModel(data,{...selectGuide(null,{id:m.champion,role:m.role,mode:'rift',comboId:plan.id,creativePlan:plan}),stage:'later'});assert.match(guide.combo.play.stages.key.window,/遇到波比/);assert.match(guide.combo.play.stages.later.exit,/黑盾阻止原定控制/);assert.ok(guide.combo.ownJob.includes('若本局仍有'));}
 }
});

test('both ball routes retain Poppy constraints while Vi R remains an explicitly separate unstoppable action',()=>{
 const r=result({jungle:'Vi',mid:'Orianna',support:'Nautilus'},['Poppy']),original=capture(r);
 assert.match(original.counterplay.rules[0].window,/蔚 Q/);assert.doesNotMatch(original.counterplay.rules[0].window,/蔚 R/);
 for(const carrier of ['Vi','Nautilus']){
  const plan=selectPartyRoute(original,'ball:'+['Orianna',carrier].sort().join(':'));
  assert.deepEqual(plan.counterplay,original.counterplay);
  assert.match(plan.counterplay.rules[0].members.find(m=>m.champion==='Vi').action,/R 的不可阻挡突进另行确认实际到达/);
  const guide=createGuideModel(data,{...selectGuide(null,{id:'Orianna',role:'mid',mode:'rift',comboId:plan.id,creativePlan:plan}),stage:'key'});
  assert.match(guide.combo.play.stages.key.exit,/可中断突进的主线与备用/);
  assert.match(cooperationView({...plan.shared,counterplay:plan.counterplay},data),/共同进场与反制条件/);
 }
});

test('adoption, favorite disk, restored member choices, copy and guide reopening keep the accepted actions without new actual enemies',async()=>{
 const r=result(trio,['Poppy','Morgana']),plan=capture(r),prepared=createPreparationStore();
 for(const m of plan.members)prepared.remember({id:m.champion,role:m.role,mode:'rift',comboId:plan.id,creativePlan:plan,conditions:['ap'],summonerIds:['SummonerFlash',m.role==='jungle'?'SummonerSmite':'SummonerExhaust'],coreIndex:0});
 const configurations=captureTeamConfigurations({...r,creativePlan:plan},data,prepared),root=await fs.mkdtemp(path.resolve('.local/party-counterplay-'));
 await saveState(root,{...defaultState(),draft:{slots:r.slots,scope:'party',style:'fun',creativePlan:plan},favorites:[{id:'counterplay',type:'team',title:plan.name,slots:r.slots,scope:'party',style:'fun',createdAt:stamp,version:data.version,creativePlan:plan,configurations}]});
 const disk=await readState(root),restored=restoreTeamFavorite(disk.favorites[0],createSlots(),data.champions);assert.deepEqual(restored.creativePlan,plan);
 for(const config of restored.configurations){
  assert.deepEqual(config.conditions,['ap']);assert.ok(config.summonerIds.includes('SummonerFlash'));
  const reopened=reconcileGuide(selectGuide(null,config),{phase:'ChampSelect',gameId:'9002'}).guide;
  assert.equal(reopened.selection.threatId,undefined);assert.equal(reopened.selection.matchupGameId,undefined);
  const guide=createGuideModel(data,{...reopened,stage:'key'});assert.match(guide.coach.action,/若本局仍有/);
  const champion=data.champions.find(c=>c.id===config.id),build=getBuild(champion,config.role,data,config),text=buildAsText(build,champion,data);
  assert.match(text,/采用时公开对手.*本局仍有/);assert.match(text,/主线与备用都受同一领域限制/);
 }
});

test('changed public picks offer new counterplay without mutating accepted original jobs or stages; offline reopening retains conditional saved text',()=>{
 const accepted=capture(result(trio,['Poppy'])),before=structuredClone(accepted);
 const offered=result(trio,['Janna'],{creativePlan:accepted}),plan=capture(offered);
 assert.deepEqual(accepted,before);assert.notEqual(plan.id,accepted.id);assert.deepEqual(plan.ordered,accepted.ordered);assert.deepEqual(plan.stagePlan,accepted.stagePlan);
 assert.deepEqual(plan.counterplay.enemies,['Janna']);
 const offline=capture(result(trio,[],{creativePlan:accepted}));assert.deepEqual(offline,accepted);
 assert.match(resultAsText({...offered,creativePlan:offline},data),/若本局仍有/);
});

test('visible mirror picks remain distinct from selection bans; unknown picks and absent opponents do not invent common threats',()=>{
 assert.equal(capture(result()).counterplay,undefined);
 const visible=result(trio,['Poppy','Poppy','NotAChampion'],{enemy:[]}),plan=capture(visible);assert.deepEqual(plan.counterplay.enemies,['Poppy']);
 const mirror=capture(result({jungle:'Vi',mid:'Orianna',support:'Poppy'},['Poppy'],{enemy:[]}));assert.ok(mirror.members.some(m=>m.champion==='Poppy'));assert.deepEqual(mirror.counterplay.enemies,['Poppy']);
 assert.equal(createPartyCounterplay([{role:'top',champion:'Garen'},{role:'jungle',champion:'MasterYi'}],['Poppy'],data.champions),null);
 const poke=result({top:'Jayce',jungle:'Nidalee',support:'Lux'},['Morgana']),jobs=resultMemberJobs(poke,data);
 assert.match(jobs.find(m=>m.champion==='Nidalee').job,/可继续安全的独立消耗与输出/);
});

test('saved counterplay rejects swapped members, untrusted sources and inconsistent content identity',()=>{
 const plan=capture(result(trio,['Poppy']));
 for(const mutate of [p=>p.counterplay.rules[0].members.reverse(),p=>p.counterplay.rules[0].sources.push('https://example.com/champion.json'),p=>p.counterplay.rules[0].stop='自行改写的取消条件']){
  const broken=structuredClone(plan);mutate(broken);assert.throws(()=>validateCreativePlan(broken));
 }
 const snapshot=structuredClone(plan);snapshot.counterplay.rules[0].window='采用时保存的人工条件原文。';snapshot.id=creativePlanId(snapshot);
 assert.equal(validateCreativePlan(snapshot).counterplay.rules[0].window,'采用时保存的人工条件原文。');
});

test('Camille Jarvan and Galio cannot treat a Poppy-blocked dash as a valid shared landing point',()=>{
 const picks={top:'Camille',jungle:'JarvanIV',mid:'Galio'},r=result(picks,['Poppy']),plan=capture(r),rule=plan.counterplay.rules[0];
 assert.match(rule.window,/卡蜜尔 E 二段.*嘉文四世 E→Q.*加里奥 E/);
 assert.equal(rule.sources.length,4);assert.doesNotMatch(rule.window,/卡蜜尔 R|嘉文四世 R|加里奥 R/);
 const jobs=resultMemberJobs({...r,creativePlan:plan},data);
 assert.match(jobs.find(m=>m.champion==='Camille').job,/E 被挡或缚地时取消原定接续/);
 assert.match(jobs.find(m=>m.champion==='JarvanIV').job,/插旗不等于已击飞.*E→Q 被挡就取消/);
 assert.match(jobs.find(m=>m.champion==='Galio').job,/E 没有实际到位就停.*不能以友军突进动画/);
 assert.match(resultAsText({...r,creativePlan:plan},data),/卡蜜尔 E 二段/);
 const hweiPlan=capture(result({top:'Camille',jungle:'JarvanIV',mid:'Hwei'},['Poppy']));
 assert.match(hweiPlan.counterplay.rules[0].window,/卡蜜尔 E 二段.*嘉文四世 E→Q/);
 assert.doesNotMatch(hweiPlan.counterplay.rules[0].members.map(m=>m.action).join(' '),/加里奥/,'Counterplay cannot invent the alternate third member');
 for(const m of plan.members){const guide=createGuideModel(data,{...selectGuide(null,{id:m.champion,role:m.role,mode:'rift',comboId:plan.id,creativePlan:plan}),stage:'key'});assert.match(guide.coach.action,/W 领域未处理/);assert.match(guide.combo.play.stages.later.exit,/主线与备用/);}
});

test('Diana and Rell share the Poppy dash gate without treating moonlight resets or Rell speed as a free backup',()=>{
 const r=result({jungle:'Diana',mid:'Yasuo',support:'Rell'},['Poppy','Morgana']),plan=capture(r),poppy=plan.counterplay.rules.find(r=>r.opponent==='Poppy');
 assert.match(poppy.window,/黛安娜 E.*亚索 E.*芮尔 W 跃下/);
 assert.match(poppy.members.find(m=>m.champion==='Diana').action,/E 被挡或缚地.*不因月光或 E 刷新承诺二次进场/);
 assert.match(poppy.members.find(m=>m.champion==='Rell').action,/W 被挡就取消这次击飞.*E 是加速，不能补出击飞/);
 assert.match(plan.counterplay.rules.find(r=>r.opponent==='Morgana').members.find(m=>m.champion==='Rell').action,/Q 具破盾作用.*黑盾已解除.*实际眩晕/);
 for(const m of plan.members){const guide=createGuideModel(data,{...selectGuide(null,{id:m.champion,role:m.role,mode:'rift',comboId:plan.id,creativePlan:plan}),stage:'key'});assert.match(guide.coach.action,/W 领域未处理/);assert.match(guide.combo.play.stages.later.exit,/主线与备用/);}
});

test('public Kindred changes whole-party finish, follow-up and exit decisions without predicting an ultimate or inventing immunity',()=>{
 const picks={top:'Ornn',jungle:'Zac',mid:'Orianna',bottom:'MissFortune',support:'Leona'},r=result(picks,['Kindred']),plan=capture(r),rule=plan.counterplay.rules[0];
 assert.equal(rule.opponent,'Kindred');assert.equal(rule.members.length,5);
 assert.match(rule.window,/同时保护友军、敌军和中立单位.*并非全程伤害免疫/);
 assert.match(rule.window,/10% 生命值.*不能受伤或治疗.*结束时.*治疗/);
 assert.match(rule.stop,/取消原计划的必杀收尾.*治疗后的生命.*共同接应退出/);
 assert.match(rule.members.find(m=>m.champion==='MissFortune').action,/本轮没有第二次 R/);
 assert.match(rule.members.find(m=>m.champion==='Orianna').action,/不把聚拢等同于目标已离开保护范围/);
 for(const m of plan.members){const guide=createGuideModel(data,{...selectGuide(null,{id:m.champion,role:m.role,mode:'rift',comboId:plan.id,creativePlan:plan}),stage:'later'});assert.match(guide.coach.action,/若本局仍有千珏/);assert.match(guide.combo.play.stages.later.exit,/治疗后的生命/);}
 assert.match(resultAsText({...r,creativePlan:plan},data),/Kindred\.json/);
 const four=capture(result(picks,['Poppy','Janna','Morgana','Kindred']));assert.equal(four.counterplay.rules.length,4);assert.deepEqual(validateCreativePlan(four),four);
 const fresh=capture(result(picks,['Kindred'],{creativePlan:capture(result(picks,['Poppy']))}));assert.deepEqual(fresh.counterplay.enemies,['Kindred']);
 const pair=capture(result({jungle:'Gragas',mid:'Yasuo'},['Kindred']));assert.equal(pair.counterplay.rules[0].members.length,2);assert.doesNotMatch(pair.counterplay.rules[0].members.map(m=>m.action).join(' '),/女枪|发条|奥恩/);
});
