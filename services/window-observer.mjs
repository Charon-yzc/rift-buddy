import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
export async function buildWindowObserver(directory,source=path.resolve('electron/window-observer.cs')){
 const executable=path.join(directory,'window-observer.exe');
 await fs.mkdir(directory,{recursive:true});
 const compiler=path.join(process.env.SystemRoot||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 await promisify(execFile)(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/r:System.Web.Extensions.dll',`/out:${executable}`,source],{windowsHide:true});
 return executable;
}
export function windowSnapshot(raw){
 const bounds=value=>{
  if(!value||!['x','y','width','height'].every(k=>Number.isInteger(value[k]))||value.width<200||value.height<100||value.width>20000||value.height>20000||Math.abs(value.x)>50000||Math.abs(value.y)>50000)return null;
  return {x:value.x,y:value.y,width:value.width,height:value.height,minimized:value.minimized===true,foreground:value.foreground===true};
 };
 return {client:bounds(raw?.client),game:bounds(raw?.game)};
}
export async function observeWindows({root,onSnapshot,onError=()=>{}}){
 if(process.platform!=='win32')return {stop(){}};
 const packaged=root.endsWith('app.asar');
 const executable=packaged?path.join(path.dirname(root),'window-observer.exe'):await buildWindowObserver(path.join(root,'.local/window-observer'),path.join(root,'electron/window-observer.cs'));
 const child=spawn(executable,[],{windowsHide:true,stdio:['pipe','pipe','ignore']});
 let buffer='',stopped=false;
 child.stdout.setEncoding('utf8');
 child.stdout.on('data',chunk=>{
  buffer+=chunk;if(buffer.length>16384){buffer='';return;}
  let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{onSnapshot(windowSnapshot(JSON.parse(line)));}catch{}}
 });
 child.on('error',()=>{if(!stopped)onError('窗口定位暂不可用，可手动移动助手');});
 child.on('exit',()=>{if(!stopped)onError('窗口定位已停止，可手动移动助手');});
 return {stop(){stopped=true;child.stdin.end();const timer=setTimeout(()=>{if(child.exitCode===null)child.kill();},2000);timer.unref();}};
}
