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
const FEED2=`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v100.0.0 烟测版2</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v100.0.0"/><updated>2026-10-12T01:00:00Z</updated></entry></feed>`;
const SETUP100_URL='https://github.com/Legender134/rift-buddy/releases/download/v100.0.0/RiftBuddy-100.0.0-Setup.exe';
const SUM100_URL='https://github.com/Legender134/rift-buddy/releases/download/v100.0.0/SHA256SUMS-100.0.0.txt';
const MSETUP100_URL='https://mirror.smoke/https://github.com/Legender134/rift-buddy/releases/download/v100.0.0/RiftBuddy-100.0.0-Setup.exe';
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
   const routes={[FEED_URL]:{status:200,body:Buffer.from(mode==='feed2'||mode==='mirror404'?FEED2:FEED)},[SUM_URL]:{status:200,body:Buffer.from(`${BIN_SHA}  RiftBuddy-99.0.0-Setup.exe\n`)},[SETUP_URL]:{status:200,headers:{'content-length':String(BIN.length)},body:BIN,chunks:4},[SETUP100_URL]:{status:200,headers:{'content-length':String(BIN.length)},body:BIN},[SUM100_URL]:mode==='nocsum'?{status:404,body:''}:{status:200,body:Buffer.from(`${BIN_SHA}  RiftBuddy-100.0.0-Setup.exe\n`)},[MSETUP100_URL]:mode==='mirror404'?{status:404,body:''}:{status:200,headers:{'content-length':String(BIN.length)},body:BIN,chunks:2}};
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
 const reload=()=>new Promise(resolve=>{main.webContents.once('did-finish-load',resolve);main.webContents.reload();});
 await until(()=>js('!!document.querySelector("[data-action=role-pools]")'),'Draft missing');
 const click=async selector=>{assert.ok(await js(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(120);};
 const set=async(selector,value,event='input')=>js(`{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));}`);
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
 // 阶段 4：重启后续装——renderer 重启后离线重查，pending 快捷方式不断网恢复 ready
 mode='offline';
 await reload();
 await until(()=>js('!!document.querySelector("[data-action=role-pools]")'),'Restart missing');
 await click('[data-action=navigate][data-route=settings]');
 await click('[data-action=app-update-check]');
 await until(()=>js('!!document.querySelector("[data-action=app-update-install]")'),'Pending shortcut not restored');
 assert.ok(await js('!!document.querySelector("[data-action=app-update-install]")'));
 const notesLink=await js('document.querySelector("[data-action=link]")?.dataset.url');
 assert.equal(notesLink,'https://github.com/Legender134/rift-buddy/releases/tag/v99.0.0');
 // 阶段 5：删除安装包回 idle
 await click('[data-action=app-update-delete]');
 await until(async()=>js('!!document.querySelector("[data-action=app-update-check]")')&&!(await js('document.querySelector("[data-action=app-update-check]").disabled')),'Delete did not reset');
 assert.equal(await fs.readFile(path.join(root,'app-update.json')).then(()=> 'exists').catch(()=>'gone'),'gone');
 // 阶段 6：忽略此版 + 新版重提示
 mode='feed';
 await click('[data-action=app-update-check]');
 await until(()=>js('!!document.querySelector("[data-action=app-update-dismiss]")'),'Dismiss missing');
 await click('[data-action=app-update-dismiss]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("已是最新")'),'Dismiss did not settle');
 await click('[data-action=app-update-check]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("已是最新")'),'Dismissed version re-prompted');
 mode='feed2';
 await js(`window.buddy.checkAppUpdate(false);window.buddy.checkAppUpdate(false);`);
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("100.0.0")'),'Newer version not prompted');
 // 阶段 7：校验缺失可重试、无残留
 mode='nocsum';
 await click('[data-action=app-update-download]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("缺失")'),'Missing-asset message not shown');
 await until(async()=>js('!!document.querySelector("[data-action=app-update-check]")')&&!(await js('document.querySelector("[data-action=app-update-check]").disabled')),'Failure not retryable');
 assert.deepEqual((await fs.readdir(path.join(root,'update-tmp'))).filter(n=>n.endsWith('.exe')||n.endsWith('.part')),[]);
 // 阶段 8：发布说明链接越权拒绝（有效链接不断言，避免在 CI 拉起浏览器）
 assert.ok((await js('window.buddy.openLink("https://github.com/other/repo/releases/tag/v1").then(()=> "OPENED").catch(()=> "REJECTED")')).startsWith('REJECTED'));
 assert.ok((await js('window.buddy.openLink("https://github.com/Legender134/rift-buddy/blob/main/README.md").then(()=> "OPENED").catch(()=> "REJECTED")')).startsWith('REJECTED'));
 // 阶段 9：镜像加速下载（安装包走镜像，校验文件仍直连）
 await set('#update-mirror','https://mirror.smoke','change');
 await until(async()=>(await js('window.buddy.bootstrap()')).state.preferences.updateMirror==='https://mirror.smoke','Mirror pref not persisted');
 mode='feed2';
 await click('[data-action=app-update-check]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("100.0.0")'),'Mirror available not shown');
 await click('[data-action=app-update-download]');
 await until(()=>js('!!document.querySelector("[data-action=app-update-install]")'),'Mirror ready not reached');
 assert.ok(await js('document.querySelector("#app-update-message")?.textContent.includes("经镜像下载")'));
 const mrecord=JSON.parse(await fs.readFile(path.join(root,'app-update.json'),'utf8'));
 assert.equal(mrecord.via,'mirror');
 // 阶段 10：镜像失败自动改直连并明示
 await click('[data-action=app-update-delete]');
 await until(async()=>js('!!document.querySelector("[data-action=app-update-check]")'),'Mirror delete did not reset');
 mode='mirror404';
 await click('[data-action=app-update-check]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("100.0.0")'),'Fallback available not shown');
 await click('[data-action=app-update-download]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("已改用直连")'),'Fallback notice not shown');
 await until(()=>js('!!document.querySelector("[data-action=app-update-install]")'),'Fallback ready not reached');
 const frecord=JSON.parse(await fs.readFile(path.join(root,'app-update.json'),'utf8'));
 assert.equal(frecord.via,'direct');assert.equal(frecord.sha256,BIN_SHA);
 console.log(JSON.stringify({passed:true,offline:true,verified:true,dryRun:true,dismissed:true,pendingShortcut:true,cleanupChecked:true,mirror:true,fallback:true}));
}
run().then(()=>app.exit(0)).catch(e=>{console.error(e);app.exit(1);});
