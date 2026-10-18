import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {payloadPath,validateInstallManifest} from '../src/core/install-manifest.mjs';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const minChunk=4096,maxChunk=65536;
// Content-dependent boundaries resynchronize after insertions in app.asar.
// SHA-256, rather than the boundary hash, decides whether bytes can be reused.
const gear=Uint32Array.from({length:256},(_,i)=>{let n=(i+1)*0x9e3779b1;n=Math.imul(n^(n>>>16),0x85ebca6b);return (n^(n>>>13))>>>0;});
function* chunks(bytes){
 let start=0,hash=0;
 for(let end=0;end<bytes.length;end++){
  hash=((hash<<1)+gear[bytes[end]])>>>0;
  const length=end+1-start;
  if(length>=minChunk&&((hash&8191)===0||length===maxChunk)){yield {offset:start,bytes:length};start=end+1;hash=0;}
 }
 if(start<bytes.length)yield {offset:start,bytes:bytes.length-start};
}
export function filePatch(name,base,target){
 name=payloadPath(name);if(base.length>536870912||target.length>536870912)throw Error('Binary patch file is too large');
 const index=new Map();
 for(const chunk of chunks(base)){const key=chunk.bytes+':'+sha(base.subarray(chunk.offset,chunk.offset+chunk.bytes));if(!index.has(key))index.set(key,new Set());index.get(key).add(chunk.offset);}
 const operations=[];let reusedBytes=0;
 for(const chunk of chunks(target)){
  const bytes=target.subarray(chunk.offset,chunk.offset+chunk.bytes),matches=index.get(chunk.bytes+':'+sha(bytes)),previous=operations.at(-1);
  if(matches){
   const contiguous=previous?.copy!==undefined?previous.copy+previous.bytes:-1,copy=matches.has(contiguous)?contiguous:matches.has(chunk.offset)?chunk.offset:matches.values().next().value;
   if(previous?.copy!==undefined&&previous.copy+previous.bytes===copy)previous.bytes+=chunk.bytes;else operations.push({copy,bytes:chunk.bytes});
   reusedBytes+=chunk.bytes;
  }else operations.push({data:bytes.toString('base64'),bytes:chunk.bytes});
 }
 return {name,baseBytes:base.length,baseSha256:sha(base),targetBytes:target.length,targetSha256:sha(target),operations,reusedBytes};
}
async function readPayload(root,row){
 const filename=path.join(root,payloadPath(row.name)),stat=await fs.lstat(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==row.bytes)throw Error('Binary patch source file differs from its manifest');
 const absolute=path.resolve(root),real=await fs.realpath(filename);if(!real.toLowerCase().startsWith(absolute.toLowerCase()+path.sep))throw Error('Binary patch source escaped its directory');
 const bytes=await fs.readFile(filename);if(sha(bytes)!==row.sha256)throw Error('Binary patch source checksum differs');return bytes;
}
export async function binaryPatches(baseDirectory,targetDirectory,base,target,changed){
 validateInstallManifest(base);validateInstallManifest(target);
 const old=new Map(base.files.map(row=>[row.name,row])),files=[];let reusedBytes=0;
 for(const row of changed){
  const previous=old.get(row.name);if(!previous||Math.min(previous.bytes,row.bytes)<1048576||Math.max(previous.bytes,row.bytes)>536870912)continue;
  const patch=filePatch(row.name,await readPayload(baseDirectory,previous),await readPayload(targetDirectory,row));
  if(patch.reusedBytes<1048576||Buffer.byteLength(JSON.stringify(patch))>=row.bytes*.5)continue;
  reusedBytes+=patch.reusedBytes;files.push(patch);
 }
 const descriptor={schema:1,files};if(files.length>200||Buffer.byteLength(JSON.stringify(descriptor))>32*1024*1024)throw Error('Binary patch descriptor exceeds installer limits');
 return {descriptor,reusedBytes,patched:new Set(files.map(file=>file.name))};
}
