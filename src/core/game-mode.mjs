// ARAM alone does not identify Mayhem. Only explicit queue/mode metadata does.
export function identifyMode(value={}){
 const queueId=Number(value.queueId),mode=String(value.gameMode||'').toUpperCase(),map=Number(value.mapId??value.mapNumber);
 if(queueId===2400||mode==='KIWI')return {id:'hex',label:'海克斯大乱斗',supported:true};
 if([450,720].includes(queueId))return {id:'aram',label:'普通大乱斗',supported:false};
 if(mode==='PRACTICETOOL'&&map===11)return {id:'rift',label:'训练模式 · 峡谷参考',supported:true};
 if([400,420,430,440,480,490].includes(queueId)||mode==='CLASSIC'&&map===11)return {id:'rift',label:'召唤师峡谷',supported:true};
 return {id:null,label:mode==='ARAM'?'大乱斗 · 类型待确认':'模式待确认',supported:false};
}
export function sanitizeGame(game){
 const config=game?.gameData?.queue||game?.queue||{},gameData=game?.gameData||game||{};
 const queueId=Number(config.id??gameData.queueId),mapId=Number(gameData.mapId??gameData.mapNumber);
 const gameMode=String(config.gameMode??gameData.gameMode??'').slice(0,40);
 const gameId=String(gameData.gameId??'');
 return {...(Number.isInteger(queueId)&&queueId>=0?{queueId}:{}),...(Number.isInteger(mapId)&&mapId>0?{mapId}:{}),...(/^\d{1,20}$/.test(gameId)?{gameId}:{}),gameMode};
}
