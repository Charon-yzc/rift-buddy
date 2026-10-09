import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {getBuild} from '../src/core/builds.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {selectGuide,createGuideModel,validateGuideSelection,validateGuideState,reconcileGuide} from '../src/core/guide.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {selectedBuildFields,buildFavoriteId,findSavedBuild} from '../src/core/build-favorites.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
import {companionPlanView} from '../src/companion-view.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {itemConflicts} from '../src/core/mechanics.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const c=data.champions.find(c=>c.id==='Ashe'),base={id:'Ashe',role:'bottom',mode:'rift',coreIndex:0,conditions:[]};
const build=s=>getBuild(c,s.role,data,s);
function seven(){let s=changeCompanionPlan(data,base,'quest-plan');for(const id of [6672,3072,3036])s=changeCompanionPlan(data,s,'later',id);return s;}

test('a deliberate bot quest plan allows three compatible later items without granting other roles or modes seven slots',()=>{
 const s=seven(),b=build(s);assert.equal(b.items.length,7);assert.deepEqual(b.selectedLaterIds,[6672,3072,3036]);assert.equal(b.maxLaterItems,3);
 const selected=[];for(const i of b.items){assert.equal(itemConflicts(i.id,selected),false);selected.push(i.id);}
 assert.deepEqual(validateGuideSelection(s).laterIds,s.laterIds);
 for(const change of [{role:'mid'},{mode:'hex'}])assert.throws(()=>validateGuideSelection({...s,...change}),/额外装备计划/);
 assert.throws(()=>validateGuideSelection({...s,bottomQuestPlan:false}),/后期备选/);
 const off=changeCompanionPlan(data,s,'quest-plan');assert.equal(build(off).items.length,6);assert.equal(off.laterIds.length,2);
 const view=companionPlanView(data,{selection:s,build:b},[]);assert.match(view,/任务后七件计划/);assert.match(view,/已选 3 \/ 3/);assert.match(view,/手动确认完成/);
});

test('changing tactical lane cannot grant another formal position the seventh equipment slot',()=>{
 const s=seven(),b=build(s),state={...selectGuide(null,s),bottomQuestConfirmed:true,completedItems:b.items.slice(0,6).map(i=>String(i.id))};
 const current={id:'Ashe',role:'bottom',mode:'rift',positionKnown:true,formalRole:'support'};
 const model=createGuideModel(data,state,null,current);
 assert.equal(model.live.kind,undefined,'A valid manual tactical position should not become a role mismatch');
 assert.equal(model.bottomQuest.eligible,false);assert.equal(model.bottomQuest.confirmed,false);assert.equal(model.next,null);
 assert.match(model.routeBlocked.at(-1).reason,/客户端分路为辅助/);
 const html=renderGuide({model,current},'items',false,()=>'<img>');
 assert.match(html,/手动方案位置不会授予/);assert.match(html,/data-action="bottom-quest" disabled/);
 assert.doesNotMatch(html,/第七件等待本局下路任务/);
 assert.equal(createGuideModel(data,state,null,{...current,formalRole:'bottom'}).bottomQuest.eligible,true);
 const live={available:true,champion:'Ashe',mode:'rift',position:'mid',queueId:420,at:Date.now(),inventory:[],gold:100,level:9};
 assert.equal(createGuideModel(data,state,live).bottomQuest.eligible,false,'Known live task position should also limit the extra slot');
});

test('seven-item preference survives favorites and actual state save but current-match completion never enters reusable preparation',async()=>{
 const s=seven(),b=build(s),v={...s,build:b};
 const f={id:buildFavoriteId(v),type:'build',title:'任务后七件',champion:s.id,role:s.role,mode:s.mode,conditions:[],coreIndex:0,...selectedBuildFields(v)};
 const store=createPreparationStore();store.remember({...s,bottomQuestConfirmed:true});assert.equal(store.recall(s).bottomQuestConfirmed,undefined);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-bottom-plan-'));await saveState(root,{...defaultState(),favorites:[f],preparations:store.snapshot()});
 const loaded=await readState(root),choice={...base,...loaded.favorites[0],id:s.id};assert.equal(build(choice).items.length,7);
 assert.equal(findSavedBuild(loaded.favorites,{...choice,build:build(choice)}).id,f.id);assert.equal(loaded.preparations[0].bottomQuestPlan,true);
 assert.equal(findSavedBuild(loaded.favorites,{...base,build:build(base)}),undefined);
});

test('the seventh purchase waits for explicit current-match quest completion and confirmation resets at the next game',()=>{
 const s=seven(),b=build(s),state=selectGuide(null,s),inventory=b.items.slice(0,6).map((i,slot)=>({id:String(i.id),count:1,slot:slot===3?6:slot>3?slot-1:slot}));
 const live={available:true,champion:'Ashe',mode:'rift',mapId:11,queueId:420,at:Date.now(),level:18,gold:4000,gameTime:2200,inventory,inventoryKnown:true,skills:{Q:5,W:5,E:5,R:3},enemies:[],allies:[]};
 const before=createGuideModel(data,state,live);assert.equal(before.autoCompletedItems.length,6);assert.equal(before.next,null);assert.equal(before.bottomQuest.confirmed,false);
 assert.match(before.routeBlocked.find(i=>i.id===String(b.items[6].id)).reason,/任务已完成/);
 const header=renderGuide({model:before},'items',false,()=>'<img>').match(/<section class="next-item complete">([\s\S]*?)<\/section>/)?.[1];
 assert.match(header,/第七件等待本局下路任务/);assert.doesNotMatch(header,/互斥|这套路线已完成/);
 assert.match(renderGuide({model:before,ball:true},'items',false,()=>'<img>'),/第七件等待本局下路任务/);
 const confirmed={...state,bottomQuestConfirmed:true,match:{gameId:'100',phase:'InProgress',entered:true}};
 const after=createGuideModel(data,confirmed,live);assert.equal(after.next.id,String(b.items[6].id));assert.equal(after.bottomQuest.confirmed,true);
 assert.match(renderGuide({model:after},'items',false,()=>'<img>'),/撤销本局完成确认/);
 const complete=validateGuideState({...confirmed,completedItems:b.items.map(i=>String(i.id))});assert.equal(complete.completedItems.length,7);
 const completedModel=createGuideModel(data,complete);
 assert.match(renderGuide({model:completedModel},'items',false,()=>'<img>'),/这套路线已完成/);
 const next=reconcileGuide(confirmed,{phase:'ChampSelect',gameId:'101'}).guide;assert.equal(next.bottomQuestConfirmed,false);assert.equal(next.selection.bottomQuestPlan,true);
 assert.equal(createGuideModel(data,next,live).next,null);
 assert.equal(createGuideModel(data,confirmed,live,{id:'Ashe',role:'support',mode:'rift',positionKnown:true}).bottomQuest.confirmed,false);
});
