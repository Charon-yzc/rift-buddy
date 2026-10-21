import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerDataFetch} from '../services/server-data-fetch.mjs';
const official='https://ddragon.leagueoflegends.com/api/versions.json';
const vendor='https://lol-api-champion.op.gg/api/global/champions/ranked';

test('server collection allows only fixed HTTPS sources and never forwards credentials',async()=>{
 let calls=0;
 const network=createServerDataFetch({intervalMs:0,transport:async(url,options)=>{
  calls++;assert.equal(options.redirect,'error');assert.equal(options.method,'GET');assert.equal(options.headers,undefined);return new Response('["16.20.1"]');
 }});
 for(const url of ['http://127.0.0.1/','https://example.org/','https://user:secret@op.gg/'])await assert.rejects(network.fetcher(url),{code:'SOURCE_NOT_ALLOWED'});
 assert.equal(calls,0);assert.deepEqual(await network.readJSON(official),['16.20.1']);
 await network.fetcher(official,{headers:{Authorization:'should-not-leave-process'}});assert.equal(calls,2);
});
test('collection serializes body reads as well as requests, with spacing between starts',async()=>{
 let active=0,maximum=0,time=0;const starts=[];
 const network=createServerDataFetch({intervalMs:1500,now:()=>time,sleep:async ms=>{time+=ms;},transport:async()=>{
  starts.push(time);active++;maximum=Math.max(maximum,active);
  return new Response(new ReadableStream({async start(controller){await new Promise(resolve=>setTimeout(resolve,8));controller.enqueue(new Uint8Array([65]));active--;controller.close();}}));
 }});
 await Promise.all([network.fetcher(official),network.fetcher(official),network.fetcher(official)]);
 assert.equal(maximum,1);assert.deepEqual(starts,[0,1500,3000]);assert.equal(network.stats().bytes,3);
});
test('rate limits stop all OP.GG collection for the round without blocking other sources',async()=>{
 let calls=0;
 const network=createServerDataFetch({intervalMs:0,transport:async url=>{calls++;return new Response('limit',{status:url.includes('op.gg')?429:200});}});
 await assert.rejects(network.fetcher(vendor),{code:'SOURCE_PAUSED'});
 await assert.rejects(network.fetcher('https://op.gg/lol/modes/aram-mayhem/ahri/build'),{code:'SOURCE_PAUSED'});
 assert.equal(calls,1);assert.equal((await network.fetcher(official)).status,200);assert.equal(calls,2);
});
test('large streaming bodies, round budgets and deadlines stop collection',async()=>{
 let cancelled=false;
 const network=createServerDataFetch({intervalMs:0,maxBytes:5,transport:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(6));},cancel(){cancelled=true;}}))});
 await assert.rejects(network.fetcher(official),{code:'RESPONSE_LIMIT'});assert.ok(cancelled);
 await assert.rejects(network.fetcher(official),{code:'ROUND_LIMIT'});
 let time=0;const expired=createServerDataFetch({now:()=>time,durationMs:100,transport:()=>assert.fail('expired request')});time=101;
 await assert.rejects(expired.fetcher(official),{code:'ROUND_LIMIT'});
});
test('three upstream errors open the circuit and response header limits reject before buffering',async()=>{
 const network=createServerDataFetch({intervalMs:0,transport:async()=>new Response('down',{status:503})});
 for(let i=0;i<3;i++)assert.equal((await network.fetcher(vendor)).status,503);
 await assert.rejects(network.fetcher(vendor),{code:'SOURCE_PAUSED'});
 const large=createServerDataFetch({intervalMs:0,transport:async()=>new Response('small',{headers:{'content-length':'999999999'}})});
 await assert.rejects(large.fetcher(vendor),{code:'RESPONSE_LIMIT'});assert.equal(large.stats().bytes,0);
});

test('hero observation collection allows only the homepage and bounded champion patch paths',async()=>{
 let calls=0;const network=createServerDataFetch({intervalMs:0,transport:async()=>{calls++;return new Response('ok');}});
 for(const url of ['https://mayhemmeta.com/api/players','https://mayhemmeta.com/?token=secret','https://mayhemmeta.com/champions/yasuo?patch=16.20&player=x','https://mayhemmeta.com/champions/yasuo'])await assert.rejects(network.fetcher(url),{code:'SOURCE_NOT_ALLOWED'});
 assert.equal(calls,0);await network.fetcher('https://mayhemmeta.com/');await network.fetcher('https://mayhemmeta.com/champions/yasuo?patch=16.20');assert.equal(calls,2);
});
