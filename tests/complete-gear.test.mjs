import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {getBuild} from '../src/core/builds.mjs';import {completeGearPlan} from '../src/core/complete-gear.mjs';import {itemConflicts} from '../src/core/mechanics.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
data.builds=JSON.parse(fs.readFileSync(new URL('../data/builds.json',import.meta.url))).entries;
const selection={id:'Ashe',role:'bottom',mode:'rift',conditions:[]},hero=id=>data.champions.find(c=>c.id===id);
const live={matched:true,inventoryKnown:true,inventory:[],gold:0,teamKnown:true,queueId:420,roster:[]};
const build=(id='Ashe',role='bottom',options={})=>getBuild(hero(id),role,data,options);
const signal=(kind,source='scoreboard',priority=70)=>({kind,source,priority,evidence:'公开装备投入'});
const run=(b=build(),extra={})=>completeGearPlan({data,build:b,selection,live,...extra});
test('frontline physical-pressure branch replaces conditional MR while protecting bought, targeted and invested defenses',()=>{
 for(const [id,role,loadoutId] of [['Malphite','top','trio-frontline'],['Sejuani','jungle','trio-jungle-frontline']]){
  const s={id,role,mode:'rift',loadoutId},b=build(id,role,s);
  assert.equal(b.items[1].id,2504);
  const physical=build(id,role,{...s,conditions:['ad']});assert.equal(physical.items[1].id,3143);assert(!physical.items.some(i=>i.id===2504));
  assert.equal(build(id,role,{...s,conditions:['ad','ap']}).items[1].id,2504);
  const signals=[signal('physical','manual',100)],changed=run(b,{selection:s,signals});assert.equal(changed.route[1].id,'3143');assert(changed.updates.some(u=>u.replaces==='2504'));
  for(const extra of [{purchaseTarget:'2504'},{selection:{...s,laterIds:[2504]}},{live:{...live,inventory:[{id:'2504',count:1}]}},{live:{...live,inventory:[{id:'1033',count:1}]}},{signals:[...signals,signal('magic','manual',100)]},{signals:[signal('physical')]}]){
   const retained=run(b,{selection:s,signals,...extra});assert(retained.route.some(i=>i.id==='2504'),JSON.stringify(extra));
  }
 }
});
test('complete ordered defaults fill compatible later slots without modifying preparation',()=>{
 const b=build(),before=JSON.stringify(b),plan=run(b);assert.equal(plan.route.length,6);assert.equal(JSON.stringify(b),before);
 assert(plan.route.every((r,n)=>!itemConflicts(Number(r.id),plan.route.slice(0,n).map(x=>Number(x.id)))));
 assert(plan.route.some(r=>data.items[r.id].tags.includes('Boots')));assert(plan.route.filter(r=>r.suggested).length>0);
});
test('public armor investment changes a full future item and retains two interaction cores',()=>{
 const b=build(),plan=run(b,{signals:[signal('armor')]});assert.equal(plan.updates[0]?.id,'3036');assert.equal(plan.updates[0]?.change,'替换后续');
 assert.deepEqual(plan.route.filter(r=>!data.items[r.id].tags.includes('Boots')).slice(0,2).map(r=>r.id),b.items.filter(r=>!r.tags.includes('Boots')).slice(0,2).map(r=>String(r.id)));
 assert.equal(plan.route.length,6);assert(plan.updates[0].reason.includes('公开装备'));
});
test('existing component investment and personal later choice prevent destructive diversion',()=>{
 const b=build(),first=b.items[0],component=first.from[0];
 const personal=run(build('Ashe','bottom',{laterIds:[3033]}),{selection:{...selection,laterIds:[3033]},signals:[signal('armor')]});
 assert(personal.route.some(r=>r.id==='3033'));assert(!personal.updates.some(u=>u.id==='3036'));assert(!personal.updates.some(u=>u.replaces==='3033'));
 const invested=run(b,{live:{...live,inventory:[{id:String(component),count:3,slot:0}],gold:9999},signals:[signal('magic','manual',100)]});
 assert(invested.route.some(r=>r.id===String(first.id)));assert(!invested.updates.some(u=>u.replaces===String(first.id)));
});

test('an explicitly chosen full-item shopping goal survives a new automatic defensive diversion',()=>{
 const b=build(),before=run(b),target=before.route[2].id;
 const after=run(b,{purchaseTarget:target,signals:[signal('magic','manual',100)]});
 assert(after.route.some(r=>r.id===target));assert(!after.updates.some(u=>u.replaces===target));assert(after.updates.some(u=>u.id==='3156'));
});

test('conditional alternatives explain choices before any observed pressure without changing the route',()=>{
 const plan=run();assert.equal(plan.updates.length,0);assert(plan.alternatives.length>=2&&plan.alternatives.length<=3);
 assert(plan.alternatives.every(a=>a.source==='conditional'&&a.reason.includes('尚未确认')&&a.caution));
 assert(plan.alternatives.every(a=>!plan.route.some(r=>r.id===a.id)));
});

test('enchanter routes keep utility choices under enemy magic resistance while damage mages retain penetration',()=>{
 for(const id of ['Lulu','Janna','Soraka','Nami','Sona','Karma','Milio']){
  const b=build(id,'support'),s={id,role:'support',mode:'rift'},before=run(b,{selection:s}),after=run(b,{selection:s,signals:[signal('resist')]});
  assert.equal(b.routeProfile.enchanter,true,id);assert.deepEqual(after.route.map(i=>i.id),before.route.map(i=>i.id),id+' lost its utility route');assert.equal(after.updates.length,0);
  assert(after.alternatives.every(i=>!['3135','3157','3102'].includes(i.id)),id+' got carry-mage alternatives');assert(after.alternatives.some(i=>['3190','3222','3107'].includes(i.id)),id+' lacks a utility alternative');assert(after.notes.some(n=>n.includes('增益保护')));
 }
 const mage=run(build('Ahri','mid'),{selection:{id:'Ahri',role:'mid',mode:'rift'},signals:[signal('resist')]});assert(mage.updates.some(i=>i.id==='3135'));
});
test('all source cores of protection supports retain their responsibility, including AP-heavy alternatives',()=>{
 let covered=0;
 for(const c of data.champions){
  if(build(c.id,'support').key!=='enchanter')continue;
  const ref=data.builds[c.id+':support'];if(!ref)continue;
  for(const core of ref.core){
   const b=build(c.id,'support',{coreId:'core-'+core.items.join('-')}),s={id:c.id,role:'support',mode:'rift'},before=run(b,{selection:s}),after=run(b,{selection:s,signals:[signal('resist')]});
   assert.equal(b.routeProfile.enchanter,true,c.id+' '+b.selectedCoreId);
   assert.deepEqual(after.route.map(i=>i.id),before.route.map(i=>i.id));assert(!after.updates.some(i=>i.id==='3135'));assert(!after.alternatives.some(i=>['3157','3102','3135'].includes(i.id)));covered++;
  }
 }
 assert(covered>100,'Expected the complete bundled support-source core pool');
 const damage=build('Lux','support');assert.equal(damage.routeProfile.kind,'magic');assert(run(damage,{selection:{id:'Lux',role:'support',mode:'rift'},signals:[signal('resist')]}).updates.some(i=>i.id==='3135'));
});
test('actual completed inventory wins over an unbought conflicting plan without suggesting sales',()=>{
 const plan=run(build(),{live:{...live,inventory:[{id:'3033',count:1,slot:0}]},signals:[signal('armor')]});
 assert(plan.route.some(r=>r.id==='3033'&&r.owned));assert(!plan.route.some(r=>r.id!=='3033'&&itemConflicts(Number(r.id),[3033])));
 assert(plan.route.length<=6);assert(!plan.updates.some(r=>r.replaces==='3033'));
});
test('a different completed pair of boots replaces the planned boots without consuming two route slots',()=>{
 const b=build(),planned=String(b.boots);
 for(const id of ['3047','3111'].filter(id=>id!==planned)){
  const p=run(b,{live:{...live,inventory:[{id,count:1,slot:0}]}});
  assert.equal(p.route.filter(r=>data.items[r.id].tags.includes('Boots')).length,1);
  assert(p.route.some(r=>r.id===id&&r.owned));assert(!p.route.some(r=>r.id===planned));assert.equal(p.route.length,6);
 }
 const component=run(b,{live:{...live,inventory:[{id:'1001',count:1,slot:0}]}});
 assert(component.route.some(r=>r.id===planned));assert(!component.route.some(r=>r.id==='1001'));
 const upgraded=run(build('Ashe','bottom',{bootsId:'boots-3047'}),{live:{...live,inventory:[{id:'3174',count:1,slot:0}]}});
 assert.equal(upgraded.route.filter(r=>data.items[r.id].tags.includes('Boots')).length,1);assert(upgraded.route.find(r=>r.id==='3047')?.owned);
});
test('Live inventory takes precedence over offline manual marks, including incomplete reads',()=>{
 const first=String(build().items[0].id);
 for(const reading of [live,{...live,inventoryKnown:false}]){
  const p=run(build(),{live:reading,completedItems:[first]});
  assert.equal(p.next.id,first);assert(!p.manualProgress);assert(p.route.every(i=>!i.planned&&!i.owned));
 }
 const p=run(build(),{live:{...live,inventory:[{id:first,count:1,slot:0}]},completedItems:[first]});
 assert(p.route.find(i=>i.id===first).owned);assert(!p.manualProgress);assert.notEqual(p.next.id,first);
});
test('team healing reduction avoids redundant auto-buy and preserves a useful alternative',()=>{
 const b=build('Ahri','mid'),p=run(b,{selection:{id:'Ahri',role:'mid',mode:'rift'},signals:[signal('healing','manual',100)],live:{...live,roster:[{side:'ally',champion:'Ashe',itemsKnown:true,inventory:[{id:'3033',count:1}]}]}});
 assert(!p.updates.some(r=>r.kind==='healing'));assert(p.alternatives.some(r=>r.id==='3165'&&r.teamAntiheal));assert(p.notes.some(n=>n.includes('队友')));
});
test('unknown or stale evidence pauses route mutation and support keeps a quest slot',()=>{
 for(const extra of [{live:{...live,queueId:480}},{live:{...live,inventoryKnown:false}},{data:{...data,patch:'16.21'}},{enabled:false}]){const p=run(build(),{signals:[signal('magic','manual',100)],...extra});assert(!p.automatic);assert.equal(p.updates.length,0);}
 const b=build('Lulu','support'),p=run(b,{selection:{id:'Lulu',role:'support',mode:'rift'}});assert(p.reservedSupport);assert(p.route.length<=5);
});

test('a seventh bottom item stays out of the purchase goal until the local quest is explicitly confirmed',()=>{
 const b=build('Ashe','bottom',{bottomQuestPlan:true}),s={...selection,bottomQuestPlan:true};
 const plan=run(b,{selection:s});assert.equal(plan.route.length,7);assert(plan.pendingQuest);assert(plan.route[6].pending);
 const inventory=plan.route.slice(0,6).map((i,n)=>({id:i.id,count:1,slot:n}));
 const heldSix=run(b,{selection:s,live:{...live,inventory}});assert.equal(heldSix.next,null);assert(heldSix.pendingQuest);
 const unlocked=run(b,{selection:s,live:{...live,inventory},bottomQuestConfirmed:true});assert(!unlocked.pendingQuest);assert.equal(unlocked.next?.id,plan.route[6].id);
 const wrongPosition=run(b,{selection:s,bottomQuestEligible:false});assert.equal(wrongPosition.route.length,6);assert(!wrongPosition.pendingQuest);
});
