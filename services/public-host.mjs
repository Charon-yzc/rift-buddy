import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

export function publicAddress(address){
 if(net.isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);}
 if(net.isIP(address)===6){const a=address.toLowerCase();return /^[23][0-9a-f]{3}:/.test(a)&&!a.startsWith('2001:db8:')&&!a.startsWith('2002:')&&!a.startsWith('2001:0:');}return false;
}
const fakeAddress=address=>net.isIP(address)===4&&/^198\.(?:18|19)\./.test(address);
const name=value=>typeof value==='string'?value.toLowerCase().replace(/\.$/,''):'';
const hostname=value=>value.length<=253&&value.split('.').every(part=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part));
const providers=['https://cloudflare-dns.com/dns-query','https://dns.google/resolve'];
const MAX_RESPONSE=32768,MAX_CACHE=64,MAX_FLIGHTS=4;
const cancelled=()=>Object.assign(Error('下载已取消'),{name:'AbortError'});

// Bootstrap only these fixed public DNS HTTPS services through the user's
// normal route (including TUN). TLS still authenticates the resolver hostname;
// no redirect, credentials, arbitrary endpoint or business request uses it.
function dnsJSON(endpoint,host,{request,signal,timeout}){
 return new Promise((resolve,reject)=>{
  const url=new URL(endpoint);url.searchParams.set('name',host);url.searchParams.set('type','A');
  if(url.hostname==='dns.google')url.searchParams.set('edns_client_subnet','0.0.0.0/0');
  let req,res,timer,settled=false,bytes=0;const parts=[];
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',onAbort);if(error){res?.destroy?.();req?.destroy?.();reject(error);}else resolve(value);};
  const onAbort=()=>finish(signal.reason||cancelled());
  signal.addEventListener('abort',onAbort,{once:true});
  if(signal.aborted){onAbort();return;}
  try{
   req=request(url,{method:'GET',agent:false,rejectUnauthorized:true,headers:{Accept:'application/dns-json'},signal},response=>{
    res=response;res.on('error',error=>finish(error));res.on('aborted',()=>finish(Error('公共 DNS 响应中断')));
    if(res.statusCode!==200){finish(Error('公共 DNS 服务未返回数据'));return;}
    res.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_RESPONSE)finish(Error('公共 DNS 响应过大'));else parts.push(chunk);});
    res.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{finish(Error('公共 DNS 响应无效'));}});
   });
   req.on('error',error=>finish(error));timer=setTimeout(()=>finish(Error('公共 DNS 请求超时')),timeout);timer.unref?.();req.end();
  }catch(error){finish(error);}
 });
}
function publicAnswers(body,host){
 if(body?.Status!==0||body.TC===true||!Array.isArray(body.Question)||body.Question.length!==1||name(body.Question[0].name)!==host||body.Question[0].type!==1||!Array.isArray(body.Answer)||body.Answer.length>64)throw Error('公共 DNS 解析结果无效');
 const owners=new Set([host]);
 for(let hop=0;hop<8;hop++)for(const answer of body.Answer)if(answer.type===5&&owners.has(name(answer.name))&&hostname(name(answer.data)))owners.add(name(answer.data));
 const answers=body.Answer.filter(answer=>answer.type===1&&owners.has(name(answer.name))),chain=body.Answer.filter(answer=>answer.type===5&&owners.has(name(answer.name)));
 if(!answers.length||answers.length>16||answers.some(answer=>net.isIP(answer.data)!==4||!publicAddress(answer.data)||!Number.isSafeInteger(answer.TTL)||answer.TTL<0))throw Error('公共 DNS 未返回有效公网地址');
 if(chain.some(answer=>!Number.isSafeInteger(answer.TTL)||answer.TTL<0))throw Error('公共 DNS 别名有效期无效');
 return {records:[...new Set(answers.map(answer=>answer.data))].map(address=>({address,family:4})),ttl:Math.min(60,...answers.map(answer=>answer.TTL),...chain.map(answer=>answer.TTL))*1000};
}

export function createPublicResolver({lookup=dns.lookup,dohRequest=lookup===dns.lookup?https.request:null,clock=()=>Date.now()}={}){
 const cache=new Map();let flights=0;
 return async(host,{timeout=15000,signal,deniedMessage='更新地址不能指向本机、内网或保留地址',timeoutMessage='解析更新地址超时'}={})=>{
  if(signal?.aborted)throw cancelled();
  if(flights>=MAX_FLIGHTS)throw Error('正在解析其他更新地址，请稍后重试');
  flights++;const controller=new AbortController(),onAbort=()=>controller.abort(cancelled());
  signal?.addEventListener('abort',onAbort,{once:true});
  const timer=setTimeout(()=>controller.abort(Error(timeoutMessage)),Math.max(1,Math.min(timeout,15000)));timer.unref?.();
  let rejectAbort;const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',rejectAbort,{once:true});});
  try{
   const work=async()=>{
    const records=await lookup(host,{all:true,verbatim:true});
    if(controller.signal.aborted)throw controller.signal.reason;
    if(records.length&&records.every(record=>publicAddress(record.address)))return records;
    // Do not reinterpret loopback/private/mixed answers or literal IP URLs as
    // proxy DNS. Mocked lookups cannot accidentally cause live network traffic.
    const query=name(host);
    if(!dohRequest||net.isIP(query)||!hostname(query)||!records.length||!records.every(record=>fakeAddress(record.address)))throw Error(deniedMessage);
    const saved=cache.get(query);if(saved&&saved.expires>clock())return saved.records.map(record=>({...record}));cache.delete(query);
    let lastError;
    for(const endpoint of providers){
     try{
      const answer=publicAnswers(await dnsJSON(endpoint,query,{request:dohRequest,signal:controller.signal,timeout:5000}),query);
      if(controller.signal.aborted)throw controller.signal.reason;
      if(answer.ttl){cache.set(query,{records:answer.records,expires:clock()+answer.ttl});while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);}
      return answer.records.map(record=>({...record}));
     }catch(error){if(controller.signal.aborted)throw controller.signal.reason;lastError=error;}
    }
    throw Error('代理 DNS 未能解析有效公网更新地址，请稍后重试',{cause:lastError});
   };
   return await Promise.race([work(),aborted]);
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);controller.signal.removeEventListener('abort',rejectAbort);flights--;}
 };
}
export const resolvePublicHost=createPublicResolver();
