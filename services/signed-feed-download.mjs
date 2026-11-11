import {DATA_FEED_ORIGIN} from './data-feed.mjs';

// Both HTTPS names serve the same signed files on the existing data server.
// A domain-specific network failure may use the other fixed name; returned
// bytes are still authenticated by the owning cache, without signature retries.
export const SIGNED_FEED_ORIGINS=Object.freeze([DATA_FEED_ORIGIN,'https://rift-buddy-data.3-27-57-181.sslip.io']);
const allowed=/^\/(?:v2\/(?:latest\.json|assets\/[a-f0-9]{64}\.json\.gz)|v1\/(?:patches\/[1-9]\d{0,2}\.[1-9]\d{0,2}\/latest\.json|assets\/[a-f0-9]{64}\.json\.gz)|community\/v1\/(?:latest\.json|assets\/[a-f0-9]{64}\.json\.gz)|national\/v1\/latest\.json)$/;
let preferred=null;
const timeoutError=()=>Object.assign(Error('资料下载超时，继续使用本地资料'),{name:'TimeoutError'});
const cancelBody=body=>{try{body?.cancel().catch(()=>{});}catch{}};
function abortable(task,signal,onLate){
 return new Promise((resolve,reject)=>{
  const onAbort=()=>reject(signal.reason);signal.addEventListener('abort',onAbort,{once:true});
  if(signal.aborted){signal.removeEventListener('abort',onAbort);reject(signal.reason);return;}
  Promise.resolve().then(task).then(value=>{if(signal.aborted){onLate?.(value);return;}resolve(value);},reject).finally(()=>signal.removeEventListener('abort',onAbort));
 });
}

export async function downloadSignedFeed(relative,{limit,fetcher=fetch,signal,label='资料',replacedCode,timeout=20000}={}){
 if(!allowed.test(relative)||!Number.isSafeInteger(limit)||limit<1||limit>16*1024*1024)throw Error('资料下载地址或限制无效');
 if(signal?.aborted)throw signal.reason;
 const overall=new AbortController(),onAbort=()=>overall.abort(signal.reason);
 signal?.addEventListener('abort',onAbort,{once:true});
 const timer=setTimeout(()=>overall.abort(timeoutError()),Math.max(1,Math.min(timeout,20000)));timer.unref?.();
 const cached=preferred?.fetcher===fetcher&&preferred.until>Date.now()?preferred.origin:null;
 const origins=cached?[cached,...SIGNED_FEED_ORIGINS.filter(origin=>origin!==cached)]:SIGNED_FEED_ORIGINS;
 let lastError;
 try{
  for(const origin of origins){
   const attempt=new AbortController(),abort=()=>attempt.abort(overall.signal.reason);
   overall.signal.addEventListener('abort',abort,{once:true});
   let response,reader,retryable=true;
   const headersTimer=setTimeout(()=>attempt.abort(timeoutError()),Math.min(6000,Math.max(1,timeout/2)));headersTimer.unref?.();
   try{
    if(overall.signal.aborted)throw overall.signal.reason;
    response=await abortable(()=>fetcher(origin+relative,{redirect:'error',credentials:'omit',signal:attempt.signal,headers:{Accept:'application/json, application/octet-stream'}}),attempt.signal,value=>cancelBody(value?.body));
    clearTimeout(headersTimer);
    if(!response.ok){const error=Object.assign(Error(label+'服务暂不可用'),{status:response.status});if(replacedCode&&relative.includes('/assets/')&&[404,410].includes(response.status)){error.code=replacedCode;retryable=false;}throw error;}
    if(Number(response.headers.get('content-length'))>limit){retryable=false;throw Error(label+'响应过大');}
    reader=response.body?.getReader();if(!reader){retryable=false;throw Error(label+'响应为空');}
    const parts=[];let bytes=0;
    while(true){const part=await abortable(()=>reader.read(),attempt.signal);if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit){retryable=false;throw Error(label+'响应过大');}parts.push(part.value);}
    preferred={fetcher,origin,until:Date.now()+30000};
    return Buffer.concat(parts);
   }catch(error){
    if(overall.signal.aborted)throw overall.signal.reason;
    if(!retryable)throw error;
    lastError=error;
   }finally{
    clearTimeout(headersTimer);overall.signal.removeEventListener('abort',abort);attempt.abort();
    if(reader){cancelBody(reader);try{reader.releaseLock();}catch{}}else cancelBody(response?.body);
   }
  }
  throw lastError;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}
