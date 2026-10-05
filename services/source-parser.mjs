// Read inert React Flight JSON only. Imported strings are never evaluated as code.
export function decodeHydration(html){
 const stream=[...String(html).matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m=>{try{return JSON.parse(m[1]);}catch{return '';}}).join('');
 if(!stream)throw Error('资料来源格式已变化');
 const refs=new Map(),nodes=[];
 function visit(v,depth=0){if(!v||typeof v!=='object'||depth>80)return;nodes.push(v);for(const c of Object.values(v))if(c&&typeof c==='object')visit(c,depth+1);}
 for(const line of stream.split('\n'))try{const colon=line.indexOf(':');const value=JSON.parse(line.slice(colon+1));refs.set(line.slice(0,colon),value);visit(value);}catch{}
 return {nodes,refs};
}
export function resolveReferences(value,refs,seen=new Set(),depth=0){
 if(depth>80)return null;
 if(typeof value==='string'){
  const match=value.match(/^\$(?:L)?([\da-f]+)((?::[\w]+)*)$/);
  if(match&&refs.has(match[1])&&!seen.has(value)){
   let source=refs.get(match[1]);
   for(const key of match[2].split(':').filter(Boolean)){
    if(['__proto__','constructor','prototype'].includes(key))return null;
    source=key==='props'&&Array.isArray(source)&&source[0]==='$'?source[3]:source?.[key];
   }
   return resolveReferences(source,refs,new Set([...seen,value]),depth+1);
  }
  return value;
 }
 if(Array.isArray(value))return value.map(v=>resolveReferences(v,refs,seen,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveReferences(v,refs,seen,depth+1)]));
 return value;
}
export function itemRows(nodes,refs,prefix){
 const rows=nodes.filter(v=>Array.isArray(v)&&v[0]==='$'&&v[1]==='tr'&&typeof v[2]==='string'&&v[2].startsWith(prefix));
 return rows.map(row=>{
  row=resolveReferences(row,refs);const items=[];let samples=0,pickRate=null;
  function flatten(v){if(!v||typeof v!=='object')return [];return [v,...Object.values(v).flatMap(c=>c&&typeof c==='object'?flatten(c):[])];}
  function scan(v){if(!v||typeof v!=='object')return;
   if(Array.isArray(v)&&v[0]==='$'&&typeof v[2]==='string'&&/^\d+-\d+$/.test(v[2])){
    const descendants=flatten(v[3]),item=descendants.find(n=>n.metaType==='item'&&Number.isInteger(n.metaId));
    const quantity=descendants.find(n=>typeof n.className==='string'&&n.className.includes('absolute bottom-0 right-0')&&Number.isInteger(n.children))?.children||1;
    if(item){items.push(...Array(Math.max(1,Math.min(quantity,5))).fill(item.metaId));return;}
   }
   if(v.metaType==='item'&&Number.isInteger(v.metaId))items.push(v.metaId);
   if(Array.isArray(v)&&v[0]==='$'&&v[1]==='span'&&Array.isArray(v[3]?.children)&&v[3].children.includes('Games')){const n=String(v[3].children[0]).replaceAll(',','');if(/^\d+$/.test(n))samples=Number(n);}
   if(Array.isArray(v)&&v[0]==='$'&&v[1]==='strong'&&pickRate===null&&typeof v[3]?.children==='string'&&v[3].children.endsWith('%'))pickRate=Number.parseFloat(v[3].children);
   for(const child of Object.values(v))if(child&&typeof child==='object')scan(child);
  }
  scan(row);return {items,samples,pickRate};
 }).filter(r=>r.items.length&&r.items.length<=12).sort((a,b)=>b.samples-a.samples);
}
export function separateComponents(row,data){
 function componentOf(id,target,seen=new Set()){
  if(seen.has(target))return false;seen.add(target);const i=data.items[target];
  const components=[...(i?.from||[]).map(Number),...(i?.specialRecipe?[i.specialRecipe]:[])];
  return components.includes(id)||components.some(c=>componentOf(id,c,new Set(seen)));
 }
 const early=row.items.filter(id=>row.items.some(other=>other!==id&&componentOf(id,other)));
 return {...row,early,items:row.items.filter(id=>!early.includes(id))};
}
