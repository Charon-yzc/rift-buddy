// Scoring weights and relationship analysis adapted from League Akari
// 60f1584c, MIT, Copyright (c) 2026 Hanxven. This is a reference score.
const mean=values=>{const read=values.filter(Number.isFinite);return read.length?read.reduce((a,b)=>a+b,0)/read.length:null;};
const clamp=n=>Math.min(1,Math.max(0,n));
export function akariScore(match){
 const p=match.self;if(!p||!match.completeTeams||!['win','loss'].includes(p.result)||match.pve)return null;
 const team=match.participants.filter(v=>v.team===p.team),total=key=>team.every(v=>v[key]!==null)?team.reduce((n,v)=>n+v[key],0):null;
 const contribution=(key,max,weight)=>{const t=total(key);return p[key]===null||t===null?null:weight*clamp(((t>0?p[key]/t*team.length:0)-1)/(max-1));};
 const taken=total('damageTaken'),heal=p.heal===null||taken===null?null:2*clamp(((taken>0?p.heal/(taken/team.length):0)-0.2)/((team.length===1?1:1.4)-0.2));
 const parts={kda:p.kda===null?null:Math.min(1,Math.sqrt(Math.max(0,p.kda-2))*3/7),win:p.result==='win'?1:0,damage:contribution('damage',2,3),taken:contribution('damageTaken',2,2),heal,cs:p.csPerMinute===null?null:2*clamp((p.csPerMinute-5)/5),gold:contribution('gold',1.5,2),participation:p.kp===null?null:2*clamp((p.kp-0.3)/0.7),vision:contribution('vision',2,2)};
 return Object.values(parts).some(v=>v===null)?null:{total:Object.values(parts).reduce((a,b)=>a+b,0),max:17,parts};
}
export function analyzeMatches(matches,{now=Date.now()}={}){
 const all=matches.filter(m=>m.self),valid=all.filter(m=>!m.pve&&['win','loss'].includes(m.self.result));
 const wins=valid.filter(m=>m.self.result==='win').length,champions=[],positions=[],relationships=new Map();
 for(const key of new Set(valid.map(m=>m.self.champion))){const games=valid.filter(m=>m.self.champion===key);champions.push({champion:key,count:games.length,wins:games.filter(m=>m.self.result==='win').length,kda:mean(games.map(m=>m.self.kda))});}
 for(const key of new Set(valid.map(m=>m.self.position).filter(Boolean))){const games=valid.filter(m=>m.self.position===key);positions.push({position:key,count:games.length,wins:games.filter(m=>m.self.result==='win').length});}
 for(const m of all)for(const p of m.participants){if(!p.puuid||p.puuid===m.self.puuid)continue;const same=p.team===m.self.team,key=p.puuid+':'+same;let entry=relationships.get(key);if(!entry){entry={puuid:p.puuid,name:p.name,champion:p.champion,ally:same,count:0,wins:0,games:[]};relationships.set(key,entry);}entry.count++;if(m.self.result==='win')entry.wins++;entry.games.push(m.id);}
 const sorted=[...valid].sort((a,b)=>b.created-a.created),first=sorted[0]?.self.result;let streak=0,sessionWins=0,sessionLosses=0,last=now;
 for(const m of sorted){if(m.self.result!==first)break;streak++;}
 if(sorted[0]&&now-sorted[0].created<4*3600000)for(const m of sorted){if(last-m.created>8*3600000)break;last=m.created;if(m.self.result==='win')sessionWins++;else sessionLosses++;}
 const scores=valid.map(akariScore).filter(Boolean);let score=null;
 if(scores.length===valid.length&&scores.length){const parts=Object.fromEntries(Object.keys(scores[0].parts).map(k=>[k,mean(scores.map(s=>s.parts[k]))]));parts.kda=Math.min(1,Math.sqrt(Math.max(0,mean(valid.map(m=>m.self.kda))-2))*3/7);parts.win=clamp((wins/valid.length-0.5)/0.5);score={parts,total:Object.values(parts).reduce((a,b)=>a+b,0),max:17};}
 return {loaded:matches.length,count:valid.length,wins,losses:valid.length-wins,winRate:valid.length?wins/valid.length:null,remakes:all.filter(m=>m.self.result==='remake').length,aborted:all.filter(m=>m.self.result==='abort').length,kda:mean(valid.map(m=>m.self.kda)),kp:mean(valid.map(m=>m.self.kp)),damage:mean(valid.map(m=>m.self.damageShare)),cs:mean(valid.map(m=>m.self.csPerMinute)),score,scoreCount:scores.length,streak:{result:first,count:streak},sessionWins,sessionLosses,champions:champions.sort((a,b)=>b.count-a.count),positions,relationships:[...relationships.values()].sort((a,b)=>b.count-a.count)};
}
