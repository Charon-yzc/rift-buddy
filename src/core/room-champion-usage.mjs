import {cleanChampionUsage,familiarMass} from './champion-usage.mjs';
export const CHAMPION_USAGE_VERSION=1;

// The explicit sharing exception contains aggregate own counts only. Rebuild
// every field so match IDs, identities, notes and credentials cannot transit.
export function cleanSharedChampionUsage(value){
 if(value===null)return null;
 if(!value||value.version!==CHAMPION_USAGE_VERSION||typeof value.mass!=='number'||!Number.isFinite(value.mass)||value.mass<0||value.mass>1)throw Error('成员英雄统计格式不正确');
 return {version:CHAMPION_USAGE_VERSION,mass:value.mass,usage:cleanChampionUsage(value.usage)};
}
export function ownSharedChampionUsage(summary,mass){
 if(!summary||!['loading','ready','partial'].includes(summary.status)||!(/^[a-f0-9]{32}$/).test(summary.session||''))return null;
 return cleanSharedChampionUsage({version:CHAMPION_USAGE_VERSION,mass:familiarMass(mass),usage:summary.usage});
}
