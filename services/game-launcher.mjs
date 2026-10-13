import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';

// Installation layout reference: LeagueAkari's client-installation detector
// (MIT, 56cdfde0). Launch only a local executable, never a shell command/URL.
const exec=promisify(execFile),win=path.win32;
export const validLaunchPath=value=>typeof value==='string'&&value.length<=500&&/^[A-Za-z]:[\\/]/.test(value)&&/\.exe$/i.test(value)&&!/[\r\n\0"<>|]/.test(value);
export function launchCandidates({launchPath='',installPath='',roots=[]}={}){
 if(launchPath){if(!validLaunchPath(launchPath))throw Error('请选择本机的 .exe 启动程序');return [{path:win.normalize(launchPath),label:'自定义启动程序'}];}
 const dirs=[installPath,...roots,...['C','D','E','F'].map(d=>d+':/WeGameApps/英雄联盟'),'D:/英雄联盟','C:/Riot Games/League of Legends'].filter(Boolean);
 const unique=[...new Set(dirs.map(p=>win.normalize(p)))];
 return [['WeGameLauncher/launcher.exe','WeGame 英雄联盟'],['Launcher/Client.exe','英雄联盟登录器'],['LeagueClient.exe','英雄联盟客户端'],['LeagueClient/LeagueClient.exe','英雄联盟客户端']].flatMap(([file,label])=>unique.map(dir=>({path:win.join(dir,file),label})));
}
export async function launchGame(preferences={}, {stat=fs.stat,registry=async()=>{
 try{const {stdout}=await exec('reg.exe',['query','HKCU\\Software\\Tencent\\LOL','/v','InstallPath'],{windowsHide:true,timeout:3000});const value=stdout.match(/InstallPath\s+REG_\w+\s+([^\r\n]+)/i)?.[1]?.trim();return value?[value]:[];}catch{return [];}
},start=async target=>new Promise((resolve,reject)=>{
 const child=spawn(target,[],{cwd:win.dirname(target),detached:true,stdio:'ignore',windowsHide:true,shell:false});
 child.once('error',()=>reject(Error('启动失败，请检查路径或从 WeGame 手动启动')));child.once('spawn',()=>{child.unref();resolve();});
})}={}){
 const roots=preferences.launchPath?[]:await registry();
 for(const candidate of launchCandidates({...preferences,roots})){
  if(!validLaunchPath(candidate.path))continue;
  const exists=await stat(candidate.path).then(value=>value.isFile(),()=>false);if(!exists)continue;
  await start(candidate.path);return {launched:true,label:candidate.label};
 }
 throw Error(preferences.launchPath?'启动程序不存在，请在设置中重新选择或恢复默认':'未找到 WeGame 英雄联盟或客户端，请在设置中选择启动程序');
}
