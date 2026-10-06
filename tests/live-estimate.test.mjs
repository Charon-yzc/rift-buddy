import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {aggregateCombatStats,applyLivePanel,canUseCombatSpells,duel,killThreshold} from '../src/core/live-estimate.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {panelStats} from '../services/live-client.mjs';
import {renderGuide} from '../src/guide-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
data.spellbook=JSON.parse(await fs.readFile('data/spells.json','utf8')).champions;
const champion=id=>data.champions.find(c=>c.id===id);
const own=champion('Ashe'),enemy=champion('Jinx'),level=9,skills={Q:4,W:2,E:2,R:1};
const guide=selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift',conditions:[],coreIndex:0});
const fresh=()=>({available:true,champion:'Ashe',mode:'rift',mapId:11,inventory:[],gold:1200,level,skills,at:Date.now(),gameTime:400,
 stats:{ad:120,ap:0,armor:50,mr:40,atkSpeed:1,crit:0,hp:650,maxHp:1700},
 enemies:[{id:'Soraka',name:champion('Soraka').name,level,items:[]},{id:'Zed',name:champion('Zed').name,level,items:[{id:'6692',count:1}]}]});

test('public defensive purchases reduce outgoing estimates and actual panel resists reduce incoming estimates',()=>{
 const agg=aggregateCombatStats(own,level,[],data);
 const base=duel(own,level,agg,skills,enemy,level,data,[]);
 const armor=duel(own,level,agg,skills,enemy,level,data,[{id:'1029',count:1}]);
 const mr=duel(own,level,agg,skills,enemy,level,data,[{id:'1033',count:1}]);
 assert.ok(armor.killMine<base.killMine);assert.ok(mr.killMine<base.killMine);
 const zero=duel(own,level,{...agg,armor:0,mr:0},skills,enemy,level,data,[]);
 const high=duel(own,level,{...agg,armor:500,mr:500},skills,enemy,level,data,[]);
 assert.ok(high.killTheirs<zero.killTheirs);
});

test('fallback mitigation uses the defender level independently from the attacker level',()=>{
 const agg=aggregateCombatStats(own,level,[],data);
 const low=killThreshold(own,level,agg,enemy,1,null,level);
 const high=killThreshold(own,level,agg,enemy,18,null,level);
 assert.ok(high<low);
 const realLow=duel(own,level,agg,skills,enemy,1,data,[]);
 const realHigh=duel(own,level,agg,skills,enemy,18,data,[]);
 assert.ok(realHigh.killMine<realLow.killMine);
});

test('negative panel resistance remains finite and increases the modeled incoming damage',()=>{
 const agg=aggregateCombatStats(own,level,[],data);
 const zero=duel(own,level,{...agg,armor:0,mr:0},skills,enemy,level,data,[]);
 const negative=duel(own,level,{...agg,armor:-100,mr:-100},skills,enemy,level,data,[]);
 assert.ok(Number.isFinite(negative.killTheirs)&&negative.killTheirs>zero.killTheirs);
});

test('partial official panels retain missing resists as unknown and fall back to own level stats',()=>{
 const panel=panelStats({attackDamage:120,abilityPower:0});
 assert.equal(panel.armor,null);assert.equal(panel.mr,null);
 const applied=applyLivePanel(own,level,panel),base=aggregateCombatStats(own,level,[],data);
 assert.equal(applied.agg.armor,base.armor);assert.equal(applied.agg.mr,base.mr);
 const owned=aggregateCombatStats(own,level,[{id:'1029',count:1}],data);
 const partial=applyLivePanel(own,level,panel,owned);
 assert.equal(partial.agg.ad,120);assert.equal(partial.agg.armor,owned.armor);assert.ok(partial.agg.armor>base.armor);
 const reported=applyLivePanel(own,level,{...panel,armor:50},owned);
 assert.equal(reported.agg.armor,50);
 assert.equal(panelStats({abilityPower:50}).ad,null);
});

test('all public enemies are checked for model warnings and list order cannot change the main target',()=>{
 const live=fresh(),initial=createGuideModel(data,guide,live).estimate;
 const weak=initial.duels.find(d=>d.enemy.id==='Soraka'),strong=initial.duels.find(d=>d.enemy.id==='Zed');
 assert.ok(strong.killTheirs>weak.killTheirs);
 live.stats.hp=Math.floor((weak.killTheirs+strong.killTheirs)/2);
 const first=createGuideModel(data,guide,live).estimate;
 const second=createGuideModel(data,guide,{...live,enemies:[...live.enemies].reverse()}).estimate;
 assert.deepEqual(second,first);assert.equal(first.enemy.id,'Zed');assert.equal(first.danger,true);
 assert.deepEqual(first.warningEnemies.map(e=>e.id),['Zed']);
 assert.deepEqual(live.enemies.map(e=>e.id),['Soraka','Zed']);
 const healthy=createGuideModel(data,guide,{...live,stats:{...live.stats,hp:strong.killTheirs+1}}).estimate;
 assert.equal(healthy.danger,false);assert.deepEqual(healthy.warningEnemies,[]);
});

test('missing own or enemy levels never become invented damage estimates',()=>{
 const live=fresh();
 assert.equal(createGuideModel(data,guide,{...live,level:null}).estimate,null);
 assert.equal(createGuideModel(data,guide,{...live,enemies:live.enemies.map(e=>({...e,level:null}))}).estimate,null);
 const partial=createGuideModel(data,guide,{...live,enemies:[{...live.enemies[0],level:null},live.enemies[1]]}).estimate;
 assert.deepEqual(partial.duels.map(d=>d.enemy.id),['Zed']);
});

test('warning UI names its target and discloses the six second model without competing gear advice',()=>{
 const live=fresh();live.stats.hp=1;
 const model=createGuideModel(data,guide,live),html=renderGuide({model,connected:true,phase:'InProgress'},'items',false,()=>'<img>');
 assert.ok(html.includes('6 秒输出估算 · 劫'));assert.ok(html.includes('模型提示 · 劫、索拉卡'));
 assert.ok(html.includes('不是实际伤害或立即斩杀判断')&&html.includes('不表示对手在附近'));
 assert.equal(Object.hasOwn(model.estimate,'liveBuy'),false);assert.equal(html.includes('实时出装'),false);
});

test('generated and partial spell formulas cannot silently change the combat warning',()=>{
 assert.equal(canUseCombatSpells(own,skills,data.spellbook),false);
 const reviewed={Ashe:{...structuredClone(data.spellbook.Ashe),reviewedForCombat:true}};
 assert.equal(canUseCombatSpells(own,skills,reviewed),false,'Partial Q must not be counted as an additional skill hit');
 const knownW={Q:0,W:1,E:0,R:0};
 assert.equal(canUseCombatSpells(own,knownW,reviewed),true);
 const agg=aggregateCombatStats(own,level,[],data);
 const unreviewed=duel(own,level,agg,skills,enemy,level,data,[],data.spellbook);
 const fallback=duel(own,level,agg,skills,enemy,level,data,[]);
 assert.deepEqual(unreviewed,fallback);assert.equal(unreviewed.mineSkillBasis,'heuristic');
 assert.equal(duel(own,level,agg,knownW,enemy,level,data,[],reviewed).mineSkillBasis,'reviewed');
 const unresolved=structuredClone(reviewed);unresolved.Ashe.W={partial:false,nuke:true,damage:null};
 assert.equal(canUseCombatSpells(own,knownW,unresolved),false,'A known damage skill with no formula is not a utility slot');
 const unsupported=structuredClone(reviewed);unsupported.Ashe.W.damage.ratios=[{stat:'maxHp',coeff:0.1,formula:'bonus'}];
 assert.equal(canUseCombatSpells(own,knownW,unsupported),false,'Self versus target health cannot be guessed');
});

test('enemy spell ranks and an available ultimate are never invented from the public level',()=>{
 const agg=aggregateCombatStats(own,1,[],data);
 const fakeReviewedBook={Jinx:{...structuredClone(data.spellbook.Jinx),reviewedForCombat:true,
  R:{partial:false,damage:{type:'true',base:[15000,15000,15000],ratios:[]}}}};
 const baseline=duel(own,1,agg,{Q:0,W:1,E:0,R:0},enemy,1,data,[]);
 const unknownRanks=duel(own,1,agg,{Q:0,W:1,E:0,R:0},enemy,1,data,[],fakeReviewedBook);
 assert.equal(unknownRanks.killTheirs,baseline.killTheirs);
});

test('custom comparisons require the actual level of each selected public champion',()=>{
 const live={...fresh(),allies:[{id:'Janna',name:'迦娜',level:8,items:[]}]};
 const picked={...guide,duelPick:{own:'Janna',foe:'Zed'}};
 assert.ok(createGuideModel(data,picked,live).customDuel.killMine>0);
 const missingAlly={...live,allies:[{...live.allies[0],level:null}]};
 assert.equal(createGuideModel(data,picked,missingAlly).customDuel.unresolved,true);
 const missingFoe={...live,enemies:live.enemies.map(e=>({...e,level:null}))};
 assert.equal(createGuideModel(data,picked,missingFoe).customDuel.unresolved,true);
 const self={...guide,duelPick:{own:'Ashe',foe:'Zed'}};
 assert.equal(createGuideModel(data,self,{...live,level:null}).customDuel.unresolved,true);
 const partialPanel={...live,stats:{ad:120,ap:0},inventory:[{id:'1029',count:1}]};
 const model=createGuideModel(data,self,partialPanel);
 assert.equal(model.customDuel.killTheirs,model.estimate.duels.find(d=>d.enemy.id==='Zed').killTheirs);
});
