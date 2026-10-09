import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {heroCoach,HERO_PLAYS,HERO_PLAYS_PATCH} from '../src/core/hero-coach.mjs';
import {heroCoachView} from '../src/hero-coach-view.mjs';
import {selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {profile} from '../src/core/rules.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
test('a future skill snapshot does not relabel existing manual action notes as reviewed',()=>{
 const current=heroCoach({data,champion:'Ahri',role:'mid'});
 const next=heroCoach({data:{...data,patch:'16.21',version:'16.21.1'},champion:'Ahri',role:'mid'});
 assert.equal(next.action,current.action);assert.equal(next.actionPatch,HERO_PLAYS_PATCH);assert.equal(next.patch,'16.21');assert.equal(next.actionStale,true);
 assert.match(heroCoachView(next),/行动笔记 16\.20 · 旧版本/);assert.match(heroCoachView(next),/技能快照 16\.21/);
 assert.equal(current.actionStale,false);
});
test('every curated action note belongs to a bundled hero and all heroes retain distinct official skill references',()=>{
 for(const id of Object.keys(HERO_PLAYS))assert.ok(data.champions.some(c=>c.id===id),'Unreachable action notes: '+id);
 for(const champion of data.champions){const coach=heroCoach({data,champion,role:'mid',priority:null});assert.equal(coach.skills.length,4,champion.id);assert.ok(coach.passive?.name,champion.id);assert.equal(coach.sourceUrl,`https://ddragon.leagueoflegends.com/cdn/${data.version}/data/zh_CN/champion/${champion.id}.json`);assert.equal(new Set(coach.skills.map(s=>s.key)).size,4);}
 assert.ok(new Set(Object.values(HERO_PLAYS).map(p=>p[0])).size>40,'Action notes should not collapse into a few archetype templates');
});
test('Yone, Cho jungle, Soraka and Corki preparation distinguish actual champion conditions',()=>{
 const yone=heroCoach({data,champion:'Yone',role:'mid',stage:'fight'});assert.match(yone.action,/E本体/);assert.match(yone.sequence,/安全回身/);
 const cho=heroCoach({data,champion:'Chogath',role:'jungle'});assert.match(cho.caution,/惩戒/);assert.match(cho.sequence,/Q命中/);
 const soraka=heroCoach({data,champion:'Soraka',role:'support'});assert.match(soraka.caution,/自身生命/);assert.match(soraka.opening,/Q命中/);
 const corki=heroCoach({data,champion:'Corki',role:'mid'});assert.equal(corki.curated,true);assert.ok(corki.skills.some(s=>s.name==='格林机枪'));assert.match(corki.opening,/E.*削双抗/);assert.doesNotMatch(heroCoachView(corki),/领取炸药包|运输机补给/);
});
test('each bundled champion has its own actionable opening, teamfight, sequence and failure condition',()=>{
 for(const champion of data.champions){
  const opening=heroCoach({data,champion,role:'mid',stage:'opening'}),fight=heroCoach({data,champion,role:'mid',stage:'fight'});
  assert.equal(opening.curated,true,champion.id);
  assert.equal(opening.action,opening.opening,champion.id);
  assert.equal(fight.action,opening.fight,champion.id);
  for(const key of ['opening','fight','sequence','caution'])assert.ok(typeof opening[key]==='string'&&opening[key].trim(),`${champion.id}: ${key}`);
 }
 for(let field=0;field<4;field++)assert.equal(new Set(Object.values(HERO_PLAYS).map(p=>p[field])).size,data.champions.length,`Repeated action field ${field}`);
});
test('form changes and upgraded abilities retain their actual prerequisites',()=>{
 const get=id=>heroCoach({data,champion:id,role:profile(data.champions.find(c=>c.id===id)).roles[0]});
 assert.match(get('Aphelios').caution,/E只是武器队列/);
 assert.match(get('Aurora').caution,/R是减速区域/);
 assert.match(get('Gnar').caution,/巨型形态.*推墙才眩晕/);
 assert.match(get('Hwei').caution,/同组共享冷却.*WE之后不能马上再用WW/);
 assert.match(get('KSante').caution,/全盛W当眩晕/);
 assert.match(get('Naafiri').fight,/R冲向英雄.*W不可被选取/);
 assert.match(get('Shyvana').opening,/W护盾.*范围爆炸/);
 assert.match(get('Yunara').opening,/普攻积累灵蕴.*达到可用条件/);
 assert.match(get('Yunara').caution,/普通E不能穿墙冲刺/);
 assert.match(get('Yuumi').caution,/E是护盾.*R没有.*禁锢/);
 assert.match(get('Locke').fight,/安全拾法器才永久强化阈值/);
 assert.match(get('Zaahen').opening,/只有打敌方英雄才积累果决/);
});
test('marks, shield timing and cooldown reductions cannot become unconditional combo guarantees',()=>{
 const get=id=>heroCoach({data,champion:id,role:profile(data.champions.find(c=>c.id===id)).roles[0]});
 assert.match(get('Kaisa').caution,/Q不叠电浆.*R需要带电浆英雄/);
 assert.match(get('Akali').sequence,/穿过圆环.*强化普攻/);
 assert.match(get('Sejuani').opening,/Q用于位移击飞而非叠层/);
 assert.match(get('Sejuani').sequence,/W两击\/普攻叠四层.*E冻结/);
 assert.match(get('MasterYi').caution,/只免疫减速.*不保证技能立刻刷新/);
 assert.match(get('Katarina').fight,/缩短技能冷却.*实际就绪/);
 assert.match(get('Jax').fight,/R\s*主动要(?:实际)?命中英雄/);
 assert.match(get('Tristana').caution,/塔\/小兵上爆炸不保证W刷新/);
 assert.match(get('Zilean').caution,/W不缩短R冷却/);
 assert.match(get('Sylas').caution,/W打非英雄不治疗/);
 assert.match(get('TahmKench').caution,/Q眩晕会消耗三层/);
 assert.match(get('Kindred').caution,/R同时保护敌人和中立单位/);
});
test('junglers teach their own attack, area damage and sustain cycles without prescribing a fixed clear route',()=>{
 const opening=id=>heroCoach({data,champion:id,role:'jungle'}).opening;
 assert.match(opening('LeeSin'),/两次普攻回能.*E范围伤害.*W二段全能吸血/);
 assert.match(opening('XinZhao'),/第三击治疗.*Q三击缩短/);
 assert.match(opening('Warwick'),/低生命.*被动回复/);
 assert.match(opening('Vi'),/穿透目标身后.*同一目标.*W破甲/);
 assert.match(opening('Viego'),/普攻兑现二次打击与治疗/);
 assert.match(opening('Nocturne'),/普攻缩短被动范围攻击冷却.*治疗/);
 assert.match(opening('Amumu'),/受到普攻会缩短E冷却/);
 assert.match(opening('Diana'),/第三击范围伤害.*Q月光标记后E/);
 assert.match(opening('Elise'),/人形Q.*换蜘蛛.*蜘蛛W普攻续航/);
 assert.match(opening('Ivern'),/非史诗.*种植.*成长后送走/);
 assert.match(opening('Fiddlesticks'),/W覆盖多个单位.*完整吸取/);
 assert.match(opening('Graves'),/普攻击退野怪.*Q碰墙/);
 for(const plan of Object.values(HERO_PLAYS))assert.doesNotMatch(plan.join(' '),/必须红开|必须蓝开|最优刷野路线|对手现在没技能|敌方技能已经冷却/);
});
test('enemy coaching is attached only to an explicit public opponent and cannot reveal a vanished target',()=>{
 const selection={id:'Ashe',role:'bottom',mode:'rift',threatId:'Zed'},state=selectGuide(null,selection);
 const live={available:true,champion:'Ashe',mode:'rift',mapId:11,queueId:420,at:Date.now(),level:7,gold:800,gameTime:900,inventory:[],skills:{Q:1,W:3,E:1,R:1},enemies:[{id:'Zed',name:'劫',level:7,items:[],itemsKnown:true}],allies:[]};
 const model=createGuideModel(data,state,live);assert.equal(model.coach.enemy.id,'Zed');assert.equal(model.coach.stage,'key');
 const missing=createGuideModel(data,state,{...live,enemies:[]});assert.equal(missing.coach.enemy,null);
 const html=renderGuide({model},'team',false,()=>'<img>');assert.match(html,/已选对手 · 劫/);assert.match(html,/自己怎么打/);
 const unselected=createGuideModel(data,selectGuide(null,{...selection,threatId:undefined}),live);assert.equal(unselected.coach.enemy,null);
});
test('a solo guide always exposes champion coaching, while Hex does not inherit Rift tactics',()=>{
 const model=createGuideModel(data,selectGuide(null,{id:'Garen',role:'top',mode:'rift'}));assert.equal(model.combo,null);
 const html=renderGuide({model},'team',false,()=>'<img>');assert.match(html,/data-tab="team"/);assert.match(html,/英雄机制|技能机制/);assert.match(html,/盖伦/);
 const hex=createGuideModel(data,selectGuide(null,{id:'Garen',role:'top',mode:'hex'}));assert.equal(hex.coach,null);assert.doesNotMatch(renderGuide({model:hex},'overview',false,()=>'<img>'),/data-tab="team"/);
});
