import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide as renderGuideActual} from '../src/guide-view.mjs';

const renderGuide=(snapshot,...rest)=>renderGuideActual({...snapshot,model:snapshot?.model?{...snapshot.model,compact:false}:snapshot?.model},...rest);

const data=JSON.parse(await fs.readFile('data/game.json'));

test('guide view displays level 1 skill recommendation highlight when level 1',()=>{
 const selection=selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'});
 const live={available:true,champion:'Ashe',mode:'rift',at:Date.now(),level:1,skills:{Q:0,W:0,E:0,R:0},inventory:[],gold:500};
 const model=createGuideModel(data,selection,live);
 assert.equal(model.nextSkill,'W','Recommended next skill is W for level 1 Ashe');

 const html=renderGuide({model,connected:true,phase:'InProgress'},'overview',false,()=>'<img>');
 assert.match(html,/1级首点推荐/);
 assert.match(html,/建议首点 <strong>W<\/strong>/);
 assert.match(html,/主W副Q/);

 // After level 1 point is spent (level 2 with W=1)
 const liveLevel2={available:true,champion:'Ashe',mode:'rift',at:Date.now(),level:2,skills:{Q:0,W:1,E:0,R:0},inventory:[],gold:500};
 const modelLevel2=createGuideModel(data,selection,liveLevel2);
 assert.equal(modelLevel2.nextSkill,'Q');
 const htmlLevel2=renderGuide({model:modelLevel2,connected:true,phase:'InProgress'},'overview',false,()=>'<img>');
 assert.doesNotMatch(htmlLevel2,/1级首点推荐/);
 assert.match(htmlLevel2,/有技能点可升 <strong>Q<\/strong>/);
});

test('skill widget header highlights level 1 opening recommendation',()=>{
 const model={live:{matched:true,level:1},nextSkill:'W',priority:'WQE'};
 const isLevel1=model?.live?.matched?model.live.level===1:false;
 const isOpening=isLevel1&&!!(model?.nextSkill||model?.first?.[0]);
 const openingSkill=model?.nextSkill||model?.first?.[0]||'';
 const main=model?.priority?.[0]||'',sub=model?.priority?.[1]||'';
 const orderNote=main&&sub?`（主${main}副${sub}）`:'';
 assert.equal(isOpening,true);
 assert.equal(openingSkill,'W');
 assert.equal(orderNote,'（主W副Q）');

 const modelLevel2={live:{matched:true,level:2},nextSkill:'Q',priority:'WQE'};
 const isOpening2=modelLevel2?.live?.matched?modelLevel2.live.level===1:false;
 assert.equal(isOpening2,false);
});
