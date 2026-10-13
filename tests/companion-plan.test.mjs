import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {changeCompanionPlan,companionPickIntent} from '../src/core/companion-plan.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {createPreparationStore,recallPreparation} from '../src/core/preparation.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {companionView} from '../src/companion-view.mjs';
import {captureCreativePlan,creativeMemberCombo,creativeComboContext} from '../src/core/creative-plan.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const hero=id=>data.champions.find(c=>c.id===id),base={id:'Volibear',role:'top',mode:'rift',conditions:[],coreIndex:0};
const build=s=>getBuild(hero(s.id),s.role,data,s);

test('only the local unselected intent prepares a labeled plan without creating a client pick',()=>{
 const slots=createSlots(),client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:hero('Volibear').key},{cellId:2,championId:0,championPickIntent:hero('Ashe').key}]}};
 const before=structuredClone({client,slots});
 assert.deepEqual(companionPickIntent(client,data.champions,slots),{selection:{id:'Volibear',role:'top',mode:'rift'},positionKnown:false});
 assert.deepEqual(companionPickIntent(client,data.champions,slots,{soloRole:'jungle'}),{selection:{id:'Volibear',role:'jungle',mode:'rift'},positionKnown:true});
 for(const scope of ['solo','party','context','bot'])assert.deepEqual(companionPickIntent(client,data.champions,slots,{scope,soloRole:'support'}),{selection:{id:'Volibear',role:'support',mode:'rift'},positionKnown:true});
 assert.deepEqual({client,slots},before);
 const assigned=structuredClone(client);assigned.session.myTeam[0].assignedPosition='JUNGLE';
 assert.equal(companionPickIntent(assigned,data.champions,slots,{soloRole:'top'}).selection.role,'jungle');
 slots[2]={...slots[2],champion:'Volibear',manualPosition:true,clientCellId:1};
 assert.equal(companionPickIntent(client,data.champions,slots).selection.role,'mid');
 assert.equal(companionPickIntent(assigned,data.champions,slots).selection.role,'mid','An explicit lane must survive a declared position');
 slots[2].champion=null;
 assert.equal(companionPickIntent(assigned,data.champions,slots).selection.role,'mid','A lane chosen before locking belongs to the player cell');
 for(const change of [{connected:false},{phase:'InProgress'},{mode:{id:'aram'}},{session:{localPlayerCellId:3,myTeam:client.session.myTeam}}])assert.equal(companionPickIntent({...client,...change},data.champions,slots),null);
 for(const change of [{championId:hero('Volibear').key},{championPickIntent:999999},{championPickIntent:String(hero('Volibear').key)},{championPickIntent:0}])assert.equal(companionPickIntent({...client,session:{...client.session,myTeam:[{...client.session.myTeam[0],...change}]}},data.champions,slots),null);
 const intent=companionPickIntent(client,data.champions,createSlots());
 const plan={preview:true,intent:true,positionKnown:intent.positionKnown,selection:intent.selection,build:build(intent.selection)};
 const html=companionView({data,client,slots:createSlots(),unassigned:[],scope:'solo',soloRole:'',style:'fun',tab:'plan',results:[],plan});
 assert.match(html,/正在预选/);assert.match(html,/位置未确认/);assert.match(html,/data-companion-field="rune"/);assert.doesNotMatch(html,/data-action="my-runes"|data-action="guide-current"/);
});

test('inline rune and equipment choices stay independent and survive preparation recall',()=>{
 const original=build(base),store=createPreparationStore();
 const rune=original.runeOptions.find(o=>o.page.selectedPerkIds[0]!==original.runePage.selectedPerkIds[0]);assert.ok(rune);
 let selected=changeCompanionPlan(data,base,'rune',rune.id);
 selected=changeCompanionPlan(data,selected,'core',1);store.remember(selected);
 const recalled=recallPreparation(store,null,base);
 assert.equal(recalled.runeId,rune.id);assert.equal(recalled.coreIndex,1);
 assert.deepEqual(build(recalled).runePage.selectedPerkIds,rune.page.selectedPerkIds);
 assert.equal(build(recalled).selectedCoreId,'core-'+original.reference.core[1].items.join('-'));
 const skill=original.skillChoices.at(-1);
 selected=changeCompanionPlan(data,recalled,'skill',skill.id);
 assert.equal(build(selected).skillOrder,skill.order);assert.equal(build(selected).selectedRuneId,rune.id);
});

test('unlocked hover resolves the accepted trio configuration and preserves personal choices under its exact plan',()=>{
 const picks={top:'Camille',jungle:'Vi',mid:'Galio'};
 const slots=createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role]}));
 const [result]=recommend({slots,champions:data.champions,scope:'party',limit:1}),creativePlan=captureCreativePlan(result,data);
 const accepted={id:'Galio',role:'mid',mode:'rift',...creativeComboContext(creativeMemberCombo(creativePlan,'Galio','mid'))};
 const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{localPlayerCellId:2,myTeam:[{cellId:2,championId:0,championPickIntent:hero('Galio').key,assignedPosition:'MIDDLE'}]}};
 const intent=companionPickIntent(client,data.champions,slots,{creativePlan});
 assert.deepEqual(intent.selection,accepted);
 assert.equal(build(intent.selection).runePage.selectedPerkIds[0],8439,'Accepted engage trio needs its Aftershock page, not the ordinary source page');
 const store=createPreparationStore(),custom=changeCompanionPlan(data,accepted,'summoner-swap');store.remember(custom);
 const recalled={...recallPreparation(store,null,intent.selection),...intent.selection};
 assert.deepEqual(build(recalled).summoners,build(custom).summoners);
 assert.deepEqual(build(recalled).items,build(accepted).items);
 assert.equal(companionPickIntent(client,data.champions,slots,{creativePlan,soloRole:'support'}).selection.comboId,accepted.comboId,'Formal lane takes precedence');
 const different=structuredClone(client);different.session.myTeam[0].championPickIntent=hero('Lux').key;
 assert.equal(companionPickIntent(different,data.champions,slots,{creativePlan}).selection.comboId,undefined);
 const moved=structuredClone(client);moved.session.myTeam[0].assignedPosition='SUPPORT';
 assert.equal(companionPickIntent(moved,data.champions,createSlots(),{creativePlan}).selection.comboId,undefined);
 assert.equal(companionPickIntent({...client,phase:'Lobby'},data.champions,slots,{creativePlan}),null);
});

test('confirming a candidate keeps its prepared combo before a saved solo default while teammates remain unknown',()=>{
 const picks={top:'Camille',jungle:'Vi',mid:'Galio'},slots=createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role]}));
 const [result]=recommend({slots,champions:data.champions,scope:'party',limit:1}),plan=captureCreativePlan(result,data);
 const context={id:'Galio',role:'mid',mode:'rift'},clicked={...context,...creativeComboContext(creativeMemberCombo(plan,'Galio','mid'))},store=createPreparationStore();
 const solo=store.remember(changeCompanionPlan(data,context,'summoner-swap'));
 assert.notDeepEqual(build(solo).runePage.selectedPerkIds,build(clicked).runePage.selectedPerkIds);
 const chosen=store.remember(clicked),personal=store.remember(changeCompanionPlan(data,chosen,'summoner-swap'));
 const restored=recallPreparation(store,chosen,context,{allowSavedCombo:true});
 assert.deepEqual(restored,personal,'Use the latest personal configuration for the currently prepared combo');
 for(const field of ['runePage','summoners','items'])assert.deepEqual(build(restored)[field],build(personal)[field]);
 assert.deepEqual(recallPreparation(store,chosen,context),solo,'Known solo context still selects its own saved preferences');
 assert.equal(recallPreparation(store,chosen,{...context,comboId:'different-plan'}),null,'A different known lineup cannot inherit this preparation');
 assert.equal(recallPreparation(store,chosen,{...context,role:'support'},{allowSavedCombo:true}),null,'Changing lane cannot inherit this preparation');
 assert.deepEqual(store.recall(context),solo,'Remembered solo preferences remain intact');
});

test('invalid or stale inline options cannot alter a remembered plan',()=>{
 const store=createPreparationStore(),remembered=store.remember(base);
 for(const [field,value] of [['core',-1],['core',999],['rune','removed'],['skill','removed'],['loadout','removed'],['condition','unknown']]){
  assert.throws(()=>changeCompanionPlan(data,base,field,value));assert.deepEqual(store.recall(base),remembered);
 }
});

test('changing the actual lane pressure updates equipment while preserving rune choice',()=>{
 const rune=build(base).runeOptions.at(-1).id;
 let selection=changeCompanionPlan(data,base,'rune',rune);
 selection=changeCompanionPlan(data,selection,'condition','ap');
 assert.ok(selection.conditions.includes('ap'));assert.equal(build(selection).selectedRuneId,rune);assert.ok(build(selection).adjustments.length);
 selection=changeCompanionPlan(data,selection,'condition','ap');assert.deepEqual(selection.conditions,[]);
});

test('the sidebar exposes all lane candidates and full configuration without another drawer',()=>{
 const slots=createSlots(),results=recommend({slots,champions:data.champions,scope:'solo',soloRole:'',limit:6});
 const props={data,client:{connected:true,phase:'ChampSelect'},slots,unassigned:[],scope:'solo',soloRole:'',style:'fun',results};
 const html=companionView({...props,tab:'recommend'});
 assert.equal((html.match(/class="companion-candidate"/g)||[]).length,results.length);
 assert.equal(new Set(results.map(r=>r.targets[0])).size,5);
 const prepared={own:{id:'Volibear',role:'top'},selection:base,build:build(base)};
 const plan=companionView({...props,tab:'plan',preparation:prepared});
 assert.match(plan,/data-companion-field="core"/);assert.match(plan,/data-companion-field="rune"/);assert.match(plan,/data-companion-field="skill"/);
 assert.equal((plan.match(/class="companion-rune /g)||[]).length,6);assert.match(plan,/companion-shards/);assert.match(plan,/出门购买/);
 const team=companionView({...props,tab:'team',enemy:['Ashe'],bans:['Yone']});
 assert.match(team,/敌方公开已选/);assert.match(team,/公开禁选/);assert.match(team,/持续输出/);
 assert.doesNotMatch(team,/\[object Object\]/);
});
