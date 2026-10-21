import {lineupFit} from './room-ballot.mjs';
import {conventionalRole} from './rules.mjs';

// Use the very same public-roster projection as the visible score, including
// incomplete evidence and fixed-position conflict caps. Never use grade.score.
export function recommendationFit(entry,{slots,champions,scope,soloRole,clientSession,party,includePreselected,patch,catalogStatus}={}){
 return lineupFit(entry.slots,slots,champions,{scope:scope||entry.scope,soloRole:soloRole||entry.soloRole||entry.targets?.[0],clientSession,party,includePreselected,editableRoles:entry.targets,patch,catalogStatus});
}
export const meetsRecommendationFit=(fit,minimum=60)=>!Number.isFinite(fit.score)||fit.score>=minimum;

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
export function orderRecommendationPage(rows){
 return rows.map((row,index)=>({row,index})).sort((a,b)=>(Number.isFinite(b.row.recommendationFit?.score)?b.row.recommendationFit.score:-1)-(Number.isFinite(a.row.recommendationFit?.score)?a.row.recommendationFit.score:-1)||a.index-b.index).map(({row})=>row);
}
