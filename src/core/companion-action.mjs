// Decide the sidebar shortcut from public draft state. The service still
// rechecks the current game and every write; this is not write authorization.
import {publicDraftTeam} from './ranked-draft.mjs';
export function companionHeroAction(client,champion,clickPrepare=true){
 const view=(label,readOnly=false)=>({prepare:false,label,...(readOnly?{readOnly:true}:{})});
 if(!champion)return view('查看配置');
 const session=client?.session,cell=session?.localPlayerCellId,mode=client?.mode?.id;
 if(!client?.connected||client.phase!=='ChampSelect'||mode!=='rift'&&mode!=='hex'||!Number.isInteger(cell))return view('查看配置');
 const own=publicDraftTeam(session).find(p=>p.cellId===cell);if(!own)return view('查看配置');
 const key=Number(champion.key),locked=own.pickState==='locked';
 // Hex bench can reselect even after a lock; only Rift locks block switching.
 if(mode==='rift'&&locked&&own.championId!==key)return {...view('已锁定，不能选择',true),blocked:true};
 if((session.myTeam||[]).some(p=>p.cellId!==cell&&Number(p.championId)===key))return view('队友已选 · 看配置',true);
 if((session.bans||[]).includes(key)||session.allowDuplicatePicks===false&&(session.theirTeam||[]).some(p=>Number(p.championId)===key))return view('本局不可选 · 看配置',true);
 if(!clickPrepare)return view('查看配置');
 return {prepare:true,hexHover:mode==='hex',label:locked&&mode==='rift'?'应用当前配置':mode==='hex'?'快速切换':'预选并配置'};
}
