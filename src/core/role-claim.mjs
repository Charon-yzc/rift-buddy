// Recognisable lane representatives, curated for claiming a lane, not a tier list.
export const ROLE_REPRESENTATIVES=Object.freeze({top:['Garen','Darius','Malphite','Sett','Renekton'],jungle:['LeeSin','MasterYi','XinZhao','JarvanIV','Amumu'],mid:['Ahri','Annie','Lux','Yasuo','Veigar'],bottom:['Ashe','Jinx','Caitlyn','MissFortune','Ezreal'],support:['Yuumi','Lulu','Nami','Leona','Nautilus']});
export function roleClaimChampion(client,role,champions){
 const own=client?.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId);
 // Normal blind selection only. Ranked/draft/custom/unknown modes never hover
 // a representative merely because the player changes a configuration lane.
 if(!client?.connected||client.phase!=='ChampSelect'||client.mode?.id!=='rift'||Number(client.game?.queueId)!==430||!own||own.assignedPosition||own.championId||own.championPickIntent)return null;
 const selectable=client.eligibility?.pickable,disabled=client.eligibility?.disabled||[];
 if(!Array.isArray(selectable))return null;
 const taken=[...(client.session.myTeam||[]),...(client.session.allowDuplicatePicks===false?client.session.theirTeam||[]:[])].flatMap(p=>[p.championId,p.championPickIntent]);
 const blocked=[...disabled,...(client.session.bans||[]),...taken];
 return (ROLE_REPRESENTATIVES[role]||[]).find(id=>{const key=champions.find(c=>c.id===id)?.key;return key&&selectable.some(v=>Number(v)===key||v===id)&&!blocked.some(v=>Number(v)===key||v===id);})||null;
}
