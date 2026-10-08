import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {purchasePlan,purchaseAction} from '../src/core/purchase.mjs';
import {gamePhase} from '../src/core/guide-stage.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const selection={id:'Ashe',role:'bottom',mode:'rift'};
const live=()=>({available:true,champion:'Ashe',mode:'rift',mapId:11,level:9,gold:800,inventory:[],skills:{Q:4,W:2,E:2,R:1},stats:{ad:120,ap:0,armor:50,mr:40,atkSpeed:1,hp:1,maxHp:1500},at:Date.now(),teamKnown:true,roster:[],enemies:[{id:'Soraka',name:'索拉卡',level:9,items:[]},{id:'Zed',name:'劫',level:9,items:[]}],gameTime:650});
const make=(change={})=>createGuideModel(data,selectGuide(null,{...selection,...change}),live());

test('purchase view has no shrink-to-ball entry, duel pickers or duplicated combat numbers',()=>{
 const m=make(),html=renderGuide({model:m,phase:'InProgress'},'items',false,()=>'<img>');
 assert.doesNotMatch(html,/data-action="ball"|class="verdict|guide-duel-own|6 秒持续/);
 assert.match(html,/本次回城/);assert.match(html,/data-tab="combat"/);
 assert.equal((html.match(/<main>/g)||[]).length,1);
});
test('combat display follows the explicit opponent, and a vanished target cannot silently become another enemy',()=>{
 const focused=make({threatId:'Soraka'});assert.equal(focused.estimate.enemy.id,'Soraka');
 const html=renderGuide({model:focused},'combat',false,()=>'<img>');
 assert.match(html,/伤害参考 · 索拉卡/);assert.doesNotMatch(html,/偏你|偏对方|均势|模型提示/);
 const missing=make({threatId:'Jinx'});assert.equal(missing.estimate.targetSelected,false);assert.equal(missing.estimate.targetMissing,true);
 assert.match(renderGuide({model:missing},'combat',false,()=>'<img>'),/所选对手、等级或装备暂不可读/);
 assert.doesNotMatch(renderGuide({model:missing},'combat',false,()=>'<img>'),/伤害参考 · 劫/);
});
test('a cheap component never gets described as funding its expensive completed item or a safe recall',()=>{
 const action={kind:'component',name:'长剑',shortfall:0};
 const text=gamePhase({matched:true,gameTime:500,gold:400},action,{name:'无尽之刃'}).tips.join('');
 assert.match(text,/长剑组件/);assert.doesNotMatch(text,/钱够无尽|推完这波线就回/);
 const upgrade=gamePhase({matched:true,gameTime:500,gold:0},{kind:'upgrade',name:'基础鞋',shortfall:0}).tips.join('');
 assert.doesNotMatch(upgrade,/金币可买/);
});
test('a full inventory blocks an unconsumed component but allows a combine using owned parts',()=>{
 const items={a:{name:'成装',gold:{total:2000},from:['b','c']},b:{name:'组件乙',gold:{total:800}},c:{name:'组件丙',gold:{total:400}}};
 const bag=Array.from({length:6},(_,slot)=>({id:'unrelated'+slot,count:1,slot}));
 const target={id:'a',name:'成装'},blocked=purchaseAction(purchasePlan([target],items,bag,1000)[0],target,1000,bag);
 assert.equal(blocked.kind,'space');assert.equal(blocked.shortfall,null);
 const held=[{id:'b',count:1,slot:0},...bag.slice(1)],combine=purchaseAction(purchasePlan([target],items,held,1500)[0],target,1500,held);
 assert.equal(combine.kind,'complete');assert.equal(combine.id,'a');assert.equal(combine.cost,1200);
 const withTrinket=bag.slice(0,5).concat({id:'3340',count:1,slot:6});
 assert.equal(purchaseAction(purchasePlan([target],items,withTrinket,500)[0],target,500,withTrinket).kind,'component');
});
test('legacy ball and compact mode have an explicit text recovery action',()=>{
 const m=make();assert.match(renderGuide({model:m,ball:true},'items',false,()=>'<img>'),/ball-label">展开/);
 assert.match(renderGuide({model:{...m,collapsed:true}},'items',false,()=>'<img>'),/data-action="collapse"[^>]*>展开/);
});
