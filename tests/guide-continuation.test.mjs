import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createGuideModel,selectGuide,validateGuideState} from '../src/core/guide.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {upsertPreparation,storedPreparation} from '../src/core/preparation.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const prepare=(id='Ashe',role='bottom')=>selectGuide(null,{id,role,mode:'rift'});
const image=()=>'<img>';
test('finishing core plus boots offers a direct next decision for ordinary source builds',()=>{
 for(const[id,role]of [['Ashe','bottom'],['Ahri','mid'],['MasterYi','jungle'],['Nautilus','support']]){
  const guide=prepare(id,role),initial=createGuideModel(data,guide);guide.completedItems=initial.route.map(i=>i.id);const model=createGuideModel(data,guide),html=renderGuide({model},'items',false,image);
  assert.equal(model.next,null);assert.ok(model.laterNeeded>0);assert.ok(model.laterChoices.length);assert.match(html,/核心路线完成，继续选择后期装备/);assert.match(html,/data-tab=items/);assert.match(html,/data-action="later"/);assert.doesNotMatch(html,/这套路线已完成/);
 }
});
test('late choice advances the same guide and saved preparation without losing core progress',()=>{
 let guide=prepare();const initial=createGuideModel(data,guide);guide.completedItems=initial.route.map(i=>i.id);
 const chosen=initial.laterChoices.find(i=>i.fitsRoute&&!i.blockedReason);guide=selectGuide(guide,changeCompanionPlan(data,guide.selection,'later',chosen.id));
 const model=createGuideModel(data,guide);assert.equal(model.next.id,chosen.id);assert.equal(model.laterNeeded,1);assert.deepEqual(model.completedItems,initial.route.map(i=>i.id));
 const preparations=upsertPreparation([],guide.selection),saved=storedPreparation(preparations,guide.selection);assert.deepEqual(saved.laterIds,[Number(chosen.id)]);assert.deepEqual(validateGuideState(JSON.parse(JSON.stringify(guide))).selection.laterIds,saved.laterIds);
});
test('source-pool alternatives cannot silently insert mutually exclusive planned items',()=>{
 const guide=prepare();const initial=createGuideModel(data,guide);let found=false;
 for(const first of initial.laterChoices){if(first.blockedReason)continue;const selected=changeCompanionPlan(data,guide.selection,'later',first.id),model=createGuideModel(data,selectGuide(guide,selected)),conflict=model.laterChoices.find(i=>!i.selected&&i.blockedReason?.includes('互斥'));
  if(conflict){assert.throws(()=>changeCompanionPlan(data,selected,'later',conflict.id),/互斥/);found=true;break;}
 }
 assert.ok(found,'The source pool exercises at least one real exclusive item family');
});
test('support late planning reserves its task item and enforces its smaller capacity',()=>{
 let selection=prepare('Nautilus','support').selection;let model=createGuideModel(data,selectGuide(null,selection));assert.equal(model.maxLaterItems,1);
 const first=model.laterChoices.find(i=>!i.blockedReason);selection=changeCompanionPlan(data,selection,'later',first.id);model=createGuideModel(data,selectGuide(null,selection));assert.equal(model.route.length,5);assert.equal(model.laterNeeded,0);assert.equal(model.granted.length,1);
 const another=model.laterChoices.find(i=>!i.selected&&!i.blockedReason);assert.ok(another);assert.throws(()=>changeCompanionPlan(data,selection,'later',another.id),/已满/);
});
test('unavailable original choices stay explicit and can be removed without an implicit replacement',()=>{
 const guide=selectGuide(null,{...prepare().selection,laterIds:[999999]});const model=createGuideModel(data,guide);assert.equal(model.unavailableLaterOptions[0].id,999999);assert.match(renderGuide({model},'items',false,image),/取消暂不可用的原选择/);
 const selection=changeCompanionPlan(data,guide.selection,'later','999999');assert.deepEqual(selection.laterIds,[]);assert.throws(()=>changeCompanionPlan(data,selection,'later','999999'),/已变化/);
});


test('confirmed core inventory offers late planning and keeps quest completion separate from the reusable plan',()=>{
 let guide=prepare();const initial=createGuideModel(data,guide),inventory=initial.route.map((item,slot)=>({id:item.id,count:1,slot}));
 const live={available:true,champion:'Ashe',mode:'rift',mapId:11,queueId:420,at:Date.now(),level:18,gold:4000,gameTime:2200,inventory,inventoryKnown:true,skills:{Q:5,W:5,E:5,R:3},enemies:[],allies:[]};
 let model=createGuideModel(data,guide,live);assert.equal(model.next,null);assert.equal(model.autoCompletedItems.length,4);assert.ok(model.laterNeeded>0);assert.match(renderGuide({model},'items',false,image),/核心路线完成，继续选择后期装备/);
 const choice=model.laterChoices.find(i=>!i.blockedReason);guide=selectGuide(guide,changeCompanionPlan(data,guide.selection,'later',choice.id));model=createGuideModel(data,guide,live);assert.equal(model.next.id,choice.id);assert.deepEqual(guide.completedItems,[]);assert.equal(model.autoCompletedItems.length,4);
 let selection={...prepare().selection,bottomQuestPlan:true};for(let n=0;n<3;n++){const current=createGuideModel(data,selectGuide(null,selection)),next=current.laterChoices.find(i=>!i.selected&&!i.blockedReason);assert.ok(next);selection=changeCompanionPlan(data,selection,'later',next.id);}
 const full=selectGuide(null,selection),planned=createGuideModel(data,full),six={...live,inventory:planned.route.slice(0,6).map((item,slot)=>({id:item.id,count:1,slot:slot===3?6:slot>3?slot-1:slot}))};
 const pending=createGuideModel(data,full,six);assert.equal(pending.maxLaterItems,3);assert.equal(pending.laterNeeded,0);assert.equal(pending.next,null);assert.match(renderGuide({model:pending},'items',false,image),/第七件等待本局下路任务/);
 const confirmed={...full,bottomQuestConfirmed:true},after=createGuideModel(data,confirmed,six);assert.equal(after.next.id,planned.route[6].id);assert.equal(storedPreparation(upsertPreparation([],confirmed.selection),confirmed.selection).bottomQuestConfirmed,undefined);
});
