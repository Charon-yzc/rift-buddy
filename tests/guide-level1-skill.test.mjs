import {skillSummary} from '../src/core/skill-summary.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide as renderGuideActual} from '../src/guide-view.mjs';

const renderGuide=(snapshot,...rest)=>renderGuideActual({...snapshot,model:snapshot?.model?{...snapshot.model,compact:false}:snapshot?.model},...rest);

const data=JSON.parse(await fs.readFile('data/game.json'));

test('one-line skill widget retains opening, priority and next available skill',()=>{
 const selection=selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'});
 const live={available:true,champion:'Ashe',mode:'rift',at:Date.now(),level:1,skills:{Q:0,W:0,E:0,R:0},inventory:[],gold:500};
 const model=createGuideModel(data,selection,live);
 assert.equal(model.nextSkill,'W','Recommended next skill is W for level 1 Ashe');

 const html=renderGuide({model,connected:true,phase:'InProgress'},'overview',false,()=>'<img>');
 const summary=skillSummary(model);assert.match(summary.text,/^W→Q→/);assert.match(summary.text,/主W 副Q/);assert.match(summary.detail,/当前可升 W/);assert.doesNotMatch(html,/1级首点推荐/);

 // After level 1 point is spent (level 2 with W=1)
 const liveLevel2={available:true,champion:'Ashe',mode:'rift',at:Date.now(),level:2,skills:{Q:0,W:1,E:0,R:0},inventory:[],gold:500};
 const modelLevel2=createGuideModel(data,selection,liveLevel2);
 assert.equal(modelLevel2.nextSkill,'Q');
 const htmlLevel2=renderGuide({model:modelLevel2,connected:true,phase:'InProgress'},'overview',false,()=>'<img>');
 assert.doesNotMatch(htmlLevel2,/1级首点推荐/);
 assert.match(skillSummary(modelLevel2).detail,/当前可升 Q/);assert.equal(skillSummary(modelLevel2).text,summary.text);
});
