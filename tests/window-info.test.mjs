import test from 'node:test';import assert from 'node:assert/strict';
import {windowInfo} from '../services/window-info.mjs';import {windowInfoDialog,windowInfoText} from '../src/window-info-view.mjs';
const now=Date.parse('2026-10-07T21:00:00Z'),bounds={x:-1920,y:0,width:1920,height:1080},workArea={...bounds,height:1040};
function fixture(){return {version:'0.11.19',dataVersion:'16.20.1',displays:[{id:9,bounds,workArea,scaleFactor:1.25,label:'private display name',serial:'private serial'}],primaryDisplayId:9,client:{connected:true,phase:'ChampSelect',message:'private client message',auth:'private-auth'},main:{bounds:{x:-300,y:40,width:400,height:850},visible:true,minimized:false,processId:99},guide:{bounds:{x:0,y:0,width:400,height:740},visible:false,collapsed:true,ball:false,clickThrough:false},companion:{docked:true},observedAt:now-1000,observedClient:{pixels:{x:0,y:0,width:1600,height:900},dip:{x:0,y:0,width:1280,height:720},foreground:true,minimized:false,title:'private window name',token:'private-token'},observedGame:null,installPath:'C:/private/path'};}
test('window report explains mixed display units and returns only allowed local fields',()=>{
 const input=fixture(),copy=structuredClone(input),info=windowInfo(input,now);
 assert.deepEqual(input,copy);assert.equal(info.displays[0].primary,true);assert.equal(info.displays[0].scaleFactor,1.25);assert.deepEqual(info.displays[0].pixelReference,{width:2400,height:1350});assert.deepEqual(info.displays[0].bounds,bounds);
 assert.equal(info.main.bounds.width,400);assert.equal(info.guide.collapsed,true);assert.equal(info.guide.visible,false);assert.equal(info.observedClient.pixels.width,1600);assert.equal(info.observedClient.dip.width,1280);assert.equal(info.observedGame,null);
 assert.doesNotMatch(JSON.stringify(info),/private|processId|serial|installPath|auth|token|label|title/);
});
test('expired or future observations never masquerade as current game or client geometry',()=>{
 for(const observedAt of [0,undefined,now-5001,now+1,Infinity]){const info=windowInfo({...fixture(),observedAt},now);assert.equal(info.observationFresh,false);assert.equal(info.observedClient,null);assert.equal(info.observedGame,null);assert.ok(info.main);}
 assert.equal(windowInfo({...fixture(),observedAt:now-5000},now).observationFresh,true);
});
test('missing displays and invalid geometry retain honest unavailable states',()=>{
 const info=windowInfo({version:'private',dataVersion:'16.20.1',displays:[{bounds,workArea,scaleFactor:NaN},{bounds:{...bounds,width:-1},workArea,scaleFactor:1}],main:{bounds:{...bounds,x:Infinity}},guide:{bounds:null},client:{phase:'private'}},now);
 assert.deepEqual(info.displays,[]);assert.equal(info.main,null);assert.equal(info.guide,null);assert.equal(info.version,'未知');assert.deepEqual(info.client,{connected:false,phase:'Offline'});
 assert.equal(windowInfo({displays:[{bounds,workArea,scaleFactor:1}]},now).displays[0].primary,false);
});
test('window UI and copied text distinguish outer bounds from render resolution',()=>{
 const info=windowInfo(fixture(),now),html=windowInfoDialog(info),text=windowInfoText(info);
 assert.match(html,/125% 缩放/);assert.match(html,/2400 × 1350/);assert.match(html,/未检测到当前外框/);assert.match(html,/不能确认游戏里的渲染分辨率/);assert.match(text,/1600 × 900 像素 · 1280 × 720 DIP/);assert.match(text,/外框不等于/);assert.doesNotMatch(text,/private|auth|token|C:\//);
 assert.match(windowInfoDialog(null),/window-info-copy" disabled/);assert.match(windowInfoDialog(null,'<bad>'),/&lt;bad&gt;/);
});
