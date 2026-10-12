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
 assert.match(main,/guard\('room-status',\(\)=>roomService\?decorateRoom\(roomService\.snapshot\(\)\):null\)/);
 assert.match(main,/if\(roomAutoKey\)roomAutoBlockedKey=roomAutoKey/,'a manual leave must not be undone by the next poll');
 assert.match(main,/queueRoomAuto\(latestClient\)/,'the client poll must feed the auto room step');
 assert.match(main,/autoRoomDecision\(\{enabled/);
});
test('the renderer wires the automatic room toggle, copy text and quiet hint',async()=>{
 const app=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
 assert.match(app,/if\(el\.id==='room-auto'\)\{saved\.preferences\.roomAuto=el\.checked;persist\(\);render\(\);\}/);
 assert.match(app,/autoEnabled:saved\.preferences\.roomAuto===true/);
 assert.match(app,/autoQuiet:roomAutoQuiet&&\(room\?\.members\?\.length\?\?0\)<=1/);
 assert.match(app,/room\?\.auto\?`开黑搭子组队房间/);
});
