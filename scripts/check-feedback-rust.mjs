import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {crc32,deflateSync} from 'node:zlib';
import {createFeedbackServer} from '../relay/feedback-server.mjs';
import {startRustFeedback} from './feedback-rust-process.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-feedback-parity-'));
const executable=path.resolve(process.argv[2]||`server/feedback-rs/target/debug/rift-buddy-feedback${process.platform==='win32'?'.exe':''}`);
let number=0;
const good={version:1,appVersion:'0.59.37',text:'synthetic parity fixture',images:[]};
function png(width=1,height=1,padding=0){
 const chunk=(type,data)=>{const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]);};
 const head=Buffer.alloc(13);head.writeUInt32BE(width);head.writeUInt32BE(height,4);head[8]=8;head[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(Buffer.from([0,0,0,0,255]))),...(padding?[chunk('tEXt',Buffer.alloc(padding))]:[]),chunk('IEND',Buffer.alloc(0))]);
}
const image=bytes=>({type:'image/png',data:bytes.toString('base64')});
async function records(directory){
 return Promise.all((await fs.readdir(directory)).filter(file=>file.endsWith('.json')).map(async file=>{const row=JSON.parse(await fs.readFile(path.join(directory,file),'utf8'));delete row.id;delete row.receivedAt;return row;}));
}
const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
async function compare(label,{route='/v1/feedback',method='POST',body=good,headers={},status=400,burst=false}={}){
 number++;
 const directory=path.join(root,String(number)),native=await createFeedbackServer({directory:path.join(directory,'node')});
 let rust;
 try{
  await new Promise((resolve,reject)=>{native.server.once('error',reject);native.server.listen(0,'127.0.0.1',resolve);});
  rust=await startRustFeedback({executable,directory:path.join(directory,'rust')});
  const nodeBase=`http://127.0.0.1:${native.server.address().port}`;
  const read=async(base,index)=>{
   const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Feedback-Client-IP':`192.0.2.${index}`,...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
   const json=await response.json();if(json.id){assert.match(json.id,/^[a-f0-9-]{36}$/);json.id='generated';}
   return {status:response.status,body:json,cache:response.headers.get('cache-control'),retry:response.headers.get('retry-after')};
  };
  for(let i=1;i<=(burst?11:1);i++){
   const actual=await read(rust.base,i),expected=await read(nodeBase,i);
   assert.deepEqual(actual,expected,label);
   assert.equal(actual.status,burst?(i===11?429:201):status,label+' expected HTTP status');
  }
  assert.deepEqual(ordered(await records(path.join(directory,'rust'))),ordered(await records(path.join(directory,'node'))),label+' stored whitelist');
  console.log(`PASS ${label}`);
 }finally{if(rust)await rust.stop();await native.stop();}
}
try{
 await compare('health',{route:'/healthz',method:'GET',status:200});
 await compare('no reads',{method:'GET',status:405});
 await compare('unknown path',{route:'/v1/feedback/extra',method:'GET',status:404});
 await compare('query suffix rejected',{route:'/healthz?x=1',method:'GET',status:404});
 await compare('bad proxy IP',{headers:{'X-Feedback-Client-IP':'invalid'},status:403});
 await compare('encoding rejected',{headers:{'Content-Encoding':'gzip'},status:415});
 await compare('content type exact',{headers:{'Content-Type':'application/json; charset=utf-8'},status:415});
 await compare('malformed JSON',{body:'{'});
 await compare('empty feedback',{body:{...good,text:' '}});
 await compare('oversized text',{body:{...good,text:'x'.repeat(2001)}});
 await compare('invalid version',{body:{...good,version:2}});
 await compare('unknown fields stripped',{body:{...good,credentials:'synthetic-must-disappear'},status:201});
 await compare('PNG screenshot',{body:{...good,images:[image(png())]},status:201});
 await compare('PNG dimension error is 400',{body:{...good,images:[image(png(8192,8192))]}});
 const corrupt=png();corrupt[corrupt.length-1]^=1;
 await compare('PNG CRC rejection',{body:{...good,images:[image(corrupt)]}});
 await compare('ECMAScript BOM trim',{body:{...good,text:'\ufeff fixture \ufeff'},status:201});
 await compare('JSON numeric version 1.0',{body:JSON.stringify(good).replace('"version":1','"version":1.0'),status:201});
 await compare('last duplicate replaces invalid value',{body:JSON.stringify(good).replace('"text":','"text":[],"text":'),status:201});
 await compare('last duplicate replaces valid value',{body:JSON.stringify(good).replace('"text":','"text":[],"ignored":')});
 await compare('unknown field cannot alias known field',{body:{...good,type:'ignored',data:[]},status:201});
 await compare('wrong image property type',{body:{...good,images:[{type:'image/png',data:[0,1,2]}]}});
 await compare('image duplicate keys use last value',{body:JSON.stringify({...good,images:[image(png())]}).replace('"data":','"data":[],"data":'),status:201});
 await compare('too many images',{body:{...good,images:Array(4).fill(image(png()))}});
 const large=('[0'+',0'.repeat(4_000_000)+']');
 await compare('huge unknown array stays bounded',{body:JSON.stringify(good).replace('"images":[]',`"extra":${large},"images":[]`),status:201});
 await compare('huge known wrong type stays bounded',{body:JSON.stringify(good).replace('"images":[]',`"images":${large}`)});
 await compare('trailing syntax wins over image validation',{body:JSON.stringify({...good,images:Array(4).fill(image(png()))})+'!'});
 const overImages={...good,images:[image(png(1,1,5*1024*1024)),image(png(1,1,5*1024*1024))]};
 await compare('cumulative PNG limit is 413',{body:overImages,status:413});
 await compare('malformed trailing JSON before 413',{body:JSON.stringify(overImages)+'!'});
 await compare('invalid text before PNG budget',{body:{...overImages,text:[]}});
 for(const field of ['text','appVersion','version']){const fields={...good,[field]:null};await compare('huge wrong type '+field,{body:JSON.stringify(fields).replace('"'+field+'":null','"'+field+'":'+large)});}
 await compare('global burst limit',{burst:true,status:429});
 console.log(`HTTP parity: ${number} fresh-process cases; expected statuses and stored payloads passed`);
}finally{
 // Only this test's mkdtemp directory, never any external service/store.
 await fs.rm(root,{recursive:true,force:true});
}
