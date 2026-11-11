const directions=new Set(['buff','nerf','adjustment']);
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<12000;
export const patchDirectionLabel=direction=>({buff:'加强',nerf:'削弱',adjustment:'调整'})[direction]||'调整';
export function validPatchNotes(notes,data){
 if(notes?.schema!==1||notes.scope!=='summoners-rift'||!Array.isArray(notes.patches)||notes.patches.length>12)return false;
 const heroes=new Set(data.champions.map(c=>c.id)),seen=new Set();
 for(const patch of notes.patches){
  if(!/^\d+\.\d+$/.test(patch.patch)||!/^\d+\.\d+$/.test(patch.officialPatch)||seen.has(patch.patch)||patch.mode!=='rift'||!Number.isFinite(Date.parse(patch.publishedAt))||patch.sourceURL!==`https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-${patch.officialPatch.replace('.','-')}-notes/`||!['champions','items','systems'].every(key=>Array.isArray(patch[key])))return false;seen.add(patch.patch);
  if(patch.officialPatch!==`${Number(patch.patch.split('.')[0])+10}.${Number(patch.patch.split('.')[1])}`||patch.format!==undefined&&patch.format!=='official-text'||patch.champions.length>heroes.size||patch.items.length>200||patch.systems.length>100)return false;
  const [season,release]=patch.patch.split('.').map(Number),[gameSeason,gameRelease]=data.patch.split('.').map(Number);if(season>gameSeason||season===gameSeason&&release>gameRelease)return false;
  if(patch.regionalNotes!==undefined&&(!Array.isArray(patch.regionalNotes)||patch.regionalNotes.length>8||patch.regionalNotes.some(row=>!text(row.text)||row.champion!==undefined&&!heroes.has(row.champion)||!/^https:\/\/lol\.qq\.com\/gicp\/news\/410\/\d{1,12}\.html$/.test(row.sourceURL))))return false;
  const championIds=new Set();
  for(const row of patch.champions){if(!heroes.has(row.champion)||championIds.has(row.champion))return false;championIds.add(row.champion);}
  for(const row of [...patch.champions,...patch.items,...patch.systems]){
   if(!directions.has(row.direction)||!Array.isArray(row.changes)||!row.changes.length||row.changes.length>200||row.note!==undefined&&!text(row.note))return false;
   for(const change of row.changes){
    if(!directions.has(change.direction)||!text(change.field))return false;
    // Official prose includes new effects, behavior changes and split lines.
    // Retain it verbatim instead of inventing a missing before/after value.
    if(change.text!==undefined){if(patch.format!=='official-text'||!text(change.text)||change.before!==undefined||change.after!==undefined)return false;}
    else if(!['before','after'].every(key=>text(change[key])))return false;
   }
  }
  if(patch.items.some(row=>typeof row.item!=='string'||!row.item.trim())||patch.systems.some(row=>typeof row.system!=='string'||!row.system.trim()))return false;
 }
 return true;
}
export function preferredPatchNotes(data,...candidates){
 const valid=candidates.filter(notes=>validPatchNotes(notes,data));
 if(!valid.length)return {schema:1,scope:'summoners-rift',patches:[],unavailable:true};
 const order=patch=>patch.split('.').map(Number),compare=(a,b)=>{const x=order(a),y=order(b);return x[0]-y[0]||x[1]-y[1];};
 const patches=new Map();
 // The first candidate is authoritative for same-patch corrections.
 for(const notes of valid)for(const patch of notes.patches)if(compare(patch.patch,data.patch)<=0){
  const current=patches.get(patch.patch);
  if(!current)patches.set(patch.patch,patch);
  else if(!current.regionalNotes&&patch.regionalNotes)patches.set(patch.patch,{...current,regionalNotes:patch.regionalNotes});
 }
 return {schema:1,scope:'summoners-rift',source:'Riot Games official patch notes',patches:[...patches.values()].sort((a,b)=>compare(b.patch,a.patch)).slice(0,12),...(valid[0].unavailable?{unavailable:true}:{})};
}
export function championPatchNotes(data,id){return (data.patchNotes?.patches||[]).flatMap(patch=>patch.champions.filter(row=>row.champion===id).map(row=>({...row,patch:patch.patch,officialPatch:patch.officialPatch,publishedAt:patch.publishedAt,sourceURL:patch.sourceURL,...(patch.regionalNotes?{regionalNotes:patch.regionalNotes.filter(note=>!note.champion||note.champion===id)}:{})})));}
export function itemPatchNotes(data,id){
 const name=data.items[id]?.name;if(!name)return [];
 const normalize=value=>String(value||'').replace(/[\s·•・]/g,'');
 return (data.patchNotes?.patches||[]).flatMap(patch=>patch.items.filter(row=>row.itemId===Number(id)||normalize(row.item)===normalize(name)).map(row=>({...row,patch:patch.patch,officialPatch:patch.officialPatch,publishedAt:patch.publishedAt,sourceURL:patch.sourceURL})));
}
