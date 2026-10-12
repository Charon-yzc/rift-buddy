const directions=new Set(['buff','nerf','adjustment']);
export const patchDirectionLabel=direction=>({buff:'加强',nerf:'削弱',adjustment:'调整'})[direction]||'调整';
export function validPatchNotes(notes,data){
 if(notes?.schema!==1||notes.scope!=='summoners-rift'||!Array.isArray(notes.patches)||notes.patches.length>12)return false;
 const heroes=new Set(data.champions.map(c=>c.id)),seen=new Set();
 for(const patch of notes.patches){
  if(!/^\d+\.\d+$/.test(patch.patch)||!/^\d+\.\d+$/.test(patch.officialPatch)||seen.has(patch.patch)||patch.mode!=='rift'||!Number.isFinite(Date.parse(patch.publishedAt))||patch.sourceURL!==`https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-${patch.officialPatch.replace('.','-')}-notes/`||!['champions','items','systems'].every(key=>Array.isArray(patch[key])))return false;seen.add(patch.patch);
  const championIds=new Set();
  for(const row of patch.champions){if(!heroes.has(row.champion)||championIds.has(row.champion))return false;championIds.add(row.champion);}
  for(const row of [...patch.champions,...patch.items,...patch.systems]){
   if(!directions.has(row.direction)||!Array.isArray(row.changes)||!row.changes.length)return false;
   for(const change of row.changes)if(!directions.has(change.direction)||!['field','before','after'].every(key=>typeof change[key]==='string'&&change[key].trim().length>0&&change[key].length<3000))return false;
  }
  if(patch.items.some(row=>typeof row.item!=='string'||!row.item.trim())||patch.systems.some(row=>typeof row.system!=='string'||!row.system.trim()))return false;
 }
 return true;
}
export function championPatchNotes(data,id){return (data.patchNotes?.patches||[]).flatMap(patch=>patch.champions.filter(row=>row.champion===id).map(row=>({...row,patch:patch.patch,officialPatch:patch.officialPatch,publishedAt:patch.publishedAt,sourceURL:patch.sourceURL})));}
