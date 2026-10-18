import {validRankingReference} from './rankings.mjs';
import {localPickLocked} from './draft-intents.mjs';

// Offline fallback: OP.GG 16.20 global Gold+, checked 2026-10-14.
// Rank by this champion's role share, never by win rate or lane popularity.
export const ROLE_REPRESENTATIVES=Object.freeze({top:['Gnar','Illaoi','Fiora','KSante','Urgot'],jungle:['Hecarim','Khazix','Belveth','Lillia','Graves'],mid:['Ahri','Vex','Kassadin','Orianna','Azir'],bottom:['Jinx','Xayah','Yunara','Samira','Aphelios'],support:['Nami','Yuumi','Milio','Braum','Thresh']});
export function roleRepresentatives(role,champions,{rankings={},patch}={}){
 const fallback=ROLE_REPRESENTATIVES[role]||[],ref=rankings[`${patch}:global:gold_plus`];
 if(!validRankingReference(ref,{champions,patch}))return [...fallback];
 // Avoid a rare off-meta sample claiming perfect exclusivity. Five stable
 // recognisable choices are preferable to filling a new patch's missing rows.
 const candidates=(ref.boards[role]||[]).filter(r=>r.samples>=1000&&r.pickRate>=.01&&r.roleRate>=.85)
  .sort((a,b)=>b.roleRate-a.roleRate||b.samples-a.samples||a.champion.localeCompare(b.champion));
 return candidates.length>=5?candidates.slice(0,5).map(r=>r.champion):[...fallback];
}
export function activeRoleClaim(claim,client){
 const session=client?.session,own=session?.myTeam?.find(p=>p.cellId===session.localPlayerCellId);
 return !!claim&&client.connected&&client.phase==='ChampSelect'&&String(session?.gameId||client.game?.gameId||'')===claim.gameId&&own?.cellId===claim.cellId&&!localPickLocked(session)&&!(session.actions||[]).flat().some(action=>action.type==='pick'&&action.actorCellId===own.cellId&&action.completed===true)&&Number(own.championId||own.championPickIntent)===claim.championId;
}
export function roleClaimChoice(client,role,champions,data={}){
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
 const champion=roleRepresentatives(role,champions,data).find(id=>{const key=champions.find(c=>c.id===id)?.key;return key&&selectable.some(v=>Number(v)===key||v===id)&&!blocked.some(v=>Number(v)===key||v===id);});
 return champion?{champion,reason:''}:unavailable('这路的常见占位英雄本局均不可选，请直接选其他英雄');
}
export function roleClaimChampion(client,role,champions){return roleClaimChoice(client,role,champions).champion;}
