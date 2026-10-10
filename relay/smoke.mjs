// Relay smoke check (CHA-31): run against a local `wrangler dev` or a
// deployed address to verify handshake, fan-out, whitelist cleaning, spoof
// rejection and leave semantics end to end.
//
// Usage:
//   node relay/smoke.mjs ws://127.0.0.1:8787/room/482913 482913
//   node relay/smoke.mjs wss://your-relay.workers.dev/room/482913 482913
//
// Slow or lossy links need more headroom than a local `wrangler dev` run:
// the connect and settle budgets are overridable, and connections can be
// retried without turning a flaky network into a false failure. All values
// are decimal non-negative integers; anything else exits 2.
//   SMOKE_CONNECT_MS  per-connection handshake budget (default 10000)
//   SMOKE_SETTLE_MS  wait for a relayed frame (default 6000)
//   SMOKE_RETRIES    reconnect attempts per member, 0 = try once (default 0)
//   SMOKE_RETRY_MS   pause between those attempts (default 5000)
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

// setTimeout silently wraps above 2^31-1, so the budgets are bounded; the
// retry count is capped well below that because each attempt costs a
// connection. Decimal digits only: `1e3` and `0x10` are not budgets here.
const LIMITS={SMOKE_CONNECT_MS:2147483647,SMOKE_SETTLE_MS:2147483647,SMOKE_RETRIES:100,SMOKE_RETRY_MS:2147483647};
for(const [name,max] of Object.entries(LIMITS)){
 const raw=process.env[name];
 if(raw===undefined)continue;
 const text=raw.trim(),value=Number(text);
 if(!/^\d+$/.test(text)||!Number.isInteger(value)||value>max){
  console.error(`${name} 需要是 0 到 ${max} 之间的十进制整数（收到 "${raw}"）`);
  process.exit(2);
 }
}
const connectMs=Number(process.env.SMOKE_CONNECT_MS||10000);
const settleMs=Number(process.env.SMOKE_SETTLE_MS||6000);
const retries=Number(process.env.SMOKE_RETRIES||0);
const retryMs=Number(process.env.SMOKE_RETRY_MS||5000);

function connect(nick){
 return new Promise((resolve,reject)=>{
  const ws=new WebSocket(url);
  const received=[];
  let settled=false;
  // A timed-out socket is closed here: retries would otherwise leave a ghost
  // connection behind that can still finish its handshake and join the room.
  const timer=setTimeout(()=>{if(!settled){settled=true;try{ws.close();}catch{}reject(new Error(`连接超时（${nick}）`));}},connectMs);
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
const until=async(fn,ms=settleMs)=>{const start=Date.now();for(;;){if(fn())return true;if(Date.now()-start>ms)return false;await new Promise(r=>setTimeout(r,60));}};

// A retry reuses the same nick, and the relay frees a nick only once the old
// socket's close event reaches it — measured at 0.3-20s on a lossy link. So a
// retry can land on a duplicate-nick close; that is the server's timing, not
// ours, so pause first and name the knob that widens the window.
const connectMember=async nick=>{
 for(let attempt=0;;attempt++){
  try{return await connect(nick);}
  catch(error){
   if(attempt>=retries)throw error;
   const hint=error.message.includes('4003')?'（同名成员可能尚未被中继释放，可调大 SMOKE_RETRY_MS）':'';
   console.log(`  · ${nick} 第 ${attempt+1} 次连接失败（${error.message}），${retryMs}ms 后重试${hint}`);
   await new Promise(resolve=>setTimeout(resolve,retryMs));
  }
 }
};

const checks={};
const a=await connectMember('检查甲');
checks['甲握手']=a.received[0]?.kind==='welcome';
const b=await connectMember('检查乙');
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
