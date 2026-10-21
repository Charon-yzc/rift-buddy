// Public aggregate selections only. This is not an offer, eligibility or
// win-rate table, and never contains individual matches or player identities.
export function validHexPoolRecord(record,hero,patch){
 if(!record||record.champion!==hero||record.patch!==patch||record.kind!=='selected-game-counts'||record.source!=='Mayhem:Meta'||typeof record.fetchedAt!=='string'||!Number.isFinite(Date.parse(record.fetchedAt))||!Array.isArray(record.rows)||!record.rows.length||record.rows.length>400)return null;
 if(Object.keys(record).sort().join(',')!=='champion,fetchedAt,kind,patch,rows,source,sourceUrl')return null;
 if(typeof record.sourceUrl!=='string'||!/^https:\/\/mayhemmeta\.com\/champions\/[a-z0-9-]{1,50}\?patch=\d{2}\.\d{1,2}$/.test(record.sourceUrl))return null;
 const url=new URL(record.sourceUrl);if(url.searchParams.get('patch')!==patch||url.pathname.split('/').at(-1).replaceAll('-','')!==String(hero).toLowerCase())return null;
 const ids=new Set();for(const row of record.rows){if(!row||Object.keys(row).sort().join(',')!=='games,id,withheld'||!Number.isSafeInteger(row.id)||row.id<=0||row.id>100000||ids.has(row.id)||!Number.isSafeInteger(row.games)||row.games<0||row.games>1e9||typeof row.withheld!=='boolean')return null;ids.add(row.id);}
 return record;
}
export function mergeHexPoolEvidence(candidate,other){
 if(!candidate)return candidate;
 const a=validHexPoolRecord(candidate.poolEvidence,candidate.champion,candidate.patch),b=validHexPoolRecord(other?.poolEvidence,candidate.champion,candidate.patch);
 return b&&(!a||Date.parse(b.fetchedAt)>Date.parse(a.fetchedAt))?{...candidate,poolEvidence:b}:candidate;
}
