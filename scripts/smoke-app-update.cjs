const {app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const windows=[],root=path.resolve(process.env.RIFT_BUDDY_USER_DATA);
app.on('browser-window-created',(_e,w)=>windows.push(w));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let i=0;i<150;i++){const r=await check();if(r)return r;await delay(100);}throw Error(label);}
const BIN=crypto.randomBytes(131072),BIN_SHA=crypto.createHash('sha256').update(BIN).digest('hex');
// 注意：源码模式（RIFT_BUDDY_SOURCE=1 / pnpm start）下 app.getVersion() 返回的是
// Electron 版本号（实测 44.5.1）而非应用版本；v99.0.0 高于两者，保证两种模式都确定性触发更新。
const FEED_URL='https://github.com/Legender134/rift-buddy/releases.atom';
const SETUP_URL='https://github.com/Legender134/rift-buddy/releases/download/v99.0.0/RiftBuddy-99.0.0-Setup.exe';
const SUM_URL='https://github.com/Legender134/rift-buddy/releases/download/v99.0.0/SHA256SUMS-99.0.0.txt';
const FEED=`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v99.0.0 烟测版</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v99.0.0"/><updated>2026-10-12T00:00:00Z</updated></entry></feed>`;
async function run(){
 app.setPath('userData',root);
 const https=require('node:https'),dns=require('node:dns/promises'),{EventEmitter}=require('node:events');
 dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
 let mode='offline';
 https.request=(url,options,callback)=>{
  const href=String(url.href||url);
  const req=new EventEmitter();req.destroy=e=>{req.emit('error',e||Error('aborted'));req.emit('close');};
  req.end=()=>queueMicrotask(()=>{
   const res=new EventEmitter();res.resume=()=>{};
   if(mode==='offline'){req.emit('error',Error('Smoke offline'));req.emit('close');return;}
   const routes={[FEED_URL]:{status:200,body:Buffer.from(FEED)},[SUM_URL]:{status:200,body:Buffer.from(`${BIN_SHA}  RiftBuddy-99.0.0-Setup.exe\n`)},[SETUP_URL]:{status:200,headers:{'content-length':String(BIN.length)},body:BIN,chunks:4}};
   const route=routes[href];
   if(!route){res.statusCode=404;callback(res);res.emit('end');req.emit('close');return;}
   res.statusCode=route.status;res.headers=route.headers||{};callback(res);
   if(route.chunks){const n=Math.ceil(route.body.length/route.chunks);for(let i=0;i<route.body.length;i+=n)res.emit('data',route.body.subarray(i,i+n));}
   else res.emit('data',route.body);
   res.emit('end');req.emit('close');
  });
  return req;
 };
 const source=process.env.RIFT_BUDDY_SOURCE==='1';
 const release=source?null:JSON.parse(await fs.readFile('release/latest.json','utf8'));
 require(source?path.resolve('electron/main.cjs'):path.join(release.directory,'resources/app.asar/electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=role-pools]")'),'Draft missing');
 const click=async selector=>{assert.ok(await js(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(120);};
 await click('[data-action=navigate][data-route=settings]');
 await click('[data-action=app-update-check]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("未完成")'),'Offline failure not surfaced');
 mode='feed';
 await click('[data-action=app-update-check]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("99.0.0")'),'Available version not shown');
 await click('[data-action=app-update-download]');
 await until(()=>js('!!document.querySelector("[data-action=app-update-install]")'),'Ready state not reached');
 const record=JSON.parse(await fs.readFile(path.join(root,'app-update.json'),'utf8'));
 assert.equal(record.version,'99.0.0');
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(record.file)).digest('hex'),BIN_SHA);
 await click('[data-action=app-update-install]');
 const witness=await until(async()=>fs.readFile(path.join(root,'app-update.json.dry-run.json'),'utf8').then(JSON.parse).catch(()=>null),'Dry-run witness missing');
 assert.equal(witness.sha256,BIN_SHA);assert.equal(witness.file,record.file);
 assert.ok(await js('document.body.textContent.length>0'),'App quit during dry run');
 console.log(JSON.stringify({passed:true,offline:true,verified:true,dryRun:true}));
}
run().then(()=>app.exit(0)).catch(e=>{console.error(e);app.exit(1);});
