import https from 'node:https';
import {text,validPuuid} from '../src/core/match-history/model.mjs';
// Riot Client is a second loopback service, with its own Basic credential.
// Only the public alias lookup needed by the Akari player search is exposed.
export function riotAliasRequest(auth,query){
 const port=auth.riotClientPort,password=auth.riotClientAuthToken;
 if(!Number.isInteger(port)||port<1||port>65535||typeof password!=='string'||!password)throw Error('当前客户端未提供玩家搜索连接');
 const [gameName,tagLine]=String(query).split('#');if(!gameName||gameName.length>64||tagLine?.length>16)throw Error('游戏 ID 格式不正确');
 const route='/player-account/aliases/v1/lookup?'+new URLSearchParams({gameName,...(tagLine?{tagLine}:{})});
 return new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port,path:route,method:'GET',auth:`riot:${password}`,rejectUnauthorized:false,timeout:4500,headers:{Accept:'application/json'}},res=>{
  const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>300000){req.destroy();reject(Error('玩家搜索响应过大'));return;}chunks.push(chunk);});res.on('error',()=>reject(Error('玩家搜索中断')));
  res.on('end',()=>{if(res.statusCode!==200)return reject(Error('玩家搜索暂不可用'));try{const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(raw))throw Error();resolve(raw.slice(0,50).filter(p=>validPuuid(p.puuid)).map(p=>({puuid:p.puuid,gameName:text(p.alias?.game_name),tagLine:text(p.alias?.tag_line)})));}catch{reject(Error('玩家搜索格式异常'));}});
 });req.on('timeout',()=>req.destroy());req.on('error',()=>reject(Error('未能连接玩家搜索接口')));req.end();});
}
