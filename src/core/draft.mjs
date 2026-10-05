export const CLIENT_POSITION_ROLES={TOP:'top',JUNGLE:'jungle',MIDDLE:'mid',MID:'mid',BOTTOM:'bottom',UTILITY:'support',SUPPORT:'support'};
export const DRAFT_SCOPES={
 context:{name:'考虑全队',description:'只推荐我们的位置，搭配时考虑队友已选英雄。'},
 party:{name:'只看我们',description:'只推荐标记“我们”的位置，只考虑我们之间的配合。'},
 bot:{name:'下路双人组',description:'只搭配下路与辅助，不受其他位置或“我们 / 队友”标记影响。'},
};
export const draftTargets=(slots,scope='context')=>slots.filter(s=>(scope==='bot'?['bottom','support'].includes(s.role):s.party)&&(!s.champion||!s.locked)).map(s=>s.role);
export const scopeSlots=(slots,scope='context')=>scope==='bot'?slots.filter(s=>['bottom','support'].includes(s.role)):scope==='party'?slots.filter(s=>s.party):slots;
export const clearDraftPicks=slots=>slots.map(s=>({role:s.role,party:s.party,champion:null,locked:false}));
export function publicDraftPicks(session,champions){
 const byKey=new Map(champions.map(c=>[c.key,c.id]));
 return (session?.myTeam||[]).filter(p=>byKey.has(Number(p.championId))&&Number.isInteger(p.cellId)).map(p=>({champion:byKey.get(Number(p.championId)),cellId:p.cellId,local:p.cellId===session.localPlayerCellId}));
}
export const unassignedPublicPicks=(slots,session,champions)=>publicDraftPicks(session,champions).filter(p=>!slots.some(s=>s.champion===p.champion&&s.clientCellId===p.cellId));
export function pickerMatches(champions,query,filter,matchesSearch,profile){
 const text=String(query??'');
 const all=champions.filter(c=>matchesSearch(c,text));
 const usual=all.filter(c=>filter==='all'||profile(c,filter).roles.includes(filter));
 const fallback=!!text.trim()&&!usual.length&&!!all.length;
 return {champions:fallback?all:usual,fallback};
}
const payload=s=>({champion:s.champion,locked:!!s.champion&&s.locked,
 ...(Number.isInteger(s.clientCellId)?{clientCellId:s.clientCellId,manualPosition:true}:{})});
export function moveChampion(slots,fromRole,toRole){
 const from=slots.find(s=>s.role===fromRole),to=slots.find(s=>s.role===toRole);
 if(!from||!to||!from.champion)throw Error('请从已选英雄开始拖动');
 if(fromRole===toRole)return structuredClone(slots);
 const a=payload(from),b=payload(to);
 return slots.map(s=>{
  if(![fromRole,toRole].includes(s.role))return {...s};
  // Position ownership stays on the board; champion and client binding move together.
  return {role:s.role,party:s.party,...(s.role===toRole?a:b)};
 });
}
export function assignClientChampion(slots,pick,toRole){
 const target=slots.find(s=>s.role===toRole);
 if(!target||target.champion)throw Error('请拖到空位置；已选英雄之间可直接交换');
 if(!pick?.champion||!Number.isInteger(pick.cellId)||pick.cellId<0||pick.cellId>=30||slots.some(s=>s.champion===pick.champion))throw Error('这位英雄已安排或选人信息已变化，请重新同步');
 return slots.map(s=>s.role===toRole?{role:s.role,party:s.party,champion:pick.champion,locked:true,clientCellId:pick.cellId,manualPosition:true}:{...s});
}
export function clientDraftStatus(client,slots,champions,now=Date.now()){
 const byKey=new Map(champions.map(c=>[c.key,c]));
 const team=client.session?.myTeam||[],hover=team.filter(p=>!p.championId&&byKey.has(Number(p.championPickIntent))).map(p=>({id:byKey.get(Number(p.championPickIntent)).id,local:p.cellId===client.session.localPlayerCellId}));
 const mismatch=slots.filter(s=>s.manualPosition&&Number.isInteger(s.clientCellId)).flatMap(s=>{const p=team.find(p=>p.cellId===s.clientCellId),assigned=CLIENT_POSITION_ROLES[String(p?.assignedPosition||'').toUpperCase()];return assigned&&assigned!==s.role?[{champion:s.champion,local:s.role,assigned}]:[];});
 const at=Date.parse(client.receivedAt),age=Number.isFinite(at)?Math.max(0,Math.floor((now-at)/1000)):null;
 const remaining=Number.isFinite(client.session?.timer?.remainingMs)&&age!==null?Math.max(0,Math.ceil(client.session.timer.remainingMs/1000-age)):null;
 return {hover,mismatch,age,remaining,stale:age!==null&&age>15};
}
