const origins=new Map([
 ['https://ddragon.leagueoflegends.com',64*1024*1024],
 ['https://game.gtimg.cn',64*1024*1024],
 ['https://raw.communitydragon.org',64*1024*1024],
 ['https://lol-api-champion.op.gg',4_000_000],
 ['https://op.gg',4_000_000],
 ['https://mlol.qt.qq.com',4_000_000],
 ['https://mayhemmeta.com',4_000_000],
]);
const sourceFor=url=>url.hostname==='op.gg'||url.hostname.endsWith('.op.gg')?'OP.GG':url.origin;
const failure=(message,code)=>Object.assign(Error(message),{code});

// One bounded request at a time, including consumption of the response body.
// A blocked upstream is not retried through another hostname or proxy.
export function createServerDataFetch({transport=fetch,intervalMs=1500,maxBytes=512*1024*1024,maxRequests=1000,
 durationMs=45*60*1000,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 let queue=Promise.resolve(),nextStart=0,requests=0,bytes=0;
 const deadline=now()+durationMs,blocked=new Map(),failures=new Map();
 const stats=()=>({requests,bytes,blocked:Object.fromEntries(blocked)});
 const available=input=>{
  const url=new URL(input),source=sourceFor(url);
  if(!origins.has(url.origin)||url.protocol!=='https:'||url.username||url.password)throw failure('不受支持的资料来源','SOURCE_NOT_ALLOWED');
  if(url.origin==='https://mayhemmeta.com'&&!(url.pathname==='/'&&!url.search||/^\/champions\/[a-z0-9-]{1,50}$/.test(url.pathname)&&/^\?patch=\d{2}\.\d{1,2}$/.test(url.search)))throw failure('不受支持的英雄记录路径','SOURCE_NOT_ALLOWED');
  if(blocked.has(source))throw failure('资料来源本轮已暂停：'+blocked.get(source),'SOURCE_PAUSED');
  if(now()>=deadline||bytes>=maxBytes||requests>=maxRequests)throw failure('本轮采集达到时间、流量或请求上限','ROUND_LIMIT');
  return {url,source};
 };
 const fetcher=(input,options={})=>{
  const task=queue.catch(()=>{}).then(async()=>{
   available(input);
   const wait=nextStart-now();if(wait>0)await sleep(wait);
   const {url,source}=available(input),limit=origins.get(url.origin);
   if(options.method&&options.method!=='GET'||options.body)throw failure('资料采集只允许 GET','SOURCE_NOT_ALLOWED');
   options.signal?.throwIfAborted();
   const timeout=AbortSignal.timeout(Math.max(1,Math.min(40000,deadline-now())));
   const signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
   nextStart=now()+intervalMs;requests++;
   try{
    const response=await transport(url.href,{method:'GET',redirect:'error',signal});
    if(response.status===403||response.status===429){
     blocked.set(source,'HTTP '+response.status);await response.body?.cancel();
     throw failure('来源返回 '+response.status+'，本轮停止访问该来源','SOURCE_PAUSED');
    }
    if(response.status>=500){
     const count=(failures.get(source)||0)+1;failures.set(source,count);
     if(count>=3)blocked.set(source,'连续三次服务错误');
    }else failures.set(source,0);
    const advertised=Number(response.headers.get('content-length'));
    if(advertised>limit||advertised>maxBytes-bytes){await response.body?.cancel();throw failure('资料响应超过大小上限','RESPONSE_LIMIT');}
    const reader=response.body?.getReader(),parts=[];let size=0;
    try{
     if(reader)while(true){
      const part=await reader.read();if(part.done)break;
      size+=part.value.byteLength;bytes+=part.value.byteLength;
      if(size>limit||bytes>maxBytes)throw failure('资料响应超过大小上限','RESPONSE_LIMIT');
      parts.push(part.value);
     }
    }finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
    return new Response([204,205,304].includes(response.status)?null:Buffer.concat(parts),{status:response.status,headers:response.headers});
   }catch(error){
    if(!error.code){const count=(failures.get(source)||0)+1;failures.set(source,count);if(count>=3)blocked.set(source,'连续三次连接错误');}
    throw error;
   }
  });
  queue=task;return task;
 };
 const readJSON=async(url)=>{const response=await fetcher(url);if(!response.ok)throw Error('基础资料来源返回 '+response.status);return response.json();};
 return {fetcher,readJSON,stats};
}
