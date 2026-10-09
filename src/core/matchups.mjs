// The matchup adapter follows LeagueAkari's normalized, unknown-relationship
// representation. See THIRD_PARTY_NOTICES.md for the pinned source and license.
export function validMatchups(rows){return Array.isArray(rows)&&rows.length<=100&&rows.every(r=>r&&typeof r.champion==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(r.champion)&&r.relationship==='unknown'&&Number.isSafeInteger(r.samples)&&r.samples>0&&Number.isSafeInteger(r.wins)&&r.wins>=0&&r.wins<=r.samples)&&new Set(rows.map(r=>r.champion)).size===rows.length;}
export function adaptMatchups(rows,champions,own){
 if(!Array.isArray(rows)||rows.length>100)return [];
 const ids=new Map(champions.map(c=>[Number(c.key),c.id])),seen=new Set(),result=[];
 for(const row of rows){const id=ids.get(row?.champion_id);if(!id||id===own||seen.has(id)||!Number.isSafeInteger(row.play)||row.play<=0||!Number.isSafeInteger(row.win)||row.win<0||row.win>row.play)continue;
  seen.add(id);result.push({champion:id,relationship:'unknown',samples:row.play,wins:row.win});
 }
 return result.sort((a,b)=>b.samples-a.samples||a.champion.localeCompare(b.champion));
}
// Wilson interval communicates small-sample uncertainty without manufacturing
// an adjusted win rate or recommending a pick from a noisy single matchup.
export function matchupEstimate(row){
 if(!validMatchups([row]))return null;
 const n=row.samples,p=row.wins/n,z=1.96,den=1+z*z/n,center=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
 return {rate:100*p,low:100*Math.max(0,center-half),high:100*Math.min(1,center+half),limited:n<200};
}
