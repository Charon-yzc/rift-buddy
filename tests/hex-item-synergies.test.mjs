import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexItemSynergies} from '../src/core/hex-item-synergies.mjs';
import {hexMechanismMicroRoutes,rankHexMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderHexRoutes} from '../src/hex-routes-view.mjs';
import {hexMicroRoutesView} from '../src/hex-micro-view.mjs';
const base=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex-item-synergies-16.21.json',import.meta.url)));
const data={...base,...fixture,champions:base.champions,items:{...base.items,...fixture.items}},image=(kind,id)=>`<img data-kind="${kind}" data-id="${id}">`;
const run=(extra={})=>hexItemSynergies({data,hero:'Elise',owned:[1002],preparedItems:[3157,3152,3143],...extra});

test('actual marks and the current prepared items are both required, without changing either input',()=>{
 const before=JSON.stringify(data),[owned]=run(),[offered]=run({owned:[],options:[1002,1996,1129]});
 assert.equal(owned.kind,'item-synergy');assert.equal(owned.state,'owned');assert.equal(offered.state,'offered');assert.deepEqual(offered.gear,owned.gear);
 assert.match(owned.summary,/若购买/);assert.match(owned.play[0],/120→60秒/);assert.match(owned.play[0],/50→25秒/);assert.match(owned.play[0],/90→45秒/);assert.match(owned.caution,/不是实时剩余冷却/);
 for(const extra of [{owned:[],options:[]},{preparedItems:[]},{preparedItems:[3089]},{mode:'rift'},{hero:'Unknown'}])assert.deepEqual(run(extra),[]);
 assert.deepEqual(run({owned:[],options:[1996,1129,1058,1002]}),[],'Only the three actual choices are eligible');
 assert.deepEqual(run({preparedItems:[3157,'3157',{id:'3157'}]})[0].gear[0].items.map(i=>i.id),[3157]);assert.equal(JSON.stringify(data),before);
});

test('attack conditions stay generic and separate damage types instead of certifying hero skills',()=>{
 for(const hero of ['Azir','Ashe']){
  const rows=run({hero,owned:[1129,1058,1996],preparedItems:[3115,3078,3100,6662]});assert.equal(rows.length,3);
  const ap=rows.find(r=>r.augment.id===1129),cycle=rows.find(r=>r.augment.id===1058),sheen=rows.find(r=>r.augment.id===1996);
  assert.match(ap.play[0],/物理伤害.*另算魔法伤害/);assert.match(ap.caution,/沙兵、召唤物、分身等不能据此推定触发/);
  assert.match(cycle.play[1],/不是按装备数量重复减冷却/);assert.match(sheen.play[1],/咒刃装备择一/);assert.match(sheen.basis,/不代表已购买、英雄适配/);
  assert.equal(sheen.gear[0].items.find(i=>i.id===6662).id,6662);assert.equal(data.items[6662].tooltip.status,'partial');
 }
 assert.equal(run({owned:[1058],preparedItems:[3115,3078]})[0].play[0].match(/1\.25秒/g).length,1);
});

test('a single dependency drift withdraws the corresponding explanation, not other valid items or marks',()=>{
 const mutations=[d=>d.items[3157].tooltip.description+=' hotfix',d=>d.items[3157].tooltip.status='partial',d=>d.items[3157].tooltip.patch='16.22',d=>d.items[3157].tooltip.source='https://example.invalid/item',d=>d.items[3157].description+=' changed',d=>d.items[3157].stats.FlatMagicDamageMod++,d=>d.items[3157].maps['12']=false,d=>d.items[3157].inStore=false,d=>d.items[3157].gold.purchasable=false,d=>delete d.items[3157]];
 for(const mutate of mutations){const changed=structuredClone(data);mutate(changed);assert.deepEqual(run({data:changed,preparedItems:[3157]}),[]);assert.deepEqual(run({data:changed,preparedItems:[3157,3152]})[0].gear[0].items.map(i=>i.id),[3152]);}
 for(const mutate of [d=>d.patch='16.22',d=>d.version='16.20.1',d=>d.augmentError='unavailable',d=>d.augmentVersion='16.20.1',d=>d.sources.augmentDescriptions='https://example.invalid/augments',d=>d.augments=[],d=>d.augments.find(a=>a.id===1002).description+=' changed',d=>d.augments.find(a=>a.id===1002).key='Other',d=>d.augments.find(a=>a.id===1002).descriptionStatus='partial']){const changed=structuredClone(data);mutate(changed);assert.deepEqual(run({data:changed}),[]);}
 const disabled=structuredClone(data);disabled.augments.find(a=>a.id===1002).catalogEnabled=false;assert.deepEqual(run({data:disabled,owned:[],options:[1002]}),[]);assert.equal(run({data:disabled})[0].catalogDisabled,true);
});

test('guide and micro retain prepared semantics even when inventory disagrees, and actual marks can be removed',()=>{
 const state=selectGuide(null,{id:'Elise',role:'mid',mode:'hex',ownedAugmentIds:[1002,1129]}),before=JSON.stringify(state),m=createGuideModel(data,state,{champion:'Elise',mode:'hex',role:'mid',matched:true,inventoryKnown:true,inventory:[]});
 const route=m.hexRoutes.find(r=>r.kind==='item-synergy');assert(route);assert.deepEqual(route.gear[0].items.map(i=>i.id),[3157]);assert.match(route.summary,/若购买/);assert.equal(JSON.stringify(state),before);
 const [micro]=m.hexMicroRoutes;assert.equal(micro.kind,'item-synergy');assert.equal(micro.augments[0].owned,true);assert.match(micro.items[0].brief,/当前方案.*若购买/);
 const html=renderHexRoutes([route],{guide:true,image});assert.match(html,/已选强化 · 条件联动/);assert.match(html,/查看强化原文/);assert.doesNotMatch(html,/已选适用/);
 const compact=hexMicroRoutesView([micro],image);assert.match(compact,/联动条件/);assert.doesNotMatch(compact,/核心 ·/);
 const removed=selectGuide(state,{...state.selection,ownedAugmentIds:[]});assert(createGuideModel(data,removed).hexRoutes.every(r=>r.kind!=='item-synergy'));
 const offered=run({owned:[],options:[1996],preparedItems:[3078]});assert.equal(hexMechanismMicroRoutes(offered)[0].augments[0].owned,false);
 assert.equal(rankHexMicroRoutes([...hexMechanismMicroRoutes(offered),micro],{owned:[1002],options:[1996]})[0],micro);
 assert.equal(m.hexMicroRoutes[1].kind,'reference');assert(m.hexMicroRoutes[1].items.length);assert(m.hexMicroRoutes[1].augments.some(a=>a.id===1129&&a.brief.startsWith('本局已选')));
});

test('same-core authored routes retain precedence and do not duplicate the conditional item explanation',async()=>{
 const current=JSON.parse(await fs.readFile(new URL('./fixtures/hex-routes-16.21.json',import.meta.url))).game;
 const updated={...data,champions:data.champions.map(c=>({...c,...current.champions.find(row=>row.id===c.id)}))};
 const model=createGuideModel(updated,selectGuide(null,{id:'Camille',role:'top',mode:'hex',ownedAugmentIds:[1996]}));
 const same=model.hexRoutes.filter(r=>r.augment.id===1996);assert.equal(same.length,1);assert.notEqual(same[0].kind,'item-synergy');assert.match(same[0].play[0],/1\.5秒/);
 assert.equal(model.hexMicroRoutes[0].id,'Camille-1996');
});

test('validated independent micro routes also take precedence, while a withdrawn route permits conditional fallback',async()=>{
 const current=JSON.parse(await fs.readFile(new URL('./fixtures/hex-routes-16.21.json',import.meta.url))).game;
 const updated=structuredClone({...data,champions:data.champions.map(c=>({...c,...current.champions.find(row=>row.id===c.id)}))});
 // Isolated legal prepared plan; no statistical sample or source claim.
 updated.hexBuilds.Yasuo={...updated.hexBuilds.Camille,champion:'Yasuo',sourceUrl:'https://op.gg/lol/modes/aram-mayhem/yasuo/build?region=global&tier=all&patch=16.21',core:[{items:[3078,3115,3031],samples:0,pickRate:null,winRate:null}],augmentIds:[1058]};
 const state=selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex',ownedAugmentIds:[1058]});
 const normal=createGuideModel(updated,state);assert(normal.route.some(i=>String(i.id)==='3078'));assert(normal.hexMicroRoutes.some(r=>r.id==='yasuo-attack-cycle'));assert(!normal.hexMicroRoutes.some(r=>r.id==='Yasuo-item-1058'));
 updated.items[3031].description+=' changed';const withdrawn=createGuideModel(updated,state);
 assert(!withdrawn.hexMicroRoutes.some(r=>r.id==='yasuo-attack-cycle'));assert(withdrawn.hexMicroRoutes.some(r=>r.id==='Yasuo-item-1058'));
});

test('equipment upgrades keep per-target clocks, deferred damage and replacement stats precise',()=>{
 const pairs=[[1318,3157],[2143,6610],[2157,6333],[2140,3074]],rows=run({owned:pairs.map(p=>p[0]),preparedItems:pairs.map(p=>p[1])});
 assert.equal(rows.length,4);for(const [id,item] of pairs){const row=rows.find(r=>r.augment.id===id);assert(row);assert.equal(row.state,'owned');assert.deepEqual(row.gear[0].items.map(i=>i.id),[item]);assert.match(row.summary,/若购买/);assert.match(row.play[0],/金币不代表/);assert.equal(row.kind,'item-synergy');}
 const by=id=>rows.find(r=>r.augment.id===id);
 assert.match(by(1318).brief,/45秒.*其他装备急速另核对/);assert.match(by(1318).caution,/不合算其他装备急速/);
 assert.match(by(2143).brief,/每个目标.*5秒.*9%已损生命/);assert.match(by(2143).caution,/不是最大生命值.*不与原装备比例直接相加/);
 assert.match(by(2157).brief,/暂缓近战40%／远程15%.*仍会流血/);assert.match(by(2157).caution,/不是直接免除.*不编造/);
 assert.match(by(2140).play[1],/变为20%，不是额外再加20%/);assert.match(by(2140).caution,/不把生命偷取推广为所有技能伤害吸血/);
 const combined=run({owned:[1002,1318],preparedItems:[3157]});assert.equal(combined.length,2);assert(combined.every(r=>!JSON.stringify(r).includes('22.5')));
 for(const [id,item] of pairs){assert.equal(run({owned:[],options:[id],preparedItems:[item]})[0].state,'offered');assert.deepEqual(run({owned:[id],preparedItems:[3089]}),[]);const changed=structuredClone(data);changed.augments.find(a=>a.id===id).description+=' changed';assert.deepEqual(run({data:changed,owned:[id],preparedItems:[item]}),[]);changed.augments=data.augments;changed.items[item].tooltip.description+=' changed';assert.deepEqual(run({data:changed,owned:[id],preparedItems:[item]}),[]);}
});
