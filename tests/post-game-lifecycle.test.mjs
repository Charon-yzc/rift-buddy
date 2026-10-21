import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createPostGameLifecycle} from '../services/post-game-lifecycle.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
const valid=()=>({connected:true,enabled:true,phase:'EndOfGame',gameId:111,account:'own-account',transport:{}});
test('late settlement cannot cross game, account, transport, disconnect, setting or shutdown boundaries',async()=>{
 for(const change of [c=>c.gameId=222,c=>c.phase='ChampSelect',c=>c.account='other',c=>c.transport={},c=>c.connected=false,c=>c.enabled=false]){
  let client=valid(),release;const shown=[];
  const lifecycle=createPostGameLifecycle({current:()=>client,read:()=>new Promise(r=>release=r),show:r=>shown.push(r),hide(){}});
  const pending=lifecycle.observe();await Promise.resolve();change(client);lifecycle.observe();release({gameId:111});await pending;assert.equal(shown.length,0,change.toString());
 }
 let release;const shown=[],lifecycle=createPostGameLifecycle({current:valid,read:()=>new Promise(r=>release=r),show:r=>shown.push(r),hide(){}});
 const pending=lifecycle.observe();await Promise.resolve();lifecycle.dispose();release({gameId:111});await pending;assert.equal(shown.length,0);
});
test('incomplete data retries, a mismatched result is rejected, success is shown only once and retry work is bounded',async()=>{
 let clock=0,reads=0,client=valid();const shown=[];
 const lifecycle=createPostGameLifecycle({now:()=>clock,current:()=>client,read:async()=>{reads++;return reads===1?null:{gameId:reads===2?222:111};},show:r=>shown.push(r),hide(){}});
 await lifecycle.observe();await lifecycle.observe();assert.equal(reads,1);clock+=3000;await lifecycle.observe();assert.equal(shown.length,0);clock+=5000;await lifecycle.observe();assert.equal(shown.length,1);clock+=60000;await lifecycle.observe();assert.equal(reads,3);
 let attempts=0;const bounded=createPostGameLifecycle({now:()=>clock,current:()=>client,read:async()=>{attempts++;return null;},show(){assert.fail();},hide(){}});
 for(let i=0;i<25;i++){clock+=60000;await bounded.observe();}assert.equal(attempts,12);
});
test('popup preference survives the actual settings disk round trip',async()=>{
 const root=await fs.mkdtemp(path.resolve('.local/postgame-settings-')),state=defaultState();state.preferences.postGamePopup=false;
 await saveState(root,state);const read=await readState(root);assert.equal(read.preferences.postGamePopup,false);
 let reads=0;const client={...valid(),enabled:read.preferences.postGamePopup};const lifecycle=createPostGameLifecycle({current:()=>client,read:async()=>{reads++;return {gameId:111};},show(){assert.fail();},hide(){}});await lifecycle.observe();assert.equal(reads,0);
});
