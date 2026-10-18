import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {startHelper,requestHelper} from '../services/client-helper.mjs';

test('history-only large responses cross the authenticated pipe while ordinary replies retain their original limit',{skip:process.platform!=='win32'},async()=>{
 const key=crypto.randomBytes(16).toString('hex'),config={pipe:'\\\\.\\pipe\\rift-buddy-'+key,secret:crypto.randomBytes(32).toString('hex')};
 const server=net.createServer(socket=>{let buffer='';socket.on('error',()=>{});socket.on('data',chunk=>{buffer+=chunk;if(!buffer.includes('\n'))return;const message=JSON.parse(buffer);assert.equal(message.secret,config.secret);socket.end(JSON.stringify({ok:true,result:{rows:Array(1000).fill('模拟战绩数据'.repeat(40))}})+'\n');});});
 await new Promise(resolve=>server.listen(config.pipe,resolve));
 try{const result=await requestHelper(config,'matchHistory',{operation:'page'});assert.equal(result.rows.length,1000);await assert.rejects(requestHelper(config,'status'),/异常|断开/);}finally{await new Promise(resolve=>server.close(resolve));}
});

test('the real authorized helper exposes only named history operations and authenticates clear',{skip:process.platform!=='win32'},async()=>{
 const root=await fs.mkdtemp(path.resolve('.local/history-helper-')),key=crypto.randomBytes(16).toString('hex'),file=path.join(root,'client-session-'+key+'.json');
 const config={pipe:'\\\\.\\pipe\\rift-buddy-'+key,secret:crypto.randomBytes(32).toString('hex'),createdAt:Date.now(),parentPid:process.pid};
 await fs.writeFile(file,JSON.stringify(config));const server=await startHelper(file,{userData:root,bundleRoot:path.resolve('.'),quit(){}});
 try{await assert.rejects(requestHelper(config,'matchHistory',{operation:'arbitrary',payload:{url:'https://example.test'}}),/不支持/);assert.equal(await requestHelper(config,'matchHistory',{operation:'clear',payload:{}}),true);await assert.rejects(requestHelper({...config,secret:'0'.repeat(64)},'matchHistory',{operation:'clear'}),/结束|断开/);}finally{if(server.listening)await new Promise(resolve=>server.close(resolve));}
});
