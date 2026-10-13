import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// The room IPC surface spans three files that cannot run together on this
// machine (Electron smoke tests are Windows-only), so pin the names
// statically: preload, main guards and renderer usage must all agree.
test('every room IPC channel exposed by preload has a guarded handler in main',async()=>{
 const preload=await fs.readFile(new URL('../electron/preload.cjs',import.meta.url),'utf8');
 const main=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
 const app=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
 const exposed=[...preload.matchAll(/ipcRenderer\.invoke\('([a-z-]+)'/g)].map(m=>m[1]).filter(name=>name.startsWith('room-'));
 assert.deepEqual(exposed.sort(),['room-addresses','room-ballot','room-host','room-join','room-leave','room-publish','room-relay','room-scan','room-status']);
 for(const channel of exposed)assert.match(main,new RegExp(`guard\\('${channel}'`),`${channel} is exposed but not guarded in main`);
 assert.match(main,/publishWindows\('room-update'/,'main must broadcast room updates to both app windows');
 assert.match(preload,/ipcRenderer\.on\('room-update'/,'preload must subscribe to room updates');
 const used=[...new Set([...app.matchAll(/api\.(room[A-Z]\w*|onRoomUpdate)/g)].map(m=>m[1]))];
 assert.ok(used.length>=8,`expected the renderer to use the full room API, saw ${used.join(',')}`);
 for(const name of used)assert.match(preload,new RegExp(`\\b${name}:`),`${name} is used by the renderer but not exposed in preload`);
});
test('the automatic room decoration wraps updates, guards, leave state and the client poll',async()=>{
 const main=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
 assert.match(main,/import\('\.\.\/src\/core\/room-auto\.mjs'\)/,'main must load the auto room core');
 assert.match(main,/publishWindows\('room-update',decorateRoom\(snapshot\)\)/,'room updates must carry the auto marker');
 const guards={
  'room-status':/guard\('room-status',\(\)=>roomService\?decorateRoom\(roomService\.snapshot\(\)\):\(roomAutoError\?decorateAutoRoom\(\{mode:'idle',members:\[\],transport:'relay'\},\{error:roomAutoError,retryAt:roomAutoFailedUntil\|\|null\}\):null\)\)/,
  'room-leave':/guard\('room-leave',[\s\S]{0,400}?closeAutoRoom\('manual'\);[\s\S]{0,200}?return roomService\?decorateRoom\(/,
  'room-publish':/guard\('room-publish',[^\n]*decorateRoom\(/,
 };
 for(const [name,pattern] of Object.entries(guards))assert.match(main,pattern,`${name} must return a decorated snapshot`);
 assert.match(main,/if\(roomAutoKey\)\{roomAutoBlockedKey=roomAutoKey;closeAutoRoom\('manual'\);\}/,'a manual leave must not be undone by the next poll');
 assert.match(main,/else if\(roomService\)\{roomService\.leave\(\);roomAutoError='';roomAutoFailedKey=null;roomAutoFailedUntil=0;\}/,'leaving a manual room also clears the automatic failure');
 assert.match(main,/queueRoomAuto\(\)/,'the client poll must feed the auto room step');
 assert.match(main,/auto:!!roomAutoKey&&!!roomAutoPin/,'only an established auto room may be marked as one');
 assert.match(main,/autoRoomDecision\(\{enabled,connected:!!client\?\.connected/);
 assert.match(main,/status==='lobby'&&Number\(client\.party\.lobbyCount\)>=2&&client\.party\?\.key\)roomAutoGoneSince=null/,'an unreadable identifier counts as missing evidence');
 assert.match(main,/blockedKey:roomAutoBlockedKey,failedKey:roomAutoFailedKey,failedRetryAt:roomAutoFailedUntil/);
 assert.match(main,/identity:client\?\.own,savedNick:state\.preferences\.roomNick/,'the room nickname comes from the public game id');
 assert.match(main,/roomAutoGoneSince=roomAutoGoneSince\?\?Date\.now\(\)/);
 assert.match(main,/roomAutoOfflineSince=roomAutoOfflineSince\?\?Date\.now\(\)/);
 assert.match(main,/if\(roomAutoKey&&roomService&&roomService\.snapshot\(\)\.mode==='idle'\)\{roomAutoKey=null;roomAutoCode=null;roomAutoPin=null;\}/,'a service that went idle must release the key');
 assert.match(main,/roomAutoError=error\?\.message\|\|'自动连接失败';[\s\S]{0,400}?publishWindows\('room-update'/,'a relay failure must reach the panel');
 assert.match(main,/roomAutoError='房间码派生失败';[\s\S]{0,200}?publishWindows\('room-update'/,'a derivation failure must reach the panel');
 assert.match(main,/roomAutoFailedKey=key;roomAutoFailedUntil=Date\.now\(\)\+AUTO_RETRY_MS;/,'a relay failure must earn a backoff');
 assert.match(main,/roomAutoError='';roomAutoCode=derived\.code;roomAutoPin=derived\.pin;/,'the derived code must be claimed before the handshake so a leave can abort it');
 assert.match(main,/snapshot\.room===roomAutoCode\)try\{roomService\?\.leave\(\);\}/,'a manual room inside the claim window is not ours to close');
 assert.match(main,/if\(roomAutoBlockedKey&&client\?\.party\?\.key&&client\.party\.key!==roomAutoBlockedKey\)roomAutoBlockedKey=null;/,'a different party lifts the manual-leave block');
});
test('only this process keeps the lobby identifier and the auto room closes with its switch',async()=>{
 const main=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
 assert.match(main,/const forRenderer=client=>\{/,'the renderer must not receive the lobby identifier');
 assert.match(main,/const \{own,party,\.\.\.rest\}=client,\{key,\.\.\.cleanParty\}=party\|\|\{\};/,'the identity used as the room nickname must be stripped');
 assert.match(main,/return \{\.\.\.rest,\.\.\.\(party\?\{party:cleanParty\}:\{\}\)\};/,'a missing party must stay missing');
 for(const boundary of [/publishWindows\('client-update',forRenderer\(latestClient\)\)/,/guard\('client-status',async force=>forRenderer\(await status\(force\)\)\)/,/guard\('authorize-client'[\s\S]{0,200}?forRenderer\(await status\(true\)\)/,/guard\('bootstrap',[\s\S]{0,140}?client:forRenderer\(latestClient\)/,/guard\('window-info'[\s\S]{0,300}?client:forRenderer\(latestClient\)/])assert.match(main,boundary,'every renderer-facing client snapshot must be stripped');
 const saveHandler=main.slice(main.indexOf("guard('save-state'"),main.indexOf("const {createClientSync}"));
 assert.ok(saveHandler.indexOf('closeAutoRoomIfRevoked();')>=0&&saveHandler.indexOf('closeAutoRoomIfRevoked();')<saveHandler.indexOf('guide.publish()'),'turning the switch or sync off must close the auto room before publishing');
 assert.match(main,/if\(had\|\|hadError\)publishWindows\('room-update'/,'revoking must also refresh the panel');
 assert.match(main,/storage\.mergeState\(current,incoming,data\.champions\)\);closeAutoRoomIfRevoked\(\)/,'an imported backup must not leave an orphan room');
 assert.match(main,/state\.preferences\?\.roomAuto===true&&state\.preferences\?\.autoSync!==false/,'automatic rooms follow the client poll switch');
 assert.match(main,/roomAutoCancelledKey=roomAutoKey;/,'a local close must be distinguishable from a relay failure');
 assert.match(main,/if\(roomAutoBlockedKey!==key&&roomAutoCancelledKey!==key\)/,'a local close must not be reported as a relay failure');
 assert.match(main,/if\(roomAutoKey!==key\)return;/,'a leave during the derivation must abort the attempt');
});
test('the renderer wires the automatic room toggle, copy text and quiet hint',async()=>{
 const app=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
 assert.match(app,/if\(el\.id==='room-auto'\)\{saved\.preferences\.roomAuto=el\.checked;persist\(\);render\(\);(?:return;)?\}/);
 assert.match(app,/autoEnabled:saved\.preferences\.roomAuto===true/);
 assert.match(app,/autoQuiet:roomAutoQuiet&&\(room\?\.members\?\.length\?\?0\)<=1/);
 assert.match(app,/room\?\.auto\?`开黑搭子组队房间/);
 assert.match(app,/noteRoomSnapshot\(snapshot\)|applyRoomSnapshot\(snapshot\)/,'room updates must feed the quiet hint');
 assert.match(app,/onRoomUpdate\?\.\(snapshot=>\{applyRoomSnapshot\(snapshot\);/,'live updates must go through the shared snapshot handler');
 assert.match(app,/applyRoomSnapshot\(room\)/,'a rebuilt window must start the quiet hint from its boot snapshot');
 assert.match(app,/if\(identity!==roomShareRoom\)\{roomShareRoom=identity;roomShareSig='';if\(identity\)scheduleRoomPublish\(\);\}/,'a rebuilt room must hear the current share again');
 assert.match(app,/roomQuietTimer=setTimeout\(\(\)=>\{roomQuietTimer=null;roomAutoQuiet=true;/,'the quiet hint needs its timer');
 assert.match(app,/地址、房间码和口令已复制；可直接发给队友手动加入/,'the automatic copy toast is part of the contract');
 assert.match(app,/autoSync:saved\.preferences\.autoSync!==false/,'the panel must know whether client sync is on');
});
