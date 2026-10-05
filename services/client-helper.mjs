import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {clientSnapshot,writeRunePage} from './lcu.mjs';
import {loadSnapshot,atomicJSON} from './data.mjs';
import {readState} from './storage.mjs';
import {launchHelper} from './helper-launch.mjs';
const pipePattern=/^\\\\\.\\pipe\\rift-buddy-[a-f0-9]{32}$/;
const tokenPattern=/^[a-f0-9]{64}$/;
function sameSecret(actual,expected){return typeof actual==='string'&&tokenPattern.test(actual)&&crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));}
export function requestHelper(config,operation,payload={},timeout=12000) {
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection(config.pipe);let buffer='';
  socket.setTimeout(timeout,()=>socket.destroy(new Error('客户端授权连接超时')));
  socket.on('connect',()=>socket.write(JSON.stringify({secret:config.secret,operation,payload})+'\n'));
  socket.on('data',chunk=>{buffer+=chunk;if(buffer.length>150000){socket.destroy(new Error('授权连接响应异常'));return;}
   if(buffer.includes('\n')){try{const message=JSON.parse(buffer.slice(0,buffer.indexOf('\n')));socket.end();if(message.ok)resolve(message.result);else reject(new Error(message.error||'客户端操作失败'));}catch{socket.destroy(new Error('授权连接格式异常'));}}
  });
  socket.on('error',()=>reject(new Error('授权连接已断开，请重新连接客户端')));
  socket.on('end',()=>{if(!buffer.includes('\n'))reject(new Error('授权连接已结束'));});
 });
}
export async function startHelper(sessionFile,{userData,bundleRoot,quit}) {
 const filename=path.resolve(sessionFile),allowed=path.resolve(userData);
 if(path.dirname(filename)!==allowed||!/^client-session-[a-f0-9]{32}\.json$/.test(path.basename(filename)))throw new Error('无效连接会话');
 const stat=await fs.stat(filename);if(stat.size>4096)throw new Error('连接会话异常');
 const config=JSON.parse(await fs.readFile(filename,'utf8'));
 if(!pipePattern.test(config.pipe)||!tokenPattern.test(config.secret)||!Number.isInteger(config.parentPid)||config.parentPid<=0||!Number.isFinite(config.createdAt)||Date.now()-config.createdAt>600000||config.createdAt>Date.now()+5000)throw new Error('连接会话已过期');
 // The helper only serves this app's explicit operations; neither command lines nor credentials leave it.
 let writing=false;
 const server=net.createServer(socket=>{
  let buffer='',handled=false;socket.setTimeout(15000,()=>socket.destroy());
  socket.on('error',()=>{});
  socket.on('data',async chunk=>{
   if(handled)return;buffer+=chunk;if(buffer.length>50000){socket.destroy();return;}if(!buffer.includes('\n'))return;handled=true;
   let request;try{request=JSON.parse(buffer.slice(0,buffer.indexOf('\n')));}catch{socket.destroy();return;}
   if(!sameSecret(request.secret,config.secret)){socket.destroy();return;}
   try{
    let result;
    if(request.operation==='ping')result={ready:true};
    else if(request.operation==='status')result=await clientSnapshot(config.installPath);
    else if(request.operation==='applyRunes'){
     if(writing)throw new Error('符文正在应用，请稍后');writing=true;
     try{const data=await loadSnapshot(path.join(userData,'data'),path.join(bundleRoot,'data'));
      const state=await readState(userData);
      result=await writeRunePage({page:request.payload.page,ownedPageId:state.ownedPageId,installPath:config.installPath,trees:data.runes});
      // The unelevated app is the sole settings writer; avoid racing a preference save.
     }finally{writing=false;}
    }else if(request.operation==='shutdown'){socket.end(JSON.stringify({ok:true,result:true})+'\n');server.close();quit();return;}
    else throw new Error('不支持的客户端操作');
    socket.end(JSON.stringify({ok:true,result})+'\n');
   }catch(error){socket.end(JSON.stringify({ok:false,error:error.message})+'\n');}
  });
 });
 // The desktop UI runs at normal integrity; authenticate every message with the
 // one-time 256-bit secret instead of relying on the elevated pipe's default ACL.
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({path:config.pipe,readableAll:true,writableAll:true},resolve);});
 await fs.unlink(filename).catch(()=>{});
 const timer=setInterval(()=>{try{process.kill(config.parentPid,0);}catch{clearInterval(timer);server.close();quit();}},5000);
 server.once('close',()=>clearInterval(timer));
 timer.unref();return server;
}
export function createHelperManager({userData,bundleRoot,executable,isPackaged,helperExecutable,helperEntry,helperBundleRoot,launcherExecutable,onProgress=()=>{},startupTimeoutMs=45000,launch=launchHelper}) {
 let config=null,opening=null,sessionFile=null,launchRecord=null,closed=false;
 async function ensure(installPath){
  if(closed)throw Error('连接已取消');
  if(config){try{await requestHelper(config,'ping',{},1000);return true;}catch{config=null;}}
  if(opening)return opening;
  opening=(async()=>{
   const key=crypto.randomBytes(16).toString('hex');
   const next={pipe:`\\\\.\\pipe\\rift-buddy-${key}`,secret:crypto.randomBytes(32).toString('hex'),parentPid:process.pid,installPath,createdAt:Date.now()};
   const nextFile=path.join(userData,`client-session-${key}.json`);sessionFile=nextFile;await atomicJSON(nextFile,next);
   const nextRecord=path.join(userData,`client-launch-${key}.json`);launchRecord=nextRecord;
   const helperArgs=helperEntry?[helperEntry,`--buddy-bundle=${helperBundleRoot||bundleRoot}`]:[...(!isPackaged?[bundleRoot]:[])];
   const args=[...helperArgs,`--buddy-data=${userData}`,`--lcu-helper=${sessionFile}`];
   let launchError=null,launcher;
   try{
   onProgress('正在启动连接授权；如果 Windows 出现系统确认，请选择“是”');
   launcher=await launch({executable:helperExecutable||executable,args,recordFile:nextRecord,launcherExecutable,bundleRoot:helperBundleRoot||bundleRoot,userData,sessionFile:nextFile,
    onError:()=>{launchError='Windows 连接授权未能启动，请重试连接';},
    onExit:code=>{if(code!==0)launchError='Windows 未能启动连接助手，请重试连接';}});
   const deadline=Date.now()+startupTimeoutMs;let launched=false;
   while(Date.now()<deadline){
    if(closed)throw Error('连接已取消');
    let record;try{record=JSON.parse((await fs.readFile(nextRecord,'utf8')).replace(/^\uFEFF/,''));}catch{}
    if(record?.phase==='failed')launchError=record.nativeCode===1223?'Windows 授权已取消，可重新点击连接':'Windows 未能启动连接助手，请重试连接';
    if(launchError)throw new Error(launchError);
    if(record?.phase==='launched'&&!launched){launched=true;onProgress('授权进程已启动，正在建立本机连接…');}
    try{const ready=await requestHelper(next,'ping',{},750);if(ready.ready){
     if(closed){await requestHelper(next,'shutdown',{},750).catch(()=>{});throw Object.assign(Error('连接已取消'),{startupFailure:true});}
     config=next;return true;
    }}catch(error){if(error.startupFailure)throw error;}
    try{const status=JSON.parse(await fs.readFile(path.join(userData,'client-helper-status.json'),'utf8'));
     if(Date.parse(status.at)>=next.createdAt&&status.stage&&!['starting','ready'].includes(status.stage))throw Object.assign(Error('连接辅助进程启动失败，请重新点击连接'),{startupFailure:true});
    }catch(error){if(error.startupFailure)throw error;}
    await new Promise(r=>setTimeout(r,200));
   }
   throw new Error('Windows 授权或连接进程启动未完成。可重试连接，或退出助手后从桌面以管理员身份运行');
   }finally{
    // Deleting this one-time session also prevents a late consent response from
    // starting an abandoned helper. Terminate only our unelevated launcher.
    await fs.unlink(nextFile).catch(()=>{});await fs.unlink(nextRecord).catch(()=>{});
    if(!config&&launcher?.exitCode===null)launcher.kill();
   }
  })().finally(()=>{opening=null;});return opening;
 }
 return {ensure,active:()=>!!config,
  request:(operation,payload)=>{if(!config)throw new Error('尚未授权客户端连接');return requestHelper(config,operation,payload);},
  status:async installPath=>{if(config){try{return await requestHelper(config,'status');}catch{}}return clientSnapshot(installPath);},
  shutdown:async()=>{closed=true;if(config){try{await requestHelper(config,'shutdown');}catch{}config=null;}if(sessionFile){try{await fs.unlink(sessionFile);}catch{}sessionFile=null;}if(launchRecord){await fs.unlink(launchRecord).catch(()=>{});launchRecord=null;}},
 };
}
