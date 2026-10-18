import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPublicStats,PUBLIC_STAT_FIELDS,PUBLIC_STAT_GROUPS,publicStatValue} from '../src/core/match-history/public-stats.mjs';
import {historyDamageComposition,historyComparisonView,historyRadarData} from '../src/match-history-comparison-view.mjs';
import {historyDetailTableView,historyPublicStatRows} from '../src/match-history-detail-table-view.mjs';
import {matchHistoryView,historyMatchSummaryView,historyMatchAkariScore} from '../src/match-history-view.mjs';
import {analyzeAkariHistory} from '../src/core/akari/bridge.mjs';

const data={champions:[{key:'22',id:'Ashe',name:'寒冰射手'},{key:'103',id:'Ahri',name:'九尾妖狐'}],items:{1001:{name:'鞋子'},3869:{name:'职责装备'}},spells:{4:{name:'闪现'},7:{name:'治疗术'}},runes:[{id:8000,name:'精密',slots:[{runes:[{id:8005,name:'强攻'}]}]},{id:8100,name:'主宰',slots:[]}],augments:[{id:100,name:'测试强化'}]};
const players=[
 {id:1,name:'<本人>',puuid:'fixture-public-player-1',champion:22,team:'TEAM-100',result:'loss',surrender:true,kills:3,deaths:2,assists:7,kda:5,kp:.5,cs:180,csPerMinute:6,damage:1000,physicalDamage:600,magicDamage:300,trueDamage:100,damageShare:.5,damageTaken:2000,physicalTaken:1000,magicTaken:800,trueTaken:200,gold:10000,heal:100,items:[1001,0],roleBoundItem:3869,spells:[4,7],styles:[{style:8000,selections:[{perk:8005}]},{style:8100,selections:[]}],runes:[8005],augments:[100]},
 {id:2,name:'队友',champion:103,team:'TEAM-100',result:'loss',kills:1,deaths:3,assists:4,kda:5/3,kp:.25,cs:100,damage:500,damageTaken:1500,gold:9000,heal:null,items:[]},
 {id:3,name:'对手',champion:103,team:'TEAM-200',result:'win',kills:4,deaths:1,assists:8,kda:12,kp:.8,cs:200,damage:2000,damageTaken:1000,gold:14000,heal:1000,items:[]}
];
const game={id:42,source:'lcu',created:1700000000000,version:'16.20',queue:420,duration:1800,participants:players,self:players[0],completeTeams:false,teams:[{key:'TEAM-100',result:'loss',kills:4,gold:19000,bans:[103],objectives:{baron:0,dragon:2,tower:null}},{key:'TEAM-200',result:'win',kills:4,gold:14000,bans:[],objectives:{}}]};
const state=(section='summary',open=true)=>({tabs:[{id:1,options:{},filter:{},page:{player:{name:'本人'},source:'lcu',games:[game],start:0,count:1},details:{42:{game,open,section}}}],current:1,servers:[],query:'',source:'auto',server:''});
test('historical numeric spell IDs resolve the bundled named spell images',()=>{
 const catalog={...data,spells:{SummonerFlash:{key:'4',name:'闪现'},SummonerHeal:{key:'7',name:'治疗术'}}};
 const html=matchHistoryView(state(),catalog);assert.match(html,/spell\/SummonerFlash\.png/);assert.match(html,/spell\/SummonerHeal\.png/);assert.doesNotMatch(html,/spell\/4\.png|spell\/7\.png/);
});

test('public stats whitelist retains exact LCU and flattened SGP values without arbitrary fields or coercion',()=>{
 const lcu=cleanPublicStats({stats:{kills:0,goldEarned:0,totalDamageDealtToChampions:10,physicalDamageTaken:250,magicDamageTaken:null,magicalDamageTaken:30,gameEndedInSurrender:false,visionScore:'99',totalHeal:NaN,puuid:'private-id',token:'credential',arbitraryMetric:1,missions:{progress:3}}});
 assert.equal(lcu.kills,0);assert.equal(lcu.visionScore,null);assert.equal(lcu.totalHeal,null);assert.equal(lcu.gameEndedInSurrender,false);assert.equal(lcu.damageGoldEfficiency,null);assert.equal(lcu.magicDamageTaken,null);assert.equal(lcu.magicalDamageTaken,30);
 assert.deepEqual(Object.keys(lcu),Object.keys(PUBLIC_STAT_FIELDS));assert.ok(Object.keys(lcu).length>200);
 assert.ok(!JSON.stringify(lcu).includes('credential'));assert.equal(Object.hasOwn(lcu,'puuid'),false);assert.equal(Object.hasOwn(lcu,'arbitraryMetric'),false);assert.equal(Object.hasOwn(lcu,'missions'),false);
 const sgp=cleanPublicStats({kills:4,goldEarned:100,totalDamageDealtToChampions:200,challenges:{soloKills:2,visionScoreAdvantageLaneOpponent:-.25,damagePerMinute:123.5,randomSecret:'secret'},PlayerBehavior:{hadAfkTeammate:true,PlayerBehavior_IsHeroInCombat:false},gameEndedInSurrender:1},'sgp');
 assert.equal(sgp.soloKills,2);assert.equal(sgp.visionScoreAdvantageLaneOpponent,-.25);assert.equal(sgp.damagePerMinute,123.5);assert.equal(sgp.hadAfkTeammate,true);assert.equal(sgp.PlayerBehavior_IsHeroInCombat,false);assert.equal(sgp.gameEndedInSurrender,null);assert.equal(sgp.damageGoldEfficiency,2);assert.equal(sgp.damageDealtToBuildings,null);
 assert.equal(PUBLIC_STAT_GROUPS.flatMap(g=>g.fields).length,Object.keys(PUBLIC_STAT_FIELDS).length);
 const inherited=cleanPublicStats({stats:Object.create({kills:123})});assert.equal(inherited.kills,null);
 const malicious=cleanPublicStats({kills:Infinity,challenges:{kills:{value:9}},PlayerBehavior:{hadAfkTeammate:'true'}},'sgp');assert.equal(malicious.kills,null);assert.equal(malicious.hadAfkTeammate,null);
 const flags=cleanPublicStats({challenges:{highestChampionDamage:1,hadOpenNexus:0},PlayerBehavior:{PlayerBehavior_IsHeroInCombat:1}},'sgp');assert.equal(flags.highestChampionDamage,1);assert.equal(flags.hadOpenNexus,0);assert.equal(flags.PlayerBehavior_IsHeroInCombat,1);
 const conflict=cleanPublicStats({soloKills:1,challenges:{soloKills:3},PlayerBehavior:{soloKills:2}},'sgp');assert.equal(conflict.soloKills,3);
 assert.equal(cleanPublicStats({stats:{totalDamageDealtToChampions:1e12,goldEarned:1e-300}}).damageGoldEfficiency,null);assert.equal(publicStatValue({damage:1e12,gold:1e-300},'damageGoldEfficiency'),null);
});
test('recent summary continues using the existing complete-analysis summary contract',()=>{
 const current=state('summary',false);current.tabs[0].page.fullAnalysis={count:1,summary:{avgKda:7.25,avgKillParticipation:.37,avgChampionDamagePercentageOfTeam:.42,avgCsPerMinute:8.5},akariScore:{total:9.75}};
 const html=matchHistoryView(current,data);for(const value of ['7.25','37%','42%','8.5','9.75 / 17'])assert.match(html,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
test('match scores use original Akari single-game engine results and respect cached unknown scores',()=>{
 const participants=Array.from({length:10},(_,index)=>({...players[0],id:index+1,puuid:'synthetic_player_'+String(index+1).padStart(5,'0'),team:index<5?'TEAM-100':'TEAM-200',teamId:index<5?100:200,result:index<5?'win':'loss',position:['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'][index%5],kills:index+1,deaths:2,assists:3,damage:10000+index*1000,damageTaken:12000+index*100,gold:10000+index*100,cs:120+index,vision:20+index,heal:1000,shield:200,level:15,soloKills:2,towerDamage:1000,cc:10}));
 const complete={...game,gameType:'MATCHED_GAME',mode:'CLASSIC',queue:420,map:11,pve:false,completeTeams:true,participants,self:participants[0]},full=analyzeAkariHistory([complete]);
 assert.ok(Number.isFinite(full.map[42].akariScore.total));assert.deepEqual(historyMatchAkariScore(complete),full.map[42].akariScore);
 const cached={...full,map:{42:{akariScore:{total:12.345}}}};assert.equal(historyMatchAkariScore(complete,cached).total,12.345);assert.equal(historyMatchAkariScore(complete,{map:{42:{akariScore:{total:null}}}}),null);
 const current=state('summary',false);current.tabs[0].page.games=[complete];current.tabs[0].page.fullAnalysis=cached;assert.match(matchHistoryView(current,data),/Akari 12.35 \/ 17/);
 assert.equal(historyMatchAkariScore(game),null);assert.equal(historyMatchAkariScore({id:1}),null);
});
test('relationship records show ally and enemy win/loss from our perspective without counting remakes as losses',()=>{
 const current=state('summary',false),participants=players.map((p,index)=>({...p,puuid:'fixture-public-player-'+(index+1)})),base={...game,participants,self:participants[0]},outcome=(id,result)=>({...base,id,self:{...base.self,result}});
 current.tabs[0].page.games=[outcome(1,'win'),outcome(2,'loss'),outcome(3,'remake'),outcome(4,'unknown')];
 const html=matchHistoryView(current,data);assert.match(html,/同队 4 局 · 我方 1 胜 \/ 1 负 · 其他 2 局/);assert.match(html,/对手 4 局 · 我方 1 胜 \/ 1 负 · 其他 2 局/);assert.doesNotMatch(html,/我方 1 胜 \/ 3 负/);
});

test('overview includes recorded spells, keystone/styles, augments, role item and surrender with six expandable tabs',()=>{
 const html=matchHistoryView(state(),data);
 for(const text of ['闪现','治疗术','强攻','精密','主宰','测试强化','职责装备','失败 · 投降'])assert.match(html,new RegExp(text));
 assert.match(html,/data-history-match="42"/);assert.match(html,/class="history-details"/);assert.match(html,/aria-expanded="true"/);assert.match(html,/class="history-player"/);assert.match(html,/data-history-role-item="3869"/);
 for(const section of ['summary','stats','runes','builds','events','timeline'])assert.match(html,new RegExp(`data-section="${section}"`));
 assert.equal((html.match(/role="tab" aria-selected="(?:true|false)" data-id="42"/g)||[]).length,6);
 assert.doesNotMatch(html,/<本人>|NaN|undefined|Infinity/);
 const collapsed=matchHistoryView(state('summary',false),data);assert.doesNotMatch(collapsed,/class="history-details"/);assert.match(collapsed,/aria-expanded="false"/);
 const sparse={...players[0],styles:[{style:8000,selections:[{perk:null},{perk:8005}]}],runes:[8005]};
 const sparseGame={...game,self:sparse,participants:[sparse],teams:[game.teams[0]]};
 assert.doesNotMatch(historyMatchSummaryView(data,{game:sparseGame}),/alt="强攻"/);
});

test('summary displays actual team bans and known zero objectives while missing objective counts stay unknown',()=>{
 const html=historyMatchSummaryView(data,{game});
 assert.match(html,/data-history-ban="103"/);assert.match(html,/九尾妖狐/);assert.match(html,/data-history-objective="baron">大龙 0/);assert.match(html,/data-history-objective="dragon">小龙 2/);assert.match(html,/data-history-objective="tower">防御塔 未读取/);assert.match(html,/禁用记录未提供/);
 const composition=historyDamageComposition(players[0]);assert.match(composition,/width="96"/);assert.match(composition,/物理 600/);assert.match(composition,/魔法 300/);assert.match(composition,/真实 100/);
 const taken=historyDamageComposition(players[0],'taken');assert.match(taken,/承伤构成/);assert.match(taken,/width="80"/);
 const partial=historyDamageComposition({...players[0],magicDamage:null});assert.match(partial,/魔法 未读取/);assert.match(partial,/未完整读取/);assert.doesNotMatch(partial,/<rect|<svg/);
 const zero=historyDamageComposition({physicalDamage:0,magicDamage:0,trueDamage:0});assert.match(zero,/真实 0/);assert.doesNotMatch(zero,/NaN|Infinity/);
});

test('radar compares loaded participants and computes team means only from complete measurements',()=>{
 const radar=historyRadarData(game,1,'');assert.equal(radar.loaded,3);assert.equal(radar.teamCount,2);
 const damage=radar.axes.find(a=>a.key==='damage');assert.equal(damage.max,2000);assert.equal(damage.playerRatio,.5);assert.equal(damage.comparison,750);assert.equal(damage.comparisonRatio,.375);
 const heal=radar.axes.find(a=>a.key==='heal');assert.equal(heal.comparison,null);assert.equal(heal.comparisonRatio,null);
 const versus=historyRadarData(game,1,3);assert.equal(versus.axes.find(a=>a.key==='damage').comparisonRatio,1);
 const html=historyComparisonView({game,radarPlayer:1,radarCompare:3});assert.match(html,/data-chart-field="radarPlayer"/);assert.match(html,/data-chart-field="radarCompare"/);assert.match(html,/value="3" selected/);assert.match(html,/已加载的 3 名玩家/);assert.match(html,/阵容尚未完整读取/);assert.match(html,/data-radar-series="compare"/);assert.doesNotMatch(html,/NaN|undefined|Infinity/);
 const absent=historyComparisonView({game:{...game,participants:[{id:1,name:'无数据',team:'TEAM-100'}],self:null}});assert.match(absent,/未读取/);assert.doesNotMatch(absent,/<circle|NaN|Infinity/);
 const unknownTeam=historyRadarData({participants:[{id:1,damage:20},{id:2,damage:10}],self:{id:99,damage:999}},1,'');assert.equal(unknownTeam.teamCount,0);assert.equal(unknownTeam.axes[0].comparison,null);assert.equal(unknownTeam.player.id,1);
});

test('raw all-player matrix uses the union of known fields, searches labels and keys, and preserves unknowns',()=>{
 const extended={...game,participants:[{...players[0],publicStats:cleanPublicStats({stats:{kills:0,magicDamageTaken:null,goldEarned:0}})},{...players[1],publicStats:cleanPublicStats({challenges:{skillshotsDodged:0,visionScoreAdvantageLaneOpponent:-.5},PlayerBehavior:{hadAfkTeammate:false}},'sgp')}]};
 const groups=historyPublicStatRows(extended),keys=groups.flatMap(g=>g.rows.map(row=>row.key));assert.ok(keys.includes('skillshotsDodged'));assert.ok(keys.includes('hadAfkTeammate'));assert.ok(!keys.includes('damageDealtToEpicMonsters'));
 assert.deepEqual(historyPublicStatRows(extended,{query:'skillshotsDodged'}).flatMap(g=>g.rows.map(r=>r.key)),['skillshotsDodged']);
 for(const key of Object.keys(PUBLIC_STAT_FIELDS))assert.ok(historyPublicStatRows(extended,{query:key}).some(g=>g.rows.some(row=>row.key===key)),key);
 assert.deepEqual(historyPublicStatRows(extended,{query:'生存 躲避'}).flatMap(g=>g.rows.map(r=>r.key)),['skillshotsDodged','dodgeSkillShotsSmallWindow']);
 const html=historyDetailTableView({game:extended,rawStatsQuery:'skillshotsDodged'},data);assert.match(html,/data-chart-field="rawStatsQuery"/);assert.match(html,/data-chart-field="rawStatsGroup"/);assert.match(html,/data-chart-field="rawStatsMetric"/);assert.match(html,/data-public-player="1"/);assert.match(html,/data-public-player="2"/);assert.match(html,/data-public-value-player="1">未读取/);assert.match(html,/data-public-value-player="2">0/);assert.match(html,/data-public-stat-player="2"/);assert.doesNotMatch(html,/data-public-stat-player="1"/);
 const missing=historyDetailTableView({game:extended,rawStatsQuery:'damageDealtToEpicMonsters'},data);assert.match(missing,/史诗野怪伤害/);assert.match(missing,/未读取/);assert.doesNotMatch(missing,/<rect/);
 const negative=historyDetailTableView({game:extended,rawStatsMetric:'visionScoreAdvantageLaneOpponent',rawStatsGroup:'vision'},data);assert.match(negative,/-50%/);assert.match(negative,/data-public-stat-player="2"/);assert.doesNotMatch(negative,/width="-/);
 const noResult=historyDetailTableView({game:extended,rawStatsQuery:'<script>bad</script>'},data);assert.match(noResult,/没有匹配的公开统计字段/);assert.doesNotMatch(noResult,/<script>|undefined|NaN|Infinity/);
 const statsTab=matchHistoryView(state('stats'),data);assert.match(statsTab,/history-public-matrix/);assert.match(statsTab,/全玩家详细数据/);
 assert.equal(publicStatValue(players[0],'__proto__'),null);assert.equal(publicStatValue({publicStats:{magicalDamageTaken:12}},'magicDamageTaken'),null);
});
