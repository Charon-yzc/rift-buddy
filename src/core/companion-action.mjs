// Decide the sidebar shortcut from public draft state. The service still
// rechecks the current game and every write; this is not write authorization.
export function companionHeroAction(client,champion,clickPrepare=true){
 const view=(label,readOnly=false)=>({prepare:false,label,...(readOnly?{readOnly:true}:{})});
 if(!champion)return view('查看配置');
 const session=client?.session,cell=session?.localPlayerCellId;
 if(!client?.connected||client.phase!=='ChampSelect'||client.mode?.id!=='rift'||!Number.isInteger(cell))return view('查看配置');
 const own=session.myTeam?.find(p=>p.cellId===cell);if(!own)return view('查看配置');
 const key=Number(champion.key),locked=(session.actions||[]).flat().find(a=>a.type==='pick'&&a.actorCellId===cell&&a.completed===true);
 if((locked||own.pickState==='locked')&&Number(locked?.championId||own.championId)!==key)return view('已锁定其他英雄 · 看配置',true);
 if((session.myTeam||[]).some(p=>p.cellId!==cell&&Number(p.championId)===key))return view('队友已选 · 看配置',true);
 if((session.bans||[]).includes(key)||session.allowDuplicatePicks===false&&(session.theirTeam||[]).some(p=>Number(p.championId)===key))return view('本局不可选 · 看配置',true);
 if(!clickPrepare)return view('查看配置');
 return {prepare:true,label:locked?'应用当前配置':'预选并配置'};
}
