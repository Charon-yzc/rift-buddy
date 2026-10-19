import test from 'node:test';
import assert from 'node:assert/strict';
import {formatChampSelectAnnouncement,findChampSelectConversation,sendChampSelectAnnouncement} from '../services/lcu-chat.mjs';
import {lcuRequest} from '../services/lcu.mjs';
import https from 'node:https';
import {EventEmitter} from 'node:events';

const champSelectRoom = 'test-room' + '@champ-select';
const binding={context:{phase:'ChampSelect',gameId:'123',cellId:1},championId:22,pageId:7,page:{primaryStyleId:8000,subStyleId:8100,selectedPerkIds:[8005,9111,9104,8014,8139,8135,5005,5008,5002]}};
const currentRoute=route=>route==='/lol-gameflow/v1/gameflow-phase'?'ChampSelect':route==='/lol-champ-select/v1/session'?{gameId:123,localPlayerCellId:1,myTeam:[{cellId:1,championId:22}]}:route==='/lol-perks/v1/pages'?[{id:7,current:true,...binding.page}]:undefined;

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
  const current=currentRoute(route);if(current!==undefined)return current;
  if(route==='/lol-chat/v1/conversations')return [{id:champSelectRoom,type:'championSelect'}];
  if(route===`/lol-chat/v1/conversations/${champSelectRoom}/messages`)return {id:'msg-1'};
  throw Error('unexpected route '+route);
 };

 return sendChampSelectAnnouncement(
  {text:'【开黑搭子】已配置 寒冰射手',...binding},
  {discover:mockDiscover,request:mockRequest,allowed:()=>true}
 ).then(result=>{
  assert.equal(result.sent,true);
  assert.equal(result.conversationId,champSelectRoom);
  assert.equal(calls.filter(c=>c.route==='/lol-perks/v1/pages').length,2);
  const posts=calls.filter(c=>c.method==='POST');assert.equal(posts.length,1);
  assert.equal(posts[0].route,`/lol-chat/v1/conversations/${champSelectRoom}/messages`);
  assert.deepEqual(posts[0].body,{body:'【开黑搭子】已配置 寒冰射手',type:'chat'});
 });
});

test('sendChampSelectAnnouncement resolves gracefully when client or chat room is absent',()=>{
 const noClient=sendChampSelectAnnouncement(
  {text:'test',...binding},
  {discover:async()=>null,request:async()=>{},allowed:()=>true}
 );
 return noClient.then(r=>{
  assert.equal(r.sent,false);
  assert.equal(r.reason,'client-unavailable');
 }).then(()=>{
  return sendChampSelectAnnouncement(
   {text:'test',...binding},
   {discover:async()=>({port:1234,password:'p'}),request:async(_auth,route)=>currentRoute(route)??[],allowed:()=>true}
  );
 }).then(r=>{
  assert.equal(r.sent,false);
  assert.equal(r.reason,'no-champ-select-conversation');
 });
});

test('lcuRequest permits mocked champ-select chat read and post while rejecting invalid chat calls',async t=>{
 const dispatched=[];
 t.mock.method(https,'request',(options,callback)=>{
  dispatched.push(options);const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from('{}'));res.emit('end');});req.write=()=>{};req.destroy=()=>{};return req;
 });
 const auth={port:23456,password:'valid-secret'};
 const room='team-123@champ-select';
 await lcuRequest(auth,'/lol-chat/v1/conversations','GET');
 await lcuRequest(auth,`/lol-chat/v1/conversations/${room}/messages`,'POST',{body:'推荐加点 W',type:'chat'});
 assert.equal(dispatched.length,2);assert(dispatched.every(o=>o.hostname==='127.0.0.1'));

 // Invalid routes/bodies are rejected synchronously
 assert.throws(()=>lcuRequest(auth,`/lol-chat/v1/conversations/${room}/messages`,'GET'),/不支持/);
 assert.throws(()=>lcuRequest(auth,`/lol-chat/v1/conversations/${room}/messages`,'POST',{body:'',type:'chat'}),/不支持/);
 assert.throws(()=>lcuRequest(auth,`/lol-chat/v1/conversations/${room}/messages`,'POST',{body:'test',type:'other'}),/不支持/);
 assert.throws(()=>lcuRequest(auth,'/lol-chat/v1/conversations/room-123/bad/messages','POST',{body:'test',type:'chat'}),/不支持/);
 assert.throws(()=>lcuRequest(auth,'/lol-chat/v1/other','GET'),/不支持/);
});
