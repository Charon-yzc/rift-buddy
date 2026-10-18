import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeAkariMatch,analyzeAkariHistory,analyzeAkariTeam,inferHistoricalGroups,findOutliersByIqr} from '../src/core/akari/bridge.mjs';
import {analyzeGames,analyzePlayers} from '../src/core/akari/engine.mjs';
import {normalizeTimeline} from '../src/core/match-history/model.mjs';

const puuid=id=>`synthetic_player_${String(id).padStart(5,'0')}`;
const positions=['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'];
const pingKeys=['allInPings','assistMePings','basicPings','commandPings','dangerPings','enemyMissingPings','enemyVisionPings','getBackPings','holdPings','needVisionPings','onMyWayPings','pushPings','retreatPings','visionClearedPings'];
function rawGame(id=1,{arena=false,placement=1,created=1700000000000}={}){
  const count=arena?8:10;
  return {json:{gameId:id,gameCreation:created,gameDuration:1200,gameVersion:'synthetic',gameType:'MATCHED_GAME',queueId:arena?1700:420,gameMode:arena?'CHERRY':'CLASSIC',mapId:arena?30:11,participants:Array.from({length:count},(_,index)=>{
    const n=index+1;
    return {participantId:n,puuid:puuid(n),teamId:index<5?100:200,championId:n===1?22:n+30,teamPosition:positions[index%5],playerSubteamId:arena?Math.floor(index/2)+1:0,subteamPlacement:arena?(index<2?placement:Math.floor(index/2)+1):0,
      spell1Id:4,spell2Id:index%5===1?11:7,champLevel:15,kills:n,deaths:2,assists:3,totalMinionsKilled:100+n,neutralMinionsKilled:20,goldEarned:10000+n*100,goldSpent:9000,totalDamageDealtToChampions:10000+n*1000,physicalDamageDealtToChampions:6000,magicDamageDealtToChampions:3000,trueDamageDealtToChampions:1000,totalDamageTaken:12000+n*100,physicalDamageTaken:7000,magicDamageTaken:4000,trueDamageTaken:1000,totalHeal:1000,visionScore:20+n,timeCCingOthers:10,damageDealtToTurrets:1000+n*100,totalDamageShieldedOnTeammates:200+n,win:index<5,gameEndedInEarlySurrender:false,gameEndedInSurrender:false,teamEarlySurrendered:false,
      challenges:{soloKills:2,effectiveHealAndShielding:400,knockEnemyIntoTeamAndKill:0,killsNearEnemyTurret:1,killsUnderOwnTurret:1,earliestDragonTakedown:300,maxCsAdvantageOnLaneOpponent:20},...Object.fromEntries(pingKeys.map((key,i)=>[key,i])),
      doubleKills:1,tripleKills:0,quadraKills:0,pentaKills:0,perks:{styles:[],statPerks:{offense:5008,flex:5008,defense:5001}}
    };
  })}};
}
const normalized=(raw,target=1)=>normalizeAkariMatch(raw,'sgp',puuid(target));
const direct=raws=>analyzeGames(raws.map(raw=>({gameId:raw.json.gameId,summary:{source:'sgp',data:raw}})),puuid(1));
function rawTimeline(events=[]){
  return {json:{frames:Array.from({length:21},(_,minute)=>({timestamp:minute*60000,participantFrames:Object.fromEntries(Array.from({length:10},(_,index)=>{
    const id=index+1;return [id,{participantId:id,position:{x:minute%2?3900:7000,y:minute%2?11000:7000},level:minute===3?3:4,minionsKilled:minute===3?6:10,jungleMinionsKilled:minute===3?10:20,damageStats:{totalDamageDoneToChampions:minute*10},championStats:{}}];
  })),events:events.filter(event=>Math.ceil(event.timestamp/60000)===minute)}))}};
}

test('complete synthetic history matches the original summary, scores, champions, flash and all win/loss aggregates',()=>{
  const first=rawGame(10,{created:1700000100000}),second=rawGame(9);
  second.json.participants[0].kills=8;second.json.participants[0].deaths=4;second.json.participants[0].spell1Id=7;second.json.participants[0].spell2Id=4;second.json.participants[0].teamPosition='MIDDLE';second.json.participants[0].win=false;
  const expected=direct([first,second]),actual=analyzeAkariHistory([normalized(second),normalized(first)]);
  for(const key of ['count','summary','akariScore','spells','positions','winLoss','teamSide','details','detailsCount','map','jungle'])assert.deepEqual(actual[key],expected[key],key);
  for(const [id,champion] of Object.entries(expected.champions))for(const key of Object.keys(champion))assert.deepEqual(actual.champions[id][key],champion[key],`champion ${id} ${key}`);
  assert.equal(actual.spells.flashOnD,1);assert.equal(actual.spells.flashOnF,1);
  assert.equal(actual.positions.TOP,1);assert.equal(actual.champions[22].positions.MIDDLE,1);
  assert.equal(actual.summary.kdaCv,0.15789473684210525);
});

test('normalization retains only measured whitelisted challenge and ping fields, with no raw credentials',()=>{
  const raw=rawGame();raw.accessToken='secret';raw.json.participants[0].password='secret';raw.json.participants[0].challenges.secret='secret';
  delete raw.json.participants[0].enemyMissingPings;delete raw.json.participants[0].challenges.soloKills;
  const game=normalized(raw);
  assert.equal(game.self.pings.enemyMissingPings,null);assert.equal(game.self.soloKills,null);
  assert.equal(game.self.challenges.effectiveHealAndShielding,400);
  assert.equal(JSON.stringify(game).includes('secret'),false);
  assert.equal(game.self,game.participants[0]);
  const analysis=analyzeAkariHistory([game]);
  assert.equal(analysis.summary.avgPings,null);assert.equal(analysis.summary.avgEnemyMissingPings,null);assert.equal(analysis.summary.avgSoloKills,null);
  assert.equal(analysis.availability.summary.avgPings,0);
});

test('missing measurements null affected single, aggregate, champion and team metrics while real zero remains zero',()=>{
  const raw=rawGame();delete raw.json.participants[1].totalDamageDealtToChampions;
  delete raw.json.participants[0].visionScore;raw.json.participants[0].kills=0;
  const actual=analyzeAkariHistory([normalized(raw)]);
  assert.equal(actual.summary.kills,0);
  assert.equal(actual.summary.avgChampionDamagePercentageOfTeam,null);
  assert.equal(actual.summary.avgChampionDamagePerMinute,550);
  assert.equal(actual.summary.avgVisionScore,null);
  assert.equal(actual.map[1].summary.championDamageRatioToTeamMax,null);
  assert.equal(actual.map[1].summary.visionScorePercentageOfTeam,null);
  assert.equal(actual.akariScore.total,null);assert.equal(actual.champions[22].akariScore.total,null);
  assert.equal(actual.availability.summary.avgChampionDamagePerMinute,1);
  assert.equal(analyzeAkariTeam([actual]).avgAkariScore,null);
});

test('LCU augmentation supports real optional fields without inventing unavailable ones',()=>{
  const sgp=rawGame(),raw={...sgp.json,participants:sgp.json.participants.map(p=>({participantId:p.participantId,teamId:p.teamId,championId:p.championId,spell1Id:p.spell1Id,spell2Id:p.spell2Id,stats:{...p,magicalDamageTaken:321,magicDamageTaken:undefined}})),participantIdentities:sgp.json.participants.map(p=>({participantId:p.participantId,player:{puuid:p.puuid}}))};
  const game=normalizeAkariMatch(raw,'lcu',puuid(1));
  assert.equal(game.self.magicTaken,321);assert.equal(game.self.soloKills,2);assert.equal(game.self.pings.allInPings,0);
  delete raw.participants[0].stats.challenges;for(const key of pingKeys)delete raw.participants[0].stats[key];
  const incomplete=normalizeAkariMatch(raw,'lcu',puuid(1));assert.equal(incomplete.self.pings,null);assert.equal(incomplete.self.soloKills,null);
});

test('invalid self, unknown results, incomplete teams, remakes and PVE are excluded; duplicates count once',()=>{
  const good=normalized(rawGame()),unknown=structuredClone(good),missing=structuredClone(good),incomplete=structuredClone(good),remake=structuredClone(good),pve=structuredClone(good);
  unknown.id=2;unknown.self.result='unknown';missing.id=3;missing.self=null;incomplete.id=4;incomplete.participants.pop();remake.id=5;remake.self.result='remake';pve.id=6;pve.pve=true;
  const actual=analyzeAkariHistory([good,good,unknown,missing,incomplete,remake,pve]);
  assert.equal(actual.count,1);assert.equal(actual.availability.excludedCount,6);
  assert.equal(analyzeAkariHistory([unknown,missing,incomplete,remake,pve]),null);
  const other=normalized(rawGame(7),2);assert.throws(()=>analyzeAkariHistory([good,other]),/single query target/);
});

test('Arena top-half wins and champion aggregates preserve original semantics and own subteam grouping',()=>{
  const raw=rawGame(1,{arena:true,placement:2}),game=normalized(raw);
  assert.equal(game.self.result,'win');
  const actual=analyzeAkariHistory([game]);
  assert.equal(actual.winLoss.all.wins,1);assert.equal(actual.winLoss.normal.count,0);
  assert.equal(actual.winLoss.cherry.topHalfFinishes,1);assert.equal(actual.winLoss.cherry.avgSubteamPlacement,2);
  assert.equal(actual.map[1].summary.teamParticipantCount,2);
  assert.equal(actual.teamSide.blueSideCount,null);
  const groups=inferHistoricalGroups(Array.from({length:5},(_,i)=>normalized(rawGame(i+1,{arena:true}))),[puuid(1),puuid(2),puuid(3)]);
  assert.deepEqual(groups.map(group=>group.players),[[puuid(1),puuid(2)]]);
  assert.equal(groups[0].times,5);
});

test('timeline early deaths and exact original jungle aggregates operate on normalized total CS',()=>{
  const raw=rawGame(),events=[{type:'CHAMPION_KILL',timestamp:170000,killerId:7,victimId:1,assistingParticipantIds:[],position:{x:3900,y:11000}},{type:'CHAMPION_KILL',timestamp:200000,killerId:2,victimId:8,assistingParticipantIds:[],position:{x:3900,y:11000}},{type:'ELITE_MONSTER_KILL',timestamp:300000,killerId:2,killerTeamId:100,assistingParticipantIds:[],monsterType:'DRAGON'}];
  const timeline=rawTimeline(events),normalizedTimeline=normalizeTimeline(timeline,'sgp');
  const laner=analyzeAkariHistory([normalized(raw)],{timelines:{1:normalizedTimeline}});
  assert.equal(laner.details.avgEarlyDeathsWithEnemyJunglerInvolved,1);
  const actual=analyzeAkariHistory([normalized(raw,2)],{timelines:{1:normalizedTimeline}});
  const expected=analyzeGames([{gameId:1,summary:{source:'sgp',data:raw},details:{source:'sgp',data:timeline}}],puuid(2));
  assert.deepEqual(actual.jungle,expected.jungle);assert.deepEqual(actual.map[1].details,expected.map[1].details);
  assert.equal(actual.jungle.objectives.avgDragons,1);assert.equal(actual.jungle.earlyGank.level3GankCount,1);
  assert.equal(actual.availability.csSplit,false);
});

test('objective ownership uses roster team IDs rather than participant-ID ranges; unknown owners remain unavailable',()=>{
  const raw=rawGame();[raw.json.participants[1].participantId,raw.json.participants[6].participantId]=[7,2];
  const timeline=normalizeTimeline(rawTimeline([{type:'ELITE_MONSTER_KILL',timestamp:300000,killerId:7,assistingParticipantIds:[],monsterType:'DRAGON'}]),'sgp');
  let actual=analyzeAkariHistory([normalized(raw)],{timelines:{1:timeline}});
  assert.equal(actual.map[1].details.objectives.dragons,1);
  timeline.events[0].killerId=0;
  actual=analyzeAkariHistory([normalized(raw)],{timelines:{1:timeline}});
  assert.equal(actual.map[1].details.objectives.dragons,null);
  assert.equal(actual.availability.timelines[1].objectives,false);
});

test('incomplete timelines and missing event positions produce unknowns, never zero-valued claims',()=>{
  const raw=rawGame(),timeline=normalizeTimeline(rawTimeline([{type:'CHAMPION_KILL',timestamp:200000,killerId:2,victimId:8,assistingParticipantIds:[]}]),'sgp');
  const actual=analyzeAkariHistory([normalized(raw,2)],{timelines:{1:timeline}});
  assert.equal(actual.map[1].details.jungle.topGanks,null);assert.equal(actual.jungle.totalTopGanks,null);
  assert.equal(actual.jungle.earlyGank.level3GankRate,null);
  const short={frames:timeline.frames.slice(0,2),events:[]};
  const incomplete=analyzeAkariHistory([normalized(raw)],{timelines:{1:short}});
  assert.equal(incomplete.map[1].details.objectives.dragons,null);assert.equal(incomplete.details.avgEarlyDeathsWithEnemyJunglerInvolved,null);
});

test('team analysis and IQR utility preserve original results when measured inputs are complete',()=>{
  const a=analyzeAkariHistory([normalized(rawGame())]),raw=rawGame(2);raw.json.participants[0].kills=10;
  const b=analyzeAkariHistory([normalized(raw)]);
  assert.deepEqual(analyzeAkariTeam([a,b]),analyzePlayers([a,b]));
  assert.deepEqual(findOutliersByIqr([1,2,2,3,100]),{below:[],over:[100]});
  assert.equal(analyzeAkariTeam([]),null);
  const same=analyzeAkariTeam([a,a]);assert.equal(same.akariScoreBsi,null);assert.equal(same.akariScoreCv,null);
});

test('historical groups deduplicate shared histories and keep caller source/region scopes unique',()=>{
  const games=Array.from({length:5},(_,i)=>normalized(rawGame(i+1)));
  const result=inferHistoricalGroups([...games,...games],[puuid(1),puuid(2)]);
  assert.equal(result[0].times,5);assert.equal(result[0].ids.length,5);
  assert.deepEqual(inferHistoricalGroups(games,[puuid(1),puuid(6)]),[]);
  const regions=['one','two','three','four','five'].map(server=>({...normalized(rawGame(1)),server}));
  assert.equal(inferHistoricalGroups(regions,[puuid(1),puuid(2)])[0].times,5);
  assert.throws(()=>inferHistoricalGroups([],Array.from({length:17},(_,i)=>puuid(i))),/16 visible/);
});

test('missing timing and zero-mean KDA do not produce fabricated current-session or CV measurements',()=>{
  const raw=rawGame();delete raw.json.gameCreation;
  raw.json.participants[0].kills=0;raw.json.participants[0].assists=0;
  const actual=analyzeAkariHistory([normalized(raw)]);
  assert.equal(actual.summary.kdaCv,null);assert.equal(actual.summary.avgKda,0);
  assert.equal(actual.winLoss.all.activeSessionWins,null);assert.equal(actual.winLoss.all.activeSessionLosses,null);
});
test('omitted event and assist arrays remain unavailable instead of zero deaths or a solo dragon',()=>{
 const raw=rawGame(),source=rawTimeline();for(const frame of source.json.frames)delete frame.events;const timeline=normalizeTimeline(source,'sgp'),value=analyzeAkariHistory([normalized(raw)],{timelines:{1:timeline}});assert.equal(value.map[1].details.objectives.dragons,null);assert.equal(value.details.avgEarlyDeathsWithEnemyJunglerInvolved,null);
 const dragon=normalizeTimeline(rawTimeline([{type:'ELITE_MONSTER_KILL',timestamp:300000,killerId:1,killerTeamId:100,monsterType:'DRAGON'}]),'sgp');const withDragon=analyzeAkariHistory([normalized(raw)],{timelines:{1:dragon}});assert.equal(withDragon.map[1].details.objectives.soloDragons,null);
});

test('vendored runtime is self-contained ESM and carries the full license and immutable source hashes',async()=>{
  const base=new URL('../src/core/akari/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8')),engine=await readFile(new URL('engine.mjs',base)),license=await readFile(new URL('LICENSE.akari.txt',base),'utf8');
  assert.equal(createHash('sha256').update(engine).digest('hex'),manifest.engineSha256);
  assert.equal(manifest.commit,'60f1584c3d3e45b2bb183aefcc615d35d7cffcb8');
  assert.ok(engine.toString().includes(license.trim()));assert.ok(manifest.sources.length>=30);
  assert.ok(manifest.sources.every(source=>/^[a-f0-9]{64}$/.test(source.sha256)));
  assert.doesNotMatch(engine.toString(),/^import\s/m);
  assert.doesNotMatch(engine.toString(),/event\.killerId >= 1 && event\.killerId <= 5/);
});
