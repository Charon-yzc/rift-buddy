// Adapted from League Akari 60f1584c (MIT, Copyright 2026 Hanxven).
// Keep an explicit unknown value: an absent field is never a measured zero.
import {matchesRules} from './filters.mjs';
import {cleanHistoricalStats,cleanVictimDamage} from './stats.mjs';
export const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
export const text=value=>typeof value==='string'?value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,96):'';
export const validPuuid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{16,160}$/.test(value)&&!/^0+$/.test(value.replace(/-/g,''));
const ratio=(a,b)=>a!==null&&b!==null&&b>0?a/b:null;
const sum=values=>values.length&&values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;
export const QUEUES={420:'单双排',440:'灵活组排',430:'匹配',400:'征召匹配',450:'大乱斗',2400:'海克斯大乱斗',1700:'斗魂竞技场',1750:'斗魂竞技场',480:'快速模式',490:'快速匹配',900:'无限火力',1900:'无限火力',1020:'克隆模式',0:'自定义'};
export const queueName=id=>QUEUES[id]||`队列 ${id??'未知'}`;
const PVE=new Set([31,32,33,34,35,36,52,800,801,810,820,830,831,832,840,841,842,850,851,852,860,870,880,890,2000,2010,2020,90,91,92,950,951,960,961,981,982,990,1030,1031,1032,1040,1041,1050,1051,1060,1061,1070,1071,1800,1810,1820,1830,1840,1850,1860,1870,1880,1890]);
export function matchResult(end,s){
 if(text(end).startsWith('Abort_'))return 'abort';
 if(s.gameEndedInEarlySurrender===true)return 'remake';
 if(s.teamEarlySurrendered===true)return 'loss';
 return s.win===true?'win':s.win===false?'loss':'unknown';
}
const METRICS={damage:'totalDamageDealtToChampions',physicalDamage:'physicalDamageDealtToChampions',magicDamage:'magicDamageDealtToChampions',trueDamage:'trueDamageDealtToChampions',damageTaken:'totalDamageTaken',gold:'goldEarned',goldSpent:'goldSpent',heal:'totalHeal',vision:'visionScore',towerDamage:'damageDealtToTurrets',cc:'timeCCingOthers',shield:'totalDamageShieldedOnTeammates',allyHeal:'totalHealsOnTeammates',soloKills:'soloKills',doubleKills:'doubleKills',tripleKills:'tripleKills',quadraKills:'quadraKills',pentaKills:'pentaKills'};
export function normalizeMatch(raw,source='lcu',puuid=''){
 const d=source==='sgp'?raw?.json:raw;if(!d||!Number.isSafeInteger(d.gameId)||d.gameId<=0)return null;
 const arena=d.gameMode==='CHERRY',identities=Array.isArray(d.participantIdentities)?d.participantIdentities:[];
 const participants=(Array.isArray(d.participants)?d.participants:[]).slice(0,30).map(p=>{
  const s=source==='sgp'?p:p.stats||{},identity=source==='sgp'?p:identities.find(i=>i.participantId===p.participantId)?.player||{};
  const name=text(identity.riotIdGameName||identity.gameName||identity.summonerName),tag=text(identity.riotIdTagline||identity.tagLine),id=validPuuid(identity.puuid)?identity.puuid:'';
  const styles=source==='sgp'?(s.perks?.styles||[]).slice(0,2).map(v=>({style:number(v.style),selections:(v.selections||[]).slice(0,4).map(k=>({perk:number(k.perk),var1:number(k.var1),var2:number(k.var2),var3:number(k.var3)}))})):[{style:number(s.perkPrimaryStyle),selections:[0,1,2,3].map(i=>({perk:number(s['perk'+i]),var1:number(s['perk'+i+'Var1']),var2:number(s['perk'+i+'Var2']),var3:number(s['perk'+i+'Var3'])}))},{style:number(s.perkSubStyle),selections:[4,5].map(i=>({perk:number(s['perk'+i]),var1:number(s['perk'+i+'Var1']),var2:number(s['perk'+i+'Var2']),var3:number(s['perk'+i+'Var3'])}))}];
  return {id:number(p.participantId),puuid:id,name:name+(tag?'#'+tag:''),champion:number(p.championId),team:arena?`CHERRY-${number(s.playerSubteamId)??'unknown'}`:`TEAM-${number(p.teamId)??'unknown'}`,teamId:number(p.teamId),placement:number(s.subteamPlacement),position:text(s.teamPosition||s.individualPosition),level:number(s.champLevel),kills:number(s.kills),deaths:number(s.deaths),assists:number(s.assists),cs:sum([number(s.totalMinionsKilled),number(s.neutralMinionsKilled)]),
   items:[0,1,2,3,4,5,6].map(i=>number(s['item'+i])),spells:[number(p.spell1Id),number(p.spell2Id)],augments:[1,2,3,4,5,6].map(i=>number(s['playerAugment'+i])).filter(v=>v>0),styles,runes:styles.flatMap(v=>v.selections.map(k=>k.perk)).filter(v=>v>0),statPerks:source==='sgp'?Object.fromEntries(['offense','flex','defense'].map(k=>[k,number(s.perks?.statPerks?.[k])])):null,result:matchResult(d.endOfGameResult,s),surrender:s.gameEndedInSurrender===true||s.teamEarlySurrendered===true,
   ...Object.fromEntries(Object.entries(METRICS).map(([key,field])=>[key,number(s[field]??s.challenges?.[field])]))};
 });
 const arenaTeams=new Set(participants.filter(p=>p.placement>0&&!p.team.endsWith('unknown')).map(p=>p.team)).size;
 const arenaSize=d.queueId===1750?3:2;
 const completeTeams=arena?arenaTeams>=2&&participants.length===arenaTeams*arenaSize&&participants.every(p=>p.placement>0&&!p.team.endsWith('unknown')&&participants.filter(q=>q.team===p.team).length===arenaSize):participants.length===10&&[100,200].every(id=>participants.filter(p=>p.teamId===id).length===5);
 for(const p of participants){if(arena&&arenaTeams>1&&p.placement>0&&!['abort','remake'].includes(p.result))p.result=p.placement<=Math.floor(arenaTeams/2)?'win':'loss';const team=participants.filter(t=>t.team===p.team);p.kda=p.kills!==null&&p.assists!==null&&p.deaths!==null?(p.kills+p.assists)/Math.max(1,p.deaths):null;p.kp=completeTeams?ratio(p.kills===null||p.assists===null?null:p.kills+p.assists,sum(team.map(t=>t.kills))):null;p.damageShare=completeTeams?ratio(p.damage,sum(team.map(t=>t.damage))):null;p.csPerMinute=ratio(p.cs,number(d.gameDuration)===null?null:d.gameDuration/60);p.damagePerMinute=ratio(p.damage,number(d.gameDuration)===null?null:d.gameDuration/60);}
 const teams=[...new Set(participants.map(p=>p.team))].map(key=>{const members=participants.filter(p=>p.team===key),info=(d.teams||[]).find(t=>`TEAM-${t.teamId}`===key);return {key,result:members[0]?.result||'unknown',placement:members[0]?.placement??null,kills:sum(members.map(p=>p.kills)),gold:sum(members.map(p=>p.gold)),damage:sum(members.map(p=>p.damage)),bans:(info?.bans||[]).slice(0,10).map(b=>number(b.championId)).filter(Boolean),objectives:source==='sgp'?Object.fromEntries(['baron','dragon','tower','inhibitor','riftHerald','horde','atakhan'].map(k=>[k,number(info?.objectives?.[k]?.kills)])):Object.fromEntries(['baron','dragon','tower','inhibitor','riftHerald','horde'].map(k=>[k,number(info?.[k+'Kills'])]))};});
 return {id:d.gameId,source,created:number(d.gameCreation),duration:number(d.gameDuration),version:text(d.gameVersion),gameType:text(d.gameType),queue:number(d.queueId),mode:text(d.gameMode),map:number(d.mapId),arena,completeTeams,pve:PVE.has(d.queueId)||!!d.gameType&&d.gameType!=='MATCHED_GAME',participants,teams,self:participants.find(p=>p.puuid&&p.puuid===puuid)||null};
}
const EVENT_FIELDS=['timestamp','participantId','killerId','victimId','itemId','beforeId','afterId','skillSlot','teamId','killerTeamId','level','bounty','shutdownBounty','multiKillLength'];
export function normalizeTimeline(raw,source='lcu'){
 const d=source==='sgp'?raw?.json:raw;if(!Array.isArray(d?.frames))throw Error('对局时间线数据不完整');
 if(d.frames.length>240)throw Error('对局时间线超出显示范围');
 const events=[],frames=d.frames.map(f=>{
   const players=Object.values(f.participantFrames||{}).slice(0,30).map(p=>({id:number(p.participantId),gold:number(p.totalGold),currentGold:number(p.currentGold),cs:sum([number(p.minionsKilled),number(p.jungleMinionsKilled)]),xp:number(p.xp),level:number(p.level),damage:number(p.damageStats?.totalDamageDoneToChampions),stats:cleanHistoricalStats(p.championStats),position:number(p.position?.x)!==null&&number(p.position?.y)!==null?{x:p.position.x,y:p.position.y}:null}));
   for(const e of (f.events||[])){if(events.length>=15000)throw Error('对局事件超出显示范围');events.push({type:text(e.type),...Object.fromEntries(EVENT_FIELDS.map(k=>[k,number(e[k])])),assists:(e.assistingParticipantIds||[]).slice(0,30).map(number).filter(v=>v!==null),monster:text(e.monsterType||e.monsterSubType),building:text(e.buildingType),lane:text(e.laneType),levelUpType:text(e.levelUpType),killType:text(e.killType),victimDamageReceived:cleanVictimDamage(e.victimDamageReceived),victimDamageDealt:cleanVictimDamage(e.victimDamageDealt),position:number(e.position?.x)!==null&&number(e.position?.y)!==null?{x:e.position.x,y:e.position.y}:null});}
  return {timestamp:number(f.timestamp),players};
 });return {frames,events:events.sort((a,b)=>(a.timestamp||0)-(b.timestamp||0))};
}
export function filterMatches(games,filter={}){return games.filter(m=>{
 const p=m.self;
 return (!filter.result||p?.result===filter.result)&&(!filter.champion||p?.champion===Number(filter.champion))&&(!filter.queue||m.queue===Number(filter.queue))&&(!filter.position||p?.position===filter.position)&&(!filter.minKda||p?.kda!==null&&p?.kda>=Number(filter.minKda))&&(!filter.from||m.created>=Date.parse(filter.from))&&(!filter.to||m.created<Date.parse(filter.to)+86400000)&&(!filter.excludePve||!m.pve)&&matchesRules(m,filter.advanced);
});}
