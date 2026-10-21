// Isolated loopback-only service: no room restart, public reads or accounts.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isIP} from 'node:net';
import {randomUUID,createHmac,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {FEEDBACK_LIMITS as L,feedbackText} from '../src/core/feedback.mjs';
import {validateFeedbackPng} from '../services/feedback-images.mjs';

const DAY=86400000,TTL=7*DAY,recordName=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/;
const fault=(message,status=400)=>Object.assign(Error(message),{status});
export function validateFeedback(input){
 const text=feedbackText(input?.text);
 if(input?.version!==1||typeof input.appVersion!=='string'||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input.appVersion)||!Array.isArray(input.images)||input.images.length>L.images)throw fault('invalid feedback');
 let total=0;const images=input.images.map(image=>{
  if(image?.type!=='image/png'||typeof image.data!=='string'||image.data.length>Math.ceil(L.imageBytes/3)*4||!image.data.length||image.data.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))throw fault('invalid image');
  const bytes=Buffer.from(image.data,'base64');total+=bytes.length;if(total>L.imageBytes)throw fault('too large',413);validateFeedbackPng(bytes);
  return {type:'image/png',data:bytes.toString('base64')};
 });
 if(!text&&!images.length)throw fault('empty feedback');return {version:1,appVersion:input.appVersion,text,images};
}

export async function createFeedbackStore(directory,{now=Date.now,maxCount=200,maxBytes=256*1024*1024}={}){
 const root=path.resolve(directory);await fs.mkdir(root,{recursive:true,mode:0o700});const info=await fs.lstat(root);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Invalid feedback directory');
 let chain=Promise.resolve();const serialize=fn=>{const task=chain.then(fn);chain=task.catch(()=>{});return task;};
 async function inventory(){
  const rows=[];let bytes=0;for(const name of await fs.readdir(root)){
   if(!recordName.test(name))continue;const file=path.join(root,name),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Invalid feedback entry');
   // Only this service's UUID JSON records expire, never arbitrary neighbours.
   if(now()-stat.mtimeMs>TTL){await fs.unlink(file);continue;}rows.push({name,bytes:stat.size});bytes+=stat.size;
  }return {rows,bytes};
 }
 const prune=()=>serialize(inventory);await prune();
 return {prune,save:input=>serialize(async()=>{
  const value=validateFeedback(input),id=randomUUID(),body=Buffer.from(JSON.stringify({id,receivedAt:new Date(now()).toISOString(),...value})),live=await inventory();
  if(live.rows.length>=maxCount||live.bytes+body.length>maxBytes)throw fault('feedback full',503);
  const file=path.join(root,id+'.json');let handle;try{handle=await fs.open(file,'wx',0o600);await handle.writeFile(body);await handle.sync();}catch(error){if(handle)await fs.unlink(file).catch(()=>{});throw error;}finally{await handle?.close();}return {id};
 })};
}

export async function createFeedbackServer({directory,now=Date.now,storeOptions={},storeFactory=createFeedbackStore,receiveTimeout=20000}){
 const store=await storeFactory(directory,{...storeOptions,now}),budgets=new Map(),salt=randomBytes(32);let globalDay={day:-1,count:0},globalBurst=[],inflight=0;
 function admit(address){
  const time=now(),day=Math.floor(time/DAY);if(globalDay.day!==day)globalDay={day,count:0};globalBurst=globalBurst.filter(t=>time-t<60000);
  for(const [key,v] of budgets)if(time-v.last>=DAY)budgets.delete(key);
  const key=createHmac('sha256',salt).update(address).digest('hex'),old=budgets.get(key)||{day,count:0,last:time,times:[]},v={day,count:old.day===day?old.count:0,last:time,times:old.times.filter(t=>time-t<600000)};
  if(v.count>=10||v.times.length>=3||globalDay.count>=100||globalBurst.length>=10||!budgets.has(key)&&budgets.size>=1024)return false;
  v.count++;v.times.push(time);budgets.set(key,v);globalDay.count++;globalBurst.push(time);return true;
 }
 const respond=(res,status,value)=>{if(res.writableEnded||res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Connection':'close',...(status===429?{'Retry-After':'600'}:{})});res.end(JSON.stringify(value));};
 const handler=(req,res)=>{
  if(req.url==='/healthz'&&req.method==='GET'){respond(res,200,{ok:true,service:'rift-buddy-feedback'});return;}
  if(req.url!=='/v1/feedback'){respond(res,404,{error:'not found'});return;}
  if(req.method!=='POST'){respond(res,405,{error:'POST required'});return;}
  const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress),address=String(req.headers['x-feedback-client-ip']||'');
  if(!loopback||!isIP(address)){respond(res,403,{error:'proxy required'});return;}
  if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']){respond(res,415,{error:'JSON required'});return;}
  const declared=req.headers['content-length'];if(declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>L.bodyBytes)){respond(res,413,{error:'too large'});return;}
  if(inflight>=2||!admit(address)){respond(res,429,{error:'rate limited'});return;}
  inflight++;let done=false,saving=false,total=0,chunks=[];const finish=()=>{if(done)return;done=true;inflight--;clearTimeout(timer);chunks=[];};
  const timer=setTimeout(()=>{if(saving){respond(res,503,{error:'feedback unavailable'});return;}respond(res,408,{error:'timeout'});finish();req.destroy();},receiveTimeout);timer.unref();
  req.on('error',finish);req.on('aborted',finish);res.once('close',()=>{if(!saving)finish();});
  req.on('data',chunk=>{if(done)return;total+=chunk.length;if(total>L.bodyBytes){respond(res,413,{error:'too large'});finish();req.destroy();}else chunks.push(chunk);});
  req.on('end',async()=>{
   if(done)return;saving=true;let input;try{input=JSON.parse(Buffer.concat(chunks));validateFeedback(input);}catch(error){respond(res,error.status||400,{error:'invalid feedback'});finish();return;}
   chunks=[];try{const result=await store.save(input);respond(res,201,result);}catch(error){respond(res,error.status||503,{error:'feedback unavailable'});}finally{finish();}
  });
 };
 const server=http.createServer({maxHeaderSize:4096},handler);server.headersTimeout=5000;server.requestTimeout=20000;server.keepAliveTimeout=1000;server.maxConnections=16;server.maxRequestsPerSocket=1;
 server.on('clientError',(_error,socket)=>socket.destroy());server.on('checkContinue',handler);
 const timer=setInterval(()=>store.prune().catch(()=>{}),3600000);timer.unref();
 return {server,store,stop:()=>new Promise(resolve=>{clearInterval(timer);server.close(resolve);server.closeAllConnections();})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await fs.realpath(process.argv[1])).href){
 const directory=process.argv[2];if(!directory||!path.isAbsolute(directory))throw Error('Absolute feedback directory required');
 const service=await createFeedbackServer({directory});service.server.listen(8790,'127.0.0.1');for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>service.stop());
}
