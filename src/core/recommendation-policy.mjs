import {lineupFit} from './room-ballot.mjs';
import {conventionalRole} from './rules.mjs';
import {communityFitException} from './recommendation-community.mjs';

// Use the very same public-roster projection as the visible score, including
// incomplete evidence and fixed-position conflict caps. Never use grade.score.
export function recommendationFit(entry,{slots,champions,scope,soloRole,clientSession,party,includePreselected,patch,catalogStatus,context,details}={}){
 return lineupFit(entry.slots,slots,champions,{scope:scope||entry.scope,soloRole:soloRole||entry.soloRole||entry.targets?.[0],clientSession,party,includePreselected,editableRoles:entry.targets,patch,catalogStatus,catalogSelectionId:entry.communityCombinationId,context,details});
}
export function meetsRecommendationFit(fit,minimum=60){
 if(fit.compatible===false)return false;
 const upperBound=Number.isFinite(fit.score)?fit.score:(fit.scoreCeiling??Infinity);
 return upperBound>=minimum;
}

// Styles select an execution category; they never add points to mechanism fit.
export function recommendationStyleTier(entry,style){
 const members=entry.analysis.members.filter(m=>!entry.targets?.length||entry.targets.includes(m.role)),combo=entry.trio||entry.duo;
 const unusual=members.some(m=>!conventionalRole(m.c,m.role,{get:()=>m.p}));
 const difficult=members.some(m=>m.p.difficulty>=7)||combo?.difficulty==='较高';
 const authored=!!combo,linked=entry.adaptive?.edges?.some(e=>e.current)||false;
 if(style==='balanced')return !unusual&&!difficult?2:!unusual?1:0;
 if(style==='wild')return unusual||combo?.style==='wild'?2:difficult&&(authored||linked)?1:0;
 return combo?.style==='fun'||linked&&!unusual?2:authored||entry.adaptive?1:0;
}

// Order only the selected batch, preserving its sampling and pagination.
export function recommendationOpponentScore(row){
 const fit=row.opponentFit;
 return [fit?.adjustment,fit?.ranked?.adjustment].reduce((sum,value)=>sum+(Number.isFinite(value)?value:0),0);
}
export function compareRecommendationFit(a,b){
 const fit=row=>Number.isFinite(row.recommendationFit?.score)?row.recommendationFit.score:-1;
 const focus=row=>fit(row)>=0?(row.recommendationFocus||0):0;
 return fit(b)-fit(a)||recommendationOpponentScore(b)-recommendationOpponentScore(a)||focus(b)-focus(a);
}
export function orderRecommendationPage(rows){
 const sorted=[...rows].sort(compareRecommendationFit);
 let familiar=0;
 const featured=sorted.filter(row=>{
  const priority=row.communityRecommendation?.priority;
  if(priority==='natural'||!communityFitException(row,row.recommendationFit))return false;
  if(priority==='familiar'&&familiar++>=1)return false;
  return true;
 }).slice(0,Math.floor(rows.length/2));
 const selected=new Set(featured);
 // Source is visible through a badge, never through a fabricated fit value.
 return [...featured,...sorted.filter(row=>!selected.has(row))];
}
