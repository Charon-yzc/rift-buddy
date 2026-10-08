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
 assert.equal(matchupPlan({data,champion:'Nautilus',role:'support',enemyId:'Zed'}),null);
 assert.ok(matchupPlan({data,champion:'Samira',role:'bottom',enemyId:'Samira'}),'Blind-pick mirror champions are valid');
 assert.notEqual(matchupTargetKey({id:'Nautilus',role:'support',mode:'rift',comboId:'naut-samira'}),matchupTargetKey({id:'Nautilus',role:'support',mode:'rift'}));
});
