import test from 'node:test';
import assert from 'node:assert/strict';
import {clientConnectionNotice} from '../src/client-connection-view.mjs';

test('offline status offers connection and launch while a connected client removes the reminder',()=>{
 const html=clientConnectionNotice({connected:false});
 assert.match(html,/data-client-connection-status/);assert.match(html,/未连接英雄联盟客户端/);
 assert.match(html,/data-action="connect-client"/);assert.match(html,/data-action="launch-game"/);
 assert.equal(clientConnectionNotice({connected:true}),'');
});
test('connection notice distinguishes disabled automatic connection and Windows authorization',()=>{
 assert.match(clientConnectionNotice({}, {autoSync:false}),/开启自动连接/);
 assert.match(clientConnectionNotice({needsElevation:true}),/授权连接/);
 const busy=clientConnectionNotice({}, {},true);assert.match(busy,/data-action="connect-client" disabled/);assert.match(busy,/正在连接客户端/);
 assert.doesNotMatch(clientConnectionNotice({message:'<script>bad()</script>'}),/<script>/);
});
