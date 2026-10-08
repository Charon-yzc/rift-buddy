import test from 'node:test';
import assert from 'node:assert/strict';
import {createClientSync} from '../src/core/async-tasks.mjs';

test('a manual connection click waits for the poll and is never lost or duplicated',async()=>{
 let release;const blocked=new Promise(r=>{release=r;});const calls=[];
 const sync=createClientSync(async manual=>{calls.push(manual);if(!manual)await blocked;return manual?'authorized':'status';});
 const first=sync(false);await Promise.resolve();
 const click1=sync(true),click2=sync(true),poll=sync(false);
 assert.deepEqual(calls,[false]);release();
 assert.deepEqual(await Promise.all([first,click1,click2,poll]),['status','authorized','authorized','status']);
 assert.deepEqual(calls,[false,true]);
});
test('failed background reads do not block a subsequent manual retry',async()=>{
 const calls=[];const sync=createClientSync(async manual=>{calls.push(manual);if(!manual)throw Error('offline');return 'retried';});
 const poll=sync(false);const manual=sync(true);
 await assert.rejects(poll,/offline/);assert.equal(await manual,'retried');assert.deepEqual(calls,[false,true]);
});

test('rune verification waits for an older foreground read and performs a fresh read without authorization',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve;}),calls=[];
 const sync=createClientSync(async(manual,fresh)=>{calls.push({manual,fresh});if(calls.length===1){await blocked;return 'old selection';}return 'new selection';});
 const older=sync(true);await Promise.resolve();
 const verify=sync(false,{fresh:true}),poll=sync(false);
 assert.deepEqual(calls,[{manual:true,fresh:false}]);release();
 assert.deepEqual(await Promise.all([older,verify,poll]),['old selection','new selection','old selection']);
 assert.deepEqual(calls,[{manual:true,fresh:false},{manual:false,fresh:true}]);
});

test('a connection authorization click remains effective during a fresh rune-context read',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve;}),calls=[];
 const sync=createClientSync(async(manual,fresh)=>{calls.push({manual,fresh});if(fresh)await blocked;return manual?'authorized':'verified';});
 const verify=sync(false,{fresh:true});await Promise.resolve();
 const authorize=sync(true);release();
 assert.deepEqual(await Promise.all([verify,authorize]),['verified','authorized']);
 assert.deepEqual(calls,[{manual:false,fresh:true},{manual:true,fresh:false}]);
});
