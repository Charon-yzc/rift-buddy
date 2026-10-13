import {invalidatePreparationStatuses,confirmPreparationResource,samePreparationPayload,invalidateItemSetStatuses,itemSetSuccessStatus} from '../src/preparation-receipts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getBuild} from '../src/core/builds.mjs';
import {clientPreparationPlan,clientPreparationKey} from '../src/client-preparation-view.mjs';
import {preparationProgress,preparationProgressView} from '../src/preparation-progress-view.mjs';
const data=JSON.parse(fs.readFileSync('data/game.json'));data.builds=JSON.parse(fs.readFileSync('data/builds.json')).entries;
const selection={id:'Ashe',role:'bottom',mode:'rift'},hero=data.champions.find(c=>c.id===selection.id);
const make=s=>({selection:s,build:getBuild(hero,s.role,data,s)}),plan=make(selection);
const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:991,localPlayerCellId:0,myTeam:[{cellId:0,championId:hero.key}],actions:[[{type:'pick',actorCellId:0,championId:hero.key,completed:true}]]}};
const record=(failure=null)=>({complete:!failure,steps:Object.fromEntries(['hover','runes','spells','items'].map((k,i)=>[k,{status:failure===k?'failed':failure&&i>['hover','runes','spells','items'].indexOf(failure)?'skipped':'done',...(failure===k?{message:'模拟失败 <source>'}:{})}]))});
test('client lock is independent from preparation, including each failed or unexecuted step',()=>{
 const empty=preparationProgress({data,plan,client});assert.equal(empty.complete,false);assert.equal(empty.locked,true);assert.match(empty.title,/尚未准备/);
 for(const failure of ['hover','runes','spells','items']){const statuses=new Map([[clientPreparationKey(client,clientPreparationPlan(data,plan)),record(failure)]]);const p=preparationProgress({data,plan,client,statuses});assert.equal(p.locked,true);assert.equal(p.complete,false);assert.deepEqual(p.failed,[failure]);const html=preparationProgressView({data,plan,client,statuses,available:true});assert.match(html,/模拟失败 &lt;source&gt;/);assert.match(html,/重新执行整套/);assert.doesNotMatch(html,/配置完成，请在客户端锁定/);if(failure==='items')assert.match(html,/导出本次装备集/);}
});
test('only the identical configuration in the known current game can display a complete result',()=>{
 const prepared=clientPreparationPlan(data,plan),statuses=new Map([[clientPreparationKey(client,prepared),record()]]);
 assert.equal(preparationProgress({data,plan,client,statuses}).complete,true);
 const modified=make({...selection,summonerIds:[...plan.build.summoners].reverse()}),p=preparationProgress({data,plan:modified,client,statuses});assert.equal(p.complete,false);assert.equal(p.changed,true);assert.match(p.title,/有修改/);
 assert.equal(preparationProgress({data,plan,client,statuses}).complete,true,'Browsing a changed payload retains the original result');
 for(const changed of [{...client,phase:'Lobby'},{...client,connected:false},{...client,mode:{id:'unknown'}},{...client,session:{...client.session,gameId:992}},{...client,session:{...client.session,myTeam:[{cellId:0,championId:222}]}}]){const p=preparationProgress({data,plan,client:changed,statuses});assert.equal(p.complete,false);assert.equal(p.changed,false);}
});
test('unknown role has a direct read-only entry and busy operation belongs to one payload',()=>{
 assert.match(preparationProgressView({data,plan:null,client}),/data-action="task-members"/);
 const guessed={...plan,positionKnown:false};
 assert.match(preparationProgressView({data,plan:guessed,client,available:true}),/data-action="client-prepare"[^>]*disabled/);
 assert.match(preparationProgressView({data,plan:guessed,client,available:true}),/位置待确认/);
 assert.equal(preparationProgress({data,plan:guessed,client}).applicable,false);
 const pendingKey=clientPreparationKey(client,clientPreparationPlan(data,plan));assert.equal(preparationProgress({data,plan,client,pendingKey}).pending,true);
 const other=make({...selection,summonerIds:[...plan.build.summoners].reverse()});assert.equal(preparationProgress({data,plan:other,client,pendingKey}).pending,false);
});

test('A → B → A cannot revive overwritten resource confirmations; browsing alone can',()=>{
 const prepared=clientPreparationPlan(data,plan),key=clientPreparationKey(client,prepared),statuses=new Map([[key,record()]]);
 assert.equal(preparationProgress({data,plan,client,statuses}).complete,true);
 invalidatePreparationStatuses(statuses,['hover','runes','spells','items']);
 const other=make({...selection,summonerIds:[...plan.build.summoners].reverse()}),b=clientPreparationPlan(data,other);
 statuses.set(clientPreparationKey(client,b),record());
 assert.equal(preparationProgress({data,plan:other,client,statuses}).complete,true);
 assert.equal(preparationProgress({data,plan,client,statuses}).complete,false);
 assert.match(preparationProgress({data,plan,client,statuses}).title,/后续操作替换/);
 invalidatePreparationStatuses(statuses,['runes']);assert.equal(preparationProgress({data,plan:other,client,statuses}).complete,false);
 assert.equal(statuses.get(clientPreparationKey(client,b)).steps.spells.status,'done');
 confirmPreparationResource(statuses,'runes',payload=>samePreparationPayload({page:payload.page},{page:b.value.page}));assert.equal(preparationProgress({data,plan:other,client,statuses}).complete,true);assert.equal(preparationProgress({data,plan,client,statuses}).complete,false);
 invalidatePreparationStatuses(statuses,['items']);assert.equal(preparationProgress({data,plan:other,client,statuses}).complete,false);
});
test('successful steps survive a post-write save/sync warning',()=>{
 const key=clientPreparationKey(client,clientPreparationPlan(data,plan)),statuses=new Map([[key,{...record(),followUpError:'模拟后续保存失败'}]]),p=preparationProgress({data,plan,client,statuses});assert.equal(p.complete,true);assert.equal(p.failed.length,0);
 const html=preparationProgressView({data,plan,client,statuses,available:true});assert.match(html,/配置回执已保留/);assert.match(html,/模拟后续保存失败/);assert.equal((html.match(/data-step-status="done"/g)||[]).length,4);
});

test('failed hover remains actionable while the client still has no target hero',()=>{
 const waiting={...client,session:{...client.session,myTeam:[{cellId:0,championId:0}],actions:[]}},key=clientPreparationKey(waiting,clientPreparationPlan(data,plan));
 const statuses=new Map([[key,record('hover')]]),p=preparationProgress({data,plan,client:waiting,statuses});
 assert.equal(p.complete,false);assert.deepEqual(p.failed,['hover']);
 const html=preparationProgressView({data,plan,client:waiting,statuses,available:true});assert.match(html,/模拟失败 &lt;source&gt;/);assert.match(html,/重新执行整套/);
 statuses.set(key,record());assert.equal(preparationProgress({data,plan,client:waiting,statuses}).complete,false,'Successful history cannot confirm a hero that is no longer selected');
});

test('preflight rejection survives a shared receipt before any champion is hovered',()=>{
 const waiting={...client,session:{...client.session,myTeam:[{cellId:0,championId:0}],actions:[]}},key=clientPreparationKey(waiting,clientPreparationPlan(data,plan));
 for(const receipt of [{message:'无法确认当前选人'}, {complete:false,message:'无法确认当前选人',preparationRevision:2}]){
  const statuses=new Map([[key,structuredClone(receipt)]]),p=preparationProgress({data,plan,client:waiting,statuses});
  assert.equal(p.complete,false);assert.deepEqual(p.failed,['hover']);assert.equal(p.status.steps.runes.status,'skipped');
  const html=preparationProgressView({data,plan,client:waiting,statuses,available:true});assert.match(html,/无法确认当前选人/);assert.match(html,/重新执行整套/);assert.doesNotMatch(html,/data-step-status="done"/);
 }
});

test('standalone equipment import confirms only that resource before any full preparation',()=>{
 const waiting={...client,session:{...client.session,myTeam:[{cellId:0,championId:0}],actions:[]}},prepared=clientPreparationPlan(data,plan),key=clientPreparationKey(waiting,prepared),statuses=new Map();
 confirmPreparationResource(statuses,'items',payload=>JSON.stringify(payload.itemSet)===JSON.stringify(prepared.value.itemSet),[{key,payload:prepared.value}]);
 const p=preparationProgress({data,plan,client:waiting,statuses});assert.equal(p.complete,false);assert.equal(p.status.steps.items.status,'done');assert.equal(p.status.steps.runes,undefined);assert.equal(p.status.steps.hover,undefined);assert.match(p.title,/装备集已导入/);
 const html=preparationProgressView({data,plan,client:waiting,statuses,available:true});assert.equal((html.match(/data-step-status="done"/g)||[]).length,1);assert.match(html,/data-preparation-step="items" data-step-status="done"/);assert.doesNotMatch(html,/配置完成，请/);
 assert.equal(preparationProgress({data,plan,client:{...waiting,session:{...waiting.session,gameId:992}},statuses}).status,null);
 invalidatePreparationStatuses(statuses,['items']);assert.equal(preparationProgress({data,plan,client:waiting,statuses}).status.steps.items.status,'superseded');
});

test('equipment receipt cannot seed a different payload or manufacture other completed steps',()=>{
 const prepared=clientPreparationPlan(data,plan),key=clientPreparationKey(client,prepared),statuses=new Map(),other=structuredClone(prepared.value.itemSet);other.title+=' other';
 confirmPreparationResource(statuses,'items',payload=>JSON.stringify(payload.itemSet)===JSON.stringify(other),[{key,payload:prepared.value}]);assert.equal(statuses.size,0);
 statuses.set(key,{complete:false,steps:{hover:{status:'done'},runes:{status:'failed',message:'mock failure'},spells:{status:'skipped'}}});
 confirmPreparationResource(statuses,'items',payload=>JSON.stringify(payload.itemSet)===JSON.stringify(prepared.value.itemSet),[{key,payload:prepared.value}]);
 const p=preparationProgress({data,plan,client,statuses});assert.equal(p.complete,false);assert.deepEqual(p.failed,['runes']);assert.equal(p.status.steps.items.status,'done');assert.equal(p.status.steps.spells.status,'skipped');assert.equal(p.status.superseded,false);
});

test('shared equipment notices invalidate on replacement and clear on game reset',()=>{
 const statuses=new Map([['actual',itemSetSuccessStatus({replaced:true})],['export',{text:'已导出 JSON'}]]);
 assert.equal(statuses.get('actual').imported,true);assert.match(statuses.get('actual').text,/已更新/);
 invalidateItemSetStatuses(statuses);assert.equal(statuses.get('actual').imported,false);assert.match(statuses.get('actual').text,/后续导入替换/);assert.equal(statuses.get('export').text,'已导出 JSON');
 invalidateItemSetStatuses(statuses,{reset:true});assert.equal(statuses.size,0);
});
