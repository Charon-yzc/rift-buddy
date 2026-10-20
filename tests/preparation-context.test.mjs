import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPreparationContext} from '../src/core/preparation-context.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {clientPreparationPlan} from '../src/client-preparation-view.mjs';
const data=JSON.parse(readFileSync(new URL('../data/game.json',import.meta.url),'utf8'));
const hero=id=>data.champions.find(c=>c.id===id);
function fixture({picked='Ashe',hover='',role='bottom',...extra}={}){
 const slots=createSlots();if(picked)Object.assign(slots.find(s=>s.role===role),{champion:picked,clientCellId:1});
 const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:12,localPlayerCellId:1,myTeam:[{cellId:1,championId:picked?hero(picked).key:0,championPickIntent:hover?hero(hover).key:0,assignedPosition:role.toUpperCase()}]}};
 return {data,client,slots,ownRole:role,...extra};
}
test('one synchronous projection shares the actual build and full client fingerprint',()=>{
 const input=fixture(),calls=[];const context=createPreparationContext(input,{build:(...args)=>{calls.push(args);return getBuild(...args);}});
 const expected=getBuild(hero('Ashe'),'bottom',data,{id:'Ashe',role:'bottom',mode:'rift'});
 for(let n=0;n<3;n++)for(const plan of [context.own,context.currentOnly,context.task,context.displayPlan]){
  assert.deepEqual(plan.selection,{id:'Ashe',role:'bottom',mode:'rift'});assert.deepEqual(plan.build,expected);
  assert.equal(clientPreparationPlan(data,plan).fingerprint,clientPreparationPlan(data,{selection:plan.selection,build:expected}).fingerprint);
 }
 assert.equal(calls.length,1);assert.equal(context.task,context.own);assert.equal(context.displayPlan,context.task);
});
test('teammate preview never replaces current-only or the own applied task',()=>{
 const input=fixture({preview:{id:'Lux',role:'support',mode:'rift',readOnly:true}}),context=createPreparationContext(input);
 assert.equal(context.displayPlan.selection.id,'Lux');assert.equal(context.displayPlan.selection.readOnly,true);
 assert.equal(context.currentOnly.selection.id,'Ashe');assert.equal(context.task.selection.id,'Ashe');
 assert.equal(context.displayPlan.preview,true);assert.equal(context.currentOnly.preview,undefined);
});
test('unknown-role intent preserves pending choices only for the exact adopted plan and lane',()=>{
 const selection={id:'Ahri',role:'mid',mode:'rift'},pending={...selection,runeId:'saved-choice',summonerIds:['SummonerFlash','SummonerTeleport']};
 const input=fixture({picked:'',hover:'Ahri',ownRole:'',intent:{selection,positionKnown:false},pendingIntent:pending,pendingPlanId:''});
 const current=createPreparationContext(input);assert.deepEqual(current.task.selection,pending);assert.equal(current.task.intent,true);assert.equal(current.task.positionKnown,false);
 assert.notEqual(current.task.selection,pending);assert.deepEqual(input.pendingIntent,pending);
 const changed=createPreparationContext({...input,pendingPlanId:'other'});assert.deepEqual(changed.task.selection,selection);
 const moved=createPreparationContext({...input,intent:{selection:{...selection,role:'support'},positionKnown:true}});assert.equal(moved.task.selection.runeId,undefined);
});
test('the public own hero wins over a conflicting adopted member; an applicable last task wins first',()=>{
 const activePlan={id:'test-plan',members:[{role:'bottom',champion:'Jinx'}]};
 const input=fixture({activePlan}),context=createPreparationContext(input);assert.equal(context.task.selection.id,'Ashe');
 const last={id:'Ashe',role:'bottom',mode:'rift',runeId:'personal-page'};
 assert.equal(createPreparationContext({...input,lastTaskSelection:last}).task.selection.runeId,'personal-page');
 assert.equal(createPreparationContext({...input,lastTaskSelection:{...last,id:'Ahri'}}).task.selection.id,'Ashe');
});
test('full choice cache distinguishes personal config, opponent, shared equipment and combo contents',()=>{
 let calls=0;const context=createPreparationContext(fixture(),{build:(_hero,_role,_data,selection)=>({selection:structuredClone(selection),number:++calls})});
 const base={id:'Ashe',role:'bottom',mode:'rift'};
 const variants=[base,{...base,runeId:'personal'},{...base,sourceOpponent:'Lux'},{...base,sharedEquipment:{core:[1]}},{...base,creativePlan:{id:'same',plan:'first'}},{...base,creativePlan:{id:'same',plan:'edited'}},{...base,summonerIds:['Flash','Heal']},{...base,customSkillOrder:['Q']}];
 const outputs=variants.map(selection=>context.buildFor(selection));assert.equal(calls,variants.length);
 assert.equal(context.buildFor(structuredClone(base)),outputs[0]);assert.equal(calls,variants.length);
});
test('flash getters are captured and subsequent contexts see the changed preference and fresh source',()=>{
 let flash='d',source='first',calls=0;const input=fixture();input.data={...data,builds:{source}};
 Object.defineProperties(input.data,{flashSlot:{get:()=>flash},clientFlashSlot:{get:()=>flash}});
 const build=(_hero,_role,snapshot)=>{calls++;return {flash:snapshot.flashSlot,clientFlash:snapshot.clientFlashSlot,builds:snapshot.builds};};
 const before=createPreparationContext(input,{build});flash='f';input.data.builds={source:'second'};
 assert.equal(before.task.build.flash,'d');assert.equal(before.task.build.clientFlash,'d');assert.equal(before.task.build.builds.source,'first');
 const after=createPreparationContext(input,{build});assert.equal(after.task.build.flash,'f');assert.equal(after.task.build.builds.source,'second');assert.equal(calls,2);
});
test('non-enumerable production-style flash preferences preserve actual builds and preparation fingerprints',()=>{
 for(const preference of ['f','auto']){
  const input=fixture();input.data={...data};let clientFlash='f';
  Object.defineProperties(input.data,{flashSlot:{get:()=>preference},clientFlashSlot:{get:()=>clientFlash}});
  const context=createPreparationContext(input),expected=getBuild(hero('Ashe'),'bottom',input.data,{id:'Ashe',role:'bottom',mode:'rift'});
  assert.deepEqual(context.task.build.summoners,expected.summoners);assert.equal(context.task.build.summoners[1],'SummonerFlash');
  assert.equal(clientPreparationPlan(input.data,context.task).fingerprint,clientPreparationPlan(input.data,{selection:context.task.selection,build:expected}).fingerprint);
  clientFlash='d';const next=createPreparationContext(input);assert.equal(next.task.build.summoners[preference==='auto'?0:1],'SummonerFlash');
 }
});
test('unsupported modes and empty selections return no preparation without building',()=>{
 for(const input of [fixture({picked:''}),(()=>{const i=fixture();i.client.mode.id='unsupported';i.slots=createSlots();return i;})()]){
  let calls=0;const context=createPreparationContext(input,{build:()=>{calls++;}});assert.equal(context.own,null);assert.equal(context.currentOnly,null);assert.equal(context.task,null);assert.equal(context.displayPlan,null);assert.equal(calls,0);
 }
});
