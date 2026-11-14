import {liveFeatures} from './contract.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export const historyFeatureNames=['sampleFraction','winRate','championFraction','championWinRate','kda','csPerMinute','damagePerMinute','goldPerMinute','visionPerMinute','healPerMinute','historyMissing','kdaMissing','csMissing','damageMissing','goldMissing','visionMissing','healMissing'];
export function localTarget(game,queue){
 if(!game||game.queue!==queue||game.map!==11||game.pve||!game.completeTeams||!Number.isSafeInteger(game.id)||!finite(game.created)||!finite(game.duration)||game.duration<300||game.duration>7200||!/^\d+\.\d+\./.test(game.version||''))return false;
 const p=game.participants;if(!Array.isArray(p)||p.length!==10||new Set(p.map(v=>v.id)).size!==10||new Set(p.map(v=>v.puuid)).size!==10||new Set(p.map(v=>v.champion)).size!==10)return false;
 return p.every(v=>Number.isSafeInteger(v.id)&&v.id>0&&typeof v.puuid==='string'&&v.puuid.length>=16&&Number.isSafeInteger(v.champion)&&v.champion>0&&['win','loss'].includes(v.result))&&[100,200].every(team=>{const members=p.filter(v=>v.teamId===team);return members.length===5&&members.every(v=>v.result===members[0].result);})&&p.find(v=>v.teamId===100).result!==p.find(v=>v.teamId===200).result;
}
export function historyFeatures(games,{targetId,created,queue,champion,limit=20}){
 if(!finite(created)||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid history cutoff');
 const seen=new Set(),rows=[];
 for(const g of [...games].sort((a,b)=>(b.created||0)-(a.created||0))){
  if(rows.length>=limit)break;
  if(!Number.isSafeInteger(g.id)||g.id===targetId||seen.has(g.id)||g.queue!==queue||!finite(g.created)||!finite(g.duration)||g.duration<=0||g.created+g.duration*1000>=created||!g.self||!['win','loss'].includes(g.self.result))continue;
  seen.add(g.id);rows.push(g);
 }
 const n=rows.length,wins=rows.filter(g=>g.self.result==='win').length,champRows=rows.filter(g=>g.self.champion===champion),champWins=champRows.filter(g=>g.self.result==='win').length;
 const metrics=[['kda',p=>[p.kills,p.deaths,p.assists].every(finite)?(p.kills+p.assists)/Math.max(1,p.deaths):null],...['cs','damage','gold','vision','heal'].map(key=>[key,(p,g)=>finite(p[key])?p[key]/(g.duration/60):null])];
 const means=[],missing=[];
 for(const [,fn] of metrics){const values=rows.map(g=>fn(g.self,g)).filter(finite);means.push(values.length?values.reduce((a,b)=>a+b,0)/values.length:0);missing.push(1-(n?values.length/n:0));}
 return {count:n,latestEnd:n?Math.max(...rows.map(g=>g.created+g.duration*1000)):null,values:[n/20,(wins+5)/(n+10),champRows.length/20,(champWins+5)/(champRows.length+10),...means,Number(n===0),...missing]};
}
export function chronologicalSplit(rows){
 const games=new Map();
  for(const row of rows){if(typeof row.game!=='string'||!row.game||!finite(row.created)||![0,1].includes(row.label))throw Error('Invalid dated sample');const prior=games.get(row.game);if(prior&&(prior.created!==row.created||prior.label!==row.label||prior.endedAt!==row.endedAt))throw Error('Match metadata conflict');games.set(row.game,{game:row.game,created:row.created,label:row.label,endedAt:row.endedAt});}
 const ordered=[...games.values()].sort((a,b)=>a.created-b.created||a.game.localeCompare(b.game));
 if(ordered.length<10)throw Error('Too few games for independent splits');
 const calibrationStart=ordered[Math.floor(ordered.length*.7)].created,testStart=ordered[Math.floor(ordered.length*.85)].created;
 if(calibrationStart>=testStart)throw Error('Not enough distinct start times');
 const purged=new Set(),split={train:[],calibration:[],test:[],calibrationStart,testStart,method:'whole-match-chronological-70-15-15'};
 for(const row of rows){const key=row.created<calibrationStart?'train':row.created<testStart?'calibration':'test',boundary=key==='train'?calibrationStart:key==='calibration'?testStart:Infinity;if(row.endedAt!==undefined&&(!finite(row.endedAt)||row.endedAt<row.created))throw Error('Invalid match end time');if(row.endedAt!==undefined&&row.endedAt>=boundary){purged.add(row.game);continue;}split[key].push(row);}
 split.purgedGames=purged.size;
 if(['train','calibration','test'].some(k=>!split[k].length))throw Error('Empty independent split');return split;
}
export function timelineSamples(game,timeline,group){
 if(!Array.isArray(timeline?.frames)||!Array.isArray(timeline?.events)||!game.completeTeams)return [];
 const frames=timeline.frames,roster=new Map(game.participants.map(p=>[p.id,p]));
 if(frames.length<2||frames[0].timestamp!==0||frames.some((f,i)=>!finite(f.timestamp)||f.eventsKnown!==true||i&&f.timestamp<=frames[i-1].timestamp))return [];
 const events=timeline.events.filter(e=>e.type==='CHAMPION_KILL');
 if(events.some(e=>!finite(e.timestamp)||!roster.has(e.victimId)||e.killerId!==0&&!roster.has(e.killerId)||e.assistsKnown!==true||!Array.isArray(e.assists)||e.assists.some(id=>!roster.has(id))))return [];
 const rows=[];
 for(const frame of frames){
  const time=frame.timestamp/1000;if(time<300||time>=game.duration||time%300!==0)continue;
  if(!Array.isArray(frame.players)||frame.players.length!==10||new Set(frame.players.map(p=>p.id)).size!==10||frame.players.some(p=>!roster.has(p.id)))continue;
  const players=frame.players.map(p=>({slot:game.participants.findIndex(v=>v.id===p.id),side:roster.get(p.id).teamId===100?'blue':'red',level:p.level,cs:p.cs,kills:0,deaths:0,assists:0})),byId=new Map(frame.players.map((p,i)=>[p.id,players[i]]));
  for(const event of events){if(event.timestamp>frame.timestamp)continue;if(event.killerId!==0)byId.get(event.killerId).kills++;byId.get(event.victimId).deaths++;for(const id of new Set(event.assists))byId.get(id).assists++;}
  try{rows.push({game:group,created:game.created,time,label:Number(game.participants.find(p=>p.teamId===100).result==='win'),features:liveFeatures({players,time})});}catch{}
 }
 return rows;
}
