import {validateRunePage} from '../src/core/builds.mjs';
import {itemConflicts} from '../src/core/mechanics.mjs';
import {separateComponents} from './source-parser.mjs';
import {legalSkillOrder} from '../src/core/skill-advice.mjs';

export const BUILD_PARSER_VERSION=5;
export const BUILD_CORE_LIMIT=15;
export const BUILD_RUNE_LIMIT=18;
export const BUILD_POSITIONS={top:'top',jungle:'jungle',mid:'mid',bottom:'adc',support:'support'};
// This public vendor response is not a Riot API contract. Validate every field
// and retain the last good offline snapshot when the vendor changes its format.
const metrics=row=>({samples:row.play,wins:row.win,winRate:row.play?100*row.win/row.play:null,
 pickRate:Number.isFinite(row.pick_rate)&&row.pick_rate>=0&&row.pick_rate<=1?100*row.pick_rate:null});
const counted=row=>row&&Number.isSafeInteger(row.play)&&row.play>0&&Number.isSafeInteger(row.win)&&row.win>=0&&row.win<=row.play;
export function parseBuildJSON(raw,{champion,role,data,url}){
 const source=raw?.data;
 if(!BUILD_POSITIONS[role]||source?.summary?.id!==Number(champion.key)||!source.summary.positions?.some(p=>p.name?.toLowerCase()===BUILD_POSITIONS[role]))throw Error('来源没有返回该英雄和位置的数据');
 if(raw.meta?.version!==data.patch)throw Object.assign(Error(`出装来源版本 ${raw.meta?.version||'未知'} 与资料 ${data.patch} 不一致`),{code:'BUILD_PATCH_MISMATCH'});
 const rows=(list,limit=30)=>{if(!Array.isArray(list)||list.length>100)throw Error('出装来源表格格式已变化');return list.filter(r=>counted(r)&&Array.isArray(r.ids)&&r.ids.length>0&&r.ids.length<=12&&r.ids.every(id=>Number.isInteger(id)&&data.items[id]?.maps?.['11'])).map(r=>({items:[...r.ids],...metrics(r)})).sort((a,b)=>b.samples-a.samples).slice(0,limit);};
 const distinct=new Set();
 const core=rows(source.core_items).map(r=>separateComponents(r,data)).filter(r=>{
  const identity=r.items.join('-');if(r.items.length!==3||r.items.some((id,i)=>itemConflicts(id,r.items.slice(0,i)))||distinct.has(identity))return false;
  distinct.add(identity);return true;
 }).slice(0,BUILD_CORE_LIMIT);
 if(!Array.isArray(source.rune_pages)||source.rune_pages.length>30||!Array.isArray(source.runes))throw Error('符文来源格式已变化');
 const runeOptions=[],seen=new Set(),globalRunes=new Map();
 const page=r=>({primaryStyleId:r.primary_page_id,subStyleId:r.secondary_page_id,selectedPerkIds:[...(r.primary_rune_ids||[]),...(r.secondary_rune_ids||[]),...(r.stat_mod_ids||[])]});
 for(const r of source.runes){if(counted(r)&&validateRunePage(page(r),data.runes))globalRunes.set(page(r).selectedPerkIds.join('-'),r);}
 const leaves=source.rune_pages.flatMap(group=>Array.isArray(group.builds)&&group.builds.length<=30?group.builds:[]).filter(counted).sort((a,b)=>b.play-a.play);
 for(const r of leaves){const p=page(r),identity=p.selectedPerkIds.join('-');if(seen.has(identity)||!validateRunePage(p,data.runes))continue;seen.add(identity);
  // Group percentages and global percentages have different denominators.
  // Never present a percentage within a rune family as global popularity.
  const m=metrics(r),global=globalRunes.get(identity);
  runeOptions.push({id:'source-'+identity,page:p,...m,pickRate:global?metrics(global).pickRate:null});
  if(runeOptions.length===BUILD_RUNE_LIMIT)break;
 }
 if(!core.length||!runeOptions.length)throw Error('该位置缺少完整出装或符文样本');
 const skillOptions=(Array.isArray(source.skills)?source.skills:[]).filter(r=>counted(r)&&Array.isArray(r.order)&&legalSkillOrder(r.order.join(''))).sort((a,b)=>b.play-a.play).slice(0,5).map(r=>({id:'source-skill-'+r.order.join('').toLowerCase(),order:r.order.join(''),...metrics(r)}));
 const spellRow=(Array.isArray(source.summoner_spells)?source.summoner_spells:[]).filter(r=>counted(r)&&Array.isArray(r.ids)&&r.ids.length===2).sort((a,b)=>b.play-a.play)[0];
 const summoners=spellRow?.ids.map(key=>Object.keys(data.spells).find(id=>Number(data.spells[id].key)===key)).filter(Boolean);
 return {schema:1,parserVersion:BUILD_PARSER_VERSION,champion:champion.id,role,patch:data.patch,region:'global',tier:'emerald_plus',source:'OP.GG',sourceUrl:url,fetchedAt:new Date().toISOString(),
  core,boots:rows(source.boots,5),start:rows(source.starter_items,5),later:[rows(source.last_items)],laterBasis:'all-orders',
  runePage:runeOptions[0].page,runeSamples:runeOptions[0].samples,runeOptions,skillOptions,priority:null,summoners:summoners?.length===2?summoners:null};
}
export async function readPublicJSON(url,{fetcher=fetch,timeout=20000,limit=3_000_000}={}){
 const response=await fetcher(url,{signal:AbortSignal.timeout(timeout),redirect:'error',headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('版本出装来源暂时不可用');
 if(Number(response.headers.get('content-length'))>limit)throw Error('出装来源响应过大');
 let bytes=0;const chunks=[];
 for await(const chunk of response.body){bytes+=chunk.length;if(bytes>limit){await response.body.cancel().catch(()=>{});throw Error('出装来源响应过大');}chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('出装来源格式已变化');}
}
