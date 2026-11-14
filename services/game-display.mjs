import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {installedGameDirectory,localDirectory} from './game-installation.mjs';
import {discoverClient,lcuRequest} from './lcu.mjs';

const MAX_CONFIG_BYTES=64*1024;
const fullscreen='0',borderless='2';
const pregamePhases=new Set(['None','Lobby','Matchmaking','ReadyCheck','ChampSelect']);
export const canSetGameDisplay=phase=>pregamePhases.has(phase);

function windowMode(content){
 // Latin-1 gives a one-byte view of the existing file, including its BOM and
 // legacy encodings. Only the ASCII digit of General.WindowMode is changed.
 const text=content.toString('latin1'),sections=[...text.matchAll(/^(?:\xEF\xBB\xBF)?[\t ]*\[([^\]\r\n]+)\][\t ]*\r?$/gm)];
 const general=sections.filter(section=>section[1].toLowerCase()==='general');
 if(general.length!==1)return null;
 const section=general[0],start=section.index+section[0].length;
 const body=text.slice(start,sections[sections.indexOf(section)+1]?.index??text.length);
 const keys=[...body.matchAll(/^[\t ]*WindowMode[\t ]*=[\t ]*([^\r\n]*)/gmi)];
 if(keys.length!==1)return null;
 const setting=keys[0],value=/^([012])[\t ]*(?:[;#].*)?$/.exec(setting[1]);
 return value?{value:value[1],offset:start+setting.index+setting[0].length-setting[1].length}:null;
}

async function readConfig(filename,io){
 const original=await io.lstat(filename);
 if(!original.isFile()||original.isSymbolicLink()||original.size>MAX_CONFIG_BYTES)throw Error('无法确认游戏的窗口配置文件');
 const file=await io.open(filename,'r');
 try{
  const stat=await file.stat();
  if(stat.dev!==original.dev||stat.ino!==original.ino||!stat.isFile())throw Error('游戏窗口配置已变化，请重试');
  const bytes=Buffer.alloc(MAX_CONFIG_BYTES+1);
  const {bytesRead}=await file.read(bytes,0,bytes.length,0);
  if(bytesRead!==stat.size||bytesRead>MAX_CONFIG_BYTES)throw Error('游戏窗口配置已变化，请重试');
  const content=bytes.subarray(0,bytesRead);
  return {stat,content,mode:windowMode(content)};
 }finally{await file.close();}
}

async function configFilename(installDir,io){
 const game=await installedGameDirectory(installDir,io);
 const config=await localDirectory(path.join(game,'Config'),io);
 return path.join(config,'game.cfg');
}

export async function readGameDisplayMode(installDir,io=fs){
 const filename=await configFilename(installDir,io);
 const {mode}=await readConfig(filename,io);
 return mode?.value===fullscreen?'fullscreen':mode?.value===borderless?'borderless':mode?.value==='1'?'windowed':'unknown';
}

export async function gameDisplayContext(installPath,{includeInstallDir=false}={}){
 const auth=await discoverClient(installPath,{reuseSnapshot:true});
 if(!auth?.port)throw Error('请先连接英雄联盟客户端');
 const phase=await lcuRequest(auth,'/lol-gameflow/v1/gameflow-phase');
 if(!includeInstallDir||!canSetGameDisplay(phase))return {phase};
 const directory=await lcuRequest(auth,'/data-store/v1/install-dir');
 return {phase,directory};
}

export async function saveBorderless(installDir,{confirm,beforeWrite,io=fs}){
 const filename=await configFilename(installDir,io);
 const initial=await readConfig(filename,io);
 if(initial.mode?.value===borderless)return {changed:false};
 if(initial.mode?.value!==fullscreen)throw Error('游戏窗口设置已变化，请重新检查');
 const next=Buffer.from(initial.content);
 next[initial.mode.offset]=borderless.charCodeAt(0);
 const temporary=filename+'.rift-buddy-'+crypto.randomUUID()+'.tmp';
 let created=false;
 try{
  await io.access(filename,fs.constants.W_OK);
  const temp=await io.open(temporary,'wx',initial.stat.mode&0o777);
  created=true;
  try{await temp.writeFile(next);await temp.sync();}finally{await temp.close();}
  await confirm();
  await localDirectory(path.dirname(filename),io);
  const current=await readConfig(filename,io);
  if(current.stat.dev!==initial.stat.dev||current.stat.ino!==initial.stat.ino||!current.content.equals(initial.content))throw Error('游戏窗口配置已变化，请重试');
  // Recheck the native observation just before committing, after disk I/O.
  beforeWrite();
  await io.rename(temporary,filename);created=false;
  if(!(await readConfig(filename,io)).content.equals(next))throw Error('游戏覆盖了窗口设置，请在视频设置中核对');
  return {changed:true};
 }catch(error){
  if(error.code)throw Error('无法保存游戏窗口模式，请检查游戏目录的写入权限');
  throw error;
 }finally{if(created)await io.unlink(temporary).catch(()=>{});}
}
