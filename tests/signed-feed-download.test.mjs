import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadSignedFeed,SIGNED_FEED_ORIGINS} from '../services/signed-feed-download.mjs';
import {verifyGenerationEnvelope} from '../services/data-generation.mjs';
const relative='/v2/latest.json';

test('signed data transport uses only the two fixed HTTPS origins and reuses the working route briefly',async()=>{
 const calls=[],fetcher=async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');if(url.startsWith(SIGNED_FEED_ORIGINS[0]))throw TypeError('connection closed');return new Response('verified later');};
 assert.equal((await downloadSignedFeed(relative,{limit:100,fetcher})).toString(),'verified later');
 assert.deepEqual(calls,SIGNED_FEED_ORIGINS.map(origin=>origin+relative));calls.length=0;
 await downloadSignedFeed(relative,{limit:100,fetcher});assert.deepEqual(calls,[SIGNED_FEED_ORIGINS[1]+relative]);
 for(const path of ['//evil.example/x','/v2/../secret','/v2/latest.json?redirect=https://evil.example','/community/v1/assets/not-a-hash.json.gz'])await assert.rejects(downloadSignedFeed(path,{limit:100,fetcher}),/地址/);
});
test('HTTP failure and replacement retries stay within fixed origins without following Location',async()=>{
 const calls=[],fetcher=async url=>{calls.push(url);return new Response('',{status:calls.length===1?302:404,headers:{location:'https://evil.example/steal'}});};
 await assert.rejects(downloadSignedFeed('/v2/assets/'+'a'.repeat(64)+'.json.gz',{limit:100,fetcher,replacedCode:'DATA_GENERATION_REPLACED'}),{code:'DATA_GENERATION_REPLACED'});
 assert.equal(calls.length,2);assert.ok(calls.every(url=>SIGNED_FEED_ORIGINS.some(origin=>url.startsWith(origin+'/v2/assets/'))));
});
test('oversized and empty bodies stop immediately, and signature rejection never changes transport source',async()=>{
 for(const make of [()=>new Response('big',{headers:{'content-length':'1000'}}),()=>new Response('big'),()=>new Response(null)]){
  let calls=0;const fetcher=async()=>{calls++;return make();};
  await assert.rejects(downloadSignedFeed(relative,{limit:2,fetcher}),/过大|为空/);assert.equal(calls,1);
 }
 let calls=0;const bytes=await downloadSignedFeed(relative,{limit:100,fetcher:async()=>{calls++;return new Response('{"payload":"tampered"}');}});
 assert.throws(()=>verifyGenerationEnvelope(JSON.parse(bytes)),/签名/);assert.equal(calls,1);
});
test('a removed immutable asset immediately requests a fresh manifest rather than masking its replacement',async()=>{
 let calls=0;
 await assert.rejects(downloadSignedFeed('/v2/assets/'+'a'.repeat(64)+'.json.gz',{limit:100,replacedCode:'DATA_GENERATION_REPLACED',fetcher:async()=>{calls++;return new Response('',{status:410});}}),{code:'DATA_GENERATION_REPLACED'});
 assert.equal(calls,1);
});
test('a stalled header attempt is cancelled before the backup and shares a single total deadline',async()=>{
 let firstAborted=false,calls=0;const fetcher=(_url,{signal})=>{calls++;if(calls===2)return Promise.resolve(new Response('ok'));return new Promise((_,reject)=>signal.addEventListener('abort',()=>{firstAborted=true;reject(signal.reason);},{once:true}));};
 const start=Date.now();await Promise.all([downloadSignedFeed(relative,{limit:100,fetcher,timeout:100}).then(bytes=>assert.equal(bytes.toString(),'ok')),new Promise(resolve=>setTimeout(resolve,120))]);
 assert.equal(firstAborted,true);assert.equal(calls,2);assert.ok(Date.now()-start<500);
});
test('cancellation releases late responses and never initiates a backup request',async()=>{
 const controller=new AbortController();let finish,cancelled=false,calls=0;
 const fetcher=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 const pending=downloadSignedFeed(relative,{limit:100,fetcher,signal:controller.signal});await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(pending,{name:'AbortError'});
 finish({body:{cancel:async()=>{cancelled=true;}}});await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,true);assert.equal(calls,1);
});
test('a stalled body exhausts the total budget and cancels the reader without fallback',async()=>{
 let calls=0,cancelled=false;const fetcher=async()=>{calls++;return {ok:true,headers:new Headers(),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>{cancelled=true;},releaseLock(){}})}};};
 await Promise.all([assert.rejects(downloadSignedFeed(relative,{limit:100,fetcher,timeout:20}),{name:'TimeoutError'}),new Promise(resolve=>setTimeout(resolve,40))]);
 assert.equal(calls,1);assert.equal(cancelled,true);
});
