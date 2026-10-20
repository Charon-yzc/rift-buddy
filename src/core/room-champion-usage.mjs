import {cleanChampionUsage,familiarMass,USAGE_ORIGIN} from './champion-usage.mjs';
export const CHAMPION_USAGE_VERSION=1;

// The explicit sharing exception contains aggregate own counts only. Rebuild
// every field so match IDs, identities, notes and credentials cannot transit.
// The shared shape stays a weight distribution; the local basis label (real
// games or a mastery proxy) is never part of the wire format.
export function cleanSharedChampionUsage(value){
 if(value===null)return null;
 if(!value||value.version!==CHAMPION_USAGE_VERSION||typeof value.mass!=='number'||!Number.isFinite(value.mass)||value.mass<0||value.mass>1)throw Error('成员英雄统计格式不正确');
 const usage=cleanChampionUsage(value.usage);
 return {version:CHAMPION_USAGE_VERSION,mass:value.mass,usage:{sampled:usage.sampled,counts:usage.counts}};
}
export function ownSharedChampionUsage(summary,mass){
 if(!summary||!['loading','ready','partial'].includes(summary.status)||!(/^[a-f0-9]{32}$/).test(summary.session||''))return null;
 // Only a live scan is shared. A local cache or a mastery proxy is a private
 // fallback and must never reach another player.
 if(summary.origin!==USAGE_ORIGIN.LIVE)return null;
 if(!summary.usage?.sampled||!Object.keys(summary.usage.counts||{}).length)return null;
 return cleanSharedChampionUsage({version:CHAMPION_USAGE_VERSION,mass:familiarMass(mass),usage:summary.usage});
}
