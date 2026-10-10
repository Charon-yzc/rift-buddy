import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {profile,PRIMARY_ROLES,conventionalRole} from '../src/core/rules.mjs';
import {analyzeTeam,createSlots,recommend} from '../src/core/recommend.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {selectBuildSource} from '../src/core/build-source.mjs';
import {summarizeEnemyTraits,describeCurve} from '../src/core/strategy.mjs';
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
 for(const id of ['Trundle','Tryndamere','Olaf','Fiora','Ryze','Ezreal','Irelia','Darius','Nasus','Warwick','XinZhao','Swain','Mordekaiser','Singed','Malzahar']){
  assert.equal(profile(hero(id)).sustain,true,id);
  assert.equal(summarizeEnemyTraits([id],data.champions).sustain,1,id);
 }
 for(const id of ['Leblanc','Talon','Malphite'])assert.equal(profile(hero(id)).sustain,false,id);
 const slots=createSlots().map(s=>({...s,champion:s.role==='top'?'Trundle':null}));
 assert.equal(analyzeTeam(slots,data.champions).traits.sustain,1);
});

test('specific control and preparation conditions agree with the same champions actual mechanism plans',()=>{
 const team=picks=>analyzeTeam(createSlots().map(s=>({...s,champion:picks[s.role]||null})),data.champions);
 const pair=team({jungle:'LeeSin',mid:'Yasuo'});assert.equal(pair.control,'有条件控制接力');assert.doesNotMatch(pair.control,/缺少/);
 const chain=team({mid:'Ahri',bottom:'Ashe',support:'Braum'});assert.equal(chain.control,'有条件控制接力');
 const early=team({top:'Darius',jungle:'LeeSin'}),growth=team({top:'Kayle',mid:'Veigar'});
 assert.notEqual(early.curve.label,growth.curve.label);assert.equal(growth.curve.label,'先保成长与装备');
 assert.match(growth.curve.windows.find(w=>w.champion==='Kayle').condition,/经验|等级/);
 const bruisers=team({top:'Darius',jungle:'Warwick',mid:'Ahri'});assert.ok(!bruisers.warnings.some(w=>w.includes('持续输出偏少')));
 assert.match(bruisers.members.find(m=>m.champion==='Darius').p.sustainCondition,/持续近身/);
 const garen=team({top:'Garen'});assert.equal(garen.curve.windows[0].kind,'base');assert.match(garen.curve.windows[0].condition,/Q.*实际接触.*E.*持续贴近.*R 未学会/);assert.deepEqual(garen.curve.unknown,[]);
 const kled=team({top:'Kled'});assert.match(kled.curve.windows[0].condition,/骑乘或下马.*勇气.*W.*下马不能.*Q\/E\/R/);
 const unknown=describeCurve({},[{champion:'FutureUnreviewed',c:{name:'未整理英雄'},p:profile({...hero('Kled'),id:'FutureUnreviewed'})}]);
 assert.equal(unknown.label,'阶段条件未整理');assert.deepEqual(unknown.windows,[]);assert.deepEqual(unknown.unknown,['未整理英雄']);
});

test('all members retain distinct readiness and failure conditions instead of a shared control gate',()=>{
 const team=picks=>analyzeTeam(createSlots().map(s=>({...s,champion:picks[s.role]||null})),data.champions);
 const scaling=team({top:'Taric',jungle:'Udyr',mid:'Anivia'});
 assert.deepEqual(scaling.curve.windows.map(w=>w.champion),['Taric','Udyr','Anivia']);
 assert.match(scaling.curve.windows[0].condition,/真实连接.*Q 当前充能.*延迟.*真正生效.*先撤/);
 assert.match(scaling.curve.windows[1].condition,/当前姿态.*觉醒.*两次普攻.*攻击距离断开/);
 assert.match(scaling.curve.windows[2].condition,/Q 实际爆开眩晕.*R 已学会并完全形成.*资源不足/);
 const duo=team({bottom:'Xayah',support:'Yuumi'});
 assert.match(duo.curve.windows[0].condition,/实际羽毛.*回收线.*未来羽毛/);
 assert.match(duo.curve.windows[1].condition,/实际附身对象.*E 按护盾.*不能当直接治疗.*不按旧版禁锢/);
 const five=team({top:'Yorick',jungle:'Viego',mid:'Yone',bottom:'Zeri',support:'Zilean'});
 assert.deepEqual(five.curve.unknown,[]);assert.equal(five.curve.windows.length,5);
 for(const [index,pattern] of [/实际墓穴.*召唤物不在覆盖/,/真实出现可附身躯体/,/肉身位置.*返回点被占/,/当前 E 穿透.*退路被占/,/保护期间真实遭遇致命伤害/].entries())assert.match(five.curve.windows[index].condition,pattern);
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

test('range damage functions do not turn counted initiators into a guaranteed control chain',()=>{
 for(const id of ['Lissandra','Taliyah','JarvanIV','Hecarim','Garen','Syndra'])assert.equal(profile(hero(id)).aoe,true,id);
 const slots=createSlots().map(s=>({...s,champion:({top:'Garen',mid:'Taliyah'})[s.role]||null}));
 assert.equal(analyzeTeam(slots,data.champions).traits.aoe,2);
 const counted=analyzeTeam(createSlots().map(s=>({...s,champion:({top:'Garen',jungle:'Hecarim',mid:'Lissandra'})[s.role]||null})),data.champions);
 assert.doesNotMatch(counted.control,/控制链完整/);assert.match(counted.control,/衔接条件待确认/);
});
