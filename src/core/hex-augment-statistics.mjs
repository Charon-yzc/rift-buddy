import snapshot from './hex-augment-statistics.json' with {type:'json'};
import {isCurrentHexData} from './hex-data-current.mjs';
import {currentHexAugmentStatistics} from './hex-current-statistics.mjs';

export const HEX_AUGMENT_STATISTICS_SOURCE='https://github.com/czgreat/aramhex-data';
const commit='f4d80d48110951b7319ab74ffaa2c351bc7c8652';
const sourceDataUrl=`${HEX_AUGMENT_STATISTICS_SOURCE}/blob/${commit}/patches/16.21/normal/hero_augments.json`;
export const HEX_AUGMENT_STATISTICS_LICENSE=`${HEX_AUGMENT_STATISTICS_SOURCE}/blob/${commit}/LICENSE`;
const licenseUrl=HEX_AUGMENT_STATISTICS_LICENSE;
const sourceHash='993f242b5b6899354c3cc71e35bf08930940645b885a72588b2fc0d8c6ce0f3f';
const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<1e-12;

// End-of-match holdings, not the chance of being offered or selecting an augment.
// Aggregate wins and games across disjoint hero records before dividing; do not
// average hero win rates. Missing rows remain unknown rather than zero.
export function hexAugmentStatistics(data){
 if(data?.hexAugmentStats==null){const current=currentHexAugmentStatistics(data);if(current)return current;}
 const ref=data?.hexAugmentStats??snapshot;
 if(!isCurrentHexData(data)||!Array.isArray(data.augments)||ref?.schema!==1||ref.patch!==data.patch||ref.mode!=='aram-mayhem'||ref.rules!=='normal'||ref.source!=='AramHex'||ref.sourceUrl!==HEX_AUGMENT_STATISTICS_SOURCE||ref.sourceCommit!==commit||ref.sourceTag!=='data-v9'||ref.sourceLicense!=='CC BY-NC 4.0'||ref.attribution!=='海克斯大乱斗统计数据：czgreat/aramhex-data，CC BY-NC 4.0；按英雄记录的胜场和持有局数加总改编。'||ref.licenseUrl!==licenseUrl||ref.sourceDataUrl!==sourceDataUrl||ref.sourceDataSHA256!==sourceHash||ref.region!=='CN'||ref.regionScope!=='国服七区合并，不代表全服或全球'||ref.windowStart!=='2026-10-25T00:00:00+08:00'||ref.windowEndExclusive!=='2026-10-26T11:07:00+08:00'||ref.snapshotAt!=='2026-10-26T11:41:58+08:00'||ref.validMatches!==5376732||ref.validPlayerAppearances!==ref.validMatches*10||ref.heroCount!==173||!Array.isArray(ref.rows)||ref.rows.length!==229||ref.rows.length>500)return null;
 const ids=new Set(data.augments.map(a=>a?.id)),seen=new Set();
 for(const row of ref.rows){
  if(!Number.isSafeInteger(row?.id)||!ids.has(row.id)||seen.has(row.id)||typeof row.name!=='string'||!row.name||!['silver','gold','prismatic'].includes(row.rarity)||!Number.isSafeInteger(row.games)||row.games<=0||row.games>ref.validPlayerAppearances||!Number.isSafeInteger(row.wins)||row.wins<0||row.wins>row.games||!Number.isSafeInteger(row.heroCount)||row.heroCount<1||row.heroCount>ref.heroCount||!near(row.winRate,row.wins/row.games)||!near(row.holdingShare,row.games/ref.validPlayerAppearances))return null;
  seen.add(row.id);
 }
 return {...ref,rows:ref.rows.map(row=>({...row})).sort((a,b)=>b.winRate-a.winRate||b.games-a.games||a.id-b.id)};
}
