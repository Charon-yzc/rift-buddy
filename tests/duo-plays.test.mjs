import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DUOS} from '../src/core/rules.mjs';
import {duoPlay,duoPlayText} from '../src/core/duo-plays.mjs';
import {rolePlay,BOTTOM_PLAYS,SUPPORT_PLAYS} from '../src/core/role-plays.mjs';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {heroCoach} from '../src/core/hero-coach.mjs';
import {heroCoachView} from '../src/hero-coach-view.mjs';
import {selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {duoPlayView} from '../src/duo-play-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
import {createSlots} from '../src/core/recommend.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id),duo=id=>DUOS.find(d=>d.id===id);

test('every bundled duo gives both actual member roles different actionable stages through the real build resolver',()=>{
 const before=JSON.stringify(DUOS);
 for(const d of DUOS){
  for(const [champion,role,other]of [[d.carry,'bottom',d.support],[d.support,'support',d.carry]]){
   const build=getBuild(hero(champion),role,data,{comboId:d.id}),play=build.combo?.play;
   assert.equal(build.combo?.id,d.id);assert.ok(play,d.id+':'+role);
   assert.deepEqual(build.combo.members.map(m=>m.champion),[other]);
   assert.equal(new Set(Object.values(play.stages).map(s=>s.ownAction)).size,3,d.id+':'+role);
   for(const phase of ['opening','key','later']){
    const stage=play.stages[phase];assert.ok(stage.ownAction?.trim());assert.ok(stage.steps.length>=2);assert.ok(stage.window.includes('确认')||stage.window.includes('搭档'));
    assert.ok(stage.exit?.trim());assert.notEqual(stage.steps.join('；'),d.plan);
    assert.equal(stage.ownAction,rolePlay(champion,role,phase).action);
   }
   assert.ok(play.economy);assert.ok(build.combo.steps.length>=2);assert.ok(build.combo.early);assert.ok(build.combo.window);
  }
 }
 assert.equal(JSON.stringify(DUOS),before,'Runtime task enrichment must not rewrite the curated catalog');
 for(const [role,notes]of [['bottom',BOTTOM_PLAYS],['support',SUPPORT_PLAYS]])for(const [champion,phases]of Object.entries(notes)){
  assert.ok(hero(champion),role+':'+champion);assert.equal(new Set(phases).size,3);assert.equal(hero(champion).mechanics.spells.length,4);
 }
});

test('paired mechanics keep airbornes, ball position, delayed protection and economy conditions separate',()=>{
 const get=id=>duoPlay(duo(id),data);
 assert.match(get('wind-cow').stages.key.steps.join(' '),/击飞已经|击飞已发生/);
 assert.match(get('wind-rock').stages.opening.window,/未学到大招/);
 assert.match(get('orianna-malphite').stages.key.steps.join(' '),/球没有因距离返回/);
 assert.match(get('kindred-taric').stages.key.steps.join(' '),/提前引导/);
 assert.match(get('kindred-taric').stages.key.exit,/任一大招未就绪/);
 assert.match(get('anivia-poppy').stages.key.exit,/墙方向不成立/);
 assert.match(get('sion-zilean').stages.key.steps.join(' '),/赛恩 E 踢挂弹小兵/);
 assert.match(get('naut-samira').stages.key.steps.join(' '),/S 和安全近身条件/);
 assert.match(get('cho-senna').economy,/科加斯负责下路补刀.*赛娜.*辅助/);
 const sennaCarry=DUOS.find(d=>d.carry==='Senna');assert.match(duoPlay(sennaCarry,data).economy,/赛娜负责下路补刀/);
});

test('same hero changes role and stage tasks without inventing a party member or unsupported pairing',()=>{
 const mid=heroCoach({data,champion:'Karma',role:'mid'}),support=heroCoach({data,champion:'Karma',role:'support'});
 assert.notEqual(mid.action,support.action);assert.match(mid.action,/补刀/);assert.match(support.action,/搭档/);
 assert.equal(rolePlay('Unknown','support'),null);assert.equal(rolePlay('Nautilus','mid'),null);
 const valid=duo('naut-samira');assert.equal(duoPlay({...valid,support:'Unknown'},data),null);
 assert.equal(duoPlay(valid,data,{champion:'Jinx',role:'bottom'}).ownJob,null);
 assert.equal(getBuild(hero('Nautilus'),'bottom',data,{comboId:'naut-samira'}).combo,null);
 const solo=heroCoach({data,champion:'Samira',role:'bottom',stage:'key'});assert.doesNotMatch(solo.action,/泰坦/);
 const old=heroCoach({data:{...data,patch:'16.21'},champion:'Karma',role:'support'});assert.equal(old.roleTask.stale,true);assert.match(heroCoachView(old),/旧版本分工需核对/);
});

test('guide stage, own action and displayed pair sequence agree while loadout choices remain unchanged',()=>{
 const state=selectGuide(null,{id:'Nautilus',role:'support',mode:'rift',comboId:'naut-samira'});
 const live={available:true,champion:'Nautilus',mode:'rift',mapId:11,at:Date.now(),level:7,gold:800,gameTime:600,inventory:[],skills:{Q:1,W:1,E:3,R:1}};
 const before=JSON.stringify(state),actions=[];
 for(const phase of ['opening','key','later']){
  const model=createGuideModel(data,{...state,stage:phase},live);actions.push(model.coach.action);
  assert.equal(model.coach.stage,phase);assert.equal(model.stageHint.id,phase);assert.equal(model.stageHint.text,model.coach.action);
  const html=renderGuide({model},'team',false,()=>'<img>');assert.match(html,new RegExp('data-duo-stage="'+phase+'"'));
  assert.equal((html.match(/id="guide-stage"/g)||[]).length,1);
  const own=heroCoachView(model.coach);assert.ok(own.indexOf('coach-action')<own.indexOf('coach-sequence'));assert.ok(own.indexOf('coach-action')<own.indexOf('coach-skills'));
 }
 assert.equal(new Set(actions).size,3);assert.equal(JSON.stringify(state),before);
 assert.equal(createGuideModel(data,{...state,stage:'auto'},live).coach.stage,'key');
 assert.equal(createGuideModel(data,{...state,stage:'auto'},{...live,level:5}).coach.stage,'opening');
 assert.equal(createGuideModel(data,{...state,stage:'auto'},{...live,gameTime:1000}).coach.stage,'key');
 assert.equal(createGuideModel(data,{...state,stage:'auto'},{...live,gameTime:1500}).coach.stage,'later');
});

test('custom preparation notes and old-version tasks survive display and copy',()=>{
 const original=duo('naut-samira'),custom={...original,steps:['我们的第一步','我们的第二步'],early:'我们先保线不进场',window:'我们约定的窗口',economy:'我们的经济安排',risk:'我们的限制'};
 const play=duoPlay(custom,data);assert.deepEqual(play.stages.key.steps,custom.steps);assert.deepEqual(play.stages.opening.steps,[custom.early]);assert.equal(play.window,custom.window);assert.equal(play.economy,custom.economy);assert.match(play.stages.key.exit,/我们的限制/);
 const old=duoPlay(original,{...data,patch:'16.21'});assert.equal(old.stale,true);assert.match(duoPlayText(old),/旧版本需核对/);assert.match(duoPlayView(old),/内容保留供参考/);
 const build=getBuild(hero('Nautilus'),'support',data,{comboId:original.id});const text=buildAsText(build,hero('Nautilus'),data);
 for(const term of ['开局 / 对线','关键配合','后期团战','经济分工','未经组合对局统计验证'])assert.ok(text.includes(term),term);
 assert.doesNotMatch(duoPlayText(play),/必杀|最优胜率|对手现在没技能|已经冷却/);
});

test('a custom duo outside curated role coverage retains its original plan in the actual result drawer',()=>{
 const carry=data.champions.find(c=>!BOTTOM_PLAYS[c.id]);assert.ok(carry);
 const custom={id:'custom-uncovered',carry:carry.id,support:'Janna',plan:'我们的原有说明 <script>不可执行</script>',steps:['先约定方向','一起退出'],window:'我们约定的行动窗口',early:'先守兵线',economy:'我们约定的经济分工',risk:'我们的原有风险',patch:'16.19',reviewedAt:'2026-09-01',sources:[]};
 assert.equal(duoPlay(custom,data),null);
 const slots=createSlots().map(s=>({...s,champion:s.role==='bottom'?carry.id:s.role==='support'?'Janna':null}));
 const row={title:'我们的组合',reason:'自定义配合',scope:'bot',duo:custom,slots,targets:['bottom','support'],connections:[],analysis:{warnings:[]}};
 const html=resultPlayCard(row,0,data);
 for(const text of ['尚未整理这套组合的分阶段分工','我们的原有说明','先约定方向','一起退出',custom.window,custom.early,custom.economy,custom.risk,'16.19'])assert.ok(html.includes(text),text);
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('data-duo-stage='),'Do not fabricate unsupported curated phase tasks');
});
