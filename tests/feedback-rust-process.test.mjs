import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {startRustFeedback} from '../scripts/feedback-rust-process.mjs';

test('Rust differential harness owns an ephemeral child port and ignores inherited production port',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-feedback-process-'));
 let hits=0;const sentinel=http.createServer((q,s)=>{hits++;s.end('{}');});
 await new Promise(resolve=>sentinel.listen(0,'127.0.0.1',resolve));
 const script=path.join(root,'fake-child.cjs');
 await fs.writeFile(script,`const http=require('node:http');const s=http.createServer((q,r)=>r.end(JSON.stringify({service:'rift-buddy-feedback'})));s.listen(Number(process.env.RIFT_FEEDBACK_PORT),'127.0.0.1',()=>console.log('rift-buddy-feedback listening on 127.0.0.1:'+s.address().port));`);
 let child;
 try{
  child=await startRustFeedback({executable:process.execPath,args:[script],directory:root,env:{...process.env,RIFT_FEEDBACK_PORT:String(sentinel.address().port)}});
  assert.notEqual(new URL(child.base).port,String(sentinel.address().port));
  assert.equal(hits,0);
 }finally{if(child)await child.stop();await new Promise(resolve=>sentinel.close(resolve));await fs.rm(root,{recursive:true,force:true});}
});
test('Rust harness fails promptly on spawn or pre-readiness exit',async()=>{
 await assert.rejects(startRustFeedback({executable:path.resolve('missing-feedback-test-executable'),directory:os.tmpdir(),timeout:1000}),/failed before readiness/);
 await assert.rejects(startRustFeedback({executable:process.execPath,args:['-e','process.exit(3)'],directory:os.tmpdir(),timeout:1000}),/failed before readiness/);
});
