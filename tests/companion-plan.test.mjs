import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {changeCompanionPlan,companionPickIntent,localConfigurationPreview,configurationReadOnly} from '../src/core/companion-plan.mjs';
import {getBuild,SHARDS} from '../src/core/builds.mjs';
import {preparationEquipment} from '../src/core/complete-gear.mjs';
import {createPreparationStore,recallPreparation} from '../src/core/preparation.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {companionView,companionPlanView,readOnlyConfigurationAction} from '../src/companion-view.mjs';
import {clientPreparationPlan,clientPreparationKey} from '../src/client-preparation-view.mjs';
import {preparationProgressView} from '../src/preparation-progress-view.mjs';
import {captureCreativePlan,creativeMemberCombo,creativeComboContext} from '../src/core/creative-plan.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const hero=id=>data.champions.find(c=>c.id===id),base={id:'Volibear',role:'top',mode:'rift',conditions:[],coreIndex:0};
const build=s=>getBuild(hero(s.id),s.role,data,s);

test('live teammate previews reject configuration edits while offline lineup references remain editable',()=>{
 const client={connected:true,phase:'ChampSelect'},selection={...base};
 const teammate=localConfigurationPreview(selection,client,'mid');
 assert.equal(teammate.readOnly,true);
 for(const [field,value] of [['summoner-swap'],['rune','default'],['rune-custom:keystone',8439],['skill-custom:1','Q'],['core',0],['source-opponent-reset']])assert.throws(()=>changeCompanionPlan(data,teammate,field,value),/队友配置仅供查看/);
 const own=localConfigurationPreview(selection,client,'top');
 assert.equal(own.readOnly,false);assert.equal(changeCompanionPlan(data,own,'summoner-swap').summonerIds.length,2);
 const local=localConfigurationPreview(selection,{connected:false,phase:'Offline'},'mid');
 assert.equal(local.localReference,true);assert.equal(local.readOnly,false);
 assert.equal(changeCompanionPlan(data,local,'summoner-swap').summonerIds.length,2);
 assert.equal(configurationReadOnly(local,client,'mid'),true,'An offline preview must become read-only if a teammate owns its lane after connection');
 assert.equal(configurationReadOnly(local,client,'top'),false);
 assert.equal(configurationReadOnly({...local,readOnly:true},{connected:false},'top'),true,'An explicitly shared read-only snapshot must remain read-only offline');
});

test('read-only configuration renders full references and navigation but disables every editor control',()=>{
 const selection={...base,readOnly:true},html=companionPlanView(data,{preview:true,selection,build:build(selection)});
 assert.match(html,/队友配置 · 只读/);assert.match(html,/当前完整配置/);
 const tags=[...html.matchAll(/<(button|select|input|textarea)\b[^>]*>/g)].map(match=>({type:match[1],tag:match[0]}));
 assert.ok(tags.some(({tag})=>/data-action="companion-summoner"/.test(tag)));
 for(const {type,tag} of tags){const action=tag.match(/data-action="([^"]+)"/)?.[1];if(type==='button'&&readOnlyConfigurationAction(action))continue;assert.match(tag,/\sdisabled(?:\s|=|>)/,tag);}
 assert.match(html,/<button[^>]*data-action="companion-current"(?![^>]*disabled)[^>]*>/);
 const local=localConfigurationPreview(base,{connected:false},'mid'),editable=companionPlanView(data,{preview:true,selection:local,build:build(local)});
 assert.match(editable,/本机配置参考 · 可编辑/);assert.match(editable,/<button[^>]*data-action="companion-summoner"(?![^>]*disabled)[^>]*>/);
});

test('only the local unselected intent prepares a labeled plan without creating a client pick',()=>{
 const slots=createSlots(),client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:hero('Volibear').key},{cellId:2,championId:0,championPickIntent:hero('Ashe').key}]}};
 const before=structuredClone({client,slots});
 assert.deepEqual(companionPickIntent(client,data.champions,slots),{selection:{id:'Volibear',role:'top',mode:'rift'},positionKnown:false});
 assert.deepEqual(companionPickIntent(client,data.champions,slots,{soloRole:'jungle'}),{selection:{id:'Volibear',role:'jungle',mode:'rift'},positionKnown:true});
 for(const scope of ['solo','party','context','bot'])assert.deepEqual(companionPickIntent(client,data.champions,slots,{scope,soloRole:'support'}),{selection:{id:'Volibear',role:'support',mode:'rift'},positionKnown:true});
 assert.deepEqual({client,slots},before);
 const assigned=structuredClone(client);assigned.session.myTeam[0].assignedPosition='JUNGLE';
 assert.equal(companionPickIntent(assigned,data.champions,slots,{soloRole:'top'}).selection.role,'jungle');
 assert.equal(companionPickIntent(assigned,data.champions,slots,{soloRole:'top',playerPosition:{role:'top',cellId:1}}).selection.role,'top','Explicit ownership takes priority even when an adopted proposal has no public cell binding');
 for(const playerPosition of [{role:'top',cellId:2},{role:'unknown',cellId:1}])assert.equal(companionPickIntent(assigned,data.champions,slots,{soloRole:'top',playerPosition}).selection.role,'jungle','Invalid or other-player ownership must not replace the assigned lane');
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
 assert.match(html,/当前完整配置/);assert.match(html,/预选位置<select/);assert.match(html,/data-companion-field="rune"/);assert.doesNotMatch(html,/data-action="my-runes"|data-action="guide-current"/);
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
 assert.equal((html.match(/class="companion-candidate"/g)||[]).length,3);
 assert.match(html,/data-action="more-candidates"/);
 assert.equal((companionView({...props,tab:'recommend',showAllCandidates:true}).match(/class="companion-candidate"/g)||[]).length,results.length);
 assert.equal(new Set(results.map(r=>r.targets[0])).size,5);
 const prepared={own:{id:'Volibear',role:'top'},selection:base,build:build(base)};
 const plan=companionView({...props,tab:'plan',preparation:prepared});
 assert.match(plan,/data-companion-field="core"/);assert.match(plan,/data-companion-field="rune"/);assert.match(plan,/data-companion-field="skill"/);
 assert.equal((plan.match(/class="companion-rune /g)||[]).length,6);assert.match(plan,/companion-shards/);assert.match(plan,/出门购买/);
 const team=companionView({...props,tab:'team',enemy:['Ashe'],bans:['Yone']});
 assert.match(team,/敌方公开已选/);assert.match(team,/公开禁选/);assert.match(team,/持续输出/);
 assert.doesNotMatch(team,/\[object Object\]/);
});

test('candidate and adopted member actions visibly distinguish my configuration from teammates',()=>{
 const slots=createSlots().map(s=>({...s,party:['mid','bottom','support'].includes(s.role),champion:({mid:'Ahri',bottom:'Ashe',support:'Braum'})[s.role]||null,locked:true}));
 const results=recommend({slots,champions:data.champions,scope:'party',limit:1});
 const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:123,localPlayerCellId:0,myTeam:[{cellId:0,championId:0,assignedPosition:'BOTTOM'}]}};
 const props={data,client,slots,unassigned:[],scope:'party',soloRole:'bottom',style:'fun',tab:'recommend',results};
 const candidates=companionView(props);
 assert.match(candidates,/data-id="Ashe"[^>]*>[\s\S]*?candidate-action-own[^>]*>你 · 配置<\/em>/);
 for(const id of ['Ahri','Braum'])assert.match(candidates,new RegExp('data-id="'+id+'"[^>]*>[\\s\\S]*?candidate-action [^>]*>查看<\\/em>'));
 const activePlan=captureCreativePlan(results[0],data),adopted=companionView({...props,activePlan});
 assert.match(adopted,/data-action="active-hero-prepare" data-id="Ashe"[^>]*>[\s\S]*?下路 · 预选并配置/);
 for(const id of ['Ahri','Braum'])assert.match(adopted,new RegExp('data-action="active-hero-prepare" data-id="'+id+'"[^>]*>[\\s\\S]*?队友配置 · 只读'));
});

test('accepted sidebar plans show one preparation receipt and reveal distinct alternatives only when comparing',()=>{
 const results=recommend({slots:createSlots(),champions:data.champions,scope:'party',limit:6});
 const activePlan=captureCreativePlan(results[0],data);results[0].creativePlan=activePlan;
 const member=activePlan.members[0],selection={id:member.champion,role:member.role,mode:'rift',...creativeComboContext(creativeMemberCombo(activePlan,member.champion,member.role))};
 const prepared={own:{id:selection.id,role:selection.role,positionKnown:true},selection,build:build(selection)},client={connected:false};
 const taskControls=preparationProgressView({data,client,plan:prepared,compact:true});
 const props={data,client,slots:results[0].slots,unassigned:[],scope:'party',soloRole:member.role,style:'fun',tab:'recommend',results,activePlan,preparation:prepared,taskPlan:prepared,taskControls};
 const accepted=companionView(props);
 assert.equal((accepted.match(/data-preparation-step=/g)||[]).length,4,'The actual four-step receipt is rendered once');
 assert.equal((accepted.match(/id="solo-role"/g)||[]).length,1,'The position control is shared with the persistent workspace');
 assert.doesNotMatch(accepted,/class="companion-candidate"/);assert.match(accepted,/data-action="task-compare"/);
 const play=accepted.indexOf('<details class="companion-chosen"');assert.ok(play>0);assert.doesNotMatch(accepted.slice(play,accepted.indexOf('>',play)),/\bopen\b/);
 const comparing=companionView({...props,taskComparing:true});
 assert.deepEqual([...comparing.matchAll(/<article class="companion-candidate" data-result-index="(\d+)"/g)].map(m=>Number(m[1])),[1,2,3],'The accepted result is excluded without shifting candidate action indexes');
 assert.match(comparing,/data-action="task-return"/);
 const failed=companionView({...props,error:'推荐失败 <mock>'});assert.match(failed,/推荐失败 &lt;mock&gt;/);assert(failed.indexOf('推荐失败 &lt;mock&gt;')<failed.indexOf('<details class="companion-chosen"'),'Failure remains visible even when the recommendation list is not rendered');
});

test('configuration overview exposes the complete selected route, six runes, shards, D/F and opening before closed editors',()=>{
 const selected=changeCompanionPlan(data,base,'summoner-swap'),current=build(selected),html=companionPlanView(data,{selection:selected,build:current});
 const start=html.indexOf('aria-label="当前完整配置"'),end=html.indexOf('</section>',start),overview=html.slice(start,end);
 assert.deepEqual([...overview.matchAll(/data-item-id="([^"]+)"/g)].map(m=>m[1]),preparationEquipment(data,current,selected).map(item=>String(item.id)));
 assert.deepEqual([...overview.matchAll(/data-rune-id="(\d+)"/g)].map(m=>Number(m[1])),current.runePage.selectedPerkIds.slice(0,6));
 for(const id of current.runePage.selectedPerkIds.slice(6))assert.ok(overview.includes(SHARDS[id]));
 const spells=overview.slice(overview.indexOf('aria-label="调整当前 D/F"'));
 assert.ok(spells.indexOf(data.spells[current.summoners[0]].name)<spells.indexOf(data.spells[current.summoners[1]].name),'The displayed D/F order follows the selected preparation');
 assert.ok(overview.includes(current.priority.split('').join(' › ')));assert.ok(overview.includes(current.first.split('').join(' → ')));
 for(const section of ['items','runes','skills','opponent','source']){
  const target=html.match(new RegExp(`<details[^>]*data-companion-section="${section}"[^>]*>`));
  assert.ok(target,section+' remains a jump target');assert.doesNotMatch(target[0],/\bopen\b/);assert.ok(html.indexOf(target[0])>end);
 }
 for(const field of ['core','rune','skill','summoner-d','summoner-f'])assert.ok(html.includes(`data-companion-field="${field}"`),field+' remains editable');
 const warned=companionPlanView(data,{selection:selected,build:{...current,referenceStale:true,selectionWarnings:['原选择不可用 <mock>']}});
 assert.ok(warned.indexOf('原选择不可用 &lt;mock&gt;')<warned.indexOf('aria-label="当前完整配置"'));assert.match(warned.slice(warned.indexOf('aria-label="当前完整配置"'),warned.indexOf('</section>',warned.indexOf('aria-label="当前完整配置"'))),/待复核/);
});

test('configuration keeps the actual receipt without recommendation controls and comparison hides only a successful receipt',()=>{
 const prepared={selection:base,build:build(base),own:{id:base.id,role:base.role,positionKnown:true}};
 const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:'73001',localPlayerCellId:0,myTeam:[{cellId:0,championId:hero(base.id).key}],actions:[]}};
 const key=clientPreparationKey(client,clientPreparationPlan(data,prepared)),steps=Object.fromEntries(['hover','runes','spells','items'].map(step=>[step,{status:'done'}]));
 const statuses=new Map([[key,{complete:true,steps}]]),taskControls=preparationProgressView({data,client,plan:prepared,statuses,available:true,compact:true});
 const props={data,client,slots:createSlots(),unassigned:[],scope:'solo',soloRole:'top',style:'fun',results:[],preparation:prepared,taskPlan:prepared,taskControls};
 const plan=companionView({...props,tab:'plan'}),persistent=plan.slice(plan.indexOf('<div class="companion-persistent"'),plan.indexOf('<main class="companion-content"'));
 assert.equal((persistent.match(/data-preparation-step=/g)||[]).length,0,'Configuration starts with the actual build, not a duplicate hero/receipt card');assert.doesNotMatch(persistent,/data-action="draft-style"|data-action="draft-scope"/);
 const unknown=companionView({...props,tab:'plan',soloRole:'',preparation:{...prepared,own:{...prepared.own,positionKnown:false}}});assert.match(unknown,/<select id="solo-role"/);assert.doesNotMatch(unknown,/<select id="solo-role"[^>]*disabled/);
 assert.equal((companionView({...props,tab:'recommend',taskComparing:true}).match(/data-preparation-step=/g)||[]).length,0);
 assert.equal((companionView({...props,tab:'recommend',taskComparing:false}).match(/data-preparation-step=/g)||[]).length,4,'Returning to the plan restores the saved receipt');
 statuses.set(key,{complete:false,steps:{...steps,runes:{status:'failed',message:'符文写入未完成 <mock>'}}});
 const failureControls=preparationProgressView({data,client,plan:prepared,statuses,available:true,compact:true}),failure=companionView({...props,tab:'recommend',taskComparing:true,taskControls:failureControls});
 assert.equal((failure.match(/data-preparation-step=/g)||[]).length,4);assert.match(failure,/符文写入未完成 &lt;mock&gt;/);assert.match(failure,/data-action="client-prepare"/);
});

test('roster badges distinguish assistant arrangements from public hover, selection and lock',()=>{
 const picks={top:'Volibear',jungle:'Graves',mid:'Ahri',bottom:'Ashe',support:'Braum'},slots=createSlots().map(slot=>({...slot,champion:picks[slot.role]}));
 const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{localPlayerCellId:0,myTeam:[{cellId:0,championId:0,championPickIntent:hero('Ahri').key},{cellId:1,championId:hero('Ashe').key},{cellId:2,championId:hero('Braum').key,pickState:'locked'}],actions:[]}};
 const props={data,client,slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results:[]},html=companionView(props);
 assert.equal((html.match(/data-pick-state="方案"/g)||[]).length,2);assert.equal((html.match(/data-pick-state="预选"/g)||[]).length,1);assert.equal((html.match(/data-pick-state="已选"/g)||[]).length,1);assert.equal((html.match(/data-pick-state="锁定"/g)||[]).length,1);
 assert.match(html,/aria-label="中路 · 阿狸[^"\n]*预选"/);assert.match(html,/title="辅助 · 布隆[^"\n]*锁定"/);
 const disconnected=companionView({...props,client:{...client,connected:false}});assert.equal((disconnected.match(/data-pick-state="方案"/g)||[]).length,5,'Cached or arranged picks are never promoted while disconnected');
});
