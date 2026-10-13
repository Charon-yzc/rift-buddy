import test from 'node:test';import assert from 'node:assert/strict';
import {roomPanel,roomMissingConfigurationDialog} from '../src/room-view.mjs';

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
 assert.match(html,/不需要额外读取客户端数据/);
 assert.match(html,/防火墙/);
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

test('members sharing the same lineup keep their own champion and role visible',()=>{
 const shared=snapshot().members[1].share;
 const members=[{nick:'上路玩家',share:shared},{nick:'射手玩家',share:{...shared,pick:{champion:'Ashe',role:'bottom',mode:'rift'}}}];
 const cards=roomPanel({room:snapshot({members}),champ}).match(/<article class="room-member">.*?<\/article>/g);
 assert.equal(cards.length,2);
 for(const [index,champion,role]of [[0,'Garen','top'],[1,'Ashe','bottom']]){
  assert.match(cards[index],new RegExp(`class="room-champ is-pick"[^>]*data-id="${champion}" data-role="${role}"`));
  assert.equal((cards[index].match(/room-champ is-pick/g)||[]).length,1);
  assert.equal((cards[index].match(/data-action="room-build"/g)||[]).length,2);
 }
 assert.match(cards[0],/个人选择：<b>盖伦<\/b> · 上路/);
 assert.match(cards[1],/个人选择：<b>艾希<\/b> · 下路/);
});

test('an unconfirmed personal pick is not inferred from the shared lineup or nickname',()=>{
 const share={...snapshot().members[1].share,pick:null};
 const html=roomPanel({room:snapshot({members:[{nick:'盖伦上路',share}]}),champ});
 assert.match(html,/个人选择未确认/);assert.doesNotMatch(html,/room-champ is-pick|room-pick-label/);
 assert.equal((html.match(/data-action="room-build"/g)||[]).length,2);
});

test('a personal pick inconsistent with the lineup or mode asks for confirmation without highlighting another build',()=>{
 const shared=snapshot().members[1].share;
 for(const pick of [{champion:'Ashe',role:'top',mode:'rift'},{champion:'Garen',role:'top',mode:'hex'}]){
  const html=roomPanel({room:snapshot({members:[{nick:'队友',share:{...shared,mode:'rift',pick}}]}),champ});
  assert.match(html,/与共享阵容不一致，请核对/);assert.doesNotMatch(html,/room-champ is-pick|room-pick-label/);
 }
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

test('a champion missing from local data still renders a clickable chip',()=>{
 const room=snapshot({members:[{nick:'队友乙',online:true,share:{lineup:[{role:'mid',champion:'Vex'},{role:'top',champion:null},{role:'jungle',champion:null},{role:'bottom',champion:null},{role:'support',champion:null}],pick:null,at:Date.now()},self:true}]});
 const html=roomPanel({room,nick:'队友乙',champ});
 assert.match(html,/data-action="room-build" data-id="Vex" data-role="mid" data-mode=""/);
 assert.match(html,/>Vex · 模式未知 · 未收到配置</);
});

test('a lineup-only relay with no confirmed pick cannot invent a mode for local references',()=>{
 const share={...snapshot().members[1].share,pick:null};
 const html=roomPanel({room:snapshot({members:[{nick:'海克斯队友',share}]}),champ});
 assert.match(html,/data-id="Ashe" data-role="bottom" data-mode=""/);
 assert.match(html,/模式未知 · 未收到配置/);
 assert.doesNotMatch(html,/data-action="room-build"[^>]*data-mode="rift"/);
 const missing=roomMissingConfigurationDialog({id:'Ashe',role:'bottom',mode:'',nick:'海克斯队友',champ});
 assert.match(missing,/未收到游戏模式/);
 assert.match(missing,/data-action="room-local-reference"[^>]*data-mode="rift"[^>]*>查看峡谷本机参考/);
 assert.match(missing,/data-action="room-local-reference"[^>]*data-mode="hex"[^>]*>查看海克斯本机参考/);
 assert.doesNotMatch(missing,/room-adopt|room-copy-configuration/);
 for(const mode of ['rift','hex']){const known=roomPanel({room:snapshot({members:[{nick:'队友',share:{...share,mode}}]}),champ});assert.match(known,new RegExp('data-action="room-build"[^>]*data-mode="'+mode+'"'));assert.doesNotMatch(known,/模式未知/);}
});

test('scanning and busy states disable their buttons instead of double-firing',()=>{
 const scanning=roomPanel({room:null,nick:'队友',scanning:true,champ});
 assert.match(scanning,/扫描中…/);assert.match(scanning,/data-action="room-scan"[^>]*disabled/);
 const busy=roomPanel({room:null,nick:'队友',busy:true,champ});
 assert.match(busy,/data-action="room-host"[^>]*disabled/);
 assert.match(busy,/data-action="room-join"[^>]*disabled/);
});

test('host panel offers address refresh and says the lineup syncs automatically',()=>{
 const html=roomPanel({room:snapshot(),nick:'房主',addresses:[{name:'以太网',address:'10.0.0.2'}],champ});
 assert.match(html,/data-action="room-refresh-addresses"/);
 assert.match(html,/自动分享阵容、装备、完整符文/);
 assert.match(html,/aria-live="polite"/);
});

test('a hand-crafted share cannot open a wrong build mode',()=>{
 const member=mode=>({nick:'队友丙',online:true,share:{lineup:[{role:'mid',champion:'Ahri'},{role:'top',champion:null},{role:'jungle',champion:null},{role:'bottom',champion:null},{role:'support',champion:null}],pick:{champion:'Ahri',role:'mid',mode},at:Date.now()},self:true});
 assert.match(roomPanel({room:snapshot({members:[member('aram')]}),nick:'队友丙',champ}),/data-action="room-build" data-id="Ahri" data-role="mid" data-mode="aram"[^>]*disabled/);
 assert.match(roomPanel({room:snapshot({members:[member('hex')]}),nick:'队友丙',champ}),/data-mode="hex"/);
});

test('the idle panel offers both transports and says which one is selected',()=>{
 const html=roomPanel({room:null,nick:'小明',champ});
 assert.match(html,/data-action="room-transport" data-id="lan" aria-pressed="true"/);
 assert.match(html,/data-action="room-transport" data-id="relay" aria-pressed="false"/);
 assert.match(html,/同一网络或虚拟局域网内共享阵容/);
 assert.match(html,/data-action="room-host"/);
 assert.doesNotMatch(html,/room-relay-join/);
 const relay=roomPanel({room:null,nick:'小明',transport:'relay',champ});
 assert.match(relay,/data-action="room-transport" data-id="relay" aria-pressed="true"/);
 assert.match(relay,/data-action="room-transport" data-id="lan" aria-pressed="false"/);
 assert.match(relay,/经中继跨网共享阵容/);
 assert.match(relay,/data-action="room-relay-join"/);
 assert.doesNotMatch(relay,/room-host|room-scan|room-invite/);
});

test('the relay form preserves a custom address and suggests the shared default with concrete joining instructions',()=>{
 const html=roomPanel({room:null,nick:'队友',transport:'relay',relayUrl:'wss://room.example.com',relayRoom:'482913',pin:'123456',champ});
 assert.match(html,/id="room-relay-url" value="wss:\/\/room\.example\.com"/);
 assert.match(html,/id="room-relay-room" value="482913"/);
 assert.match(html,/id="room-pin" value="123456"/);
 assert.match(html,/id="room-relay-url"/);
 assert.match(html,/强身份认证/);
 const empty=roomPanel({room:null,nick:'队友',transport:'relay',champ});
 assert.match(empty,/id="room-relay-url" value="wss:\/\/room\.riftbuddy\.dpdns\.org"/);
 assert.match(empty,/inputmode="numeric" maxlength="6"/);assert.match(empty,/type="password"/);assert.match(empty,/口令只私下告知/);
 assert.match(empty,/阵容与配置会共享给同房间成员和中继运营者/);
 assert.match(empty,/data-action="room-relay-join"/);
 const cleared=roomPanel({room:null,transport:'relay',relayUrl:'',champ});assert.match(cleared,/id="room-relay-url" value=""/,'editing/clearing must not silently refill the field');
});

test('the default relay shares full configuration while missing peer fields remain explicit',()=>{
 const idle=roomPanel({room:null,transport:'relay',champ});
 assert.match(idle,/阵容与配置会共享给同房间成员和中继运营者/);assert.doesNotMatch(idle,/仅共享英雄阵容|不转发装备/);
 const relay=snapshot({mode:'client',transport:'relay',relayUrl:'wss://room.riftbuddy.dpdns.org',link:'connected'});
 const active=roomPanel({room:relay,champ});
 assert.match(active,/room-link">已连接/);assert.match(active,/自动分享阵容、装备、完整符文、召唤师技能、加点与组合分工/);
 assert.match(active,/已收到阵容，尚未收到这位队友的配置/);
 assert.match(active,/仅展示实际收到的配置/);assert.doesNotMatch(active,/默认中继只发送阵容|不转发装备/);
 const custom=roomPanel({room:null,transport:'relay',relayUrl:'wss://example.com',champ});
 assert.match(custom,/阵容与配置会共享给同房间成员和中继运营者/);
});

test('missing peer configuration requires a separate local reference click and cannot offer adoption',()=>{
 const html=roomMissingConfigurationDialog({id:'Garen',role:'top',mode:'rift',nick:'<队友>',champ});
 assert.match(html,/aria-label="未收到队友配置"/);assert.match(html,/未收到&lt;队友&gt;的配置/);
 assert.match(html,/本机参考不代表队友所选|不代表队友所选/);
 assert.match(html,/data-action="room-local-reference" data-id="Garen" data-role="top" data-mode="rift"/);
 assert.doesNotMatch(html,/data-action="room-adopt-configuration"|data-action="room-copy-configuration"/);
 for(const [id,mode] of [['Unknown','rift'],['Garen','aram']]){
  const unsupported=roomMissingConfigurationDialog({id,role:'top',mode,nick:'队友',champ});
  assert.doesNotMatch(unsupported,/data-action="room-local-reference"/);
 }
});

test('a received configuration stays available even on the default relay without assuming other peers have it',()=>{
 const received=snapshot().members[1];
 const html=roomPanel({room:snapshot({mode:'client',transport:'relay',relayUrl:'wss://room.riftbuddy.dpdns.org',link:'connected',members:[{...received,share:{...received.share,configurations:[{champion:'Garen',role:'top',mode:'rift'}]}}]}),champ});
 assert.match(html,/title="本人选择 · 上路 · 查看发送方配置"/);
 assert.match(html,/盖伦 · 符文与加点/);assert.match(html,/艾希 · 未收到配置/);
 assert.doesNotMatch(html,/尚未收到这位队友的配置/);
});

test('an active relay room shows the link state and never a LAN invite code',()=>{
 const room=snapshot({mode:'client',transport:'relay',pin:null,port:null,relayUrl:'wss://room.example.com',link:'connected',members:[{nick:'我',online:true,share:null,self:true},{nick:'队友甲',online:true,share:{lineup:[{role:'top',champion:'Garen'},{role:'jungle',champion:null},{role:'mid',champion:null},{role:'bottom',champion:'Ashe'},{role:'support',champion:null}],pick:null,at:Date.now()},self:false}]});
 const html=roomPanel({room,nick:'我',addresses:[{name:'以太网',address:'10.0.0.2'}],champ});
 assert.match(html,/经中继/);
 assert.match(html,/room-link">已连接/);
 assert.match(html,/data-action="room-copy-relay"/);
 assert.match(html,/中继 wss:\/\/room\.example\.com｜房间 482913/);
 assert.doesNotMatch(html,/room-copy-invite|room-refresh-addresses/);
 // The pin itself must never reach the relay panel: the relay only ever saw
 // its hash, so there is nothing honest to display.
 assert.doesNotMatch(html,/口令\s*123456/);
 assert.match(html,/data-action="room-build" data-id="Garen" data-role="top"/);
 assert.match(html,/aria-live="polite"/);
});

test('a dropped relay link says so instead of pretending the room is fine',()=>{
 const html=roomPanel({room:snapshot({mode:'client',transport:'relay',pin:null,port:null,relayUrl:'wss://room.example.com',link:'reconnecting'}),nick:'我',champ});
 assert.match(html,/room-link warn">重连中/);
 assert.match(html,/正在重连/);
});

test('the automatic party room shows its derived code, pin and honest fallbacks',()=>{
 const idle=roomPanel({room:null,transport:'relay',champ});
 assert.match(idle,/id="room-auto"/);assert.doesNotMatch(idle,/id="room-auto" checked/);
 assert.match(idle,/自动连接组队房间/);assert.match(idle,/默认开启/);
 assert.match(idle,/data-action="room-relay-join"/);
 const on=roomPanel({room:null,transport:'relay',autoEnabled:true,champ});
 assert.match(on,/id="room-auto" checked/);assert.doesNotMatch(on,/当前关闭/);
 const failed=roomPanel({room:null,transport:'relay',autoEnabled:true,autoError:'<b>中继没有回应</b>',champ});
 assert.match(failed,/&lt;b&gt;中继没有回应&lt;\/b&gt;/);
 assert.doesNotMatch(failed,/<b>/);
 const revoked=roomPanel({room:null,transport:'relay',autoEnabled:false,autoError:'中继没有回应',champ});
 assert.doesNotMatch(revoked,/上次自动连接失败/,'a revoked switch must not promise a retry');
 const unsynced=roomPanel({room:null,transport:'relay',autoEnabled:true,autoSync:false,autoError:'中继没有回应',champ});
 assert.doesNotMatch(unsynced,/上次自动连接失败/,'no poll runs with sync off, so nothing will retry');
 assert.match(unsynced,/自动同步已关闭，自动连接不会触发/);
 assert.ok(idle.indexOf('id="room-relay-room"')<idle.indexOf('id="room-auto"'),'manual join is immediately available before optional automatic connection');
});

test('an automatic relay room copies the derived pin and admits when nobody else arrived',()=>{
 const room=snapshot({mode:'client',transport:'relay',link:'connected',relayUrl:'wss://room.example.com',auto:true,pin:'654321',members:[{nick:'我',online:true,share:null,self:true}]});
 const html=roomPanel({room,nick:'我',champ});
 assert.match(html,/自动 · 组队房间 · 已连接/);
 assert.match(html,/1 人在线 · 自动连接 · 经中继/);
 assert.match(html,/中继 wss:\/\/room\.example\.com｜房间 482913｜口令 654321/);
 assert.match(html,/口令由大厅共享标识派生，只用于同队汇合，不是强认证/);
 assert.match(html,/旧版队友或派生不一致时，可按上面的地址、房间码与口令手动加入。/);
 assert.doesNotMatch(html,/暂时没看到队友/);
 const quiet=roomPanel({room,nick:'我',champ,autoQuiet:true});
 assert.match(quiet,/暂时没看到队友：可以把上面的房间码和口令发给队友手动加入，或让队友确认也开启了自动连接。/);
 // A manual room never borrows the automatic hint or its failure advice, and
 // its copy text never carries a pin.
 const manual=roomPanel({room:snapshot({mode:'client',transport:'relay',link:'connected',relayUrl:'wss://room.example.com',pin:'123456',members:[{nick:'我',online:true,share:null,self:true}]}),nick:'我',champ,autoQuiet:true});
 assert.doesNotMatch(manual,/暂时没看到队友/);
 assert.match(manual,/中继 wss:\/\/room\.example\.com｜房间 482913/);
 assert.match(manual,/邀请队友（复制下面的地址和房间码，口令请另行告知）：/);
 assert.doesNotMatch(manual,/口令 123456/);
 const failedLink=roomPanel({room:snapshot({mode:'client',transport:'relay',link:'failed',relayUrl:'wss://room.example.com',auto:true,pin:'654321',members:[{nick:'我',online:true,share:null,self:true}]}),nick:'我',champ});
 assert.match(failedLink,/连续重连失败已停止；可先复制上面的房间码与口令，离开后本组队不再自动重连（重启助手后会重新尝试）。/);
});
