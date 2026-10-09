// Public context of the user's click; no credentials or player identifiers.
export const RUNE_PHASES=['None','Lobby','Matchmaking','ReadyCheck','ChampSelect'];
export function runeWriteContext(client){
 if(!client?.connected||!RUNE_PHASES.includes(client.phase))throw Error('请在大厅或选人阶段应用符文');
 const result={phase:client.phase,gameId:/^\d{1,20}$/.test(String(client.game?.gameId||''))&&Number(client.game.gameId)>0?String(client.game.gameId):null};
 if(client.phase==='ChampSelect'){
  const session=client.session,cell=session?.localPlayerCellId,own=session?.myTeam?.find(p=>p.cellId===cell);
  if(!Number.isInteger(cell)||cell<0||cell>=30||!own||![own.championId||0,own.championPickIntent||0].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('未能确认当前选人对象，请同步客户端后重新点击应用');
  Object.assign(result,{cellId:cell,championId:own.championId||0,championPickIntent:own.championPickIntent||0,assignedPosition:String(own.assignedPosition||'').toUpperCase()});
 }
 return result;
}
export function validateRuneWriteContext(value){
 if(!value||typeof value!=='object'||value.gameId!==null&&(typeof value.gameId!=='string'||!/^\d{1,20}$/.test(value.gameId)||Number(value.gameId)<=0))throw Error('符文应用对象已失效，请重新点击应用');
 const context=runeWriteContext({connected:true,phase:value.phase,game:{gameId:value.gameId},session:{localPlayerCellId:value.cellId,myTeam:[{cellId:value.cellId,championId:value.championId,championPickIntent:value.championPickIntent,assignedPosition:value.assignedPosition}]}});
 if(context.phase==='ChampSelect'&&(value.championId!==context.championId||value.championPickIntent!==context.championPickIntent||typeof value.assignedPosition!=='string'||value.assignedPosition.length>40))throw Error('符文应用对象格式不正确，请重新点击应用');
 return context;
}
export function sameRuneWriteContext(actual,expected){
 // An absent public game ID cannot establish or invalidate a game identity.
 return JSON.stringify({...actual,gameId:expected.gameId?actual.gameId:null})===JSON.stringify(expected);
}
