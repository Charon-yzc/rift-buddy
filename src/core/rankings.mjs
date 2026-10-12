import {requireBuildSource} from './build-source.mjs';

export const RANKING_ROLES=Object.freeze({TOP:'top',JUNGLE:'jungle',MID:'mid',ADC:'bottom',SUPPORT:'support'});
const roles=Object.values(RANKING_ROLES);
export function rankingKey(patch,source){
 if(!/^[1-9]\d*\.[1-9]\d*$/.test(patch||''))throw Error('排行榜资料版本无效');
 const {region,tier}=requireBuildSource(source);return [patch,region,tier].join(':');
}
export function rankingURL(patch,source){
 rankingKey(patch,source);const {region,tier}=requireBuildSource(source);
 return `https://lol-api-champion.op.gg/api/${region}/champions/ranked?tier=${tier}&version=${patch}`;
}
const rate=v=>Number.isFinite(v)&&v>=0&&v<=1;
const count=v=>Number.isSafeInteger(v)&&v>=0;
const rank=v=>v===null||Number.isSafeInteger(v)&&v>0;
const tier=v=>v===null||Number.isInteger(v)&&v>=0&&v<=5;
const dated=v=>typeof v==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
export function validRankingReference(ref,data){
 try{
  if(ref?.schema!==1||ref.patch!==data.patch||ref.key!==rankingKey(ref.patch,ref)||ref.source!=='OP.GG'||ref.sourceURL!==rankingURL(ref.patch,ref)||ref.sourceScopeFromRequest!==true||ref.championCount!==data.champions.length||!count(ref.totalMatches)||!ref.totalMatches||!dated(ref.analyzedAt)||!dated(ref.fetchedAt))return false;
  if(!ref.boards||Object.keys(ref.boards).length!==5||!roles.every(role=>Array.isArray(ref.boards[role])&&ref.boards[role].length))return false;
  const heroes=new Set(data.champions.map(c=>c.id));
  for(const role of roles){
   const seen=new Set();
   for(const row of ref.boards[role]){
    if(!heroes.has(row.champion)||seen.has(row.champion)||row.role!==role||!count(row.samples)||!row.samples||!tier(row.tier)||!rank(row.rank)||!rank(row.previousPatchRank)||!['winRate','pickRate','banRate','roleRate'].every(key=>rate(row[key]))||!Array.isArray(row.counters)||row.counters.length>heroes.size)return false;
    seen.add(row.champion);const opponents=new Set();
    for(const c of row.counters){if(!heroes.has(c.champion)||opponents.has(c.champion)||!count(c.samples)||!c.samples||!rate(c.winRate))return false;opponents.add(c.champion);}
   }
  }
  return true;
 }catch{return false;}
}
export function parseRankings(raw,{data,source,fetchedAt=new Date().toISOString(),requestURL=rankingURL(data.patch,source)}){
 const selected=requireBuildSource(source),key=rankingKey(data.patch,selected);
 if(requestURL!==rankingURL(data.patch,selected))throw Error('排行榜请求身份不匹配');
 if(raw?.meta?.version!==data.patch)throw Error('排行榜来源版本与当前资料不一致');
 const heroes=new Map(data.champions.map(hero=>[hero.key,hero]));
 if(!Array.isArray(raw.data)||raw.data.length<150||raw.data.length!==heroes.size||new Set(raw.data.map(row=>row?.id)).size!==heroes.size)throw Error('排行榜英雄清单不完整');
 const boards=Object.fromEntries(roles.map(role=>[role,[]]));
 for(const row of raw.data){
  const hero=heroes.get(row.id);if(!hero||!Array.isArray(row.positions))throw Error('排行榜英雄或位置无效');
  const seen=new Set();
  for(const position of row.positions){
   const role=RANKING_ROLES[position.name],stats=position.stats;
   if(!role||seen.has(role)||!stats||!Array.isArray(position.counters||[]))throw Error('排行榜位置重复或不受支持');seen.add(role);
   const counters=(position.counters||[]).map(c=>{if(!heroes.has(c.champion_id)||!count(c.play)||!c.play||!count(c.win)||c.win>c.play)throw Error('排行榜对位数据无效');return {champion:heroes.get(c.champion_id).id,samples:c.play,winRate:c.win/c.play};});
   boards[role].push({champion:hero.id,role,tier:stats.tier_data?.tier??null,rank:stats.tier_data?.rank??null,previousPatchRank:stats.tier_data?.rank_prev_patch??null,samples:stats.play,winRate:stats.win_rate,pickRate:stats.pick_rate,banRate:stats.ban_rate,roleRate:stats.role_rate,counters});
  }
 }
 for(const rows of Object.values(boards))rows.sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)||b.samples-a.samples||a.champion.localeCompare(b.champion));
 const ref={schema:1,key,patch:data.patch,...selected,source:'OP.GG',sourceURL:requestURL,sourceScopeFromRequest:true,championCount:heroes.size,analyzedAt:raw.meta.analyzed_at,fetchedAt,totalMatches:raw.meta.match_count,boards};
 if(!validRankingReference(ref,data))throw Error('排行榜统计数值或时间无效，已保留原数据');
 return ref;
}
export function rankingReference(data,source){const ref=data.rankings?.[rankingKey(data.patch,source)];return validRankingReference(ref,data)?ref:null;}
export function newerRanking(next,current){return !current||Date.parse(next.analyzedAt)>Date.parse(current.analyzedAt)||next.analyzedAt===current.analyzedAt&&Date.parse(next.fetchedAt)>Date.parse(current.fetchedAt);}
