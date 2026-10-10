export const SHARD_ROWS=[[5008,5005,5007],[5008,5010,5001],[5011,5013,5001]];

export function validateRunePage(page,trees){
 if(!page||!Array.isArray(page.selectedPerkIds)||page.selectedPerkIds.length!==9)return false;
 const primary=trees.find(t=>t.id===page.primaryStyleId),secondary=trees.find(t=>t.id===page.subStyleId);
 if(!primary||!secondary||primary.id===secondary.id)return false;
 const ids=page.selectedPerkIds;
 if(!primary.slots.every((s,i)=>s.runes.some(r=>r.id===ids[i])))return false;
 const a=secondary.slots.findIndex(s=>s.runes.some(r=>r.id===ids[4])),b=secondary.slots.findIndex(s=>s.runes.some(r=>r.id===ids[5]));
 return a>0&&b>0&&a!==b&&SHARD_ROWS.every((allowed,i)=>allowed.includes(ids[i+6]));
}

// Storage validates bounded structure without silently replacing a future or
// removed rune. Rendering and applying must additionally use current trees.
export function validateCustomRunePage(value){
 const positive=id=>Number.isSafeInteger(id)&&id>0&&id<100000;
 if(!value||!positive(value.primaryStyleId)||!positive(value.subStyleId)||value.primaryStyleId===value.subStyleId||!Array.isArray(value.selectedPerkIds)||value.selectedPerkIds.length!==9||!value.selectedPerkIds.every(positive)||!/^\d{2}\.\d{1,2}$/.test(value.patch||''))throw Error('自选符文页格式不正确');
 return {primaryStyleId:value.primaryStyleId,subStyleId:value.subStyleId,selectedPerkIds:[...value.selectedPerkIds],patch:value.patch};
}

export function editRunePage(page,field,value,trees,patch){
 if(!validateRunePage(page,trees))throw Error('当前完整符文页不可编辑，请先选择可用的完整页');
 const next={primaryStyleId:page.primaryStyleId,subStyleId:page.subStyleId,selectedPerkIds:[...page.selectedPerkIds],patch},id=Number(value);
 if(field==='primaryStyleId'||field==='subStyleId'){
  const tree=trees.find(t=>t.id===id);if(!tree)throw Error('符文系已变化，请重新选择');
  next[field]=id;
  if(field==='primaryStyleId')next.selectedPerkIds.splice(0,4,...tree.slots.map(s=>s.runes[0].id));
  else next.selectedPerkIds.splice(4,2,...tree.slots.slice(1,3).map(s=>s.runes[0].id));
 }else{
  const slot=Number(field);if(!Number.isInteger(slot)||slot<0||slot>8)throw Error('符文位置不正确');
  next.selectedPerkIds[slot]=id;
 }
 if(!validateRunePage(next,trees))throw Error('主副系须不同，副系须选两行不同符文，碎片须属于对应行');
 return validateCustomRunePage(next);
}
