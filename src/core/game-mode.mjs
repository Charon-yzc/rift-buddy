// ARAM alone does not identify Mayhem. Only explicit queue/mode metadata does.
const riftQueues=[400,420,430,440,490];
const modeFamily=mode=>['CLASSIC','PRACTICETOOL'].includes(mode)?'rift':['ARAM','KIWI'].includes(mode)?'aram':mode;
export function identifyMode(value={}){
 const queueId=Number(value.queueId),mode=String(value.gameMode||'').trim().toUpperCase(),map=Number(value.mapId??value.mapNumber);
 if(value.modeConflict===true||riftQueues.includes(queueId)&&(mode&&modeFamily(mode)!=='rift'||Number.isInteger(map)&&map>0&&map!==11))return {id:null,label:'模式信息不一致，请刷新客户端',supported:false};
 if(queueId===2400||mode==='KIWI')return {id:'hex',label:'海克斯大乱斗',supported:true};
 if([450,720].includes(queueId))return {id:'aram',label:'普通大乱斗',supported:false};
 if(queueId===480)return {id:'swiftplay',label:'快速模式 · 独立出门与阶段规则尚未支持',supported:false};
 if(mode==='PRACTICETOOL'&&map===11)return {id:'rift',label:'训练模式 · 峡谷参考',supported:true};
 if(riftQueues.includes(queueId)||mode==='CLASSIC'&&map===11)return {id:'rift',label:'召唤师峡谷',supported:true};
 return {id:null,label:mode==='ARAM'?'大乱斗 · 类型待确认':'模式待确认',supported:false};
}
export function sanitizeGame(game){
 const config=game?.gameData?.queue||game?.queue||{},gameData=game?.gameData||game||{},map=game?.map||{};
 const queueId=Number(config.id??gameData.queueId),maps=[gameData.mapId,gameData.mapNumber,map.id,config.mapId].map(Number).filter(n=>Number.isInteger(n)&&n>0),mapId=maps[0];
 // Gameflow puts the actual map outside gameData. Custom queues can have an
 // empty mode, so only nonempty metadata may hide the next public fallback.
 const modes=[config.gameMode,gameData.gameMode,map.gameMode].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim().toUpperCase().slice(0,40)),gameMode=modes[0]||'';
 // Practice/Classic and Mayhem/ARAM share map metadata. Different map IDs or
 // incompatible modes are contradictory evidence, never permission to write.
 const modeConflict=new Set(maps).size>1||new Set(modes.map(modeFamily)).size>1;
 const gameId=String(gameData.gameId??'');
 return {...(Number.isInteger(queueId)&&queueId>=0?{queueId}:{}),...(Number.isInteger(mapId)&&mapId>0?{mapId}:{}),...(/^\d{1,20}$/.test(gameId)?{gameId}:{}),gameMode,...(modeConflict?{modeConflict:true}:{})};
}
