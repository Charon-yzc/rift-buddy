// Differential HTTP check. Uses synthetic feedback in isolated temporary stores.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {crc32,deflateSync} from 'node:zlib';
import {createFeedbackServer} from '../relay/feedback-server.mjs';

const root=await fs.mkdtemp(path.resolve('.local/feedback-parity-'));
const native=await createFeedbackServer({directory:path.join(root,'node')});
await new Promise(resolve=>native.server.listen(0,'127.0.0.1',resolve));
const executable=path.resolve(process.argv[2]||'server/feedback-rs/target/debug/rift-buddy-feedback.exe');
const child=spawn(executable,[path.join(root,'rust')],{stdio:['ignore','pipe','inherit']});
const exited=once(child,'exit');
const nodeBase=`http://127.0.0.1:${native.server.address().port}`;
const rustBase='http://127.0.0.1:8790';
let number=0;
const good={version:1,appVersion:'0.59.26',text:'synthetic parity fixture',images:[]};
function png(width=1,height=1){
 const chunk=(type,data)=>{const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]);};
 const head=Buffer.alloc(13);head.writeUInt32BE(width);head.writeUInt32BE(height,4);head[8]=8;head[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(Buffer.from([0,0,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);
}
const image=bytes=>({type:'image/png',data:bytes.toString('base64')});
async function compare(label,{route='/v1/feedback',method='POST',body=good,headers={}}={}){
 number++;
 const opts={method,headers:{'Content-Type':'application/json','X-Feedback-Client-IP':`192.0.2.${number}`,...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})};
 const read=async base=>{const response=await fetch(base+route,{...opts,signal:AbortSignal.timeout(5000)});const json=await response.json();if(json.id){assert.match(json.id,/^[a-f0-9-]{36}$/);json.id='generated';}return {status:response.status,body:json,cache:response.headers.get('cache-control'),retry:response.headers.get('retry-after')};};
 assert.deepEqual(await read(rustBase),await read(nodeBase),label);
 console.log(`PASS ${label}`);
}
try{
 await Promise.race([once(child.stdout,'data'),exited.then(()=>{throw Error('Rust exited before readiness');})]);
 await compare('health',{route:'/healthz',method:'GET'});
 await compare('no reads',{method:'GET'});
 await compare('unknown path',{route:'/v1/feedback/extra',method:'GET'});
 await compare('query suffix rejected',{route:'/healthz?x=1',method:'GET'});
 await compare('bad proxy IP',{headers:{'X-Feedback-Client-IP':'invalid'}});
 await compare('encoding rejected',{headers:{'Content-Encoding':'gzip'}});
 await compare('content type exact',{headers:{'Content-Type':'application/json; charset=utf-8'}});
 await compare('malformed JSON',{body:'{'});
 await compare('empty feedback',{body:{...good,text:' '}});
 await compare('oversized text',{body:{...good,text:'x'.repeat(2001)}});
 await compare('invalid version',{body:{...good,version:2}});
 await compare('unknown fields stripped',{body:{...good,credentials:'synthetic-must-disappear'}});
 await compare('PNG screenshot',{body:{...good,images:[image(png())]}});
 await compare('PNG dimension error is 400',{body:{...good,images:[image(png(8192,8192))]}});
 const corrupt=png();corrupt[corrupt.length-1]^=1;
 await compare('PNG CRC rejection',{body:{...good,images:[image(corrupt)]}});
 await compare('ECMAScript BOM trim',{body:{...good,text:'\ufeff fixture \ufeff'}});
 await compare('JSON numeric version 1.0',{body:JSON.stringify(good).replace('"version":1','"version":1.0')});
 await compare('global burst limit',{body:good});
 const records=async name=>{const directory=path.join(root,name);return Promise.all((await fs.readdir(directory)).map(async file=>{const row=JSON.parse(await fs.readFile(path.join(directory,file),'utf8'));delete row.id;delete row.receivedAt;return row;}));};
 const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 assert.deepEqual(ordered(await records('rust')),ordered(await records('node')),'stored whitelist payloads');
 console.log(`HTTP parity: ${number} cases; stored payload parity passed`);
}finally{
 child.kill();await exited;await native.stop();
 await fs.rm(root,{recursive:true,force:true});
}
