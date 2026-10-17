import https from 'node:https';
// Fixed endpoint configuration adapted from Akari builtin.ts at 60f1584c.
const tencent={HN1:['艾欧尼亚','hn1-k8s'],HN10:['黑色玫瑰','hn10-k8s'],TJ100:['联盟四区','tj100'],TJ101:['联盟五区','tj101'],NJ100:['联盟一区','nj100'],GZ100:['联盟二区','gz100'],CQ100:['联盟三区','cq100'],BGP2:['峡谷之巅','bgp2-k8s'],PBE:['国服测试服','pbe'],PREPBE:['国服预测试服','prepbe']};
export const SGP_SERVERS=Object.fromEntries(Object.entries(tencent).map(([id,[name,host]])=>['TENCENT_'+id,{name,base:`https://${host}-sgp.lol.qq.com:21019`,common:`https://${host}-sgp.lol.qq.com:21019`,region:id,tencent:true}]));
for(const [id,name,base,common,region] of [
 ['TW2','台湾','apse1','tw2','TW2'],['SG2','新加坡','apse1','sg2','SG2'],['PH2','菲律宾','apse1','ph2','PH2'],['VN2','越南','apse1','vn2','VN2'],['TH2','泰国','apse1','th2','TH2'],['PBE','测试服','usw2','pbe','PBE1'],['EUW','西欧','euc1','euw','EUW1'],['JP','日本','apne1','jp','JP1'],['RU','俄罗斯','euc1','ru','RU'],['BR1','巴西','usw2','br','BR1'],['OC1','大洋洲','apse1','oce','OC1'],['TR1','土耳其','euc1','tr','TR1'],['LA1','拉美北','usw2','lan','LA1'],['LA2','拉美南','usw2','las','LA2'],['NA1','北美','usw2','na','NA1'],['KR','韩国','apne1','kr','KR']])SGP_SERVERS[id]={name,base:`https://${base}-red.pp.sgp.pvp.net`,common:`https://${common}-red.lol.sgp.pvp.net`,region,tencent:false};
export function sgpServerId(auth,locale={}){const r=String(auth.region||locale.region||'').toUpperCase(),p=String(auth.rsoPlatformId||'').toUpperCase();return r==='TENCENT'?(p?'TENCENT_'+p:''):({NA:'NA1',BR:'BR1',TR:'TR1',LAN:'LA1',LAS:'LA2',OCE:'OC1',EUW1:'EUW',JP1:'JP'}[r]||r);}
export function sgpRequest({server,route,token,method='GET',body,common=false}){
 const config=SGP_SERVERS[server];if(!config||!/^\/(?:match-history-query|summoner-ledge)\/v[12]\//.test(route)||typeof token!=='string'||!token||/[\r\n]/.test(token))throw Error('战绩后台配置或认证不可用');
 const url=new URL(route,common?config.common:config.base),payload=body===undefined?null:JSON.stringify(body);
 return new Promise((resolve,reject)=>{
  const req=https.request(url,{method,timeout:8000,headers:{Accept:'application/json',Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{
   const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>8_000_000){req.destroy();reject(Error('战绩后台响应过大'));return;}chunks.push(chunk);});res.on('error',()=>reject(Error('战绩后台读取中断')));
   res.on('end',()=>{if(res.statusCode!==200){const e=Error(res.statusCode===401||res.statusCode===403?'战绩后台认证失效或不支持此大区':res.statusCode===429?'战绩查询过于频繁，请稍后重试':`战绩后台暂不可用（${res.statusCode}）`);e.status=res.statusCode;return reject(e);}try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('战绩后台数据格式异常'));}});
  });req.on('timeout',()=>req.destroy());req.on('error',()=>reject(Error('无法连接战绩后台，请检查网络或切换客户端数据源')));if(payload)req.write(payload);req.end();
 });
}
