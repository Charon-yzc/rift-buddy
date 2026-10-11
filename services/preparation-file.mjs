import fs from 'node:fs/promises';
import {MAX_PREPARATION_FILE_BYTES,parsePreparationFile} from '../src/core/preparation-file.mjs';
export async function readPreparationFile(file){
 const handle=await fs.open(file,'r');
 try{
  const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_PREPARATION_FILE_BYTES)throw Error('准备文件必须是256KB以内的JSON文件');
  const buffer=Buffer.alloc(MAX_PREPARATION_FILE_BYTES+1);let total=0;
  while(total<buffer.length){const {bytesRead}=await handle.read(buffer,total,buffer.length-total,null);if(!bytesRead)break;total+=bytesRead;}
  if(total>MAX_PREPARATION_FILE_BYTES)throw Error('准备文件超过256KB');
  return parsePreparationFile(buffer.subarray(0,total).toString('utf8'));
 }finally{await handle.close();}
}