import fs from 'node:fs/promises';
import {renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {atomicJSON} from './data.mjs';

// Requests for the same patch still belong to different base snapshots. Keep
// coalescing within a snapshot without retaining old snapshots in the key map.
export function createReferenceContext(getData){
 const ids=new WeakMap();let serial=0;
 return ()=>{
  const data=getData(),patch=data.patch,version=data.version;
  if(!ids.has(data))ids.set(data,++serial);
  return {data,patch,key:JSON.stringify([ids.get(data),patch,version]),current:()=>getData()===data&&data.patch===patch&&data.version===version};
 };
}

// The stage must not replace active bytes until the base and merged source
// collection are still current. Promotion and the prepared RAM assignments
// run synchronously together; an awaited rename would reopen that race.
export async function commitReferenceCache(filename,value,{current,commit,write=atomicJSON,message='资料已更新，请重新刷新'}={}){
 const stage=filename+'.'+process.pid+'-'+randomUUID()+'.pending';
 try{
  if(!current())throw Error(message);
  await write(stage,value);
  if(!current())throw Error(message);
  renameSync(stage,filename);commit();
 }finally{await fs.unlink(stage).catch(()=>{});}
}
