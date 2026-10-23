import snapshot from './hex-champion-statistics.json' with {type:'json'};
import {isCurrentHexData} from './hex-data-current.mjs';

export const HEX_CHAMPION_SOURCE='https://aramgg.com/data/champions-stats.json';
// This provider attributes its snapshot to Tencent. It does not publish hero
// sample counts, an observation cutoff, or a joint/team win probability.
export function normalizeHexChampionStatistics(rows,{champions,patch,fetchedAt}){
 if(!Array.isArray(rows)||!rows.length||rows.length>300||!Number.isFinite(Date.parse(fetchedAt)))throw Error('海克斯英雄统计格式不正确');
 const heroes=new Map(champions.map(h=>[String(h.key),h.id])),seen=new Set();
 const result=rows.map(row=>{
  const hero=heroes.get(String(row.championId));
  if(!hero||seen.has(hero)||row.version!==patch||row.source!=='tencent'||row.region!=='CN'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||Date.parse(row.date)>Date.parse(fetchedAt)||!Number.isFinite(row.winRate)||row.winRate<0||row.winRate>1||row.numGames!==null||row.numWinGames!==null)throw Error('海克斯英雄统计版本或口径不符');
  seen.add(hero);return {hero,winRate:row.winRate,samples:null,date:row.date};
 });
 return {schema:1,mode:'aram-mayhem',source:'ARAMGG',sourceUrl:HEX_CHAMPION_SOURCE,region:'CN',patch,fetchedAt,rows:result};
}
export function hexChampionStatistics(data){
 const ref=data.hexChampionStats??snapshot,heroes=new Set(data.champions.map(h=>h.id));
 if(!isCurrentHexData(data)||ref?.schema!==1||ref.mode!=='aram-mayhem'||ref.patch!==data.patch||ref.source!=='ARAMGG'||ref.sourceUrl!==HEX_CHAMPION_SOURCE||ref.region!=='CN'||!Number.isFinite(Date.parse(ref.fetchedAt))||!Array.isArray(ref.rows)||!ref.rows.length||ref.rows.length>300)return null;
 const seen=new Set();
 for(const row of ref.rows){if(!heroes.has(row.hero)||seen.has(row.hero)||row.samples!==null||!Number.isFinite(row.winRate)||row.winRate<0||row.winRate>1||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||Date.parse(row.date)>Date.parse(ref.fetchedAt))return null;seen.add(row.hero);}
 return ref;
}
