import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {sgpRequest} from '../services/match-history-sgp.mjs';

const route='/match-history-query/v1/products/lol/KR_123/SUMMARY';
const token='synthetic-sgp-token';
function transport(t,{status=200,location,body='{"games":[]}'}={}){
 const calls=[];
 t.mock.method(https,'request',(url,options,callback)=>{
  const request=new EventEmitter(),chunks=[];
  request.write=value=>chunks.push(value);
  request.destroy=()=>{};
  request.end=()=>{calls.push({url:new URL(url),options,body:chunks.join('')});queueMicrotask(()=>{
   const response=Readable.from([Buffer.from(body)]);response.statusCode=status;response.headers=location?{location}:{};callback(response);
  });};
  return request;
 });
 return calls;
}

test('actual SGP transport sends Bearer only to fixed Riot/Tencent HTTPS origins',async t=>{
 const calls=transport(t);
 for(const [server,common,origin] of [
  ['TENCENT_HN10',false,'https://hn10-k8s-sgp.lol.qq.com:21019'],
  ['TENCENT_HN10',true,'https://hn10-k8s-sgp.lol.qq.com:21019'],
  ['KR',false,'https://apne1-red.pp.sgp.pvp.net'],
  ['KR',true,'https://kr-red.lol.sgp.pvp.net'],
  ['NA1',false,'https://usw2-red.pp.sgp.pvp.net']
 ]){
  assert.deepEqual(await sgpRequest({server,common,route,token}),{games:[]});
  const call=calls.at(-1);assert.equal(call.url.origin,origin);assert.equal(call.url.pathname,route);
  assert.equal(call.options.headers.Authorization,'Bearer '+token);assert.equal(call.options.auth,undefined);
  assert.equal(call.url.username,'');assert.equal(call.url.password,'');assert.equal(call.options.method,'GET');assert.equal(call.body,'');
 }
 assert.equal(calls.length,5);
});

test('invalid SGP server, absolute route and header-injection token fail before any request',t=>{
 const calls=transport(t);
 for(const input of [
  {server:'https://attacker.invalid'},
  {route:'https://attacker.invalid/match-history-query/v1/games'},
  {route:'//attacker.invalid/match-history-query/v1/games'},
  {route:'/not-history/v1/games'},
  {token:''},{token:'secret\r\nAuthorization: Basic forbidden'}
 ])assert.throws(()=>sgpRequest({server:'KR',route,token,...input}));
 assert.deepEqual(calls,[]);
});

for(const status of [301,302,307,308])test(`SGP ${status} rejects a Location without sending a second authenticated request`,async t=>{
 const calls=transport(t,{status,location:'https://attacker.invalid/collect'});
 await assert.rejects(sgpRequest({server:'KR',route,token}),error=>error.status===status&&!error.message.includes(token));
 assert.equal(calls.length,1);assert.equal(calls[0].url.origin,'https://apne1-red.pp.sgp.pvp.net');
});
