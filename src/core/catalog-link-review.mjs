import {comboKey,comboMembers} from './combo-members.mjs';
import {fingerprint} from './content-fingerprint.mjs';
import {mechanicSourceMatches,mechanicSourceContentMatches,olderPatch} from './mechanic-source.mjs';

const pairKey=heroes=>[...heroes].sort().join(':');

// Only the owning store knows which merged objects came from personal data.
// An identical personal replacement remains personal, not a public review.
export function publicLinkOrigins(base,personal={}){
 const privateCombos=[...(personal.duos||[]),...(personal.trios||[])];
 const publicIds=[],configurationOverrides={};
 for(const review of base.linkReviews||[]){
  const entry=[...base.duos,...base.trios].find(x=>x.id===review.comboId);
  if(!entry||privateCombos.some(x=>x.id===entry.id||comboKey(x)===comboKey(entry)))continue;
  const members=comboMembers(entry),loadoutIds=new Set(members.map(m=>m.loadoutId).filter(id=>id&&id!=='default'));
  const loadouts=base.loadouts.filter(l=>loadoutIds.has(l.id)),runes=new Set(loadouts.flatMap(l=>l.runes||[]));
  const plans=(base.skillPlans||[]).filter(p=>members.some(m=>p.champion===m.champion&&p.role===m.role&&p.loadoutId===m.loadoutId));
  configurationOverrides[review.comboId]={
   loadout:(personal.loadouts||[]).some(l=>loadoutIds.has(l.id)),
   rune:[...runes].some(id=>Object.hasOwn(personal.runes||{},id)),
   skillPlan:(personal.skillPlans||[]).some(p=>plans.some(q=>p.id===q.id)||members.some(m=>p.champion===m.champion&&p.role===m.role&&p.loadoutId===m.loadoutId))
  };
  publicIds.push(review.comboId);
 }
 return {publicIds:[...new Set(publicIds)].sort(),configurationOverrides};
}

// These records authorize only the explanation and candidate expansion. They
// do not promote an edge to a current cooperation graph or imply win rate.
export function linkReviewStatuses(catalog,{patch,champions,mechanicSourceRevision,allowHistoricalLinks=false}={}){
 const result={},byId=new Map((champions||[]).map(c=>[c.id,c])),links=new Map(catalog.links.map(link=>[pairKey(link.slice(0,2)),link]));
 const entries=new Map([...catalog.duos,...catalog.trios].map(entry=>[entry.id,entry]));
 for(const review of catalog.linkReviews||[]){
  const key=pairKey(review.heroes),link=links.get(key),entry=entries.get(review.comboId),members=comboMembers(entry),heroes=members.map(m=>m.champion);
  const invalid=!entry||members.length!==2||pairKey(heroes)!==key||!link||review.heroes.some(id=>!byId.has(id));
  const historical=review.patch!==patch;
  const stale=invalid||historical&&(!allowHistoricalLinks||!olderPatch(review.patch,patch))||(mechanicSourceRevision!==undefined&&mechanicSourceRevision!==1)||fingerprint(link)!==review.linkFingerprint||!review.heroes.every(id=>{const champion=byId.get(id),anchor=review.anchors?.[id];return anchor?.kind==='explicit-review'&&fingerprint({stats:champion?.stats,mechanics:champion?.mechanics})===review.baseline?.[id]&&(historical?mechanicSourceRevision===1&&mechanicSourceContentMatches(champion,patch,anchor,review.baseline?.[id]):mechanicSourceMatches(champion,patch,anchor,review.baseline?.[id]));});
  result[key]={invalid,stale,...(historical&&!stale?{historicalPatch:patch}:{})};
 }
 return result;
}

function reviewedCatalogLinkRecords(catalog,{patch,status,baseKind,publicIds}={}){
 if(!catalog||!['bundled','community'].includes(baseKind)||!Array.isArray(publicIds)||typeof patch!=='string')return [];
 const approved=new Set(publicIds),links=new Map(catalog.links.map(link=>[pairKey(link.slice(0,2)),link])),out=[];
 for(const review of catalog.linkReviews||[]){
  const key=pairKey(review.heroes),link=links.get(key),state=status?.[key];
  if(review.patch!==patch&&state?.historicalPatch!==patch||!approved.has(review.comboId)||!state||state.invalid!==false||state.stale!==false||!link||fingerprint(link)!==review.linkFingerprint)continue;
  out.push({link,review});
 }
 return out;
}
export function reviewedCatalogLinks(catalog,context={}){return reviewedCatalogLinkRecords(catalog,context).map(row=>row.link);}

// A link is a two-hero observation, not a complete executable plan. Keep its
// owner's positions when using it to explore candidate lineups.
export function reviewedLinkOwners(catalog,context={}){
 const approved=reviewedCatalogLinkRecords(catalog,context);
 if(!approved.length)return [];
 const duos=new Map(catalog.duos.map(entry=>[entry.id,entry])),out=[];
 for(const {review} of approved){
  const key=pairKey(review.heroes),entry=duos.get(review.comboId),members=comboMembers(entry);
  if(members.length!==2||pairKey(members.map(m=>m.champion))!==key||members[0].role===members[1].role)continue;
  out.push(members.map(({role,champion})=>({role,champion})));
 }
 return out;
}
