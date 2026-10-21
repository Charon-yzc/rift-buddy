import {decodeHydration,resolveReferences} from './source-parser.mjs';
import {validHexPoolRecord} from '../src/core/hex-pool-evidence.mjs';

const origin='https://mayhemmeta.com';
export function parseHexPoolPage(html,{champion,patch,slug,clock=Date.now}={}){
 if(!/^[a-z0-9-]{1,50}$/.test(slug)||!/^\d{2}\.\d{1,2}$/.test(patch))throw Error('英雄或补丁格式不正确');
 const canonical=String(html).match(/<link rel="canonical" href="([^"]+)"/)?.[1],title=String(html).match(/<title>(.*?)<\/title>/)?.[1];
 if(canonical!==origin+'/champions/'+slug||!title?.includes('Build '+patch+' '))throw Error('英雄池来源的英雄或补丁不匹配');
 const {nodes}=decodeHydration(html),tables=nodes.filter(n=>!Array.isArray(n)&&n.title==='All Augments'&&Array.isArray(n.rows));
 if(tables.length!==1||!Array.isArray(tables[0].extraFilter?.rows))throw Error('英雄强化记录格式已变化');
 const raw=[...tables[0].rows,...tables[0].extraFilter.rows],seen=new Set();if(!raw.length||raw.length>400)throw Error('英雄强化记录数量异常');
 const rows=raw.map(r=>{
  if(!Number.isSafeInteger(r.id)||r.id<=0||r.id>100000||seen.has(r.id)||!Number.isSafeInteger(r.games)||r.games<0||r.games>1e9||r.withheld!==undefined&&typeof r.withheld!=='boolean')throw Error('英雄强化记录缺失或重复');
  seen.add(r.id);return {id:r.id,games:r.games,withheld:r.withheld===true};
 });
 // These are selected-augment game counts, not offers, bans or round pools.
 // No individual games, identities, win rates or pick probabilities are saved.
 const record={champion,patch,source:'Mayhem:Meta',sourceUrl:canonical+'?patch='+patch,fetchedAt:new Date(clock()).toISOString(),kind:'selected-game-counts',rows};
 if(!validHexPoolRecord(record,champion,patch))throw Error('英雄强化记录身份不匹配');return record;
}
export async function fetchHexPoolIndex({patch,fetcher=fetch}={}){
 if(patch!==undefined&&!/^\d{2}\.\d{1,2}$/.test(patch))throw Error('英雄来源补丁格式不正确');
 const response=await fetcher(origin+'/',{redirect:'error',signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('英雄来源索引暂不可用');
 const html=await response.text();if(html.length>4_000_000)throw Error('英雄索引过大');
 const {nodes,refs}=decodeHydration(html);
 if(patch!==undefined){
  // The site silently returns its default patch for unavailable requests.
  // Inspect its explicit availability summary before querying every hero;
  // exact per-hero patch checks remain mandatory when the summary is absent.
  const configs=nodes.filter(n=>!Array.isArray(n)&&Object.hasOwn(n,'servablePatches')).map(n=>({defaultPatch:resolveReferences(n.defaultPatch,refs),patches:resolveReferences(n.servablePatches,refs)}));
  for(const row of configs)if(!/^\d{2}\.\d{1,2}$/.test(row.defaultPatch)||!Array.isArray(row.patches)||!row.patches.length||row.patches.length>32||row.patches.some(p=>typeof p!=='string'||!/^\d{2}\.\d{1,2}$/.test(p))||new Set(row.patches).size!==row.patches.length||!row.patches.includes(row.defaultPatch))throw Error('英雄来源补丁索引已变化');
  if(new Set(configs.map(row=>JSON.stringify([row.defaultPatch,...row.patches.toSorted()]))).size>1)throw Error('英雄来源补丁索引不一致');
  if(configs.length&&!configs[0].patches.includes(patch))throw Object.assign(Error('英雄强化来源尚未提供 '+patch+'，保留已有记录'),{code:'SOURCE_PATCH_UNAVAILABLE'});
 }
 const index=nodes.find(n=>Array.isArray(n)&&n.length>100&&n.length<=400&&n.every(r=>r&&Number.isSafeInteger(r.champion_id)&&r.champion_id>0&&/^[a-z0-9-]{1,50}$/.test(r.slug)));
 if(!index||new Set(index.map(r=>r.champion_id)).size!==index.length||new Set(index.map(r=>r.slug)).size!==index.length)throw Error('英雄来源索引已变化');
 return new Map(index.map(r=>[r.champion_id,r.slug]));
}
export async function fetchHexPoolEvidence(champion,{patch,slug,fetcher=fetch,clock=Date.now}){
 const url=origin+'/champions/'+encodeURIComponent(slug)+'?patch='+encodeURIComponent(patch),response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('英雄强化记录来源暂不可用');
 const html=await response.text();if(html.length>4_000_000)throw Error('英雄强化记录响应过大');
 return parseHexPoolPage(html,{champion:champion.id,patch,slug,clock});
}
