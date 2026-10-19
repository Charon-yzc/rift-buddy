import test from 'node:test';
import assert from 'node:assert/strict';
import {formatChampSelectAnnouncement,findChampSelectConversation,sendChampSelectAnnouncement} from '../services/lcu-chat.mjs';
import {lcuRequest} from '../services/lcu.mjs';

const champSelectRoom = 'test-room' + '@champ-select';

test('formatChampSelectAnnouncement creates clean, single-line WeGame-style team announcements',()=>{
 const ashe=formatChampSelectAnnouncement({
  championName:'寒冰射手',
  primaryStyleName:'精密',
  subStyleName:'主宰',
  keystoneName:'强攻',
  firstSkill:'W',
  priority:'WQE'
 });
 assert.equal(ashe,'【开黑搭子】已配置 寒冰射手 | 符文：精密+主宰（强攻） | 推荐加点：1级学 W，主 W 副 Q');

 const aphelios=formatChampSelectAnnouncement({
  championName:'厄斐琉斯',
  primaryStyleName:'精密',
  subStyleName:'启迪',
  keystoneName:'征服者',
  attributePriority:'攻击力 › 攻速 › 穿甲'
 });
 assert.equal(aphelios,'【开黑搭子】已配置 厄斐琉斯 | 符文：精密+启迪（征服者） | 属性加点：攻击力 › 攻速 › 穿甲');

 const hex=formatChampSelectAnnouncement({
  championName:'金克丝',
  keystoneName:'致命节奏',
  firstSkill:'Q',
  priority:'QWE',
  mode:'hex'
 });
 assert.match(hex,/已配置 金克丝（大乱斗）/);
 assert.match(hex,/基石：致命节奏/);
 assert.match(hex,/推荐加点：1级学 Q，主 Q 副 W/);

 const minimal=formatChampSelectAnnouncement({});
 assert.equal(minimal,'【开黑搭子】已配置 英雄');

 const multiline=formatChampSelectAnnouncement({
  championName:'卡牌\n大师\r\0',
  firstSkill:'W\n'
 });
 assert.doesNotMatch(multiline,/[\r\n\0]/);
 assert.match(multiline,/卡牌 大师/);
});

test('findChampSelectConversation identifies champ select chat rooms by type or id',()=>{
 const list=[
  {id:'lobby-1@chat',type:'lobby'},
  {id:champSelectRoom,type:'championSelect'},
  {id:'post-1@chat',type:'postGame'}
 ];
 assert.equal(findChampSelectConversation(list)?.id,champSelectRoom);

 const fallback=[
  {id:'fallback-room@champ-select.pvp.net'},
  {id:'other@chat',type:'chat'}
 ];
 assert.equal(findChampSelectConversation(fallback)?.id,'fallback-room@champ-select.pvp.net');

 assert.equal(findChampSelectConversation([]),null);
 assert.equal(findChampSelectConversation(null),null);
 assert.equal(findChampSelectConversation([{id:'bad/id',type:'championSelect'}]),null,'IDs with invalid characters are rejected');
});

test('sendChampSelectAnnouncement queries LCU conversations and posts chat message',()=>{
 const calls=[];
 const mockDiscover=async()=>({port:23456,password:'test-secret'});
 const mockRequest=async(auth,route,method,body)=>{
  calls.push({route,method,body});
  if(route==='/lol-chat/v1/conversations')return [{id:champSelectRoom,type:'championSelect'}];
  if(route===`/lol-chat/v1/conversations/${champSelectRoom}/messages`)return {id:'msg-1'};
  throw Error('unexpected route '+route);
 };

 return sendChampSelectAnnouncement(
  {text:'【开黑搭子】已配置 寒冰射手'},
  {discover:mockDiscover,request:mockRequest}
 ).then(result=>{
  assert.equal(result.sent,true);
  assert.equal(result.conversationId,champSelectRoom);
  assert.equal(calls.length,2);
  assert.equal(calls[0].route,'/lol-chat/v1/conversations');
  assert.equal(calls[0].method,'GET');
  assert.equal(calls[1].route,`/lol-chat/v1/conversations/${champSelectRoom}/messages`);
  assert.equal(calls[1].method,'POST');
  assert.deepEqual(calls[1].body,{body:'【开黑搭子】已配置 寒冰射手',type:'chat'});
 });
});

test('sendChampSelectAnnouncement resolves gracefully when client or chat room is absent',()=>{
 const noClient=sendChampSelectAnnouncement(
  {text:'test'},
  {discover:async()=>null,request:async()=>{}}
 );
 return noClient.then(r=>{
  assert.equal(r.sent,false);
  assert.equal(r.reason,'client-unavailable');
 }).then(()=>{
  return sendChampSelectAnnouncement(
   {text:'test'},
   {discover:async()=>({port:1234,password:'p'}),request:async()=>[]}
  );
 }).then(r=>{
  assert.equal(r.sent,false);
  assert.equal(r.reason,'no-champ-select-conversation');
 });
});

test('lcuRequest permits champ-select chat read and post while rejecting invalid chat calls',()=>{
 const auth={port:23456,password:'valid-secret'};
 const room='team-123@champ-select';
 // GET /lol-chat/v1/conversations is whitelisted (catch loopback network error)
 assert.doesNotThrow(()=>{
  lcuRequest(auth,'/lol-chat/v1/conversations','GET').catch(()=>{});
 });
 // POST /lol-chat/v1/conversations/{id}/messages with valid body is whitelisted
 assert.doesNotThrow(()=>{
  lcuRequest(auth,`/lol-chat/v1/conversations/${room}/messages`,'POST',{body:'推荐加点 W',type:'chat'}).catch(()=>{});
 });

 // Invalid routes/bodies are rejected synchronously
 assert.throws(()=>lcuRequest(auth,`/lol-chat/v1/conversations/${room}/messages`,'GET'),/不支持/);
 assert.throws(()=>lcuRequest(auth,`/lol-chat/v1/conversations/${room}/messages`,'POST',{body:'',type:'chat'}),/不支持/);
 assert.throws(()=>lcuRequest(auth,`/lol-chat/v1/conversations/${room}/messages`,'POST',{body:'test',type:'other'}),/不支持/);
 assert.throws(()=>lcuRequest(auth,'/lol-chat/v1/conversations/room-123/bad/messages','POST',{body:'test',type:'chat'}),/不支持/);
 assert.throws(()=>lcuRequest(auth,'/lol-chat/v1/other','GET'),/不支持/);
});
