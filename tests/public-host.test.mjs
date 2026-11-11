import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPublicResolver,publicAddress} from '../services/public-host.mjs';
import {createAppUpdateService} from '../services/app-update.mjs';
import {downloadCatalog} from '../services/catalog-store.mjs';

const fakeLookup=async()=>[{address:'198.18.0.141',family:4}];
const answer=(host,address='8.8.8.8',ttl=30)=>({Status:0,TC:false,Question:[{name:host+'.',type:1}],Answer:[{name:host+'.',type:1,data:address,TTL:ttl}]});
function dnsRequest(route,hits=[]){
 return (url,options,callback)=>{
  const req=new EventEmitter();req.destroy=()=>{req.destroyed=true;};
  hits.push({url:new URL(url),options,req});
  req.end=()=>queueMicrotask(()=>{
   const selected=route(url.searchParams.get('name'),url);
   if(!selected)return;
   const res=new EventEmitter();res.statusCode=selected.status||200;res.destroy=()=>{res.destroyed=true;};
   callback(res);if(req.destroyed)return;
   res.emit('data',Buffer.from(selected.raw??JSON.stringify(selected.body??selected)));res.emit('end');
  });return req;
 };
}

test('only a pure Fake-IP answer falls back to fixed HTTPS DNS and yields public pinned addresses',async()=>{
 const hits=[],resolve=createPublicResolver({lookup:fakeLookup,dohRequest:dnsRequest(host=>answer(host,'180.76.199.13'),hits)});
 assert.deepEqual(await resolve('gitee.com'),[{address:'180.76.199.13',family:4}]);
 assert.equal(publicAddress('198.18.0.141'),false);assert.equal(publicAddress('198.19.255.254'),false);
 assert.equal(hits.length,1);assert.equal(hits[0].url.origin,'https://cloudflare-dns.com');assert.equal(hits[0].url.pathname,'/dns-query');
 assert.equal(hits[0].url.searchParams.get('name'),'gitee.com');assert.equal(hits[0].options.rejectUnauthorized,true);
 assert.equal(hits[0].options.headers.Authorization,undefined);assert.equal(hits[0].options.lookup,undefined);
 const records=[{address:'8.8.8.8',family:4}];
 assert.deepEqual(await createPublicResolver({lookup:async()=>records,dohRequest:()=>assert.fail('Public DNS must use the normal path')})('gitee.com'),records);
 for(const addresses of [['127.0.0.1'],['10.0.0.2'],['198.18.0.1','10.0.0.2'],['198.18.0.1','8.8.8.8'],['::1'],[]]){
  await assert.rejects(createPublicResolver({lookup:async()=>addresses.map(address=>({address,family:4})),dohRequest:()=>assert.fail('Private/mixed answers must not trigger DNS fallback')})('gitee.com'),/内网/);
 }
 await assert.rejects(resolve('198.18.0.141'),/内网/);
 await assert.rejects(createPublicResolver({lookup:fakeLookup})('gitee.com'),/内网/,'Injected lookups must not accidentally access the network');
});

test('DNS fallback rejects private, unrelated, truncated and mismatched responses without following redirects',async()=>{
 const bad=[answer('gitee.com','127.0.0.1'),answer('gitee.com','198.18.0.1'),{...answer('gitee.com'),TC:true},answer('evil.example'),{...answer('gitee.com'),Answer:[{name:'evil.example',type:1,data:'8.8.8.8',TTL:30}]},{...answer('gitee.com'),Status:3},{raw:'x'.repeat(32769)},{status:302,raw:'redirect'}];
 for(const body of bad){
  const hits=[],resolve=createPublicResolver({lookup:fakeLookup,dohRequest:dnsRequest(()=>body,hits)});
  await assert.rejects(resolve('gitee.com'),/未能解析有效公网/);
  assert.equal(hits.length,2);assert.deepEqual(hits.map(hit=>hit.url.hostname),['cloudflare-dns.com','dns.google']);
  assert.equal(hits[1].url.searchParams.get('edns_client_subnet'),'0.0.0.0/0');
 }
 const mixed=answer('gitee.com');mixed.Answer.push({name:'gitee.com',type:1,data:'192.168.1.1',TTL:30});
 await assert.rejects(createPublicResolver({lookup:fakeLookup,dohRequest:dnsRequest(()=>mixed)})('gitee.com'),/未能解析有效公网/);
});

test('CNAME answers, TTL expiry and bounded cache preserve fresh address checks',async()=>{
 let now=0,calls=0,privateDNS=false;
 const request=dnsRequest(host=>{calls++;return {...answer(host),Answer:[{name:host,type:5,data:'cdn.example.',TTL:2},{name:'cdn.example.',type:1,data:'8.8.8.8',TTL:30}]};});
 const resolve=createPublicResolver({lookup:async()=>privateDNS?[{address:'10.0.0.1',family:4}]:fakeLookup(),dohRequest:request,clock:()=>now});
 await resolve('gitee.com');const cached=await resolve('gitee.com');cached[0].address='127.0.0.1';
 assert.equal((await resolve('gitee.com'))[0].address,'8.8.8.8');assert.equal(calls,1);
 now=2001;await resolve('gitee.com');assert.equal(calls,2);
 privateDNS=true;await assert.rejects(resolve('gitee.com'),/内网/);assert.equal(calls,2);privateDNS=false;
 for(let i=0;i<65;i++)await resolve(`host${i}.example`);
 const before=calls;await resolve('host0.example');assert.equal(calls,before+1);
});

test('cancellation and deadlines stop DNS work before creating a business request',async()=>{
 const controller=new AbortController();let finishLookup,dohCalls=0;
 const resolve=createPublicResolver({lookup:()=>new Promise(resolve=>finishLookup=resolve),dohRequest:()=>{dohCalls++;assert.fail('Cancelled lookup must not start HTTPS DNS');}});
 const pending=resolve('gitee.com',{signal:controller.signal});controller.abort();await assert.rejects(pending,/取消/);
 finishLookup(await fakeLookup());await new Promise(resolve=>setImmediate(resolve));assert.equal(dohCalls,0);
 const stalled=createPublicResolver({lookup:()=>new Promise(()=>{}),dohRequest:()=>assert.fail('Timed-out lookup must not start HTTPS DNS')});
 await Promise.all([assert.rejects(stalled('gitee.com',{timeout:10}),/解析更新地址超时/),new Promise(resolve=>setTimeout(resolve,30))]);
 const hits=[],during=new AbortController(),dns=createPublicResolver({lookup:fakeLookup,dohRequest:dnsRequest(()=>null,hits)});
 const request=dns('gitee.com',{signal:during.signal});await new Promise(resolve=>setImmediate(resolve));during.abort();
 await assert.rejects(request,/取消/);assert.equal(hits[0].req.destroyed,true);assert.equal(hits.length,1);
 const timed=[],timeout=createPublicResolver({lookup:fakeLookup,dohRequest:dnsRequest(()=>null,timed)});
 await Promise.all([assert.rejects(timeout('gitee.com',{timeout:10}),/解析更新地址超时/),new Promise(resolve=>setTimeout(resolve,30))]);
 assert.equal(timed[0].req.destroyed,true);assert.equal(timed.length,1);
});

test('only four resolutions can be pending and cancellation releases capacity',async()=>{
 const controller=new AbortController(),resolve=createPublicResolver({lookup:()=>new Promise(()=>{}),dohRequest:null});
 const active=Array.from({length:4},()=>assert.rejects(resolve('gitee.com',{signal:controller.signal}),/取消/));
 await assert.rejects(resolve('gitee.com'),/正在解析其他/);controller.abort();await Promise.all(active);
 const fresh=new AbortController(),next=resolve('gitee.com',{signal:fresh.signal});fresh.abort();await assert.rejects(next,/取消/);
 const aborted=new AbortController();aborted.abort();await assert.rejects(resolve('gitee.com',{signal:aborted.signal}),/取消/);
});

const feed='<?xml version="1.0"?><feed><entry><title>v9.9.9</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9"/><updated>2026-10-12T00:00:00Z</updated></entry></feed>';
const businessRequest=(body,hits)=>(url,options,callback)=>{
 const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{
  options.lookup(url.hostname,{all:true},(error,records)=>{assert.ifError(error);hits.push({url,records});});
  const res=new EventEmitter();res.statusCode=200;res.headers={};res.resume=()=>{};callback(res);res.emit('data',Buffer.from(body));res.emit('end');req.emit('close');
 });return req;
};
test('software checks and catalogs pin real addresses while retaining the HTTPS hostname',async()=>{
 const hits=[],dohRequest=dnsRequest(host=>answer(host,'180.76.199.13'));
 const updater=createAppUpdateService({currentVersion:'0.59.58',feedUrl:'https://github.com/Legender134/rift-buddy/releases.atom',giteeFeedUrl:null,lookup:fakeLookup,dohRequest,request:businessRequest(feed,hits)});
 assert.equal((await updater.check()).release.version,'9.9.9');
 assert.equal(hits[0].url.protocol,'https:');assert.equal(hits[0].url.hostname,'github.com');assert.equal(hits[0].records[0].address,'180.76.199.13');
 const catalogHits=[];
 assert.deepEqual(await downloadCatalog('https://catalog.example/data.json',{lookup:fakeLookup,dohRequest,request:businessRequest('{"schema":1}',catalogHits)}),{schema:1});
 assert.equal(catalogHits[0].url.hostname,'catalog.example');assert.equal(catalogHits[0].records[0].address,'180.76.199.13');
});
