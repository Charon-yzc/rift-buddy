import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {inventoryFulfillsItem,situationItemIssue} from '../src/core/live-situation.mjs';
import {purchasePlan} from '../src/core/purchase.mjs';

const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const bag=ids=>ids.map(id=>({id:String(id),count:1}));
const snapshot=(ids,{gold=0,roster=[]}={})=>({available:true,at:Date.now(),champion:'Ezreal',mode:'rift',mapId:11,gold,level:12,skills:{Q:5,W:3,E:1,R:2},inventory:bag(ids),roster,teamKnown:true});
const selection={id:'Ezreal',role:'bottom',mode:'rift'};
const guide=(fixture,ids,{state=selectGuide(null,selection),...liveOptions}={})=>createGuideModel(fixture,state,snapshot(ids,liveOptions));

test('the real default Ezreal route offers Muramana task upgrade from an owned Manamune',()=>{
 const model=guide(data,[3078,3004]);
 assert.deepEqual(model.route.slice(0,3).map(i=>i.id),['3078','3042','3161']);
 assert.equal(model.next.id,'3042');assert.equal(model.action.kind,'upgrade');
 assert.equal(model.action.id,'3004');assert.equal(model.action.cost,0);
 assert.equal(model.routeBlocked.some(i=>i.id==='3042'),false);
 assert.equal(model.shoppingTargets.find(i=>i.id==='3042').blockedReason,null);
 assert.equal(model.autoCompletedItems.includes('3042'),false,'Owning the base does not mean its task upgrade is complete');
});

test('each mana task family allows its own upgrade and blocks a different branch',()=>{
 for(const [base,target] of [[3004,3042],[3003,3040],[3119,3121]]){
  const fixture={...data,builds:{...data.builds,'Ezreal:bottom':{...data.builds['Ezreal:bottom'],core:[{items:[3078,target,3161],samples:1}]}}};
  const model=guide(fixture,[3078,base]);
  assert.equal(situationItemIssue({data,id:String(target),inventory:bag([base])}),null);
  assert.equal(model.next.id,String(target));assert.equal(model.action.kind,'upgrade');assert.equal(model.action.id,String(base));
  assert.equal(model.routeBlocked.some(i=>i.id===String(target)),false);
  const otherBase=base===3004?3003:3004,other=guide(fixture,[3078,otherBase]);
  assert.match(situationItemIssue({data,id:String(target),inventory:bag([otherBase])}),/互斥/);
  assert.ok(other.routeBlocked.some(i=>i.id===String(target)));
  assert.notEqual(other.next?.id,String(target));
 }
});

test('task and normal recipe ownership is directional, without dismantling finished equipment for recipe credit',()=>{
 for(const [base,upgraded] of [[3004,3042],[3003,3040],[3119,3121],[3047,3174]]){
  assert.equal(inventoryFulfillsItem({data,id:String(base),inventory:bag([upgraded])}),true);
  assert.equal(inventoryFulfillsItem({data,id:String(upgraded),inventory:bag([base])}),false);
  assert.equal(inventoryFulfillsItem({data,id:String(base),inventory:[{id:String(upgraded),count:0}]}),false);
 }
 assert.equal(inventoryFulfillsItem({data,id:'3040',inventory:bag([3042])}),false,'Sharing Tear does not fulfill another mana branch');
 const upgraded=guide(data,[3078,3042]);assert.ok(upgraded.autoCompletedItems.includes('3042'));assert.notEqual(upgraded.next?.id,'3042');
 // A completed weapon is not broken into its Long Sword recipe by the planner.
 const component=purchasePlan([{id:'1036'}],data.items,bag([3156]),0)[0];
 assert.equal(component.credit,0);assert.equal(component.owned,false);
});

test('affordable actual next core wins over a detour even when a blocked earlier route item reserves its component',()=>{
 const roster=['Jhin','Jinx'].map((champion,index)=>({champion,side:'enemy',itemsKnown:true,inventory:bag([index?6672:3031]),scores:{kills:0}}));
 const state=selectGuide(null,{...selection,coreId:'core-3078-3042-3156'});
 const model=guide(data,[3078,3040,1036],{state,gold:2750,roster});
 assert.ok(model.routeBlocked.some(i=>i.id==='3042'));
 assert.ok(model.situation.candidates.some(i=>i.id==='1029'),'The defensive alternative still exists for manual choice');
 assert.equal(model.next.id,'3156');assert.equal(model.automaticTarget,false);
 assert.equal(model.action.kind,'complete');assert.equal(model.action.cost,2750);
 assert.equal(model.targetPlan.credit,350);
 assert.equal(model.purchase.find(i=>i.id==='3156').credit,0,'Keep full-route display allocation intact');
 const original=purchasePlan(model.route,data.items,bag([3078,3040,1036]),2750);
 assert.deepEqual(model.purchase,original);
});

test('an unaffordable next core still permits a valid detour and an explicit target remains authoritative',()=>{
 const roster=['Jhin','Jinx'].map((champion,index)=>({champion,side:'enemy',itemsKnown:true,inventory:bag([index?6672:3031]),scores:{kills:0}}));
 const state=selectGuide(null,{...selection,coreId:'core-3078-3042-3156'});
 const model=guide(data,[3078,3040,1036],{state,gold:300,roster});
 assert.equal(model.next.id,'1029');assert.equal(model.automaticTarget,true);
 const manual=guide(data,[3078,3040,1036],{state:{...state,purchaseTarget:'3156'},gold:300,roster});
 assert.equal(manual.next.id,'3156');assert.equal(manual.automaticTarget,false);
});

test('mixed normal and task recipe cycles terminate and never turn an unrelated target into owned',()=>{
 const fixture={items:{1:{from:['2'],specialRecipe:3},2:{from:['1']},3:{specialRecipe:4},4:{from:['3']}}};
 assert.equal(inventoryFulfillsItem({data:fixture,id:'4',inventory:bag([1])}),true);
 assert.equal(inventoryFulfillsItem({data:fixture,id:'999',inventory:bag([1])}),false);
 const items={};for(let id=1;id<=100;id++)items[id]={specialRecipe:id===100?1:id+1};
 assert.equal(inventoryFulfillsItem({data:{items},id:'101',inventory:bag([1])}),false);
 assert.equal(inventoryFulfillsItem({data:{items},id:'100',inventory:bag([1])}),false,'Traversal remains bounded even for corrupt long recipes');
});
