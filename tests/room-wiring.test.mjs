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
 assert.deepEqual(exposed.sort(),['room-addresses','room-host','room-join','room-leave','room-publish','room-relay','room-scan','room-status']);
 for(const channel of exposed)assert.match(main,new RegExp(`guard\\('${channel}'`),`${channel} is exposed but not guarded in main`);
 assert.match(main,/webContents\.send\('room-update'/,'main must broadcast room updates to the renderer');
 assert.match(preload,/ipcRenderer\.on\('room-update'/,'preload must subscribe to room updates');
 const used=[...new Set([...app.matchAll(/api\.(room[A-Z]\w*|onRoomUpdate)/g)].map(m=>m[1]))];
 assert.ok(used.length>=8,`expected the renderer to use the full room API, saw ${used.join(',')}`);
 for(const name of used)assert.match(preload,new RegExp(`\\b${name}:`),`${name} is used by the renderer but not exposed in preload`);
});
test('the automatic room decoration wraps updates, guards, leave state and the client poll',async()=>{
 const main=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
 assert.match(main,/import\('\.\.\/src\/core\/room-auto\.mjs'\)/,'main must load the auto room core');
 assert.match(main,/webContents\.send\('room-update',decorateRoom\(snapshot\)\)/,'room updates must carry the auto marker');
 const guards={
  'room-status':/guard\('room-status',\(\)=>roomService\?decorateRoom\(roomService\.snapshot\(\)\)/,
  'room-host':/guard\('room-host',async nick=>decorateRoom\(await ensureRoom\(nick\)\.host\(\)\)\)/,
  'room-join':/guard\('room-join',async\(target,nick\)=>decorateRoom\(await ensureRoom\(nick\)\.join\(target\|\|\{\}\)\)\)/,
  'room-relay':/guard\('room-relay',async\(target,nick\)=>decorateRoom\(await ensureRoom\(nick\)\.relay\(target\|\|\{\}\)\)\)/,
  'room-leave':/guard\('room-leave',[\s\S]{0,400}?closeAutoRoom\('manual'\);[\s\S]{0,200}?return decorateRoom\(/,
  'room-publish':/guard\('room-publish',[^\n]*decorateRoom\(/,
 };
 for(const [name,pattern] of Object.entries(guards))assert.match(main,pattern,`${name} must return a decorated snapshot`);
 assert.match(main,/if\(roomAutoKey\)\{roomAutoBlockedKey=roomAutoKey;closeAutoRoom\('manual'\);\}/,'a manual leave must not be undone by the next poll');
 assert.match(main,/queueRoomAuto\(\)/,'the client poll must feed the auto room step');
 assert.match(main,/autoRoomDecision\(\{enabled/);
});
test('only this process keeps the lobby identifier and the auto room closes with its switch',async()=>{
 const main=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
 assert.match(main,/const forRenderer=client=>\{/,'the renderer must not receive the lobby identifier');
 assert.match(main,/return \{\.\.\.rest,\.\.\.\(party\?\{party:cleanParty\}:\{\}\)\};/,'a missing party must stay missing');
 for(const boundary of [/send\('client-update',forRenderer\(latestClient\)\)/,/guard\('client-status',async force=>forRenderer\(await status\(force\)\)\)/,/guard\('authorize-client'[\s\S]{0,200}?forRenderer\(await status\(true\)\)/,/guard\('bootstrap',[\s\S]{0,120}?client:forRenderer\(latestClient\)/,/guard\('window-info'[\s\S]{0,300}?client:forRenderer\(latestClient\)/])assert.match(main,boundary,'every renderer-facing client snapshot must be stripped');
 assert.match(main,/closeAutoRoomIfRevoked\(\);\s+guide\.publish\(\)/,'turning the switch or sync off must close the auto room');
 assert.match(main,/storage\.mergeState\(current,incoming,data\.champions\)\);closeAutoRoomIfRevoked\(\)/,'an imported backup must not leave an orphan room');
 assert.match(main,/state\.preferences\?\.roomAuto===true&&state\.preferences\?\.autoSync!==false/,'automatic rooms follow the client poll switch');
 assert.match(main,/roomAutoCancelledKey=roomAutoKey;/,'a local close must be distinguishable from a relay failure');
 assert.match(main,/if\(roomAutoBlockedKey!==key&&roomAutoCancelledKey!==key\)/,'a local close must not be reported as a relay failure');
 assert.match(main,/if\(roomAutoKey!==key\)return;/,'a leave during the derivation must abort the attempt');
});
test('the renderer wires the automatic room toggle, copy text and quiet hint',async()=>{
 const app=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
 assert.match(app,/if\(el\.id==='room-auto'\)\{saved\.preferences\.roomAuto=el\.checked;persist\(\);render\(\);\}/);
 assert.match(app,/autoEnabled:saved\.preferences\.roomAuto===true/);
 assert.match(app,/autoQuiet:roomAutoQuiet&&\(room\?\.members\?\.length\?\?0\)<=1/);
 assert.match(app,/room\?\.auto\?`开黑搭子组队房间/);
 assert.match(app,/noteRoomSnapshot\(snapshot\)|applyRoomSnapshot\(snapshot\)/,'room updates must feed the quiet hint');
 assert.match(app,/applyRoomSnapshot\(room\)/,'a rebuilt window must start the quiet hint from its boot snapshot');
 assert.match(app,/if\(identity!==roomShareRoom\)\{roomShareRoom=identity;roomShareSig='';if\(identity\)scheduleRoomPublish\(\);\}/,'a rebuilt room must hear the current share again');
 assert.match(app,/autoSync:saved\.preferences\.autoSync!==false/,'the panel must know whether client sync is on');
});
