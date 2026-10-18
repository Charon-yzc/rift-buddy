import test from 'node:test';
import assert from 'node:assert/strict';
import {historyBuildsView,collectHistoryBuild} from '../src/match-history-builds-view.mjs';
test('build history retains purchase, sale, undo and exact skill slots without current-build guesses',()=>{
 const d={game:{participants:[{id:1,champion:22,name:'示例',items:[1001,0]}]},timeline:{events:[{participantId:1,type:'ITEM_PURCHASED',timestamp:1000,itemId:1001},{participantId:1,type:'ITEM_SOLD',timestamp:2000,itemId:1001},{participantId:1,type:'ITEM_UNDO',timestamp:3000,beforeId:0,afterId:1001},{participantId:1,type:'SKILL_LEVEL_UP',timestamp:0,skillSlot:2}]}};
 const html=historyBuildsView(d,{champions:[],items:{}});assert.match(html,/购买/);assert.match(html,/出售/);assert.match(html,/撤销/);assert.match(html,/实际技能升级/);assert.match(html,/W/);assert.ok(!html.includes('undefined'));
});
test('skill evolution events never advance champion-level numbering and sorting retains exact slots',()=>{
 const events=[{participantId:1,type:'SKILL_LEVEL_UP',timestamp:3000,skillSlot:3},{participantId:1,type:'SKILL_LEVEL_UP',timestamp:1000,skillSlot:1},{participantId:1,type:'SKILL_LEVEL_UP',timestamp:2000,skillSlot:1,levelUpType:'EVOLVE'},{participantId:2,type:'SKILL_LEVEL_UP',timestamp:500,skillSlot:4},{participantId:1,type:'SKILL_LEVEL_UP',timestamp:2500,skillSlot:4,levelUpType:'EVOLVE'}];
 const build=collectHistoryBuild(events,1);assert.deepEqual(build.skills.map(s=>s.displayLevel),[1,null,null,2]);assert.deepEqual(build.skills.map(s=>s.skillSlot),[1,1,4,3]);assert.equal(build.levels,2);assert.equal(events[0].timestamp,3000);
 const html=historyBuildsView({game:{id:42,participants:[{id:1,name:'进化英雄',items:[]}]},timeline:{events}},{champions:[],items:{}});assert.match(html,/进化（不计入等级）/);assert.match(html,/<th>1<\/th><th>进化<\/th><th>进化<\/th><th>2<\/th>/);assert.doesNotMatch(html,/<th>3<\/th>/);
});
test('purchase sessions use gaps strictly above thirty seconds, including a purchase at zero',()=>{
 const purchase=(timestamp,itemId=1001)=>({participantId:1,type:'ITEM_PURCHASED',timestamp,itemId});
 const events=[purchase(70001),purchase(0),purchase(30000),{participantId:1,type:'ITEM_SOLD',timestamp:65000,itemId:1001},purchase(40000),purchase(null),purchase(80000),{participantId:2,type:'ITEM_PURCHASED',timestamp:1,itemId:1001}];
 const build=collectHistoryBuild(events,1);assert.deepEqual(build.sessions.map(s=>s.events.map(v=>v.timestamp)),[[0,30000,40000],[70001,80000],[null]]);assert.equal(build.items.length,7);assert.equal(build.sessions[2].timestamp,null);
 const html=historyBuildsView({game:{id:42,participants:[{id:1,name:'玩家',items:[]}]},timeline:{events}},{champions:[],items:{}});assert.match(html,/第 1 批/);assert.match(html,/第 2 批/);assert.match(html,/第 3 批/);assert.match(html,/时间未读取/);assert.match(html,/出售/);
});
test('build navigation targets unique participant anchors and Arena anvil totals require genuine purchases',()=>{
 const participants=[{id:1,name:'<玩家>',items:[6032],roleBoundItem:3869},{id:2,name:'队友',items:[]}],events=[{participantId:1,type:'ITEM_PURCHASED',timestamp:1000,itemId:6032},{participantId:1,type:'ITEM_PURCHASED',timestamp:2000,itemId:220000},{participantId:1,type:'ITEM_SOLD',timestamp:3000,itemId:6032},{participantId:1,type:'ITEM_UNDO',timestamp:4000,beforeId:220000,afterId:0},{participantId:1,type:'ITEM_PURCHASED',timestamp:5000,itemId:1001},{participantId:2,type:'ITEM_PURCHASED',timestamp:1000,itemId:6032}];
 assert.equal(collectHistoryBuild(events,1,{arena:true}).anvils,2);assert.equal(collectHistoryBuild(events,2,{arena:true}).anvils,1);assert.equal(collectHistoryBuild(events,1).anvils,null);
 const d={game:{id:42,arena:true,participants},timeline:{events}},html=historyBuildsView(d,{champions:[],items:{}});
 assert.match(html,/href="#history-build-42-1"/);assert.match(html,/id="history-build-42-1" data-builds-participant-id="1"/);assert.match(html,/href="#history-build-42-2"/);assert.match(html,/data-history-anvils="2"/);assert.match(html,/含之后撤销的购买/);assert.doesNotMatch(html,/<玩家>|undefined|NaN/);
 const missing=historyBuildsView({...d,timeline:{events:[]}},{champions:[],items:{}});assert.doesNotMatch(missing,/data-history-anvils/);
 const classic=historyBuildsView({...d,game:{...d.game,arena:false}},{champions:[],items:{}});assert.doesNotMatch(classic,/data-history-anvils/);
 assert.match(historyBuildsView({game:d.game},{champions:[],items:{}}),/尚未读取/);
});
