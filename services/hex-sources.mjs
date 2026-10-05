import {decodeHydration,itemRows,separateComponents} from './source-parser.mjs';
export function parseHexBuildPage(html,{champion,data,url}){
 const canonical=String(html).match(/<link rel="canonical" href="([^"]+)"/)?.[1];
 const expected=`https://op.gg/lol/modes/aram-mayhem/${champion.id.toLowerCase()}/build`;
 if(canonical!==expected)throw Error('来源没有返回该英雄的海克斯大乱斗资料');
 const {nodes,refs}=decodeHydration(html);
 const context=nodes.find(v=>!Array.isArray(v)&&v.patch===data.patch&&v.region==='global'&&v.tier==='all');
 if(!context||!nodes.some(v=>v.championName===champion.id.toLowerCase()&&v.type==='aram'))throw Error('海克斯来源的版本或英雄不匹配');
 const extract=prefix=>itemRows(nodes,refs,prefix);
 const core=extract('core_items_').map(row=>separateComponents(row,data)).filter(r=>r.items.length===3&&r.items.every(id=>data.items[id]?.maps?.['12']));
 const augmentIds=[...new Set(nodes.filter(v=>v.metaType==='aram-augment'&&Number.isInteger(v.metaId)).map(v=>v.metaId))].filter(id=>data.augments.some(a=>a.id===id));
 if(!core.length||!augmentIds.length)throw Error('该英雄缺少完整的海克斯出装或强化参考');
 const priority=[...new Set(nodes.filter(v=>v.metaType==='skill'&&/^[QWE]$/.test(v.extraData)).map(v=>v.extraData))].join('');
 const summoners=nodes.filter(v=>v.metaType==='spell'&&Number.isInteger(v.metaId)).slice(0,2).map(v=>Object.keys(data.spells).find(id=>Number(data.spells[id].key)===v.metaId)).filter(Boolean);
 return {schema:1,parserVersion:3,mode:'hex',champion:champion.id,patch:data.patch,region:'global',tier:'all',source:'OP.GG',sourceUrl:url,
  fetchedAt:new Date().toISOString(),core:core.slice(0,3),boots:extract('boots_').slice(0,2),start:extract('starter_items_').slice(0,2),later:[],
  augmentIds,priority:priority.length===3?priority:null,summoners:summoners.length===2?summoners:null};
}
export async function fetchHexBuild(champion,data){
 const url=`https://op.gg/lol/modes/aram-mayhem/${encodeURIComponent(champion.id.toLowerCase())}/build?region=global&tier=all&patch=${encodeURIComponent(data.patch)}`;
 const response=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('海克斯版本配置来源暂时不可用');
 const html=await response.text();if(html.length>4_000_000)throw Error('海克斯来源响应异常');
 return parseHexBuildPage(html,{champion,data,url});
}
