// Relay smoke check (CHA-31): run against a local `wrangler dev` or a
// deployed address to verify handshake, fan-out, whitelist cleaning, spoof
// rejection and leave semantics end to end.
//
// Usage:
//   node relay/smoke.mjs ws://127.0.0.1:8787/room/482913 482913
//   node relay/smoke.mjs wss://your-relay.workers.dev/room/482913 482913
//
// Exits 0 when every check passes, 1 otherwise. Talks to the relay only and
// never touches the game client.

import {createHash} from 'node:crypto';
import {ROOM_PROTOCOL} from '../src/core/room.mjs';

const url=process.argv[2];
const pin=process.argv[3];
if(!url||!pin){console.error('用法: node relay/smoke.mjs <wss地址/room/房间码> <口令>');process.exit(2);}
const room=new URL(url).pathname.split('/').pop();
if(!/^\d{6}$/.test(room)||!/^\d{6}$/.test(pin)){console.error('房间码与口令都必须是 6 位数字');process.exit(2);}
const pinHash=createHash('sha256').update(pin).digest('hex');

function connect(nick){
 return new Promise((resolve,reject)=>{
  const ws=new WebSocket(url);
  const received=[];
  let settled=false;
  const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error(`连接超时（${nick}）`));}},10000);
  ws.onopen=()=>{ws.send(JSON.stringify({kind:'hello',v:ROOM_PROTOCOL,room,pinHash,nick}));};
  ws.onmessage=event=>{
   const frame=JSON.parse(event.data);
   received.push(frame);
   if(frame.kind==='welcome'&&!settled){settled=true;clearTimeout(timer);resolve({ws,received,nick});}
  };
  ws.onclose=event=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error(`连接被关闭（${nick}）：${event.code} ${event.reason||''}`.trim()));}};
  ws.onerror=()=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error(`连接失败（${nick}）`));}};
 });
}
const until=async(fn,ms=6000)=>{const start=Date.now();for(;;){if(fn())return true;if(Date.now()-start>ms)return false;await new Promise(r=>setTimeout(r,60));}};

const checks={};
const a=await connect('检查甲');
checks['甲握手']=a.received[0]?.kind==='welcome';
const b=await connect('检查乙');
checks['乙握手']=b.received[0]?.kind==='welcome';
checks['乙看到甲']=b.received[0]?.members?.some(m=>m.nick==='检查甲');
checks['甲看到乙加入']=await until(()=>a.received.some(f=>f.kind==='join'&&f.from==='检查乙'));
a.ws.send(JSON.stringify({kind:'state',v:ROOM_PROTOCOL,from:'检查甲',at:Date.now(),
 lineup:[{role:'bottom',champion:'Ashe'}],pick:{champion:'Ashe',role:'bottom',mode:'rift'},
 riotId:'private#tag',scores:{kda:9}}));
checks['状态已转发']=await until(()=>b.received.some(f=>f.kind==='state'&&f.from==='检查甲'));
const got=b.received.find(f=>f.kind==='state');
checks['白名单清洗']=!!got&&!JSON.stringify(got).includes('private')&&!Object.hasOwn(got,'riotId')&&!Object.hasOwn(got,'scores');
checks['阵容保留']=got?.lineup?.[0]?.champion==='Ashe';
b.ws.send(JSON.stringify({kind:'state',v:ROOM_PROTOCOL,from:'检查甲',at:Date.now(),lineup:[],pick:null}));
await new Promise(r=>setTimeout(r,400));
checks['冒名丢弃']=!a.received.some(f=>f.kind==='state'&&f.from==='检查甲'&&f.lineup&&f.lineup.length===0);
b.ws.close(1000,'done');
checks['甲看到乙离开']=await until(()=>a.received.some(f=>f.kind==='leave'&&f.from==='检查乙'));
a.ws.close(1000,'done');

let failed=false;
for(const [name,pass] of Object.entries(checks)){
 console.log(`${pass?'✔':'✖'} ${name}`);
 if(!pass)failed=true;
}
console.log(failed?'中继检查未通过':'中继检查全部通过');
process.exit(failed?1:0);
