// A full five-player share and a different ballot can each retain a complete
// frozen plan. Intern repeated text only when the legacy JSON exceeds 64 KiB;
// never truncate routes, change identities, or raise the on-wire frame limit.
const bytes=text=>new TextEncoder().encode(text).length;
const MAX_EXPANDED_BYTES=4*65536;
export function packRoomState(value){
 if(value?.kind!=='state'||value.v!==1)return null;
 const counts=new Map();
 const count=v=>{if(typeof v==='string'){if(v.length>=16)counts.set(v,(counts.get(v)||0)+1);}else if(Array.isArray(v))v.forEach(count);else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){count(k);count(x);}};
 count(value);const table=[...counts].filter(([,n])=>n>1).map(([s])=>s),index=new Map(table.map((s,i)=>[s,i]));
 if(table.length>4096)return null;
 // Typed tuples distinguish literal arrays/objects from string references.
 const encode=v=>typeof v==='string'&&index.has(v)?[0,index.get(v)]:Array.isArray(v)?[1,...v.map(encode)]:v&&typeof v==='object'?[2,...Object.entries(v).flatMap(([k,x])=>[encode(k),encode(x)])]:v;
 return {kind:'state',v:1,encoding:'dict1',table,body:encode(value)};
}
export function unpackRoomState(frame){
 if(frame?.kind!=='state'||frame.v!==1||frame.encoding!=='dict1'||!Array.isArray(frame.table)||frame.table.length>4096||frame.table.some(s=>typeof s!=='string'))return null;
 let cost=0,nodes=0;
 const tableCosts=frame.table.map(s=>bytes(JSON.stringify(s))),spend=n=>{cost+=n;if(cost>MAX_EXPANDED_BYTES)throw Error('Expanded room frame too large');};
 const read=(node,depth=0)=>{
  if(++nodes>32768||depth>32)throw Error('Room frame complexity limit');
  if(!Array.isArray(node)){if(node&&typeof node==='object')throw Error('Invalid room node');spend(bytes(JSON.stringify(node)));return node;}
  if(node[0]===0){if(node.length!==2||!Number.isInteger(node[1])||node[1]<0||node[1]>=frame.table.length)throw Error('Invalid room reference');spend(tableCosts[node[1]]);return frame.table[node[1]];}
  spend(2);
  if(node[0]===1)return node.slice(1).map(v=>{spend(1);return read(v,depth+1);});
  if(node[0]!==2||node.length%2!==1)throw Error('Invalid room object');
  const entries=[],keys=new Set();
  for(let i=1;i<node.length;i+=2){const key=read(node[i],depth+1);if(typeof key!=='string'||keys.has(key))throw Error('Invalid room key');keys.add(key);spend(2);entries.push([key,read(node[i+1],depth+1)]);}
  return Object.fromEntries(entries);
 };
 try{const value=read(frame.body);return value?.kind==='state'&&value.v===1&&value.encoding===undefined&&bytes(JSON.stringify(value))<=MAX_EXPANDED_BYTES?value:null;}catch{return null;}
}
export const roomStateWithinBudget=text=>bytes(text)<=MAX_EXPANDED_BYTES;
