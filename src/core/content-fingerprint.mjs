// Change detection, not authentication or evidence that a strategy works.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;
export const canonicalJSON=value=>JSON.stringify(canonical(value??null));
export function fingerprint(value){let hash=14695981039346656037n;for(const c of canonicalJSON(value)){hash^=BigInt(c.charCodeAt(0));hash=BigInt.asUintN(64,hash*1099511628211n);}return hash.toString(16).padStart(16,'0');}
