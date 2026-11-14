import test from 'node:test';import assert from 'node:assert/strict';
import {skillSummary} from '../src/core/skill-summary.mjs';
import {skillWidgetPlacement} from '../src/core/guide-placement.mjs';
import {hexMicroPayload} from '../src/core/hex-micro.mjs';
import {validateState} from '../services/storage.mjs';
test('one-line skill summary retains opening sequence and priority instead of replacing them with current level',()=>{
 const model={first:'QEW',priority:'QER',skillOrder:'QEWQQR',live:{matched:true,level:8},nextSkill:'E'};
 assert.equal(skillSummary(model).text,'Q→E→W · 主Q 副E');assert.match(skillSummary(model).detail,/当前可升 E/);assert.equal(skillSummary(model,{wrong:true}).text,'—');assert.equal(skillSummary({}).text,'—');
 const bounds=skillWidgetPlacement(null,{x:0,y:0,width:1920,height:1080},null,1,{width:286,height:160});assert.equal(bounds.height,28,'Migrate saved tall prompts to a single line');
});
test('Rift can reuse the same wallet-free four-row economy payload without Hex recipes',()=>{
 const value={model:{mode:'rift',champion:{id:'Ashe'},equipment:{available:true,ally:{players:[{id:'Ashe',name:'艾希',known:true,value:3200,gold:9999}]},enemy:{players:[]}}}};
 const p=hexMicroPayload(value,'economy');assert.equal(p.active,true);assert.equal(p.equipment.ally.players[0].value,3200);assert.equal(p.equipment.ally.players[0].gold,undefined);assert.equal(hexMicroPayload(value,'routes').active,false);
});
test('guide feature switches persist independent opt-outs without altering one another',()=>{
 const state=validateState({schema:1,favorites:[],excluded:[],preparations:[],preferences:{guideEconomy:false,guideEquipment:false,guideSkills:false,guideJungle:false,postGamePopup:false},draft:null,ownedPageId:null,guide:null});
 for(const key of ['guideEconomy','guideEquipment','guideSkills','guideJungle','postGamePopup'])assert.equal(state.preferences[key],false);assert.equal(state.preferences.guideAutoShow,true);
});
