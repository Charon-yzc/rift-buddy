// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BUNDLED_CATALOG,validateCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {dependencyChanges} from '../src/core/catalog-review.mjs';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {COOPERATION_SKILLS} from '../src/core/cooperation-skills.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {createSlots} from '../src/core/recommend.mjs';
const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json'));
data.builds=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/builds.json')).entries;
const hero=id=>data.champions.find(h=>h.id===id);
const conditions={
 'kindred-taric-yasuo':[/10%.*不能.*治疗/,/E 眩晕不能触发亚索 R/,/未衔接成功就撤/],
 'diana-ori-rell':[/球实际到达/,/W 在承伤前开/,/R 拖曳不能当持续眩晕/,/球返回.*停止深入/],
 'kennen-amumu-mf':[/实际三层才.*眩晕/,/E 结束.*攻速/,/打断者靠近就取消引导/],
 'ashe-varus-maokai':[/R 是禁锢/,/扩散.*实际触及/,/Q 蓄力会减速自己/,/共同撤回/],
 'ahri-ashe-braum':[/实际四层才眩晕/,/技能伤害不帮叠普攻层数/,/魅惑被挡.*停追/],
 'jarvan-varus-ashe':[/单独 Q 与 R 围墙.*不能/,/再次施放 R 主动拆墙/],
 'kennen-viktor-braum':[/1\.25 秒才眩晕/,/布隆.*留在维克托/,/后排被绕.*转守/],
 'expand-kindred-nilah-taric':[/10%.*不能继续治疗/,/R 经过 1 秒.*结束段拉拢/,/保护未衔接.*撤出/],
 'expand-diana-samira-rakan':[/实际 S 评级/,/E 不能跳友军/,/本人造成伤害后 3 秒内该英雄死亡才刷新 E，含有效助攻/,/尚未死亡就不预支/],
 'expand-poppy-smolder-braum':[/飞行时不可选取/,/未有对应层数就没有升级 Q/,/R.*经过自己.*治疗自己/,/回城时比较暴击输出与生存需求/],
 'expand-galio-lucian-nami':[/区域护盾仅挡魔法伤害/,/落点不会追踪卢锡安后续 E/,/E 减速本身不是定身/],
 'expand-graves-swain-taric':[/护甲与魔抗/,/烟幕.*不沉默/,/E 返回段实际禁锢/,/吸取不到英雄.*收缩/]
};

test('reviewed trios have current dependencies while unrelated pending reviews stay visible',()=>{
 validateCatalog(BUNDLED_CATALOG,data);const issues=catalogIssues(BUNDLED_CATALOG,data);
 for(const id of Object.keys(conditions)){
  const t=BUNDLED_CATALOG.trios.find(t=>t.id===id);
  assert.equal(t.patch,data.patch,id);assert.equal(t.reviewedAt,'2026-10-12',id);
  assert.deepEqual(dependencyChanges(t,BUNDLED_CATALOG,data),[],id);
  assert.equal(issues.status[id].stale,false,id);
  for(const m of t.members)assert(t.sources.some(s=>s.url===`https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/${m.champion}.json`),m.champion);
 }
 assert.equal(issues.loadoutStatus['onhit-carry'].stale,true);
 assert(issues.reviewTasks.some(t=>!Object.hasOwn(conditions,t.id)));
});

test('member builds and copied plans retain actual timing, control types and cancellation conditions',()=>{
 for(const [id,patterns]of Object.entries(conditions)){
  const t=BUNDLED_CATALOG.trios.find(t=>t.id===id);
  const slots=createSlots().map(s=>({...s,party:t.members.some(m=>m.role===s.role),champion:t.members.find(m=>m.role===s.role)?.champion||null,locked:t.members.some(m=>m.role===s.role)}));
  const plan=captureCreativePlan({id,title:t.name,slots,scope:'party',targets:[],trio:t},data);
  assert(plan);
  const text=t.members.map(m=>{
   const b=getBuild(hero(m.champion),m.role,data,{comboId:plan.id,creativePlan:plan});
   assert.equal(b.loadoutId,m.loadoutId);
   assert.deepEqual(b.combo.steps,t.steps);
   assert.equal(b.combo.ownJob,m.job);
   return buildAsText(b,hero(m.champion),data);
  }).join('\n');
  for(const pattern of patterns)assert.match(text,pattern,id);
 }
});

test('current Stormraider descriptions require the damage threshold in both dependent configurations',()=>{
 const actual=data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes)).find(r=>r.id===8230);
 assert.match(actual.longDesc,/25%/);
 for(const [id,role,loadoutId]of [['Maokai','jungle','trio-jungle-frontline'],['Galio','mid','trio-galio-engage']]){
  const initial=getBuild(hero(id),role,data,{loadoutId}),option=initial.runeOptions.find(r=>r.source==='机制整理'&&r.page.selectedPerkIds[0]===8230);
  assert(option);
  const b=getBuild(hero(id),role,data,{loadoutId,runeId:option.id});
  assert.match(b.configurationNote,/3 秒内.*25% 最大生命值伤害/);
  assert.match(b.selectedRune.when,/25% 最大生命值伤害/);
  assert.match(b.selectedRune.name,/风暴掠袭者/);
  assert.match(buildAsText(b,hero(id),data),/25% 最大生命值伤害/);
 }
});

test('default source equipment, rune, skills and D/F order are preserved for the reviewed default members',()=>{
 for(const [id,role,comboId]of [['Smolder','bottom','expand-poppy-smolder-braum'],['Kennen','top','kennen-amumu-mf'],['Graves','jungle','expand-graves-swain-taric'],['Kindred','jungle','kindred-taric-yasuo']]){
  const solo=getBuild(hero(id),role,data),combo=getBuild(hero(id),role,data,{comboId});
  assert.deepEqual(combo.items.map(i=>i.id),solo.items.map(i=>i.id),id);
  assert.deepEqual(combo.runePage.selectedPerkIds,solo.runePage.selectedPerkIds,id);
  assert.deepEqual(combo.summoners,solo.summoners,id);
  assert.equal(combo.skillOrder,solo.skillOrder,id);
 }
});

test('general cooperation retains the same protection and exit boundaries',()=>{
 assert.match(COOPERATION_SKILLS.Graves.join(' '),/护甲与魔抗/);
 assert.match(COOPERATION_SKILLS.Kindred.join(' '),/10%.*不能继续治疗/);
 assert.match(COOPERATION_SKILLS.Viktor.join(' '),/1\.25 秒/);
 assert.match(COOPERATION_SKILLS.Galio.join(' '),/落点不跟随友军后续位移/);
 assert.match(COOPERATION_SKILLS.Samira.join(' '),/S 评级/);
 assert.match(COOPERATION_SKILLS.Samira.join(' '),/本人造成伤害后 3 秒内该英雄死亡才刷新 E，含有效助攻/);
 assert.match(COOPERATION_SKILLS.Samira.join(' '),/尚未死亡就不预支/);
 assert.match(BUNDLED_CATALOG.loadouts.find(l=>l.id==='samira-reset').why,/本人造成伤害后 3 秒内该英雄死亡才刷新 E，含有效助攻/);
 assert.match(COOPERATION_SKILLS.Poppy.join(' '),/飞行中不可选取/);
 assert.match(COOPERATION_SKILLS.Smolder.join(' '),/不治疗队友/);
});
