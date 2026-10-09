import {decodeHydration,itemRows,separateComponents} from './source-parser.mjs';
import {itemConflicts} from '../src/core/mechanics.mjs';
import {validateRunePage,usableBuildPatch} from '../src/core/builds.mjs';
import {BUILD_PARSER_VERSION,BUILD_CORE_LIMIT,BUILD_RUNE_LIMIT,BUILD_POSITIONS,parseBuildJSON,readPublicJSON} from './build-json.mjs';
import {DEFAULT_BUILD_SOURCE,requireBuildSource,sameBuildSource} from '../src/core/build-source.mjs';
export {BUILD_PARSER_VERSION,parseBuildJSON};
const position=BUILD_POSITIONS;
export function parseBuildPage(html,{champion,role,data,url,buildSource=DEFAULT_BUILD_SOURCE}) {
 const selected=requireBuildSource(buildSource);
 // Parse inert JSON emitted by the source's server renderer; never evaluate page JavaScript.
 const {nodes,refs}=decodeHydration(html);
 const context=nodes.find(v=>!Array.isArray(v)&&v.championId===champion.key&&v.position===position[role]&&v.patch&&v.type==='ranked');
 if(!context)throw new Error('来源没有返回该英雄和位置的数据');
 if(context.patch!==data.patch)throw new Error(`出装来源版本 ${context.patch} 与资料 ${data.patch} 不一致`);
 if(!sameBuildSource(context,selected))throw Object.assign(Error('来源返回的地域或段位与所选筛选不一致'),{code:'BUILD_SOURCE_MISMATCH'});
 const runeData=nodes.find(v=>Array.isArray(v.rune_pages)&&v.rune_pages.some(r=>r.importClientData));
 const runeGroups=runeData?.rune_pages||[];
 const runeGroupsSorted=[...runeGroups].sort((a,b)=>(b.play||0)-(a.play||0));
 const seenRunes=new Set();
 const runeOptions=runeGroupsSorted.filter(r=>{
  if(!validateRunePage(r.importClientData,data.runes))return false;
  const key=r.importClientData.selectedPerkIds.join('-');if(seenRunes.has(key))return false;seenRunes.add(key);return true;
 }).slice(0,BUILD_RUNE_LIMIT).map(r=>({id:'source-'+r.importClientData.selectedPerkIds.join('-'),samples:0,sampleScope:'family',familySamples:Number.isFinite(r.play)&&r.play>=0?r.play:0,
  page:{primaryStyleId:r.importClientData.primaryStyleId,subStyleId:r.importClientData.subStyleId,selectedPerkIds:[...r.importClientData.selectedPerkIds]}}));
 const sourceRune=runeGroupsSorted.find(r=>r.importClientData&&validateRunePage(r.importClientData,data.runes));
 const runePage=sourceRune?.importClientData;
 const extract=prefix=>itemRows(nodes,refs,prefix);
 const cores=extract('core_items_').map(row=>separateComponents(row,data)).filter(r=>r.items.length===3&&r.items.every((id,i)=>data.items[id]?.maps?.['11']&&!itemConflicts(id,r.items.slice(0,i))));
 const boots=extract('boots_'),starters=extract('starter_items_');
 const later=[4,5,6].map(depth=>extract(`depth_${depth}_item_`));
 const skillPriority=[...new Set(nodes.filter(v=>v.metaType==='skill'&&v.metaId===champion.id.toLowerCase()&&/^[QWER]$/.test(v.extraData)).map(v=>v.extraData))].join('');
 const summoners=nodes.filter(v=>v.metaType==='spell'&&Number.isInteger(v.metaId)).slice(0,2).map(v=>Object.keys(data.spells).find(id=>Number(data.spells[id].key)===v.metaId)).filter(Boolean);
 if(!cores.length||!runePage)throw new Error('该位置缺少完整出装或符文样本');
 return {schema:1,parserVersion:BUILD_PARSER_VERSION,champion:champion.id,role,patch:context.patch,region:context.region,tier:context.tier,
  source:'OP.GG',sourceUrl:url,fetchedAt:new Date().toISOString(),
  core:cores.slice(0,BUILD_CORE_LIMIT),boots:boots.slice(0,2),start:starters.slice(0,2),later,laterBasis:'purchase-order',
  runePage:{primaryStyleId:runePage.primaryStyleId,subStyleId:runePage.subStyleId,selectedPerkIds:runePage.selectedPerkIds},
  runeSamples:runeOptions[0].samples,runeOptions,priority:skillPriority.length===3?skillPriority:null,summoners:summoners.length===2?summoners:null};
}
export async function fetchChampionBuild(champion,role,data,{fetcher=fetch,allowOlder=false,jsonOnly=false,sourcePatch=data.patch,region=DEFAULT_BUILD_SOURCE.region,tier=DEFAULT_BUILD_SOURCE.tier}={}) {
 const buildSource=requireBuildSource({region,tier});
 if(!position[role])throw new Error('位置不受支持');
 if(!usableBuildPatch(sourcePatch,data.patch,allowOlder))throw Error('出装来源版本超出可参考范围');
 const url=`https://op.gg/lol/champions/${encodeURIComponent(champion.id.toLowerCase())}/build/${position[role]}?region=${region}&type=ranked&tier=${tier}&patch=${encodeURIComponent(sourcePatch)}`;
 const jsonUrl=`https://lol-api-champion.op.gg/api/${region}/champions/ranked/${encodeURIComponent(champion.key)}/${position[role]}?tier=${tier}&version=${encodeURIComponent(sourcePatch)}`;
 try{return parseBuildJSON(await readPublicJSON(jsonUrl,{fetcher}),{champion,role,data:{...data,patch:sourcePatch},url,buildSource});}
 catch(error){
  if(allowOlder&&sourcePatch===data.patch&&(error.status===422||error.code==='BUILD_PATCH_MISMATCH')){
   // Ask for the vendor's latest published statistics, which may be several
   // patches behind. Preserve that actual version rather than relabeling it.
   const raw=await readPublicJSON(jsonUrl.replace(/&version=[^&]+/,''),{fetcher}),patch=raw.meta?.version;
   if(!usableBuildPatch(patch,data.patch,true))throw Error('来源统计版本不正确，已保留本地方案');
   return parseBuildJSON(raw,{champion,role,data:{...data,patch},url:url.replace(/&patch=[^&]+/,'&patch='+patch),buildSource});
  }
  if(jsonOnly||['BUILD_PATCH_MISMATCH','BUILD_ROLE_UNAVAILABLE','BUILD_SOURCE_MISMATCH'].includes(error?.code))throw error;
 }
 const response=await fetcher(url,{signal:AbortSignal.timeout(25000),redirect:'error'});
 if(!response.ok)throw new Error('版本出装来源暂时不可用');
 const text=await response.text();if(text.length>4_000_000)throw new Error('出装来源响应异常');
 return parseBuildPage(text,{champion,role,data:{...data,patch:sourcePatch},url,buildSource});
}
