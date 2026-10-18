import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {atomicJSON} from './data.mjs';

// Only the updater's own direct-child temporary files can be resumed or removed.
export function partialStore(tempDir,storeFile,maxBytes){
 const checkpoint=storeFile+'.partial.json';
 const owns=file=>typeof file==='string'&&path.dirname(path.resolve(file))===path.resolve(tempDir)&&/^rift-buddy-update-\d+-[0-9a-f-]{36}\.exe\.part$/.test(path.basename(file));
 const unlink=async file=>{try{await fs.unlink(file);}catch(error){if(error.code!=='ENOENT')throw error;}};
 async function read(){
  try{
   if((await fs.stat(checkpoint)).size>65536)return null;
   const raw=JSON.parse(await fs.readFile(checkpoint,'utf8'));
   if(raw.schema!==1||!owns(raw.file)||!/^\d+\.\d+\.\d+$/.test(raw.release?.version||'')||raw.release.tag!==`v${raw.release.version}`&&raw.release.tag!==raw.release.version||!['full','incremental'].includes(raw.kind)||typeof raw.key!=='string'||raw.key.length>300)return null;
   const stat=await fs.lstat(raw.file);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes||raw.total!=null&&(!Number.isInteger(raw.total)||raw.total<stat.size||raw.total>maxBytes))return null;
   return {...raw,received:stat.size};
  }catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
 }
 async function clear(){
  const raw=await read();
  if(raw)await unlink(raw.file);
  await unlink(checkpoint);
 }
 async function save(raw){await atomicJSON(checkpoint,raw);}
 async function open({release,key,total,kind,via}){
  let raw=await read();
  if(raw?.key!==key){await clear();raw=null;}
  await fs.mkdir(tempDir,{recursive:true});
  if(!raw){
   const file=path.join(tempDir,`rift-buddy-update-${Date.now()}-${crypto.randomUUID()}.exe.part`);
   const handle=await fs.open(file,'wx');
   raw={schema:1,file,key,release,total,kind,via,received:0};
   try{await save(raw);}catch(error){await handle.close();await unlink(file);throw error;}
   return {raw,handle};
  }
  return {raw,handle:await fs.open(raw.file,'r+')};
 }
 return {read,clear,save,open,checkpoint};
}
