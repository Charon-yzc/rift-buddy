import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMatch,normalizeTimeline,filterMatches} from '../src/core/match-history/model.mjs';
import {analyzeMatches} from '../src/core/match-history/analysis.mjs';

export function game(id=1,extra={}){return {gameId:id,gameCreation:1700000000000,gameDuration:1200,gameVersion:'16.20',gameType:'MATCHED_GAME',queueId:420,gameMode:'CLASSIC',mapId:11,
 participantIdentities:[{participantId:1,player:{puuid:'mock-public-player-1',gameName:'示例',tagLine:'CN1'}}],
 participants:[{participantId:1,championId:22,teamId:100,spell1Id:4,spell2Id:7,stats:{kills:4,deaths:0,assists:8,win:true,totalMinionsKilled:100,neutralMinionsKilled:20,item0:3006,perk0:8005,perkPrimaryStyle:8000,perkSubStyle:8100}}],teams:[],...extra};}
test('LCU history retains real zeroes, unknown metrics and explicit participant identity',()=>{
 const m=normalizeMatch(game(),'lcu','mock-public-player-1');
 assert.equal(m.self.kda,12);assert.equal(m.self.cs,120);assert.equal(m.self.damage,null);assert.equal(m.self.deaths,0);assert.equal(m.self.name,'示例#CN1');assert.equal(m.self.items[0],3006);
 assert.equal(normalizeMatch(game(),'lcu','another-player-id').self,null);
 assert.equal(JSON.stringify(m).includes('NaN'),false);
});
test('SGP arena participants group by subteam and preserve augments and perks',()=>{
 const m=normalizeMatch({json:{...game(),gameMode:'CHERRY',queueId:1700,participants:[{participantId:1,puuid:'mock-public-player-1',riotIdGameName:'示例',riotIdTagline:'CN1',championId:22,teamId:100,playerSubteamId:3,subteamPlacement:2,kills:3,deaths:1,assists:4,win:true,playerAugment1:123,perks:{styles:[{style:8000,selections:[{perk:8005}]}]}}]}},'sgp','mock-public-player-1');
 assert.equal(m.self.team,'CHERRY-3');assert.equal(m.self.placement,2);assert.equal(m.self.augments[0],123);assert.equal(m.self.runes[0],8005);
});
test('remakes and aborts do not count as losses and filters use actual loaded values',()=>{
 const won=normalizeMatch(game(),'lcu','mock-public-player-1'),remade=normalizeMatch(game(2,{endOfGameResult:'Abort_Unexpected'}),'lcu','mock-public-player-1');
 const a=analyzeMatches([won,remade]);assert.equal(a.count,1);assert.equal(a.wins,1);assert.equal(a.losses,0);assert.equal(a.winRate,1);
 assert.equal(filterMatches([won,remade],{result:'win'}).length,1);assert.equal(filterMatches([won],{champion:99}).length,0);
});
test('timeline strips unrelated fields but retains purchases, skill upgrades and per-minute values',()=>{
 const t=normalizeTimeline({frames:[{timestamp:60000,participantFrames:{1:{participantId:1,totalGold:800,minionsKilled:12,position:{x:100,y:200},secret:'omit'}},events:[{type:'ITEM_PURCHASED',timestamp:60000,participantId:1,itemId:1001,token:'omit'},{type:'SKILL_LEVEL_UP',timestamp:60001,participantId:1,skillSlot:2}]}]},'lcu');
 assert.equal(t.frames[0].players[0].gold,800);assert.equal(t.events[1].skillSlot,2);assert.equal(JSON.stringify(t).includes('omit'),false);
});
test('Arena wins use the top half placement rather than the first-place backend win flag',()=>{
 const players=Array.from({length:8},(_,i)=>({participantId:i+1,puuid:'mock-arena-player-'+(i+1),championId:22,playerSubteamId:i+1,subteamPlacement:i+1,win:i===0,kills:1,deaths:1,assists:1}));
 const m=normalizeMatch({json:{...game(),gameMode:'CHERRY',participants:players}},'sgp','mock-arena-player-2');
 assert.equal(m.self.result,'win');assert.equal(m.participants[7].result,'loss');
});
test('incomplete summary teams cannot fabricate participation, damage share or Akari ratings',()=>{
 const m=normalizeMatch(game(),'lcu','mock-public-player-1');assert.equal(m.self.kp,null);assert.equal(m.self.damageShare,null);assert.equal(m.completeTeams,false);assert.equal(analyzeMatches([m]).score,null);
});
test('three-player Arena requires three participants in every subteam for complete statistics',()=>{
 const participants=Array.from({length:18},(_,i)=>({participantId:i+1,puuid:'mock-arena-player-'+(i+1),championId:22,playerSubteamId:Math.floor(i/3)+1,subteamPlacement:Math.floor(i/3)+1,win:i<3,kills:2,deaths:1,assists:1}));
 const m=normalizeMatch({json:{...game(),queueId:1750,gameMode:'CHERRY',participants}},'sgp','mock-arena-player-2');assert.equal(m.completeTeams,true);assert.equal(m.self.kp,0.5);
 participants[2]={...participants[2],playerSubteamId:2};assert.equal(normalizeMatch({json:{...game(),queueId:1750,gameMode:'CHERRY',participants}},'sgp').completeTeams,false);
});
