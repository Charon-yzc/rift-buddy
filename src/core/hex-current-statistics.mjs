import snapshot from './hex-statistics-16.22.json' with {type:'json'};
import {isReadableHexData} from './hex-data-current.mjs';

const metadata={
 patch:snapshot.patch,source:snapshot.source,sourceUrl:snapshot.sourceUrl,licenseUrl:snapshot.licenseUrl,
 regionScope:snapshot.regionScope,windowStart:snapshot.windowStart,windowEndExclusive:snapshot.windowEndExclusive,
 validMatches:snapshot.validMatches,attribution:'海克斯大乱斗统计：czgreat/aramhex-data · CC BY-NC 4.0；按胜场和结算持有数加总。'
};
const matchesCurrent=data=>data?.patch===snapshot.patch&&isReadableHexData(data);

export function currentHexChampionStatistics(data){
 if(!matchesCurrent(data)||!Array.isArray(data.champions))return null;
 const roster=new Set(data.champions.map(hero=>hero.id));
 const rows=snapshot.heroes.filter(row=>roster.has(row.hero)).map(({hero,games,wins})=>({
  hero,winRate:wins/games,samples:games,date:snapshot.snapshotAt.slice(0,10)
 }));
 return rows.length?{...metadata,rows}:null;
}

export function currentHexAugmentStatistics(data){
 if(!matchesCurrent(data))return null;
 const catalog=new Map(data.augments.map(augment=>[augment.id,augment]));
 const rows=snapshot.augments.flatMap(row=>{
  const augment=catalog.get(row.id);
  if(!augment||augment.catalogEnabled===false)return [];
  return [{...row,name:augment.name,winRate:row.wins/row.games,holdingShare:row.games/snapshot.validPlayerAppearances}];
 }).sort((a,b)=>b.winRate-a.winRate||b.games-a.games||a.id-b.id);
 return rows.length?{...metadata,rows}:null;
}
