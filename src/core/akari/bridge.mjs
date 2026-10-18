// League Akari integration. Original MIT engine and provenance are adjacent to this file.
// Only normalized whitelisted values cross this boundary; raw responses are never retained.
import {normalizeMatch,number,validPuuid} from '../match-history/model.mjs';
import {analyzeGames,analyzePlayers,calculateTogetherTimes,findOutliersByIqr} from './engine.mjs';

export {findOutliersByIqr};
const PINGS=['allInPings','assistMePings','basicPings','commandPings','dangerPings','enemyMissingPings','enemyVisionPings','getBackPings','holdPings','needVisionPings','onMyWayPings','pushPings','retreatPings','visionClearedPings'];
const CHALLENGES=['soloKills','effectiveHealAndShielding','knockEnemyIntoTeamAndKill','killsNearEnemyTurret','killsUnderOwnTurret','earliestDragonTakedown','maxCsAdvantageOnLaneOpponent'];
const POSITIONS=new Set(['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY']);
const known=value=>typeof value==='number'&&Number.isFinite(value);
const zero=value=>number(value)??0;
const coordinate=value=>number(value?.x)!==null&&number(value?.y)!==null?{x:value.x,y:value.y}:null;

/** Add only fields consumed by the original analysis. Null means the source did not measure it. */
export function normalizeAkariMatch(raw,source='lcu',puuid=''){
  const match=normalizeMatch(raw,source,puuid);
  if(!match)return null;
  const data=source==='sgp'?raw.json:raw;
  for(let index=0;index<match.participants.length;index++){
    const participant=match.participants[index],original=data.participants[index],stats=source==='sgp'?original:original.stats||{};
    participant.totalMinionsKilled=number(stats.totalMinionsKilled);
    participant.neutralMinionsKilled=number(stats.neutralMinionsKilled);
    participant.physicalTaken=number(stats.physicalDamageTaken);
    participant.magicTaken=number(stats.magicDamageTaken??stats.magicalDamageTaken);
    participant.trueTaken=number(stats.trueDamageTaken);
    participant.pings=Object.fromEntries(PINGS.map(key=>[key,number(stats[key])]));
    if(!Object.values(participant.pings).some(known))participant.pings=null;
    participant.challenges=Object.fromEntries(CHALLENGES.map(key=>[key,number(stats.challenges?.[key]??stats[key])]));
    participant.soloKills=participant.challenges.soloKills;
  }
  return match;
}

function canonicalParticipant(p){
  const out={
    participantId:zero(p.id),puuid:p.puuid||'',championId:zero(p.champion),
    riotIdGameName:'',riotIdTagline:'',profileIcon:0,
    teamId:zero(p.teamId),playerSubteamId:p.team?.startsWith('CHERRY-')?Number(p.team.slice(7)):0,
    subteamPlacement:zero(p.placement),teamPosition:POSITIONS.has(p.position)?p.position:null,
    champLevel:zero(p.level),kills:zero(p.kills),deaths:zero(p.deaths),assists:zero(p.assists),
    totalMinionsKilled:number(p.totalMinionsKilled)??zero(p.cs),neutralMinionsKilled:number(p.neutralMinionsKilled)??0,
    spell1Id:zero(p.spells?.[0]),spell2Id:zero(p.spells?.[1]),
    win:p.result==='win',gameEndedInEarlySurrender:false,gameEndedInSurrender:p.surrender===true,teamEarlySurrendered:false,
    perks:{styles:[],statPerks:null},
    challenges:Object.fromEntries(CHALLENGES.map(key=>[key,number(p.challenges?.[key]??(key==='soloKills'?p.soloKills:null))])),
    ...Object.fromEntries(PINGS.map(key=>[key,zero(p.pings?.[key])]))
  };
  const metrics={totalDamageDealtToChampions:'damage',physicalDamageDealtToChampions:'physicalDamage',magicDamageDealtToChampions:'magicDamage',trueDamageDealtToChampions:'trueDamage',totalDamageTaken:'damageTaken',physicalDamageTaken:'physicalTaken',magicDamageTaken:'magicTaken',trueDamageTaken:'trueTaken',goldEarned:'gold',goldSpent:'goldSpent',damageDealtToTurrets:'towerDamage',totalHeal:'heal',visionScore:'vision',timeCCingOthers:'cc',doubleKills:'doubleKills',tripleKills:'tripleKills',quadraKills:'quadraKills',pentaKills:'pentaKills'};
  for(const [field,key] of Object.entries(metrics))out[field]=zero(p[key]);
  out.totalDamageShieldedOnTeammates=number(p.shield);
  // The original adapter expects a complete ping object. Partial pings are gated after analysis.
  return out;
}

function canonicalSummary(game){
  return {source:'sgp',gameId:game.id,data:{json:{
    gameId:game.id,gameCreation:zero(game.created),gameDuration:zero(game.duration)||1,
    gameVersion:game.version||'',gameType:game.gameType||'',queueId:zero(game.queue),
    gameMode:game.mode||'',mapId:zero(game.map),endOfGameResult:'GameComplete',
    participants:game.participants.map(canonicalParticipant)
  }}};
}

function completeRoster(game){
  if(!game.completeTeams||!Array.isArray(game.participants)||game.participants.length>30)return false;
  const ids=game.participants.map(p=>p.id);
  if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length)return false;
  if(game.arena){
    const teams=new Map();
    for(const p of game.participants){
      if(!/^CHERRY-[1-9]\d*$/.test(p.team)||!Number.isSafeInteger(p.placement)||p.placement<=0)return false;
      const list=teams.get(p.team)||[];list.push(p);teams.set(p.team,list);
    }
    const size=game.queue===1750?3:2;
    return teams.size>=2&&[...teams.values()].every(team=>team.length===size&&team.every(p=>p.placement===team[0].placement&&p.placement<=teams.size));
  }
  return game.participants.length===10&&[100,200].every(teamId=>game.participants.filter(p=>p.teamId===teamId&&p.team===`TEAM-${teamId}`).length===5);
}

// Rebuild the original frame envelope from normalized frames plus their flat event list.
function canonicalTimeline(timeline,game){
  if(!Array.isArray(timeline?.frames)||!timeline.frames.length||timeline.frames.length>240)return null;
  const roster=new Map(game.participants.map(p=>[p.id,p]));
  const sourceFrames=timeline.frames;
  if(sourceFrames.some((frame,index)=>!known(frame.timestamp)||frame.timestamp<0||index>0&&frame.timestamp<=sourceFrames[index-1].timestamp))return null;
  const frames=sourceFrames.map(frame=>({timestamp:frame.timestamp,participantFrames:Object.fromEntries((frame.players||[]).filter(p=>roster.has(p.id)).map(p=>{
    const value={participantId:p.id,position:coordinate(p.position),level:number(p.level),minionsKilled:zero(p.cs),jungleMinionsKilled:0};
    if(known(p.damage)){
      value.damageStats={totalDamageDoneToChampions:p.damage};
      value.championStats={}; // Marks the original detailed-frame branch; no invented champion stats.
    }
    return [p.id,value];
  })),events:[]}));
  const events=Array.isArray(timeline.events)?timeline.events:[];
  if(events.length>15000)return null;
   let objectiveTeams=true,eventTimes=Array.isArray(timeline.events)&&sourceFrames.every(frame=>frame.eventsKnown!==false),killIdentities=true,killPositions=true,soloObjectives=true;
  for(const event of events){
    if(!['CHAMPION_KILL','ELITE_MONSTER_KILL'].includes(event.type))continue;
    if(!known(event.timestamp)||event.timestamp<0){eventTimes=false;continue;}
    const killer=roster.get(event.killerId),explicit=number(event.killerTeamId);
    const killerTeamId=[100,200].includes(explicit)?explicit:[100,200].includes(killer?.teamId)?killer.teamId:null;
    const assists=Array.isArray(event.assists)?event.assists.filter(id=>roster.has(id)):[];
    const normalized={type:event.type,timestamp:event.timestamp,killerId:number(event.killerId),victimId:number(event.victimId),killerTeamId,assistingParticipantIds:assists,position:coordinate(event.position),monsterType:event.monster||''};
    if(event.type==='ELITE_MONSTER_KILL'){
      if(!killerTeamId||explicit!==null&&killer&&explicit!==killer.teamId)objectiveTeams=false;
      if(!event.monster)objectiveTeams=false;
       if(!Array.isArray(event.assists)||event.assistsKnown===false)soloObjectives=false;
    }else{
       if(!roster.has(event.victimId)||event.killerId!==0&&!killer||!Array.isArray(event.assists)||event.assistsKnown===false||(event.assists||[]).some(id=>!roster.has(id)))killIdentities=false;
      if((event.killerId===game.self.id||assists.includes(game.self.id))&&event.timestamp<=14*60000&&!normalized.position)killPositions=false;
    }
    const index=frames.findIndex(frame=>frame.timestamp>=event.timestamp);
    frames[index<0?frames.length-1:index].events.push(normalized);
  }
  const minuteFrames=sourceFrames.every((frame,index)=>Math.abs(frame.timestamp-index*60000)<=1500);
  const coversEnd=known(game.duration)&&game.duration>0&&sourceFrames.at(-1).timestamp>=game.duration*1000-90000;
  const sampled=sourceFrames.slice(1,15),selfFrame=frame=>(frame?.players||[]).find(p=>p.id===game.self.id);
  const positions=sampled.length>0&&sampled.every(frame=>coordinate(selfFrame(frame)?.position));
  const at3=selfFrame(sourceFrames[3]),at4=selfFrame(sourceFrames[4]);
  const earlyGank=minuteFrames&&known(at3?.cs)&&known(at3?.level)&&!!at4&&killPositions&&killIdentities&&eventTimes;
  const earlyDeaths=eventTimes&&killIdentities&&sourceFrames.at(-1).timestamp>=Math.min(game.duration*1000,15*60000)-1500;
  return {details:{source:'sgp',gameId:game.id,data:{json:{frames}}},availability:{
    frames:frames.length,events:events.length,objectives:objectiveTeams&&eventTimes&&coversEnd,
    soloObjectives,earlyDeaths,positions:!!positions&&minuteFrames,killPositions:killPositions&&killIdentities&&eventTimes&&coversEnd,
    earlyGank,minuteFrames,coversEnd,csSplit:false
  }};
}

function metricDependencies(game){
  const p=game.self,team=game.participants.filter(q=>q.team===p.team),all=game.participants;
  const self=key=>known(p[key]),every=(list,key)=>list.every(q=>known(q[key]));
  const duration=known(game.duration)&&game.duration>0,kda=self('kills')&&self('deaths')&&self('assists');
  const out={teamParticipantCount:true,win:true,kda,killParticipation:self('kills')&&self('assists')&&every(team,'kills'),damageGoldEfficiency:self('damage')&&self('gold'),killDamageEfficiency:self('kills')&&every(team,'kills')&&every(team,'damage'),healingRatioToTeamAverageDamageTaken:self('heal')&&every(team,'damageTaken'),championDamagePerMinute:self('damage')&&duration,csPerMinute:self('cs')&&duration};
  for(const [prefix,key] of [['championDamage','damage'],['damageTaken','damageTaken'],['gold','gold'],['cs','cs'],['towerDamage','towerDamage'],['visionScore','vision'],['totalDamageShieldedOnTeammates','shield']]){
    out[`${prefix}RatioToTeamMax`]=every(team,key);
    out[`${prefix}RatioToExpectedContribution`]=every(team,key);
    out[`${prefix}RatioToMax`]=every(all,key);
    out[`${prefix}PercentageOfTeam`]=every(team,key);
  }
  return out;
}

const SCORE_DEPS={kdaScore:['kda'],winRateScore:['win'],dmgScore:['championDamageRatioToExpectedContribution'],dmgTakenScore:['damageTakenRatioToExpectedContribution'],healingScore:['healingRatioToTeamAverageDamageTaken'],csScore:['csPerMinute'],goldScore:['goldRatioToExpectedContribution'],participationScore:['killParticipation'],visionScore:['visionScoreRatioToExpectedContribution']};
function gateScore(score,dependencies){
  for(const [key,fields] of Object.entries(SCORE_DEPS))if(!fields.every(field=>dependencies[field]))score[key]=null;
  if(Object.keys(SCORE_DEPS).some(key=>score[key]===null)){score.total=null;score.outstanding=null;score.extraordinary=null;}
}

function aggregateAvailability(output,rows){
  const count=rows.length,all=test=>count>0&&rows.every(test),samples=test=>rows.filter(test).length;
  const summary={},score={};
  for(const key of Object.keys(output.summary)){
    let test;
    if(['kills','deaths','assists'].includes(key))test=row=>known(row.game.self[key]);
    else if(key==='avgKda'||key==='kdaCv')test=row=>row.metrics.kda;
    else if(key==='winRate')test=()=>true;
    else if(key==='avgVisionScore')test=row=>known(row.game.self.vision);
    else if(key==='avgSoloKills')test=row=>known(row.game.self.soloKills);
    else if(key==='avgEnemyMissingPings')test=row=>known(row.game.self.pings?.enemyMissingPings);
    else if(key==='avgPings')test=row=>PINGS.every(field=>known(row.game.self.pings?.[field]));
    else {const field=key.startsWith('avg')?key[3].toLowerCase()+key.slice(4):key;test=row=>row.metrics[field]===true;}
    summary[key]=samples(test);
    if(!all(test))output.summary[key]=null;
  }
  for(const [key,fields] of Object.entries(SCORE_DEPS)){
    const test=row=>fields.every(field=>row.metrics[field]);score[key]=samples(test);
    if(!all(test))output.akariScore[key]=null;
  }
  if(Object.keys(SCORE_DEPS).some(key=>output.akariScore[key]===null)){output.akariScore.total=null;output.akariScore.outstanding=null;output.akariScore.extraordinary=null;}
  if(output.summary.kdaCv<0)output.summary.kdaCv=null; // Original -1 sentinel: zero mean has no CV.
  if(!all(row=>POSITIONS.has(row.game.self.position)))output.positions=null;
  if(output.spells&&!all(row=>row.game.self.spells?.length===2&&row.game.self.spells.every(known)))output.spells={flashOnD:null,flashOnF:null};
  for(const key of ['all','normal','cherry']){
    const group=key==='all'?rows:rows.filter(row=>(row.game.mode==='CHERRY')===(key==='cherry'));
    if(group.some(row=>!known(row.game.created)||!known(row.game.duration))){output.winLoss[key].activeSessionWins=null;output.winLoss[key].activeSessionLosses=null;}
  }
  if(output.teamSide&&rows.some(row=>row.game.arena))output.teamSide={redSideCount:null,blueSideCount:null};
  return {summary,akariScore:score,positions:samples(row=>POSITIONS.has(row.game.self.position)),spells:samples(row=>row.game.self.spells?.length===2&&row.game.self.spells.every(known))};
}

function gateTimeline(single,row){
  if(!single.details)return;
  const available=row.timeline.availability,details=single.details;
  if(!available.objectives)for(const key of Object.keys(details.objectives))details.objectives[key]=null;
  else if(!available.soloObjectives)details.objectives.soloDragons=null;
  if(!available.earlyDeaths)details.earlyDeathsWithEnemyJunglerInvolved=null;
  if(!details.jungle)return;
  const jungle=details.jungle;
  if(!available.positions||!available.killPositions){
    for(const key of ['topZoneWeightSum','midZoneWeightSum','botZoneWeightSum','totalZoneWeightSum'])jungle[key]=null;
  }
  if(!available.killPositions){
    for(const key of ['topGanks','midGanks','botGanks'])jungle[key]=null;
    jungle.gankPositions=null;
  }
  if(!available.positions)jungle.minutePositions=null;
  if(!available.minuteFrames)jungle.startCamp=null;
  if(!available.earlyGank){jungle.level3GankDetected=null;jungle.level4GankDetected=null;jungle.level3KillPositions=null;jungle.level4KillPositions=null;}
}

function gateJungle(output,rows){
  if(!output)return;
  const junglers=rows.filter(row=>row.timeline&&row.game.map===11&&(row.game.self.position==='JUNGLE'||row.game.self.spells?.includes(11)));
  const all=test=>junglers.length>0&&junglers.every(row=>test(row.timeline.availability));
  if(!all(a=>a.positions&&a.killPositions))for(const key of ['topZoneWeightSum','midZoneWeightSum','botZoneWeightSum','totalZoneWeightSum','avgTopZonePercentage','avgMidZonePercentage','avgBotZonePercentage'])output[key]=null;
  if(!all(a=>a.positions))output.minutePositions=null;
  if(!all(a=>a.killPositions)){for(const key of ['totalTopGanks','totalMidGanks','totalBotGanks','avgTopGanks','avgMidGanks','avgBotGanks','gankPositions'])output[key]=null;}
  if(!all(a=>a.objectives))for(const key of Object.keys(output.objectives))output.objectives[key]=null;
  else if(!all(a=>a.soloObjectives))output.objectives.soloDragonRate=null;
  if(!all(a=>a.earlyGank)){
    for(const key of Object.keys(output.earlyGank))if(key!=='byTeam')output.earlyGank[key]=null;
    for(const key of Object.keys(output.earlyGank.byTeam))if(!key.endsWith('Games'))output.earlyGank.byTeam[key]=null;
  }
  if(!all(a=>a.minuteFrames))output.firstClearCamp=null;
}

/** Original AggregatedAnalysis shape, with conservative nulls when any metric dependency is absent. */
export function analyzeAkariHistory(games,{timelines={}}={}){
  const rows=[],seen=new Set();let target='';
  for(const game of Array.isArray(games)?games:[]){
    if(!game?.self||!validPuuid(game.self.puuid)||!['win','loss'].includes(game.self.result)||!completeRoster(game))continue;
    if(game.pve||game.gameType!=='MATCHED_GAME')continue;
    if(!Number.isSafeInteger(game.id)||game.id<=0||seen.has(game.id))continue;
    if(!game.participants.some(p=>p.id===game.self.id&&p.puuid===game.self.puuid))continue;
    if(target&&target!==game.self.puuid)throw Error('Akari history requires a single query target');
    target=game.self.puuid;seen.add(game.id);
    const timeline=canonicalTimeline(timelines instanceof Map?timelines.get(game.id):timelines[game.id],game);
    rows.push({game,summary:canonicalSummary(game),timeline,metrics:metricDependencies(game)});
  }
  if(!rows.length)return null;
  rows.sort((a,b)=>(b.game.created??0)-(a.game.created??0)||b.game.id-a.game.id);
  const output=analyzeGames(rows.map(row=>({gameId:row.game.id,summary:row.summary,...(row.timeline?{details:row.timeline.details}:{})})),target);
  const availability=aggregateAvailability(output,rows);
  // Run all upstream aggregates before mutating the cached single results.
  for(const champion of Object.values(output.champions)){
    const championRows=rows.filter(row=>row.game.self.champion===champion.championId);
    champion.availability=aggregateAvailability(champion,championRows);
    gateJungle(champion.jungle,championRows);
  }
  gateJungle(output.jungle,rows);
  for(const row of rows){
    const single=output.map[row.game.id];
    for(const key of Object.keys(single.summary))if(row.metrics[key]===false)single.summary[key]=null;
    gateScore(single.akariScore,row.metrics);gateTimeline(single,row);
  }
  const detailed=rows.filter(row=>row.timeline);
  if(output.details&&detailed.some(row=>!row.timeline.availability.earlyDeaths))output.details.avgEarlyDeathsWithEnemyJunglerInvolved=null;
  output.availability={...availability,inputCount:Array.isArray(games)?games.length:0,includedCount:rows.length,excludedCount:(Array.isArray(games)?games.length:0)-rows.length,
    details:output.detailsCount,csSplit:false,conservative:true,
    timelines:Object.fromEntries(detailed.map(row=>[row.game.id,row.timeline.availability]))};
  return output;
}

/** Original analyzePlayers; absent measurements never enter the displayed team result as zero. */
export function analyzeAkariTeam(playerAnalyses){
  const players=(Array.isArray(playerAnalyses)?playerAnalyses:[]).filter(a=>a?.count>0&&a.summary&&a.winLoss?.all&&a.akariScore);
  if(!players.length)return null;
  const safe=players.map(a=>({...a,summary:{...a.summary,kills:a.summary.kills??0,deaths:a.summary.deaths??0,assists:a.summary.assists??0},akariScore:{...a.akariScore,total:a.akariScore.total??0}}));
  const output=analyzePlayers(safe);
  for(const key of ['kills','deaths','assists'])if(players.some(a=>!known(a.summary[key])))output[key]=null;
  if(['kills','deaths','assists'].some(key=>output[key]===null))output.avgKda=null;
  if(players.some(a=>!known(a.akariScore.total)))for(const key of ['avgAkariScore','akariScoreCv','akariScoreBsi'])output[key]=null;
  // Upstream standardize(equal scores) yields CV=-1 and BSI division by zero.
  if(output.akariScoreCv<0)output.akariScoreCv=null;
  for(const key of Object.keys(output))if(typeof output[key]==='number'&&!Number.isFinite(output[key]))output[key]=null;
  return output;
}

/** Historical pairwise minimum co-occurrence inference. Caller owns region/source scoping. */
export function inferHistoricalGroups(games,visiblePuuids,threshold=5){
  const visible=[...new Set(Array.from(visiblePuuids||[]).filter(validPuuid))];
  if(visible.length<2)return [];
  if(visible.length>16)throw Error('Historical group inference is limited to 16 visible players');
  if(!Number.isSafeInteger(threshold)||threshold<1)throw Error('Invalid historical group threshold');
  const seen=new Set(),matches=[];
  for(const game of Array.isArray(games)?games:[]){
    if(!game||!completeRoster(game)||!Number.isSafeInteger(game.id))continue;
    // The caller supplies a source/region-unique game key when combining server histories.
    const scope=typeof game.historyKey==='string'?game.historyKey:`${game.source||''}:${game.region||game.server||''}:${game.id}`;
    if(seen.has(scope))continue;seen.add(scope);
    const groups=new Map();
    for(const p of game.participants){
      if(!validPuuid(p.puuid)||!visible.includes(p.puuid))continue;
      const members=groups.get(p.team)||new Set();members.add(p.puuid);groups.set(p.team,members);
    }
    for(const members of groups.values())if(members.size>1)matches.push({id:scope,players:[...members]});
  }
  return calculateTogetherTimes(matches,visible,threshold);
}
