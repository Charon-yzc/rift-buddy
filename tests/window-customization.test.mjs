import test from 'node:test';
import assert from 'node:assert/strict';
import windowResize from '../electron/window-resize.cjs';
import {compactGuidePlacement,skillWidgetPlacement,jungleWidgetPlacement,guideWindowLimits} from '../src/core/guide-placement.mjs';
import {selectGuide,validateGuideState} from '../src/core/guide.mjs';
import {validateState,defaultState} from '../services/storage.mjs';
import {playerFlowSettings} from '../src/player-flow-settings.mjs';
import {presentationSettings} from '../src/presentation-view.mjs';
const area={x:-1920,y:0,width:1920,height:1040};
const selection={id:'Nocturne',role:'jungle',mode:'rift',conditions:[]};
test('independent window sizes survive storage, hero changes and display recovery',()=>{
 const guide=selectGuide(null,selection);Object.assign(guide,{compactBounds:{x:-900,y:40,width:430,height:330},stripBounds:{x:-800,y:300,width:500,height:200},skillWidget:{enabled:false,offset:{x:-100,y:-180},size:{width:320,height:70}},jungleWidget:{enabled:true,offset:{x:-400,y:-400},size:{width:380,height:260}}});
 const saved=validateGuideState(JSON.parse(JSON.stringify(guide))),other=selectGuide(saved,{...selection,id:'Ashe',role:'bottom'});
 for(const key of ['compactBounds','stripBounds','skillWidget','jungleWidget'])assert.deepEqual(other[key],guide[key]);
 const compact=compactGuidePlacement(saved.compactBounds,area,null);assert.deepEqual(compact,saved.compactBounds);
 const skill=skillWidgetPlacement(saved.skillWidget.offset,area,null,1,saved.skillWidget.size);assert.equal(skill.width,320);assert.equal(skill.height,70);
 const jungle=jungleWidgetPlacement(saved.jungleWidget.offset,area,null,1,saved.jungleWidget.size);assert.equal(jungle.width,380);assert.equal(jungle.height,260);
 const smaller={x:0,y:0,width:360,height:300},recovered=compactGuidePlacement(saved.compactBounds,smaller,null);assert.equal(recovered.width,360);assert.equal(recovered.height,300);assert.equal(recovered.x,0);assert.equal(recovered.y,0);
 const bad=validateGuideState({...guide,skillWidget:{size:{width:Infinity,height:100}},compactBounds:{x:1,y:2,width:'500',height:300}});assert.equal(bad.skillWidget.size,undefined);assert.deepEqual(bad.compactBounds,{x:1,y:2});
 const state=defaultState();state.preferences.mainBounds={x:-1700,y:50,width:1200,height:800};state.preferences.companionBounds={x:-500,y:40,width:430,height:700};const normalized=validateState(state);assert.deepEqual(normalized.preferences.mainBounds,state.preferences.mainBounds);assert.deepEqual(normalized.preferences.companionBounds,state.preferences.companionBounds);
});
test('transparent overlay resize uses OS cursor DIPs, clamps edges and commits once on release',async()=>{
 let bounds={x:-300,y:800,width:250,height:144},cursor={x:10,y:10},commits=0,starts=0;
 const win={isDestroyed:()=>false,getBounds:()=>({...bounds}),setBounds:value=>{bounds=value;}};
 const resize=windowResize({getWindow:()=>win,getArea:()=>area,getLimits:a=>guideWindowLimits('jungle',a),getCursor:()=>cursor,onStart:()=>starts++,onEnd:()=>commits++});
 await resize.control('resize-start');cursor={x:160,y:126};await resize.control('resize');assert.equal(bounds.width,400);assert.equal(bounds.height,260);assert.equal(bounds.x,-400);assert.equal(bounds.y,780);assert.equal(commits,0);assert(resize.active());
 await resize.control('resize-end');assert.equal(commits,1);assert(!resize.active());await resize.control('resize-end');assert.equal(commits,1);
 await resize.control('resize-key',{axis:'width',delta:-10});assert.equal(bounds.width,390);assert.equal(commits,2);assert.equal(starts,2);
 await assert.rejects(resize.control('resize-key',{axis:'width',delta:1e6}),/格式/);
 await resize.control('resize-start');resize.cancel();cursor={x:99999,y:99999};await resize.control('resize');assert.equal(bounds.width,390);assert.equal(commits,2);
});
test('reset controls explain scope and keep window reset distinct from text/content reset',()=>{
 const side=playerFlowSettings({}, {custom:true});assert.match(side,/当前侧栏使用你保存的布局/);for(const action of ['window-follow','window-reset-side','window-reset-all'])assert.match(side,new RegExp('data-action="'+action+'"'));
 assert.match(side,/恢复侧栏只重置侧栏/);assert.match(side,/恢复全部.*主窗.*装备卡.*加点.*野区提示.*局内小窗/);assert.match(side,/(?:保留|不会改)[^<]*英雄[^<]*阵容[^<]*字号[^<]*收藏/);
 const guide=presentationSettings({}, {guide:true});assert.match(guide,/data-action="reset-layout"/);assert.match(guide,/data-action="presentation" data-field="reset"/);assert.match(guide,/每个窗口独立记住位置和尺寸/);
});
