import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ongoingGameView} from '../src/ongoing-game-view.mjs';
import {ongoingGameAnalysisView,ongoingTeamAnalysisView} from '../src/ongoing-game-analysis-view.mjs';
import {ongoingJungleView} from '../src/ongoing-game-jungle-view.mjs';

const data={champions:[{id:'Ashe',key:'22',name:'艾希',icon:''},{id:'Lux',key:'99',name:'拉克丝',icon:''}],spells:{4:{name:'闪现'},11:{name:'惩戒'}}};
const player=(key='p1',team='TEAM-100')=>({key,puuid:`public-player-${key}`,name:`名字-${key}#CN`,team,champion:22,locked:true,position:'BOTTOM',spells:[4,7],self:key==='p1'});
const analysis=()=>({count:20,detailsCount:5,summary:{avgKda:3.6,avgSoloKills:null,avgEnemyMissingPings:null,avgChampionDamagePercentageOfTeam:.25,avgKillDamageEfficiency:1,avgCsPerMinute:7,kills:100,deaths:50,assists:80},details:null,winLoss:{all:{count:20,wins:12,losses:8,winRate:.6,winningStreak:0,losingStreak:0},normal:{count:20,wins:12,losses:8,winRate:.6},cherry:{count:0}},akariScore:null,spells:{flashOnD:10,flashOnF:0},teamSide:{blueSideCount:12,redSideCount:8},positions:{BOTTOM:18,UTILITY:2},champions:{22:{championId:22,summary:{avgKda:3.5},winLoss:{all:{count:18,wins:11,losses:7,winRate:11/18}}}},jungle:null});
const game=id=>({id,queue:420,created:1720000000000+id,duration:1800,self:{champion:22,result:id%2?'win':'loss',kills:6,deaths:2,assists:9}});
function state(members=[player()]){return {roster:{phase:'champ-select',queue:420,mode:'CLASSIC',players:members,teams:Object.fromEntries([...new Set(members.map(p=>p.team))].map(team=>[team,members.filter(p=>p.team===team).map(p=>p.key)]))},players:Object.fromEntries(members.map(p=>[p.key,{page:{games:[game(123)]},profile:{ranked:[{queue:'RANKED_SOLO_5x5',tier:'EMERALD',division:'II',lp:34,wins:30,losses:20}],mastery:[]},analysis:analysis()}])),settings:{},notes:{},met:{},groups:[],teamAnalysis:{}};}
const card=html=>html.match(/<article class="ongoing-player-card[\s\S]*?<\/article>/)?.[0]||'';
const tag=(html,id)=>card(html).includes(`data-ongoing-tag-id="${id}"`);
test('live numeric spell IDs use the offline named catalog images and labels',()=>{
 const html=ongoingGameView(state(),{...data,spells:{SummonerFlash:{key:'4',name:'闪现'},SummonerHeal:{key:'7',name:'治疗术'}}});assert.match(html,/spell\/SummonerFlash\.png/);assert.match(html,/D · 闪现/);assert.doesNotMatch(html,/spell\/4\.png/);
});

test('empty and partial records preserve missing values and provide usable settings',()=>{
 const html=ongoingGameView({},data);assert.match(html,/等待客户端公开阵容/);assert.doesNotMatch(html,/undefined|NaN|Infinity/);
 for(const field of ['enabled','count','details','concurrency','source','tag','sort','usage','lobby','jungle','jungleAll','borders','autoRoute','streamer','threshold'])assert.ok(html.includes(`data-ongoing-field="${field}"`),field);
 assert.match(html,/data-disclosure-key="ongoing-settings"/);
 assert.match(html,/data-ongoing-tag="akari"/);
 const s=state();s.players.p1={};const missing=card(ongoingGameView(s,data));
 assert.match(missing,/历史胜率/);assert.match(missing,/>—<\/strong>/);assert.doesNotMatch(missing,/Akari 0|0%|NaN|undefined/);
 assert.match(missing,/没有可分析的有效历史样本/);
});

test('card actions preserve player, champion, position and match IDs while escaping names and notes',()=>{
 const s=state();s.roster.players[0].name='<script>name</script>';s.notes[s.roster.players[0].puuid]='<img src=x onerror=alert(1)>';const html=card(ongoingGameView(s,data));
 for(const action of ['ongoing-player-refresh','ongoing-history','ongoing-preview','ongoing-note'])assert.ok(html.includes(`data-action="${action}"`));
 assert.match(html,/data-player="p1" data-champion="22"/);assert.match(html,/data-player="p1" data-position="BOTTOM"/);assert.match(html,/data-player="p1" data-id="123"/);
 assert.match(html,/data-disclosure-context="ongoing-player:p1"/);assert.match(html,/data-disclosure-key="ongoing-analysis"/);
 assert.match(html,/流光翡翠 II · 34 LP/);assert.match(html,/&lt;script&gt;name&lt;\/script&gt;/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<script>|<img src=x/);
});

test('streamer mode masks identity and notes in visible text, titles, notices and previews',()=>{
 const s=state();const p=s.roster.players[0];s.settings.streamer=true;s.notes[p.puuid]='PRIVATE-NOTE';s.players.p1.error=`ERROR ${p.name}`;s.players.p1.notice=`NOTICE ${p.name}`;s.error=`GLOBAL ${p.name}`;
 s.players.p1.detailsError=`PRIVATE-DETAIL ${p.name}`;s.details={game:{id:9,queue:420,participants:[{...p,kills:1,deaths:2,assists:3}]},error:`PREVIEW ${p.name}`};
 const html=ongoingGameView(s,data);assert.doesNotMatch(html,/名字-p1|PRIVATE-NOTE|PRIVATE-DETAIL|GLOBAL|ERROR|NOTICE|PREVIEW/);assert.match(html,/玩家 1/);assert.match(html,/title="查看玩家战绩"/);assert.match(html,/主播模式已隐藏备注/);
});

test('hidden identities cannot render a stale profile, history, groups, met counts or notes',()=>{
 const p={...player(),hidden:true},s=state([p]);s.notes[p.puuid]='HIDDEN-NOTE';s.met[p.puuid]={count:42,ally:40,enemy:2};s.groups=[{players:[p.puuid,'other'],count:10,inferred:true}];s.players.p1.notice='STALE-NOTICE';
 const html=card(ongoingGameView(s,data));assert.match(html,/身份隐藏/);assert.doesNotMatch(html,/HIDDEN-NOTE|STALE-NOTICE|流光翡翠|data-id="123"|曾同局 42|历史共同对局 10/);assert.match(html,/data-action="ongoing-history"[^>]*disabled/);
});

test('parsed Riot role objects render Chinese assignment and autofill details without object coercion',()=>{
 const s=state(),p=s.roster.players[0];p.position='';p.role={current:'UTILITY',assignmentReason:'AUTOFILL',primary:'BOTTOM',secondary:'MIDDLE',fill:'TOP'};
 let html=card(ongoingGameView(s,data));for(const label of ['系统补位','主选 下路','副选 中路','补位信息','辅助'])assert.ok(html.includes(label),label);assert.doesNotMatch(html,/\[object Object\]|AUTOFILL|UNSELECTED/);assert.match(html,/data-position="UTILITY"/);
 p.role={current:'BOTTOM',assignmentReason:'FILL_SECONDARY',primary:'BOTTOM',secondary:'UTILITY',fill:'NONE'};html=card(ongoingGameView(s,data));assert.match(html,/副选补位/);assert.doesNotMatch(html,/补位信息/);
 p.role=null;html=card(ongoingGameView(s,data));assert.doesNotMatch(html,/系统补位|副选补位|ongoing-role-reason/);
 s.players.p1.page.player={privacy:'PRIVATE'};assert.equal(tag(ongoingGameView(s,data),'privacy'),true);
 s.players.p1.detailsLoading=true;s.players.p1.loadedDetails=2;html=card(ongoingGameView(s,data));assert.match(html,/aria-busy="true"/);assert.match(html,/正在读取详细样本 2 \/ 20/);
});

test('teams are retained, champ-select labels do not assume actual side, and arena overflow is contained',async()=>{
 const s=state([player('p1'),player('p2','TEAM-200')]);let html=ongoingGameView(s,data);
 assert.match(html,/data-ongoing-team="TEAM-100"/);assert.match(html,/data-ongoing-team="TEAM-200"/);assert.match(html,/我方队伍/);assert.match(html,/对方队伍/);assert.doesNotMatch(html,/<h2>蓝色方|<h2>红色方/);
 s.roster.phase='in-game';html=ongoingGameView(s,data);assert.match(html,/<h2>蓝色方/);assert.match(html,/<h2>红色方/);
 const arena=state(Array.from({length:16},(_,i)=>player(`arena${i}`,'TEAM-ALL')));arena.roster.mode='CHERRY';const rendered=ongoingGameView(arena,data);assert.equal((rendered.match(/<article class="ongoing-player-card/g)||[]).length,16);assert.match(rendered,/ongoing-team-scroll is-large/);
 const css=await readFile(new URL('../src/ongoing-game.css',import.meta.url),'utf8');assert.match(css,/\.ongoing-team-scroll\{[^}]*overflow-x:auto/);assert.match(css,/width:240px;flex:0 0 240px/);assert.doesNotMatch(css,/100vw|position:fixed/);
});

test('historical sample limits and nine-champion usage cap are respected',()=>{
 const s=state();s.settings={count:3,usage:'recent'};s.players.p1.page.games=Array.from({length:12},(_,i)=>game(i+1));s.players.p1.analysis.champions=Object.fromEntries(Array.from({length:14},(_,i)=>[i+1,{championId:i+1,winLoss:{all:{count:20-i,winRate:.5}},summary:{avgKda:2}}]));
 const html=card(ongoingGameView(s,data));assert.equal((html.match(/class="ongoing-history-row /g)||[]).length,3);assert.match(html,/已显示 3 \/ 上限 3/);
 const usage=html.match(/<section class="ongoing-usage">[\s\S]*?<\/section>/)[0];assert.equal((usage.match(/data-action="ongoing-history"/g)||[]).length,9);
 s.settings={usage:'mastery'};s.players.p1.profile.mastery=[{champion:99,level:60,points:123456},{champion:22,level:4,points:100}];const mastery=card(ongoingGameView(s,data));assert.match(mastery,/英雄成就/);assert.match(mastery,/成就 60 级 · 123,456 点/);assert.match(mastery,/ongoing-mastery-star/);
});

test('streak, gank, score and kill efficiency tags follow exact Akari boundaries',()=>{
 const s=state();s.settings.tags=['winning','losing','gank','performance','akari','killEfficiency'];const a=s.players.p1.analysis;
 a.winLoss.all.winningStreak=2;assert.equal(tag(ongoingGameView(s,data),'winning'),false);a.winLoss.all.winningStreak=3;assert.equal(tag(ongoingGameView(s,data),'winning'),true);
 a.winLoss.all.losingStreak=3;assert.equal(tag(ongoingGameView(s,data),'losing'),true);
 for(const [deaths,label] of [[.99,'历史难抓'],[1,null],[1.49,null],[1.5,'历史好抓'],[2,'历史好抓'],[2.01,'历史非常好抓']]){a.details={avgEarlyDeathsWithEnemyJunglerInvolved:deaths};const html=ongoingGameView(s,data);assert.equal(tag(html,'gank'),label!==null);if(label)assert.ok(card(html).includes(label));}
 s.roster.players[0].spells=[4,11];assert.equal(tag(ongoingGameView(s,data),'gank'),false);
 for(const [value,expected] of [[.65,false],[1.35,false],[.649,true],[1.351,true],[null,false]]){a.summary.avgKillDamageEfficiency=value;assert.equal(tag(ongoingGameView(s,data),'killEfficiency'),expected);}
 a.winLoss.all.count=15;a.winLoss.all.winRate=.9;assert.equal(tag(ongoingGameView(s,data),'performance'),false);a.winLoss.all.count=16;a.winLoss.all.winRate=.85;assert.equal(tag(ongoingGameView(s,data),'performance'),true);
 a.winLoss.all.winRate=.6;a.akariScore={total:6.5,maxScore:17,outstanding:true};a.count=4;assert.equal(tag(ongoingGameView(s,data),'performance'),false);a.count=5;assert.equal(tag(ongoingGameView(s,data),'performance'),true);
 a.akariScore=null;assert.equal(tag(ongoingGameView(s,data),'akari'),false);
});

test('historical relationships are labeled inference and respect the configured threshold',()=>{
 const p=player(),s=state();s.groups=[{players:[p.puuid,'other'],count:4,inferred:true}];let html=ongoingGameView(s,data);assert.equal(tag(html,'premade'),false);
 s.groups[0].count=5;html=ongoingGameView(s,data);assert.equal(tag(html,'premade'),true);assert.match(card(html),/历史共同对局 5\+/);assert.match(card(html),/不能证明预组队/);
});

test('aggregate panels render original spell, side, arena, champion and team analysis shapes',()=>{
 const a=analysis();a.winLoss.cherry={count:4,wins:3,losses:1,winRate:.75,top1Rate:.25,topHalfRate:.75,avgSubteamPlacement:3,top1s:1,topHalfFinishes:3};a.summary.avgSoloKills=null;
 const html=ongoingGameAnalysisView(a,data,{playerKey:'p1'});for(const text of ['详细历史分析','闪现 D 位','蓝色方','斗魂竞技场','第一率','英雄聚合','历史分路','场均单杀','未读取'])assert.ok(html.includes(text),text);assert.doesNotMatch(html,/NaN|undefined/);
 const team=ongoingTeamAnalysisView({games:40,avgWinRate:.6,avgKda:3.6,wins:24,losses:16,kills:200,deaths:100,assists:160,avgAkariScore:null,akariScoreCv:null,akariScoreBsi:null},{members:5,analyzed:2});assert.match(team,/2 \/ 5 人/);assert.match(team,/同一场对局可能重复计入/);assert.match(team,/未读取/);
});

test('historical jungle maps, early-gank labels and sample omissions do not invent tracking',()=>{
 const j={gamesAnalyzed:5,avgTopZonePercentage:.1,avgMidZonePercentage:.35,avgBotZonePercentage:.55,avgTopGanks:0,avgMidGanks:1,avgBotGanks:2,minutePositions:[{x:2000,y:3000,minute:1,lane:'bot'},{x:null,y:3}],gankPositions:[{x:5000,y:6000,lane:'mid'}],earlyGank:{level3GankRate:.4,level3GankCount:2,level4GankRate:.6,level4GankCount:3,byTeam:{blueGames:5,redGames:0,blueLevel3GankRate:.4,blueLevel4GankRate:.6}},firstClearCamp:{blueGames:5,redGames:0,blue:{blue:3,red:2},blueInvade:{},red:{},redInvade:{}}};
 const html=ongoingJungleView(j);assert.match(html,/历史偏中下/);assert.match(html,/历史 3 级抓/);assert.match(html,/历史 4 级抓/);assert.match(html,/历史活动热力/);assert.match(html,/ongoing-map-heat/);assert.match(html,/ongoing-map-position/);assert.match(html,/不能作为本局行踪或意图/);assert.match(html,/红色方：无样本/);assert.doesNotMatch(html,/NaN|undefined|实时位置/);
 assert.equal(ongoingJungleView(null),'');assert.equal(ongoingJungleView({...j,gamesAnalyzed:0}),'');
 assert.doesNotMatch(ongoingJungleView({...j,avgTopZonePercentage:null,avgMidZonePercentage:null,avgBotZonePercentage:null}),/<meter/);
 const s=state();s.roster.players[0].position='JUNGLE';s.players.p1.analysis.jungle=j;let page=card(ongoingGameView(s,data));assert.match(page,/当前英雄暂无打野样本/);
 s.settings.jungle=false;page=card(ongoingGameView(s,data));assert.doesNotMatch(page,/ongoing-jungle/);
});
