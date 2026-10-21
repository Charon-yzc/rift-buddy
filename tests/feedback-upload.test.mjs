import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {crc32,deflateSync} from 'node:zlib';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createFeedbackServer,createFeedbackStore,validateFeedback} from '../relay/feedback-server.mjs';
import {createFeedbackClient} from '../services/feedback.mjs';
import {feedbackImageDimensions,validateFeedbackPng} from '../services/feedback-images.mjs';
import {FEEDBACK_URL} from '../src/core/feedback.mjs';
import {createFeedbackUI} from '../src/feedback-view.mjs';

function png(width=1,height=1){const chunk=(type,data)=>{const tag=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([len,tag,data,crc]);},head=Buffer.alloc(13);head.writeUInt32BE(width);head.writeUInt32BE(height,4);head[8]=8;head[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(Buffer.from([0,0,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);}
const input=()=>({version:1,appVersion:'0.59.26',text:'画面遮住技能栏',images:[{type:'image/png',data:png().toString('base64')}]});
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rift-feedback-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

test('feedback strips unknown fields and accepts only bounded checked PNG screenshots',()=>{
 const value=validateFeedback({...input(),credentials:'must not store',account:'private'});assert.deepEqual(Object.keys(value),['version','appVersion','text','images']);assert.deepEqual(feedbackImageDimensions(png()),{width:1,height:1});
 assert.throws(()=>validateFeedbackPng(png(8192,8192)),/分辨率/);assert.throws(()=>feedbackImageDimensions(Buffer.from('<svg/>')),/PNG/);
 const broken=png();broken[broken.length-1]^=1;assert.throws(()=>validateFeedbackPng(broken));assert.throws(()=>validateFeedback({...input(),text:'x'.repeat(2001)}));assert.throws(()=>validateFeedback({...input(),images:Array(4).fill(input().images[0])}));assert.throws(()=>validateFeedback({...input(),images:[{type:'image/svg+xml',data:'PHN2Zy8+'}]}));assert.throws(()=>validateFeedback({version:1,appVersion:'0.59.26',text:' ',images:[]}));
});

test('private store serializes concurrent quota checks and expires only its generated records',async t=>{
 const dir=await temporary(t),store=await createFeedbackStore(dir,{maxCount:1});const results=await Promise.allSettled([store.save(input()),store.save(input())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,503);
 const files=await fs.readdir(dir),record=JSON.parse(await fs.readFile(path.join(dir,files[0])));assert.match(record.id,/^[0-9a-f-]{36}$/);assert.equal(record.text,input().text);
 await fs.writeFile(path.join(dir,'player-owned.txt'),'keep');const old=new Date(Date.now()-8*86400000);await fs.utimes(path.join(dir,files[0]),old,old);await store.prune();assert.deepEqual(await fs.readdir(dir),['player-owned.txt']);
 const small=await createFeedbackStore(path.join(dir,'small'),{maxBytes:1});await assert.rejects(small.save(input()),e=>e.status===503);
});

test('public feedback accepts explicit submissions, rejects reads, spoofed forwarding and bursts',async t=>{
 const dir=await temporary(t),service=await createFeedbackServer({directory:dir});await new Promise(r=>service.server.listen(0,'127.0.0.1',r));t.after(()=>service.stop());const url='http://127.0.0.1:'+service.server.address().port+'/v1/feedback';
 const send=(extra={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Feedback-Client-IP':'192.0.2.1',...extra},body:JSON.stringify(input())});
 assert.equal((await fetch(url)).status,405);assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'192.0.2.1'},body:'{}'})).status,403);
 assert.equal((await send({'Content-Encoding':'gzip'})).status,415);
 for(let i=0;i<3;i++){const response=await send();assert.equal(response.status,201);assert.match((await response.json()).id,/^[0-9a-f-]{36}$/);}
 assert.equal((await send()).status,429);assert.equal((await fs.readdir(dir)).length,3);
 assert.equal((await fetch(url+'/anything')).status,404);
});

test('desktop feedback binds chosen screenshots and never follows redirects or adds automatic context',async t=>{
 const dir=await temporary(t),file=path.join(dir,'private-original.png');await fs.writeFile(file,png());const calls=[];
 let status=201,clock=100000;
 const request=(url,options,callback)=>{assert.equal(url.href,FEEDBACK_URL);assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,undefined);const req=new EventEmitter();req.destroy=()=>req.emit('close');req.end=body=>{calls.push(JSON.parse(body));const response=Readable.from([Buffer.from(JSON.stringify({id:'d99c020c-949a-49c1-a66e-b8cf1331a251'}))]);response.statusCode=status;queueMicrotask(()=>{callback(response);req.emit('close');});};return req;};
 const client=createFeedbackClient({chooseFiles:async()=>[file],encodeImage:async bytes=>({bytes,preview:'data:image/png;base64,'+bytes.toString('base64')}),version:'0.59.26',request,now:()=>clock});
 const picked=await client.choose();await assert.rejects(client.send({text:'问题',images:[file],consent:true}),/确认/);await assert.rejects(client.send({text:'问题',images:[picked[0].id],consent:false}),/确认/);
 await client.send({text:'问题',images:[picked[0].id],consent:true,account:'private',logs:'private'});assert.deepEqual(Object.keys(calls[0]),['version','appVersion','text','images']);assert.equal(JSON.stringify(calls[0]).includes('private'),false);await assert.rejects(client.send({text:'问题',images:[],consent:true}),/稍后/);
 clock+=31000;status=302;await assert.rejects(client.send({text:'问题',images:[],consent:true}),/未完成/);assert.equal(calls.length,2,'A redirect cannot issue a second request');client.clear();
});

test('erasing feedback after picking a screenshot cannot revive the previous text',async()=>{
 let html='',value='',sent;const textarea={get value(){return value;},focus(){}},overlay={querySelector:selector=>selector==='.feedback-dialog'?html.includes('feedback-dialog'):selector==='#feedback-text'||selector==='textarea'?textarea:null,get innerHTML(){return html;},set innerHTML(v){html=v;value=/<textarea[^>]*>([^<]*)<\/textarea>/.exec(v)?.[1]||'';}};
 const ui=createFeedbackUI({overlay,api:{feedbackClear:async()=>{},feedbackImages:async()=>[{id:'chosen',preview:'data:image/png;base64,'}],feedbackSend:async input=>{sent=input;return {id:'receipt'};}}});
 await ui.action('feedback-open');value='已删除的私人文字';await ui.action('feedback-images');value='';await ui.action('feedback-send');assert.equal(sent.text,'');assert.deepEqual(sent.images,['chosen']);
});

test('a stalled store retains its concurrency slots after the response deadline',async t=>{
 const waiting=[];let entered=0;const service=await createFeedbackServer({directory:'unused',receiveTimeout:40,storeFactory:async()=>({prune:async()=>{},save:async()=>{entered++;return new Promise(resolve=>waiting.push(()=>resolve({id:'d99c020c-949a-49c1-a66e-b8cf1331a251'})));}})});
 await new Promise(r=>service.server.listen(0,'127.0.0.1',r));t.after(async()=>{waiting.forEach(r=>r());await service.stop();});const url='http://127.0.0.1:'+service.server.address().port+'/v1/feedback',send=ip=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Feedback-Client-IP':ip},body:JSON.stringify(input())});
 const pair=await Promise.all([send('192.0.2.1'),send('192.0.2.2')]);assert(pair.every(r=>r.status===503));assert.equal(entered,2);assert.equal((await send('192.0.2.3')).status,429);assert.equal(entered,2);waiting.forEach(r=>r());
});
