import test from 'node:test';import assert from 'node:assert/strict';
import {roomPanel} from '../src/room-view.mjs';

const champions={Ashe:{id:'Ashe',name:'艾希',icon:'ashe.png'},Garen:{id:'Garen',name:'盖伦',icon:'garen.png'}};
const champ=id=>champions[id];
const snapshot=overrides=>({mode:'host',room:'482913',pin:'123456',host:null,port:47833,members:[
 {nick:'房主',online:true,share:null,self:true},
 {nick:'队友甲',online:true,share:{lineup:[{role:'top',champion:'Garen'},{role:'jungle',champion:null},{role:'mid',champion:null},{role:'bottom',champion:'Ashe'},{role:'support',champion:null}],pick:{champion:'Garen',role:'top',mode:'rift'},at:Date.parse('2026-10-10T12:00:00Z')},self:false},
],...overrides});

test('idle room panel offers create, scan and join with the saved nickname',()=>{
 const html=roomPanel({room:null,nick:'小明',champ});
 assert.match(html,/创建房间/);assert.match(html,/扫描局域网房间/);
 assert.match(html,/id="room-nick" value="小明"/);
 assert.match(html,/id="room-invite"/);assert.match(html,/id="room-pin"/);
 assert.match(html,/data-action="room-join"/);
 assert.match(html,/不读取任何客户端数据/);
 assert.doesNotMatch(html,/口令 123456/);
});

test('scan results fill one invite and an empty scan stays honest',()=>{
 const found=roomPanel({room:null,nick:'队友',scanResults:[{room:'482913',port:47833,host:'192.168.1.5'}],champ});
 assert.match(found,/data-action="room-fill" data-invite="192\.168\.1\.5:47833#482913"/);
 assert.match(found,/房间 482913 · 192\.168\.1\.5/);
 const empty=roomPanel({room:null,nick:'队友',scanResults:[],champ});
 assert.match(empty,/没有发现房间/);
 assert.doesNotMatch(empty,/room-fill/);
});

test('host room shows invite codes and members click through to local builds',()=>{
 const html=roomPanel({room:snapshot(),nick:'房主',addresses:[{name:'以太网',address:'192.168.1.5'},{name:'Radmin VPN',address:'26.31.0.7'}],champ});
 assert.match(html,/开黑房间 · 482913/);assert.match(html,/2 人在线 · 口令 123456/);
 assert.match(html,/data-action="room-copy-invite" data-invite="192\.168\.1\.5:47833#482913"/);
 assert.match(html,/data-action="room-copy-invite" data-invite="26\.31\.0\.7:47833#482913"/);
 assert.match(html,/data-action="room-build" data-id="Garen" data-role="top"/);
 assert.match(html,/data-action="room-build" data-id="Ashe" data-role="bottom"/);
 assert.match(html,/盖伦/);assert.match(html,/艾希/);assert.match(html,/更新于/);
 assert.match(html,/房主/);assert.match(html,/队友甲/);assert.match(html,/我/);
 assert.match(html,/还没分享阵容/);
});

test('a host without detected addresses asks guests to scan instead of inventing one',()=>{
 const html=roomPanel({room:snapshot(),nick:'房主',addresses:[],champ});
 assert.doesNotMatch(html,/room-copy-invite/);
 assert.match(html,/暂未检测到局域网地址/);
});

test('guest room never shows host credentials and escapes nicknames',()=>{
 const room=snapshot({mode:'client',pin:null,host:'192.168.1.5',members:[{nick:'<b>坏人</b>',online:true,share:null,self:true}]});
 const html=roomPanel({room,nick:'队友',addresses:[{name:'x',address:'10.0.0.2'}],champ});
 assert.doesNotMatch(html,/口令/);assert.doesNotMatch(html,/room-copy-invite/);
 assert.match(html,/&lt;b&gt;坏人&lt;\/b&gt;/);
 assert.doesNotMatch(html,/<b>坏人<\/b>/);
});

test('join errors stay visible and the panel promises no win rates',()=>{
 const html=roomPanel({room:null,nick:'队友',error:'口令是 6 位数字',champ});
 assert.match(html,/口令是 6 位数字/);
 const active=roomPanel({room:snapshot(),nick:'房主',addresses:[],champ});
 for(const text of [html,active])assert.doesNotMatch(text,/胜率|预测|上分/);
});
