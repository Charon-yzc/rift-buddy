// Names are used only to resolve a public event's team and are never retained.
const kinds=new Set(['GameStart','DragonKill','BaronKill','HeraldKill']);
const dragons=new Set(['Air','Earth','Fire','Water','Hextech','Chemtech','Elder']);
export function sanitizePublicEvents(raw,players,own,gameTime){
 if(!Array.isArray(raw?.Events)||!Number.isFinite(gameTime)||gameTime<0)return {available:false,historyComplete:false,events:[]};
 const input=raw.Events.slice(0,2000),events=[],ids=new Map();let valid=raw.Events.length<=2000;
 for(const event of input){
  if(!Number.isInteger(event?.EventID)||event.EventID<0||event.EventID>10000000||!Number.isFinite(event.EventTime)||event.EventTime<0||event.EventTime>gameTime+2){valid=false;continue;}
  if(!kinds.has(event.EventName))continue;
  const matches=typeof event.KillerName==='string'&&event.KillerName?players.filter(p=>p&&[p.riotId,p.summonerName,p.riotIdGameName].some(name=>typeof name==='string'&&name===event.KillerName)):[];
  const team=matches.length===1&&['ORDER','CHAOS'].includes(matches[0].team)&&['ORDER','CHAOS'].includes(own?.team)?matches[0].team===own.team?'ally':'enemy':null;
  const value={id:event.EventID,kind:event.EventName,time:event.EventTime,...(event.EventName!=='GameStart'?{side:team}:{}),...(event.EventName==='DragonKill'?{dragon:dragons.has(event.DragonType)?event.DragonType:null}:{})};
  if(ids.has(value.id)){if(JSON.stringify(ids.get(value.id))!==JSON.stringify(value))valid=false;continue;}
  ids.set(value.id,value);events.push(value);
 }
 events.sort((a,b)=>a.time-b.time||a.id-b.id);
 const starts=events.filter(e=>e.kind==='GameStart');
 return {available:true,historyComplete:valid&&starts.length===1&&starts[0].time<=5,events};
}
