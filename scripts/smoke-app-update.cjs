const {revealDraftAction}=require('./smoke-draft-ui.cjs');
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
 const handoff=process.env.RIFT_BUDDY_SMOKE_UPDATE_HANDOFF==='1';let launches=0,quits=0;
 if(handoff){
  const cp=require('node:child_process'),spawn=cp.spawn;
  cp.spawn=(file,...args)=>{
   if(!String(file).startsWith(path.join(root,'update-tmp')+path.sep))return spawn(file,...args);
   const child=new EventEmitter(),attempt=++launches;child.unref=()=>{};
   setTimeout(()=>child.emit(attempt===1?'error':'spawn',attempt===1?Error('EACCES smoke blocked'):undefined),200);
   return child;
  };
  require('node:module').syncBuiltinESMExports();app.quit=()=>{quits++;};
 }
 dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
 let mode='offline';const ranges=[];
 https.request=(url,options,callback)=>{
  const href=String(url.href||url);
  const req=new EventEmitter();req.destroy=e=>{req.destroyed=true;req.emit('error',e||Error('aborted'));req.emit('close');};
  req.end=()=>queueMicrotask(()=>{
   const res=new EventEmitter();res.resume=()=>{};
   if(mode==='offline'){req.emit('error',Error('Smoke offline'));req.emit('close');return;}
   const routes={[FEED_URL]:{status:200,body:Buffer.from(mode==='feed2'||mode==='mirror404'?FEED2:FEED)},[SUM_URL]:{status:200,body:Buffer.from(`${BIN_SHA}  RiftBuddy-99.0.0-Setup.exe\n`)},[SETUP_URL]:{status:200,headers:{'content-length':String(BIN.length)},body:BIN,chunks:4},[SETUP100_URL]:{status:200,headers:{'content-length':String(BIN.length)},body:BIN},[SUM100_URL]:mode==='nocsum'?{status:404,body:''}:{status:200,body:Buffer.from(`${BIN_SHA}  RiftBuddy-100.0.0-Setup.exe\n`)},[MSETUP100_URL]:mode==='mirror404'?{status:404,body:''}:{status:200,headers:{'content-length':String(BIN.length)},body:BIN,chunks:2}};
   const route=routes[href];
   if(!route){res.statusCode=404;callback(res);res.emit('end');req.emit('close');return;}
   if(mode==='slow'&&href===SETUP_URL){
    const start=Number(/^bytes=(\d+)-$/.exec(options.headers.Range||'')?.[1]||0);ranges.push(start);
    res.statusCode=start?206:200;res.headers={'content-length':String(BIN.length-start),...(start?{'content-range':`bytes ${start}-${BIN.length-1}/${BIN.length}`}:{})};res.destroy=()=>{req.destroyed=true;};
    callback(res);let offset=start;
    const send=()=>{if(req.destroyed)return;if(offset===BIN.length){res.emit('end');req.emit('close');return;}res.emit('data',BIN.subarray(offset,offset+4096));offset+=4096;setTimeout(send,40);};setTimeout(send,40);return;
   }
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
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=code=>main.webContents.executeJavaScript(code,true).catch(error=>{throw Error('Renderer expression: '+code,{cause:error});});
 const reload=()=>new Promise(resolve=>{main.webContents.once('did-finish-load',resolve);main.webContents.reload();});
 await until(()=>js('!!document.querySelector("#solo-role")'),'Draft missing');
 const click=async selector=>{selector=await revealDraftAction(js,selector);assert.ok(await js(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(120);};
 const set=async(selector,value,event='input')=>js(`{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));}`);
 await click('[data-action=navigate][data-route=settings]');
 await click('[data-action=app-update-check]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("未完成")'),'Offline failure not surfaced');
 mode='feed';
 await click('[data-action=app-update-check]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("99.0.0")'),'Available version not shown');
 mode='slow';
 await click('[data-action=app-update-download]');
 await until(()=>js('Number(document.querySelector("[data-app-update-phase] progress")?.value)>0'),'Download progress missing');
 const nativeClickAcrossProgress=async action=>{
  const point=await js(`{const b=document.querySelector('[data-action=${action}]');b.scrollIntoView({block:'center'});window.updateControl=b;const r=b.getBoundingClientRect();({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});}`);
  main.webContents.sendInputEvent({type:'mouseMove',...point});main.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
  await delay(200);assert.ok(await js('window.updateControl.isConnected'),'Progress replaced the pressed control');
  main.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
 };
 await nativeClickAcrossProgress('app-update-pause');
 await until(()=>js('!!document.querySelector("[data-app-update-phase=paused]")'),'Pause click lost');
 const paused=JSON.parse(await fs.readFile(path.join(root,'app-update.json.partial.json'),'utf8')),pausedBytes=(await fs.stat(paused.file)).size;
 assert.ok(pausedBytes>0&&pausedBytes<BIN.length);
 await fs.writeFile(path.join(root,'controls-paused.png'),(await main.webContents.capturePage()).toPNG());
 await reload();await until(()=>js('!!document.querySelector("#solo-role")'),'Reload while paused failed');
 await click('[data-action=navigate][data-route=settings]');await until(()=>js('!!document.querySelector("[data-app-update-phase=paused]")'),'Bootstrap did not restore paused status');
 await click('[data-action=app-update-download]');await until(()=>ranges.length===2,'Resume request missing');assert.equal(ranges[1],pausedBytes);
 await nativeClickAcrossProgress('app-update-cancel');
 await until(()=>js('!!document.querySelector("[data-app-update-phase=available]")'),'Cancel click lost');
 assert.equal(await fs.stat(paused.file).then(()=>true,()=>false),false);assert.equal(await fs.stat(path.join(root,'app-update.json.partial.json')).then(()=>true,()=>false),false);
 await fs.writeFile(path.join(root,'update-controls.json'),JSON.stringify({pausePreservedBytes:pausedBytes,resumeOffset:ranges[1],nativeClicksSurvivedProgress:true,cancelCleaned:true},null,2));
 mode='feed';
 await click('[data-action=app-update-download]');
 await until(()=>js('!!document.querySelector("[data-action=app-update-install]")'),'Ready state not reached');
 const record=JSON.parse(await fs.readFile(path.join(root,'app-update.json'),'utf8'));
 assert.equal(record.version,'99.0.0');
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(record.file)).digest('hex'),BIN_SHA);
 await click('[data-action=app-update-install]');
 if(handoff){
  await until(()=>js('document.querySelector("[data-action=app-update-install]")?.disabled'),'Install button did not enter busy state');
  await until(()=>js('document.querySelector("[role=alert]")?.textContent.includes("EACCES")'),'Spawn failure not surfaced');
  assert.equal(launches,1);assert.equal(quits,0);assert.ok(await fs.stat(record.file));
  assert.ok(await js('!document.querySelector("[data-action=app-update-install]").disabled'),'Retry missing');
  await click('[data-action=app-update-install]');
  await js('window.buddy.installAppUpdate().catch(()=>{})');
  await until(()=>quits===1,'Confirmed spawn did not request quit');
  assert.equal(launches,2);assert.equal(quits,1);
  console.log(JSON.stringify({passed:true,handoff:true,asyncFailureRetry:true,concurrentInstall:true,launches,quits}));return;
 }
 const witness=await until(async()=>fs.readFile(path.join(root,'app-update.json.dry-run.json'),'utf8').then(JSON.parse).catch(()=>null),'Dry-run witness missing');
 assert.equal(witness.sha256,BIN_SHA);assert.equal(witness.file,record.file);
 assert.ok(await js('document.body.textContent.length>0'),'App quit during dry run');
 // 阶段 4：窗口重载直接恢复 ready；离线复查仍能使用已校验的 pending。
 mode='offline';
 await reload();
 await until(()=>js('!!document.querySelector("#solo-role")'),'Restart missing');
 await click('[data-action=navigate][data-route=settings]');
 assert.ok(await js('!!document.querySelector("[data-action=app-update-install]")'),'Bootstrap did not restore ready status');
 await js('window.buddy.checkAppUpdate(false)');
 await until(()=>js('!!document.querySelector("[data-action=app-update-install]")'),'Pending shortcut not restored');
 assert.ok(await js('!!document.querySelector("[data-action=app-update-install]")'));
 const notesLink=await js('[...document.querySelectorAll("[data-action=link]")].find(el=>el.textContent.includes("查看发布说明"))?.dataset.url');
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
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("已忽略")'),'Dismiss did not settle');
 await js('window.buddy.checkAppUpdate(true)');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("已忽略")'),'Background check did not retain dismissed state');
 await click('[data-action=app-update-check]');
 await until(()=>js('!!document.querySelector("[data-action=app-update-download]")'),'Manual check could not recover dismissed version');
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
