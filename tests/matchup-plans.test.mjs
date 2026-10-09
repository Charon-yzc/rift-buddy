import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getBuild} from '../src/core/builds.mjs';
import {heroCoach} from '../src/core/hero-coach.mjs';
import {MATCHUP_RULES,matchupPlan,publicMatchupOpponent,matchupTargetKey} from '../src/core/matchup-plans.mjs';
import {createGuideModel,selectGuide,reconcileGuide} from '../src/core/guide.mjs';
import {companionPlanView} from '../src/companion-view.mjs';
import {heroCoachView} from '../src/hero-coach-view.mjs';
import {matchupTargetView} from '../src/matchup-plan-view.mjs';

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);

test('the same Nautilus/Samira preparation gets distinct own action plans for Black Shield, disengage and attachment',()=>{
 const combo=getBuild(hero('Nautilus'),'support',data,{comboId:'naut-samira'}).combo;
 assert.equal(combo.id,'naut-samira');assert.deepEqual(combo.members.map(m=>[m.champion,m.role]),[['Samira','bottom']]);
 const coaches=['Morgana','Janna','Yuumi'].map(enemyId=>heroCoach({data,champion:'Nautilus',role:'support',enemyId,combo}));
 assert.equal(new Set(coaches.map(c=>c.action)).size,3);
 assert.equal(new Set(coaches.map(c=>c.sequence)).size,3);
 assert.match(coaches[0].sequence,/黑盾已消失/);assert.match(coaches[0].sequence,/黑盾目标当已经被控住/);
 assert.match(coaches[1].sequence,/Q.*打断.*W 不能阻止风女 R/);
 assert.match(coaches[2].sequence,/同一宿主/);assert.match(coaches[2].matchup.equipment,/重伤减少治疗，不减少 E 护盾/);
 for(const c of coaches){assert.match(c.sequence,/玩家确认/);assert.match(heroCoachView(c),/出装与符文的取舍/);assert.match(heroCoachView(c,{compact:true}),new RegExp('遇到'+c.enemy.name));}
});

test('the Samira solo plan does not invent a controller, and guide stage choices select conditional opening/fight tasks',()=>{
 const solo=heroCoach({data,champion:'Samira',role:'bottom',enemyId:'Janna',stage:'fight'});
 assert.match(solo.action,/W 不能阻止风女 R/);assert.equal(solo.matchup.comboTitle,null);assert.doesNotMatch(solo.sequence,/泰坦/);
 const state=selectGuide(null,{id:'Samira',role:'bottom',mode:'rift',threatId:'Janna'});
 const live={available:true,champion:'Samira',mode:'rift',mapId:11,queueId:420,at:Date.now(),level:7,gold:800,gameTime:1000,inventory:[],skills:{Q:3,W:1,E:1,R:1},enemies:[{id:'Janna',name:'迦娜',level:7,items:[],itemsKnown:true}],allies:[]};
 const opening=createGuideModel(data,{...state,stage:'opening'},live),fight=createGuideModel(data,{...state,stage:'later'},live);
 assert.equal(opening.coach.stage,'opening');assert.equal(fight.coach.stage,'later');assert.notEqual(opening.coach.action,fight.coach.action);
});

test('public target identity cannot reveal unknown, missing, unselected or previous-game enemies',()=>{
 assert.equal(publicMatchupOpponent(data,['Janna'],'Morgana'),null);
 assert.equal(publicMatchupOpponent(data,['Unknown'],'Unknown'),null);
 assert.equal(publicMatchupOpponent(data,['Janna'],''),null);
 assert.equal(publicMatchupOpponent(data,['Janna'],'Janna').id,'Janna');
 const selection={id:'Nautilus',role:'support',mode:'rift',threatId:'Morgana'};
 const state=selectGuide(null,selection),live={available:true,champion:'Nautilus',mode:'rift',mapId:11,at:Date.now(),level:7,gold:800,gameTime:900,inventory:[],skills:{Q:1,W:1,E:3,R:1},enemies:[{id:'Morgana',level:7,items:[]}],allies:[]};
 assert.equal(createGuideModel(data,state,live).coach.matchup.enemy.id,'Morgana');
 assert.equal(createGuideModel(data,state,{...live,enemies:[]}).coach.matchup,null);
 assert.equal(createGuideModel(data,state,{...live,available:false}).coach.matchup,null);
 assert.equal(createGuideModel(data,selectGuide(null,{...selection,threatId:undefined}),live).coach.matchup,null);
 const next=reconcileGuide({...state,match:{gameId:'101',phase:'InProgress',entered:true}},{phase:'InProgress',gameId:'102',live});
 assert.equal(next.guide.selection.threatId,undefined);assert.equal(createGuideModel(data,next.guide,live).coach.matchup,null);
});

test('side preparation only renders an explicitly chosen public opponent and keeps actual selected core and runes intact',()=>{
 const selection={id:'Samira',role:'bottom',mode:'rift',comboId:'naut-samira',coreIndex:1,conditions:[]};
 const build=getBuild(hero(selection.id),selection.role,data,selection),plan={selection,build};
 const before=structuredClone(plan);
 const html=companionPlanView(data,plan,[],{enemyIds:['Morgana','Janna','Yuumi'],opponentId:'Janna'});
 assert.match(html,/data-matchup-enemy="Janna"/);assert.doesNotMatch(html,/data-matchup-enemy="Morgana"/);
 assert.match(html,/data-matchup-target/);assert.match(html,/未指定 · 不猜对线/);
 assert.match(html,/当前搭配摘要/);assert.match(html,/查看当前完整符文页/);
 const summary=html.slice(html.indexOf('companion-plan-summary'),html.indexOf('companion-row-actions'));
 for(const i of build.items.slice(0,3))assert.ok(summary.includes(i.name),i.name);
 assert.deepEqual(plan,before,'A condition plan must not change or apply the loadout');
 assert.doesNotMatch(companionPlanView(data,plan,[],{enemyIds:['Morgana'],opponentId:'Janna'}),/data-matchup-enemy="Janna"/);
 assert.equal(matchupTargetView(data,{...selection,mode:'hex'},['Janna'],'Janna'),'');
 const hex={selection:{...selection,mode:'hex'},build:getBuild(hero(selection.id),selection.role,data,{mode:'hex'})};
 assert.doesNotMatch(companionPlanView(data,hex,[],{enemyIds:['Janna'],opponentId:'Janna'}),/data-matchup-target|data-matchup-enemy/);
});

test('curated enemy rules have usable current skill evidence and preserve old-version warnings without claiming optimality',()=>{
 assert.ok(Object.keys(MATCHUP_RULES).length>=16);
 for(const id of Object.keys(MATCHUP_RULES)){
  const plan=matchupPlan({data,champion:'Nautilus',role:'support',enemyId:id});
  for(const key of plan.skillKeys)assert.ok(hero(id).mechanics.spells['QWER'.indexOf(key)]?.description,id+':'+key);
  assert.ok(plan.sequence.length===3);assert.ok(plan.equipment&&plan.runes&&plan.exit,id);
  assert.doesNotMatch(JSON.stringify(plan),/必胜|最佳胜率|胜率提升|敌方技能已经冷却|对手现在没技能/);
  assert.ok(plan.sourceUrls.every(url=>url.startsWith('https://ddragon.leagueoflegends.com/cdn/'+data.version+'/')));
  assert.equal(matchupPlan({data:{...data,patch:'17.1'},champion:'Nautilus',role:'support',enemyId:id}).stale,true);
 }
 assert.equal(matchupPlan({data,champion:'Nautilus',role:'support',enemyId:'Unknown'}),null);
 assert.ok(matchupPlan({data,champion:'Nautilus',role:'support',enemyId:'Zed'}));
 assert.ok(matchupPlan({data,champion:'Samira',role:'bottom',enemyId:'Samira'}),'Blind-pick mirror champions are valid');
 assert.notEqual(matchupTargetKey({id:'Nautilus',role:'support',mode:'rift',comboId:'naut-samira'}),matchupTargetKey({id:'Nautilus',role:'support',mode:'rift'}));
});

test('a focused opponent adds constraints without replacing four different champions with a generic control actor',()=>{
 const cases=[['LeeSin','jungle',/Q命中.*安全时二段/,/两次普攻回能/],['Yuumi','support',/附身/,/E/],['Soraka','support',/Q/,/W/],['Nautilus','support',/被动/,/Q/]];
 for(const [id,role,sequence,action] of cases)for(const enemyId of ['Darius','Morgana']){
  const baseline=heroCoach({data,champion:id,role}),focused=heroCoach({data,champion:id,role,enemyId});
  assert.match(focused.sequence,sequence,id);assert.match(focused.action,action,id);assert.ok(focused.action.startsWith(baseline.action));
  assert.match(focused.sequence,/玩家确认/);assert.ok(focused.caution.includes(focused.matchup.exit));
  assert.doesNotMatch(focused.sequence,/你先控制靠近搭档/);
 }
});

test('common mid and bottom targets have concrete windows, exits and existing complete-rune tradeoffs',()=>{
 for(const [id,role,enemyId,window,tradeoff] of [['Ahri','mid','Zed',/影子/,/电刑/],['Ezreal','bottom','Caitlyn',/夹子/,/强攻/],['Jinx','bottom','Nautilus',/Q.*路径/,/致命节奏/]]){
  const coach=heroCoach({data,champion:id,role,enemyId});assert.ok(coach.matchup,id);
  assert.match(coach.matchup.sequence[0],window);assert.match(coach.matchup.runes,tradeoff);
  assert.match(coach.matchup.equipment,/代价/);assert.ok(coach.matchup.exit);assert.ok(!coach.matchup.stale);
  const selection={id,role,mode:'rift',conditions:[],coreIndex:0},build=getBuild(hero(id),role,data,selection),before=structuredClone(build.runePage);
  const view=companionPlanView(data,{selection,build},[],{enemyIds:[enemyId],opponentId:enemyId});
  assert.match(view,new RegExp('data-matchup-enemy="'+enemyId+'"'));assert.deepEqual(build.runePage,before);
 }
});

test('jungle isolation, parry and mobile mage paths retain own actions and distinguish dedicated from generic plans',()=>{
 for(const [id,role,enemyId,limit] of [['LeeSin','jungle','Khazix',/孤立/],['Aatrox','top','Fiora',/W/],['Nautilus','support','Ahri',/R/]]){
  const coach=heroCoach({data,champion:id,role,enemyId});assert.equal(coach.matchup.generic,false);assert.match(coach.matchup.reason,limit);assert.ok(coach.sequence.includes('玩家确认'));
  assert.ok(coach.matchup.equipment&&coach.matchup.runes&&coach.matchup.exit);assert.ok(!coach.matchup.stale);
 }
 const generic=heroCoach({data,champion:'Ahri',role:'mid',enemyId:'Akali'});
 assert.equal(generic.matchup.generic,true);assert.match(generic.matchup.reason,/对方机制限制/);assert.match(generic.matchup.sequence[0],/玩家确认/);
 assert.match(heroCoachView(generic,{compact:true}),/专门对位尚未整理/);assert.match(generic.sequence,/E/);
 assert.doesNotMatch(generic.matchup.reason,/胜率提升|对方现在没有技能/);
});

test('every dedicated enemy rule keeps own champion and position additions out of unrelated preparations',()=>{
 const actors={Garen:'盖伦',LeeSin:'李青',Aatrox:'剑魔',Nautilus:'泰坦',Ahri:'阿狸',Ezreal:'伊泽瑞尔',Jinx:'金克丝'};
 const pairs=[['Garen','top'],['Lux','support'],['Veigar','mid'],['Ashe','bottom'],['LeeSin','jungle'],['Aatrox','top'],['Nautilus','support'],['Ahri','mid'],['Ezreal','bottom'],['Jinx','bottom']];
 for(const [id,role] of pairs)for(const enemyId of Object.keys(MATCHUP_RULES)){
  const coach=heroCoach({data,champion:id,role,enemyId});
  const text=[coach.matchup.opening,coach.matchup.fight,coach.matchup.exit,coach.matchup.equipment,coach.matchup.runes,...coach.matchup.sequence].join(' ');
  for(const [actor,name]of Object.entries(actors))if(actor!==id&&actor!==enemyId)assert.ok(!text.includes(name),`${id}/${role} against ${enemyId} imported ${actor}`);
 }
 assert.doesNotMatch(heroCoach({data,champion:'Ashe',role:'bottom',enemyId:'Fiora'}).matchup.exit,/三个 Q/);
 const support=heroCoach({data,champion:'Ahri',role:'support',enemyId:'Zed'});
 assert.doesNotMatch(support.matchup.runes,/阿狸 E|电刑爆发页/,'A mid-specific note must not leak into another own position');
 const coach=heroCoach({data,champion:'Garen',role:'top',enemyId:'Ahri'}),html=heroCoachView(coach);
 assert.doesNotMatch(html,/泰坦 Q|泰坦已有余震/);
 const selection={id:'Garen',role:'top',mode:'rift'},build=getBuild(hero('Garen'),'top',data,selection);
 assert.doesNotMatch(companionPlanView(data,{selection,build},[],{enemyIds:['Ahri'],opponentId:'Ahri'}),/泰坦 Q|泰坦已有余震/);
});

test('five high-risk top opponents produce distinct Garen entry, failure and retreat plans with existing complete-page tradeoffs',()=>{
 const cases=[['Jax',/E.*闪避.*眩晕/,/先等反击结束.*Q/,/反击|E 范围/],['Tryndamere',/R 免死已经结束/,/自己的 R.*免死/,/开启 R/],['Vayne',/E.*地形/,/Q.*不靠墙/,/击退|撞墙/],['Renekton',/W.*怒气.*二段 E/,/强化 W.*破盾/,/红怒 W/],['Tristana',/E 炸弹.*R.*安全路线/,/炸弹.*长追/,/W.*再次/]];
 const sequences=[];
 for(const [enemyId,window,start,exit] of cases){
  const coach=heroCoach({data,champion:'Garen',role:'top',enemyId,stage:'key'}),m=coach.matchup;
  assert.equal(m.generic,false);assert.equal(m.coverage,'pair');assert.match(m.sequence[0],window);assert.match(m.sequence[1],start);assert.match(m.exit,exit);
  assert.match(m.runes,/盖伦.*完整页|盖伦.*风暴掠袭者的狂涌/);assert.match(m.runes,/代价/);assert.match(m.equipment,/代价/);assert.ok(m.runeCondition&&m.equipmentCondition);sequences.push(m.sequence[1]);
  const support=heroCoach({data,champion:'Garen',role:'support',enemyId}).matchup;assert.equal(support.coverage,'enemy');assert.doesNotMatch(support.runes,/盖伦上单|盖伦已有/);
 }
 assert.equal(new Set(sequences).size,cases.length);
 assert.equal(heroCoach({data,champion:'Garen',role:'top',enemyId:'Akali'}).matchup.coverage,'generic');
 const future=heroCoach({data,champion:'Garen',role:'top',enemyId:'Tryndamere',ownSkills:{Q:1,W:1,E:3,R:0}});assert.ok(future.unlearned.includes('R'));assert.ok(future.futureSequence);assert.doesNotMatch(future.sequence,/自己的 R/);assert.match(future.futureSequence,/自己的 R/);
});
