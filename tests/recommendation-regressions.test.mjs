import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getBuild} from '../src/core/builds.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {assessSituation,pinnedSituationItem,situationItemIssue,inventoryFulfillsItem} from '../src/core/live-situation.mjs';
import {adaptEquipment} from '../src/core/adaptive-build.mjs';
import {itemConflicts} from '../src/core/mechanics.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);
const rows=ids=>ids.map(id=>({items:[id],samples:100}));
const player=(champion,ids)=>({champion,side:'enemy',itemsKnown:true,inventory:ids.map(id=>({id:String(id),count:1})),scores:{kills:0}});
const live=(champion,roster=[],inventory=[])=>({available:true,at:Date.now(),champion,mode:'rift',mapId:11,gold:1800,level:12,skills:{Q:5,W:3,E:1,R:2},inventory,roster,teamKnown:true});
const apCore=data.builds['KogMaw:bottom'].core.find(c=>c.items.filter(id=>data.items[id]?.stats?.FlatMagicDamageMod>0).length>=2);
const apCoreId='core-'+apCore.items.join('-');

test('utility equipment alone does not establish magic grievous-wound application',()=>{
 const options={items:[3504,6617,3107],late:[],boots:3158,key:'crit',champion:'Twitch',support:true,data,conditions:['heal']};
 const build=adaptEquipment(options);
 assert.equal(build.routeProfile.enchanter,true);assert.equal(build.routeProfile.uncertain,true);
 assert.equal(build.early.includes(3916),false);assert.equal(build.sequence.includes(3165),false);
 assert.match(build.adjustments.at(-1).text,/主要伤害类型未确认/);
});

test('explicit later choices fill remaining slots and skip repeats, mutually exclusive items, boots and unavailable items',()=>{
 const ref={...data.builds['Ashe:bottom'],core:[{items:[6672,3031,3046],samples:100}],boots:rows([3006]),later:[rows([6672,3006,3599,3901,2003,3036,3033,3072])],laterBasis:'all-orders'};
 const fixture={...data,builds:{'Ashe:bottom':ref}};
 assert.equal(getBuild(hero('Ashe'),'bottom',fixture).items.length,4);
 const build=getBuild(hero('Ashe'),'bottom',fixture,{laterIds:[3036,3072]});
 assert.deepEqual(build.items.map(i=>i.id),[6672,3031,3046,3006,3036,3072]);
 for(const [index,i] of build.items.entries())assert.equal(itemConflicts(i.id,build.items.slice(0,index).map(x=>x.id)),false);
 const guide=createGuideModel(fixture,selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift',laterIds:[3036,3072]}),live('Ashe',[],build.items.slice(0,5).map(i=>({id:String(i.id),count:1}))));
 assert.equal(guide.next.id,'3072','Fifth purchase must not prematurely finish a six-slot route');
 assert.equal(ref.later[0].length,8,'Selection must not mutate the cached reference');
});

test('ordered HTML purchase groups retain one choice per position, and a scarce pool never invents a completion',()=>{
 const original=data.builds['Ashe:bottom'];
 const ref={...original,core:[{items:[6672,3031,3046],samples:100}],boots:rows([3006]),later:[rows([3036,3072]),rows([3026,3091])]};
 delete ref.laterBasis;
 const fixture={...data,builds:{'Ashe:bottom':ref}};
 assert.deepEqual(getBuild(hero('Ashe'),'bottom',fixture).items.map(i=>i.id),[6672,3031,3046,3006,3036,3026]);
 fixture.builds['Ashe:bottom']={...ref,laterBasis:'all-orders',later:[rows([6672,3036,3033])]};
 assert.equal(getBuild(hero('Ashe'),'bottom',fixture).items.length,4);
});

test('later choices exclude source components and support quest rewards while keeping completed low-cost and transforming items',()=>{
 const original=data.builds['Ashe:bottom'];
 const ref={...original,core:[{items:[6672,3031,3046],samples:100}],boots:rows([3006]),later:[rows([1082,1038,3070,1055,3865,3869,3870,3041,2526])],laterBasis:'all-orders'};
 const fixture={...data,builds:{'Ashe:bottom':ref}};
 assert.deepEqual(getBuild(hero('Ashe'),'bottom',fixture,{laterIds:[3041,2526]}).items.map(i=>i.id),[6672,3031,3046,3006,3041,2526]);
 for(const [champion,role,badId] of [['Galio','mid',1082],['Lucian','bottom',1038],['Taric','support',3070],['Alistar','support',3869]]){
  assert.equal(getBuild(hero(champion),role,data).items.some(i=>i.id===badId),false,`${champion}:${role} must not end with ${badId}`);
 }
});

test('the default skill identity stays stable when a different source skill is selected',()=>{
 for(const comboId of [null,'ashe-taric']){
  const base=getBuild(hero('Ashe'),'bottom',data,{comboId});
  const other=base.skillChoices.find(s=>s.id!==base.defaultSkillId);assert.ok(other);
  const changed=getBuild(hero('Ashe'),'bottom',data,{comboId,skillId:other.id});
  assert.equal(base.selectedSkillId,base.defaultSkillId);assert.equal(changed.defaultSkillId,base.defaultSkillId);assert.equal(changed.selectedSkillId,other.id);
 }
});

test('support explicit later choices preserve the quest slot and unselected source pools do not invent completions',()=>{
 const ref={...data.builds['Ashe:support'],core:[{items:[6672,3031,3046],samples:100}],boots:rows([3006]),later:[rows([3036,3072])],laterBasis:'all-orders'};
 const fixture={...data,builds:{'Ashe:support':ref}};
 const support=getBuild(hero('Ashe'),'support',fixture,{laterIds:[3036,3072]});
 assert.equal(support.items.length,5);assert.equal(support.granted.length,1);
 assert.equal(getBuild(hero('Ashe'),'bottom',data).items.length,4);
});

test('AP KogMaw route uses magic resist answers, never percentage armor penetration from the static on-hit key',()=>{
 const selection={id:'KogMaw',role:'bottom',mode:'rift',coreId:apCoreId};
 const get=ids=>createGuideModel(data,selectGuide(null,selection),live('KogMaw',[player('Malphite',[ids[0]]),player('Rammus',[ids[1]])]));
 const armor=get([3075,3143]),resist=get([3065,4401]);
 assert.deepEqual(armor.route.slice(0,3).map(i=>Number(i.id)),apCore.items);
 assert.equal(armor.situation.candidates.some(c=>c.id==='3035'),false);
 const magic=resist.situation.candidates.find(c=>c.id==='4630');assert.ok(magic);assert.match(magic.reason,/所选核心.*法强/);
 const adapted=getBuild(hero('KogMaw'),'bottom',data,{coreId:apCoreId,conditions:['ap','heal','burst']});
 for(const id of [3102,3165,3157])assert.ok(adapted.items.some(i=>i.id===id),String(id));
 for(const id of [3156,3033,3026])assert.equal(adapted.items.some(i=>i.id===id),false,String(id));
 assert.equal(adapted.selectedCoreId,apCoreId);
});

test('AP does not automatically establish magic damage, and mixed routes keep their core under output conditions',()=>{
 for(const champion of ['Twitch','Ashe']){
  const adaptive=adaptEquipment({items:[6655,4645,3089],late:[3135,3157],boots:3020,key:'crit',champion,data,conditions:['heal','ap']});
  assert.equal(adaptive.routeProfile.magic,false);assert.equal(adaptive.routeProfile.physical,false);
  assert.equal(adaptive.sequence.includes(3033),false);assert.equal(adaptive.sequence.includes(3165),false);
  const situation=assessSituation({data,champion,build:{key:'crit',items:[data.items[6655],data.items[4645],data.items[3089]]},selection:{mode:'rift',conditions:['heal']},live:live(champion,[player('Malphite',[3075]),player('Rammus',[3143])])});
  assert.equal(situation.candidates.some(c=>['3035','4630','3916','3123'].includes(c.id)),false);
  assert.match(adaptive.adjustments.map(a=>a.text).join(' '),/不能证明实际伤害/);
 }
 const mixed=adaptEquipment({items:[6655,3153,3089],boots:3020,key:'mage',champion:'Lux',data,conditions:['heal','ap','burst']});
 assert.equal(mixed.routeProfile.uncertain,true);assert.deepEqual(mixed.sequence.slice(0,3),[6655,3153,3089]);
});

test('tank and attack routes override a stale static mage key without claiming a fixed damage share',()=>{
 const tank=adaptEquipment({items:[3068,2504,6665],boots:3047,key:'mage',champion:'Malphite',data,conditions:['heal']});
 assert.equal(tank.routeProfile.tank,true);assert.ok(tank.sequence.includes(3075));assert.equal(tank.sequence.includes(3165),false);
 const attack=adaptEquipment({items:[3153,6672,3031],boots:3006,key:'mage',champion:'Neeko',data,conditions:['ap']});
 assert.equal(attack.routeProfile.physical,true);assert.ok(attack.sequence.includes(3156));assert.equal(attack.sequence.includes(3102),false);
});

test('pinned incompatible boots are blocked even when the same boots occur in the normal route',()=>{
 const inventory=[{id:'3111',count:1,slot:7}];
 assert.match(situationItemIssue({data,id:'3047',inventory}),/另一双成鞋/);
 assert.equal(pinnedSituationItem({data,id:'3047',mode:'rift',inventory}),null);
 assert.ok(pinnedSituationItem({data,id:'3047',mode:'rift',inventory:[{id:'1001',count:1,slot:7}]}),'Base boots remain a valid upgrade component');
 const selection={id:'Ashe',role:'bottom',mode:'rift',conditions:['ad']};
 const guide={...selectGuide(null,selection),purchaseTarget:'3047',purchaseTargetKind:'situation'};
 const model=createGuideModel(data,guide,live('Ashe',[],inventory));
 assert.notEqual(model.next?.id,'3047');assert.equal(model.targetFallback,true);
 assert.equal(guide.purchaseTarget,'3047','Keep the stored manual intent for later user review');
 assert.ok(model.shoppingTargets.find(i=>i.id==='3047').blockedReason);
});

test('pinned situation components reject mutually exclusive completed families but ignore empty inventory records',()=>{
 assert.equal(pinnedSituationItem({data,id:'3190',mode:'rift',inventory:[{id:'3111',count:1}]}).id,3190);
 assert.ok(pinnedSituationItem({data,id:'3047',mode:'rift',inventory:[{id:'3111',count:0}]}));
 assert.equal(pinnedSituationItem({data,id:'4630',mode:'rift',inventory:[{id:'3135',count:1}]}),null,'A held upgrade fulfills the component already');
});

test('boot upgrades stay valid purchases and already upgraded boots fulfill the original footwear target',()=>{
 const base=[{id:'3047',count:1}],upgraded=[{id:'3174',count:1}];
 assert.equal(situationItemIssue({data,id:'3174',inventory:base}),null);
 assert.equal(situationItemIssue({data,id:'3047',inventory:upgraded}),null);
 assert.equal(inventoryFulfillsItem({data,id:'3047',inventory:upgraded}),true);
 assert.equal(pinnedSituationItem({data,id:'3047',mode:'rift',inventory:upgraded}),null);
 const selection={id:'Ashe',role:'bottom',mode:'rift',conditions:['ad']};
 const guide={...selectGuide(null,selection),purchaseTarget:'3047',purchaseTargetKind:'situation'};
 const model=createGuideModel(data,guide,live('Ashe',[],upgraded));
 assert.notEqual(model.next?.id,'3047');assert.ok(model.autoCompletedItems.includes('3047'));
});
