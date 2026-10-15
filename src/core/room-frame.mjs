// Lossless room state encoding, used only above the legacy 64 KiB limit.
// dict2 interns repeated keys and clauses; it never removes plan conditions.
// Tuples: 0=string reference, 1=array, 2=object, 3=string fragments.
// Object key positions may contain a dictionary index only in dict2.
const bytes=text=>new TextEncoder().encode(text).length;
const MAX_EXPANDED_BYTES=4*65536;
const clauses=text=>text.split(/(?<=[，,。；;：:\n])/u);
export function packRoomState(value){
 if(value?.kind!=='state'||value.v!==1)return null;
 const keys=new Map(),full=new Map(),count=v=>{if(typeof v==='string')full.set(v,(full.get(v)||0)+1);else if(Array.isArray(v))v.forEach(count);else if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){keys.set(k,(keys.get(k)||0)+1);count(k);count(x);}};
 count(value);
 const worth=(s,n)=>n>1&&n*(bytes(JSON.stringify(s))-8)>bytes(JSON.stringify(s))+1;
 const exact=new Set([...full].filter(([s,n])=>(worth(s,n)||(keys.get(s)||0)*(bytes(JSON.stringify(s))-4)>bytes(JSON.stringify(s))+1)).map(([s])=>s)),counts=new Map([...full].filter(([s])=>exact.has(s)));
 for(const [s,n]of full)if(!exact.has(s))for(const piece of clauses(s))if(piece!==s)counts.set(piece,(counts.get(piece)||0)+n);
 const table=[...counts].filter(([s,n])=>worth(s,n)||exact.has(s)).sort((a,b)=>b[1]-a[1]).map(([s])=>s),index=new Map(table.map((s,i)=>[s,i]));
 if(table.length>4096)return null;
 const string=s=>{
  if(index.has(s)&&bytes(JSON.stringify([0,index.get(s)]))<bytes(JSON.stringify(s)))return [0,index.get(s)];
  const parts=clauses(s),node=[3,...parts.map(p=>index.has(p)?[0,index.get(p)]:p)];
  return parts.length>1&&bytes(JSON.stringify(node))<bytes(JSON.stringify(s))?node:s;
 };
 const encode=v=>typeof v==='string'?string(v):Array.isArray(v)?[1,...v.map(encode)]:v&&typeof v==='object'?[2,...Object.entries(v).flatMap(([k,x])=>[index.has(k)?index.get(k):k,encode(x)])]:v;
 return {kind:'state',v:1,encoding:'dict2',table,body:encode(value)};
}
export function unpackRoomState(frame){
 if(frame?.kind!=='state'||frame.v!==1||!['dict1','dict2'].includes(frame.encoding)||!Array.isArray(frame.table)||frame.table.length>4096||frame.table.some(s=>typeof s!=='string'))return null;
 let cost=0,nodes=0;
 const tableCosts=frame.table.map(s=>bytes(JSON.stringify(s))),spend=n=>{cost+=n;if(cost>MAX_EXPANDED_BYTES)throw Error('Expanded room frame too large');};
 const reference=node=>{if(!Array.isArray(node)||node.length!==2||node[0]!==0||!Number.isInteger(node[1])||node[1]<0||node[1]>=frame.table.length)throw Error('Invalid room reference');return node[1];};
 const read=(node,depth=0)=>{
  if(++nodes>32768||depth>32)throw Error('Room frame complexity limit');
  if(!Array.isArray(node)){if(node&&typeof node==='object')throw Error('Invalid room node');spend(bytes(JSON.stringify(node)));return node;}
  if(node[0]===0){const i=reference(node);spend(tableCosts[i]);return frame.table[i];}
  spend(2);
  if(node[0]===3){
   if(frame.encoding!=='dict2'||node.length<2)throw Error('Invalid room string');
   const parts=[];
   for(const part of node.slice(1)){
    if(++nodes>32768||depth+1>32)throw Error('Room frame complexity limit');
    if(typeof part==='string'){spend(bytes(JSON.stringify(part))-2);parts.push(part);}
    else{const i=reference(part);spend(tableCosts[i]-2);parts.push(frame.table[i]);}
   }
   return parts.join('');
  }
  if(node[0]===1)return node.slice(1).map(v=>{spend(1);return read(v,depth+1);});
  if(node[0]!==2||node.length%2!==1)throw Error('Invalid room object');
  const entries=[],keys=new Set();
  for(let i=1;i<node.length;i+=2){const key=read(frame.encoding==='dict2'&&typeof node[i]==='number'?[0,node[i]]:node[i],depth+1);if(typeof key!=='string'||keys.has(key))throw Error('Invalid room key');keys.add(key);spend(2);entries.push([key,read(node[i+1],depth+1)]);}
  return Object.fromEntries(entries);
 };
 try{const value=read(frame.body);return value?.kind==='state'&&value.v===1&&value.encoding===undefined&&bytes(JSON.stringify(value))<=MAX_EXPANDED_BYTES?value:null;}catch{return null;}
}
export const roomStateWithinBudget=text=>bytes(text)<=MAX_EXPANDED_BYTES;
