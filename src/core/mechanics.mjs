export const ITEM_FAMILIES=[[3036,3033,6694,3071,3302],[3135,3137,3302],[3053,3156,6673],[3004,3003,3119,3040,3042,3121,2526,2530],[3078,3100,3508,6662]];
export function itemConflicts(id,selected){return selected.includes(id)||ITEM_FAMILIES.some(group=>group.includes(id)&&selected.some(other=>group.includes(other)));}
const noHardCC=new Set('DrMundo Garen MasterYi Tryndamere KogMaw Lucian Sivir Ezreal Kaisa Katarina Talon Zed Akali Nidalee Rumble Zeri Samira'.split(' '));
export function runeMechanicIssue(champion,page){
 return noHardCC.has(champion)&&[8439,8351].includes(page?.selectedPerkIds?.[0])?'缺少自身硬控，无法稳定触发这套基石符文':null;
}
export function loadoutMechanicIssues(loadout,runes){
 const problems=[],selected=[];
 for(const id of [...loadout.items,loadout.boots,...loadout.late]){if(itemConflicts(id,selected))problems.push('成装重复或互斥：'+id);selected.push(id);}
 for(const id of loadout.champions)for(const key of loadout.runes){if(id==='DrMundo'&&loadout.base==='tank')continue;const issue=runeMechanicIssue(id,runes[key]?.page);if(issue)problems.push(`${id}：${issue}`);}
 return [...new Set(problems)];
}
