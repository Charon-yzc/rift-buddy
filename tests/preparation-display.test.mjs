import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getBuild} from '../src/core/builds.mjs';
import {preparationEquipment} from '../src/core/complete-gear.mjs';
import {companionPlanView} from '../src/companion-view.mjs';
import {adoptedTaskView,configurationSummary} from '../src/draft-task-view.mjs';
import {BUNDLED_CATALOG} from '../src/core/catalog.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {escape as e} from '../src/ui.mjs';
const data=JSON.parse(fs.readFileSync('data/game.json'));data.builds=JSON.parse(fs.readFileSync('data/builds.json')).entries;
const plan=(id,role,extra={})=>{const selection={id,role,mode:'rift',...extra};return {selection,build:getBuild(data.champions.find(c=>c.id===id),role,data,selection)};};
test('complete sidebar equipment shows every ordered item sent to preparation including automatic later references',()=>{
 for(const [id,role] of [['Ahri','mid'],['Yasuo','bottom'],['Galio','mid'],['Lulu','support']]){
  const p=plan(id,role),items=preparationEquipment(data,p.build,p.selection),html=companionPlanView(data,p,[],{hideClientControls:true});
  for(const [n,item] of items.entries())assert(html.includes(`<em>${n+1}</em><b>${e(item.name)}</b>`),id+' missing ordered '+item.name);
  assert.match(html,/aria-label="当前完整配置"/);assert.match(html,/data-companion-disclosure="edit-runes"/);
  if(p.build.laterOptions.length)assert.match(html,/后期装备备选 · 手动已选/);
 }
});
test('adopted task shows saved opening duty and the complete short plan including its initiator',()=>{
 const trio=BUNDLED_CATALOG.trios.find(t=>t.name==='近身救援舞');assert(trio);
 const slots=createSlots().map(s=>({...s,champion:trio.members.find(m=>m.role===s.role)?.champion||null,party:trio.members.some(m=>m.role===s.role)}));
 const activePlan=captureCreativePlan({slots,scope:'party',trio},data),member=trio.members.find(m=>m.champion==='Galio'),p=plan(member.champion,member.role);
 const html=adoptedTaskView({data,plan:p,activePlan,ownRole:member.role,controls:''});
 assert(html.includes(e(activePlan.plan)));assert(html.includes(e(activePlan.stagePlan.opening.memberJobs.find(m=>m.champion==='Galio').job.split('。')[0])));
});
test('Aphelios adopted summary displays attribute priority instead of missing QWER guidance',()=>{
 const p=plan('Aphelios','bottom'),html=configurationSummary(data,p);
 assert.match(html,/属性加点/);assert(html.includes(e(p.build.attributePlan.priority.join(' › '))));assert.doesNotMatch(html,/加点资料待补/);
});
