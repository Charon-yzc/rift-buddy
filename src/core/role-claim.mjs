// Recognisable lane representatives, curated for claiming a lane, not a tier list.
export const ROLE_REPRESENTATIVES=Object.freeze({top:['Garen','Darius','Malphite','Sett','Renekton'],jungle:['LeeSin','MasterYi','XinZhao','JarvanIV','Amumu'],mid:['Ahri','Annie','Lux','Yasuo','Veigar'],bottom:['Ashe','Jinx','Caitlyn','MissFortune','Ezreal'],support:['Yuumi','Lulu','Nami','Leona','Nautilus']});
export function roleClaimChoice(client,role,champions){
 const unavailable=reason=>({champion:null,reason});
 if(!ROLE_REPRESENTATIVES[role])return unavailable('请选择预选位置');
 if(!client?.connected)return unavailable('未连接客户端，连接后才能预选英雄');
 if(client.phase!=='ChampSelect')return unavailable('进入选人阶段后才能预选英雄');
 if(client.mode?.id!=='rift')return unavailable('当前模式不支持分路预选');
 const own=client?.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId);
 if(!own)return unavailable('尚未读取到本人的选人状态，请重新连接');
 // This helper is called only by an explicit lane choice. A public hover is
 // still replaceable; only the completed pick prevents changing champions.
 if(own.pickState==='locked'||(client.session.actions||[]).flat().some(a=>a.type==='pick'&&a.actorCellId===own.cellId&&a.completed===true))return unavailable('英雄已锁定，仅调整配置位置');
 const selectable=client.eligibility?.pickable,disabled=client.eligibility?.disabled||[];
 if(!Array.isArray(selectable))return unavailable('尚未取得可选英雄，请重新同步');
 const taken=[...(client.session.myTeam||[]).filter(p=>p.cellId!==own.cellId),...(client.session.allowDuplicatePicks===false?client.session.theirTeam||[]:[])].flatMap(p=>[p.championId,p.championPickIntent]);
 const blocked=[...disabled,...(client.session.bans||[]),...taken];
 const champion=ROLE_REPRESENTATIVES[role].find(id=>{const key=champions.find(c=>c.id===id)?.key;return key&&selectable.some(v=>Number(v)===key||v===id)&&!blocked.some(v=>Number(v)===key||v===id);});
 return champion?{champion,reason:''}:unavailable('这路的常见占位英雄本局均不可选，请直接选其他英雄');
}
export function roleClaimChampion(client,role,champions){return roleClaimChoice(client,role,champions).champion;}
