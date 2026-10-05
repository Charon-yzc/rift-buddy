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
