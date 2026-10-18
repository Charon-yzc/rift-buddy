import test from 'node:test';
import assert from 'node:assert/strict';
import {clientConnectionNotice} from '../src/client-connection-view.mjs';

test('offline status offers connection and launch while a connected client removes the reminder',()=>{
 const html=clientConnectionNotice({connected:false});
 assert.match(html,/data-client-connection-status/);assert.match(html,/未连接英雄联盟客户端/);
 assert.match(html,/data-action="sync" data-client-connect/);assert.match(html,/data-action="launch-game"/);
 assert.equal(clientConnectionNotice({connected:true}),'');
});
test('connection notice distinguishes disabled automatic connection and a Windows permission request',()=>{
 assert.match(clientConnectionNotice({}, {autoSync:false}),/开启自动连接/);
 assert.match(clientConnectionNotice({needsElevation:true}),/需要 Windows 权限/);
 assert.match(clientConnectionNotice({needsElevation:true}),/自动读取公开数据/);
 assert.doesNotMatch(clientConnectionNotice({needsElevation:true}),/授权连接|请授权/);
 const busy=clientConnectionNotice({}, {},true);assert.match(busy,/data-client-connect disabled/);assert.match(busy,/正在连接客户端/);
 assert.doesNotMatch(clientConnectionNotice({message:'<script>bad()</script>'}),/<script>/);
});

test('compact connection keeps the primary action visible and secondary details collapsed',()=>{
 for(const client of [{},{needsElevation:true},{connecting:true}]){
  const html=clientConnectionNotice(client,{autoSync:false},false,{compact:true});
  assert.match(html,/data-client-connect/);assert.match(html,/class="client-connection-options"/);
  assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
  assert.ok(html.indexOf('data-client-connect')<html.indexOf('<details'));
  assert.match(html,/<details[\s\S]*data-action="launch-game"/);
 }
 assert.equal(clientConnectionNotice({connected:true},{},false,{compact:true}),'');
});
