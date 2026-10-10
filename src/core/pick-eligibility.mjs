import {CLIENT_POSITION_ROLES,manualPlayerSlot} from './draft.mjs';

// Public draft identity only; timer ticks and private player identifiers are omitted.
export function pickEligibilityContext(session){
 if(!session)return null;
 const team=rows=>(rows||[]).map(p=>[p.cellId,p.championId||0,p.assignedPosition||'']).sort((a,b)=>a[0]-b[0]);
 return JSON.stringify([session.gameId||null,session.localPlayerCellId,team(session.myTeam),team(session.theirTeam),[...(session.bans||[])].sort((a,b)=>a-b),session.allowDuplicatePicks]);
}
export function normalizeChampionIds(value){
 return Array.isArray(value)&&value.length<=5000&&value.every(id=>Number.isSafeInteger(id)&&id>0&&id<10000000)?[...new Set(value)].sort((a,b)=>a-b):null;
}
export function publicUnavailableChampions(session,champions){
 const ids=new Map(champions.map(c=>[c.key,c.id]));
 return {bans:(session?.bans||[]).map(id=>ids.get(id)).filter(Boolean),enemy:session?.allowDuplicatePicks===false?(session.theirTeam||[]).map(p=>ids.get(Number(p.championId))).filter(Boolean):[]};
}
export function localPickEligibility(client,slots,champions,{scope='context',soloRole='',playerPosition=null,now=Date.now()}={}){
 const none=(status,message)=>({status,message,role:'',eligibleByRole:{},confirmedPick:null});
 if(!client?.connected||client.phase!=='ChampSelect'||!client.session)return none('manual','手动推荐 · 当前可选英雄未核对');
 const session=client.session,read=client.eligibility,at=Date.parse(read?.receivedAt);
 if(!read||!Number.isFinite(at)||now-at>15000||at-now>5000||read.context!==pickEligibilityContext(session)||read.localPlayerCellId!==session.localPlayerCellId)return none('unknown','未读到本局可选范围 · 暂按手动英雄池推荐');
 const pickable=normalizeChampionIds(read.pickable),disabled=normalizeChampionIds(read.disabled);
 if(pickable===null&&disabled===null)return none('unknown','可选范围接口暂不可用 · 暂按手动英雄池推荐');
 const player=session.myTeam?.find(p=>p.cellId===session.localPlayerCellId);
 if(!player||!Number.isInteger(session.localPlayerCellId))return none('unknown','尚未确认本机选人位置 · 可选范围未应用');
 const selected=champions.find(c=>c.key===Number(player.championId));
 const manuallyPlaced=selected&&slots.find(s=>s.champion===selected.id&&(s.manualPosition||!Number.isInteger(s.clientCellId)));
 const explicit=playerPosition?.cellId===session.localPlayerCellId&&slots.some(s=>s.role===playerPosition.role)?playerPosition.role:'';
 const role=manualPlayerSlot(slots,session.localPlayerCellId)?.role||explicit||manuallyPlaced?.role||CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()]||(scope==='solo'?soloRole:'');
 const roles=role?[role]:scope==='solo'?slots.map(s=>s.role):[];
 if(!roles.length)return none('position','已读取本机可选范围 · 请先确认“我的位置”；朋友的可选范围未知');
 const allowed=champions.filter(c=>(pickable===null||pickable.includes(c.key))&&!(disabled||[]).includes(c.key)).map(c=>c.id).sort();
 const label=role?({top:'上路',jungle:'打野',mid:'中路',bottom:'下路',support:'辅助'})[role]:'各路单人候选';
 return {status:pickable!==null&&disabled!==null?'checked':'partial',role,confirmedPick:role&&selected?{role,champion:selected.id}:null,eligibleByRole:Object.fromEntries(roles.map(r=>[r,allowed])),message:`${label}仅推荐本机${pickable===null?'未禁用':'当前可选'}英雄${pickable!==null?' '+allowed.length+' 位':''} · ${pickable===null?'拥有/周免范围未核对；':disabled===null?'临时禁用范围未核对；':''}朋友的可选范围未知`};
}
