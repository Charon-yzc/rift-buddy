import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {validatePairStatistics} from '../src/core/pair-statistics.mjs';
import {requireBuildSource} from '../src/core/build-source.mjs';
import {pairSourceUrl,pairApiUrl} from '../src/core/pair-statistics.mjs';

const positions={top:'TOP',jungle:'JUNGLE',mid:'MID',bottom:'ADC',support:'SUPPORT'};
export function parsePairStatisticsJSON(raw,{champion,role,data,source,rawSha256,fetchedAt=new Date().toISOString()}){
 source=requireBuildSource(source);
 if(raw?.meta?.version!==data.patch||!Array.isArray(raw.data)||raw.data.length>100||raw.meta.region!==undefined&&raw.meta.region!==source.region||raw.meta.tier!==undefined&&raw.meta.tier!==source.tier)throw Error('同队统计版本或来源筛选不一致');
 const byKey=new Map(data.champions.map(c=>[Number(c.key),c])),roleByPosition=Object.fromEntries(Object.entries(positions).map(([r,p])=>[p,r])),pairs=[];
 for(const row of raw.data){
  if(row?.champion_id!==Number(champion.key)||row.position!==positions[role])throw Error('同队统计返回了其他英雄或位置');
  if(row.synergy_position==='ALL')continue;
  const ally=byKey.get(row.synergy_champion_id),allyRole=roleByPosition[row.synergy_position];
  // A newer hero may not exist in the offline game snapshot. Do not invent it.
  if(!ally||!allyRole||ally.id===champion.id||allyRole===role)continue;
  if(!Number.isSafeInteger(row.play)||row.play<=0||!Number.isSafeInteger(row.win)||row.win<0||row.win>row.play||!Number.isFinite(row.win_rate)||Math.abs(row.win/row.play-row.win_rate)>.000002)throw Error('同队统计场次与胜率不一致');
  pairs.push({champion:ally.id,role:allyRole,games:row.play,wins:row.win});
 }
 const entry={champion:champion.id,role,url:pairApiUrl(champion.key,role,source,data.patch),sourceUrl:pairSourceUrl(champion.id,role,source,data.patch),fetchedAt,sourceCachedAt:raw.meta.cached_at||'',rawSha256,pairs};
 validatePairStatistics({schema:1,source:'OP.GG',...source,patch:data.patch,entries:[entry]},data.champions);return entry;
}

export async function loadPairStatistics(filename,data){
 try{const bytes=await fs.readFile(filename),snapshot=JSON.parse(bytes);validatePairStatistics(snapshot,data.champions);return {...snapshot,revision:crypto.createHash('sha256').update(bytes).digest('hex')};}
 catch{return null;}
}
