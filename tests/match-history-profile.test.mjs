import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePublicRanked,normalizePublicMastery,cleanPlayerChallenges,cleanPlayerProfile} from '../services/match-history-profile.mjs';
import {matchHistoryToolsView,privateHistoryState,privateHistoryFilterTab} from '../src/match-history-tools-view.mjs';
import {advancedHistoryFilters} from '../src/match-history-filters-view.mjs';
import {filterMatches} from '../src/core/match-history/model.mjs';

const secret='不得输出的账号';
const ranked={queueType:'RANKED_SOLO_5x5',tier:'EMERALD',division:'II',leaguePoints:58,wins:24,losses:18,highestTier:'DIAMOND',highestDivision:'III',previousSeasonEndTier:'PLATINUM',previousSeasonEndDivision:'I',previousSeasonHighestTier:'EMERALD',previousSeasonHighestDivision:'IV',previousSeasonAchievedTier:'EMERALD',previousSeasonAchievedDivision:'II',ratedRating:1234,ratedTier:'BLUE',isProvisional:true,provisionalGamesRemaining:3,provisionalGameThreshold:5,climbingIndicatorActive:false,currentSeasonWinsForRewards:24,previousSeasonWinsForRewards:41,miniSeriesProgress:'WLN',warnings:{credentials:secret},puuid:secret};
const mastery={championId:103,championLevel:12,championPoints:123456,championPointsSinceLastLevel:3200,championPointsUntilNextLevel:7800,tokensEarned:2,markRequiredForNextLevel:3,championSeasonMilestone:4,lastPlayTime:1792195200000,highestGrade:'S+',milestoneGrades:['S','A','S-'],nextSeasonMilestone:{bonus:true,requireGradeCounts:{S:2,A:1,private:secret},rewardMarks:2,rewardConfig:{maximumReward:1,rewardValue:'CHEST',private:secret},private:secret},puuid:secret};
const data={champions:[{id:'Ahri',key:'103',name:'阿狸',title:'九尾妖狐',icon:'https://example.invalid/Ahri.png'},{id:'Garen',key:'86',name:'盖伦',title:'德玛西亚之力',icon:'https://example.invalid/Garen.png'}]};

test('public ranked whitelist retains current, peak and prior divisions, rated and provisional data',()=>{
 const [value]=normalizePublicRanked({queues:[ranked],puuid:secret});
 assert.deepEqual(value,{queue:'RANKED_SOLO_5x5',tier:'EMERALD',division:'II',lp:58,wins:24,losses:18,peak:'DIAMOND',peakDivision:'III',previousTier:'PLATINUM',previousDivision:'I',previousPeak:'EMERALD',previousPeakDivision:'IV',previousAchievedTier:'EMERALD',previousAchievedDivision:'II',rating:1234,ratedTier:'BLUE',provisional:true,provisionalRemaining:3,provisionalThreshold:5,climbing:false,rewardWins:24,previousRewardWins:41,miniSeries:'WLN'});
 assert.ok(!JSON.stringify(value).includes(secret));
 assert.equal(normalizePublicRanked({queueMap:{RANKED_FLEX_SR:{tier:'GOLD',division:'IV'}}})[0].queue,'RANKED_FLEX_SR');
 assert.deepEqual(normalizePublicRanked(null),[]);
 const [unknown]=normalizePublicRanked({queues:[{queueType:secret,tier:secret,division:secret,leaguePoints:'50',wins:-1,losses:Infinity,isProvisional:'false',miniSeriesProgress:secret}]});
 assert.equal(unknown.queue,'');assert.equal(unknown.tier,'');assert.equal(unknown.division,'');assert.equal(unknown.lp,null);assert.equal(unknown.wins,null);assert.equal(unknown.losses,null);assert.equal(unknown.provisional,null);assert.equal(unknown.miniSeries,'');
 assert.equal(normalizePublicRanked({queues:Array.from({length:30},()=>ranked)}).length,12);
});

test('mastery normalization includes all public progress, grade, milestone and aggregate fields only',()=>{
 const value=normalizePublicMastery({score:19,masteries:[mastery,{championId:86,championLevel:7,championPoints:50000}],puuid:secret,summonerId:secret});
 assert.deepEqual(value.masteryTotals,{score:19,champions:2,points:173456,levels:19});
 assert.deepEqual(value.mastery[0],{champion:103,level:12,points:123456,sinceLastLevel:3200,untilNextLevel:7800,tokens:2,marksRequired:3,milestone:4,lastPlay:1792195200000,grade:'S+',milestoneGrades:['S','A','S-'],nextMilestone:{bonus:true,rewardMarks:2,requireGrades:{S:2,A:1},reward:{maximum:1,value:'CHEST'}}});
 assert.ok(!JSON.stringify(value).includes(secret));
 assert.equal(value.mastery[1].untilNextLevel,null);assert.equal(value.mastery[1].lastPlay,null);assert.equal(value.mastery[1].grade,'');assert.equal(value.mastery[1].nextMilestone,null);
 assert.equal(normalizePublicMastery([mastery]).masteryTotals.score,12);
 assert.deepEqual(normalizePublicMastery(null).masteryTotals,{score:null,champions:null,points:null,levels:null});
 assert.deepEqual(normalizePublicMastery([]).masteryTotals,{score:0,champions:0,points:0,levels:0});
 const incomplete=normalizePublicMastery([mastery,{championId:86,championLevel:undefined,championPoints:null},{championId:-1,puuid:secret}]);
 assert.equal(incomplete.mastery.length,2);assert.equal(incomplete.masteryTotals.points,null);assert.equal(incomplete.masteryTotals.levels,null);assert.equal(incomplete.masteryTotals.champions,null);
 const bounded=normalizePublicMastery(Array.from({length:301},(_,index)=>({...mastery,championId:index+1})));
 assert.equal(bounded.mastery.length,300);assert.equal(bounded.masteryTotals.points,null);
 assert.equal(normalizePublicMastery([{...mastery,highestGrade:secret,milestoneGrades:[secret],championPointsSinceLastLevel:'200',championPointsUntilNextLevel:-2}]).mastery[0].grade,'');
});

test('cosmetic profile excludes credentials, account identity and arbitrary nested data',()=>{
 assert.deepEqual(cleanPlayerProfile({backgroundSkinId:103000,backgroundSkinAugments:'',regalia:'RANKED_SOLO_5x5',puuid:secret,credentials:secret,internalName:secret}),{backgroundSkin:103000,backgroundSkinAugments:'',regalia:'RANKED_SOLO_5x5'});
 assert.deepEqual(cleanPlayerProfile(null),{backgroundSkin:null,backgroundSkinAugments:'',regalia:''});
});

test('challenge assets use the six exact Akari IDs with explicit unknowns and retain the full challenge table',()=>{
 const ids=[505001,510001,510011,504003,504002,504004];
 const playerChallenges=ids.map((id,index)=>({id,currentValue:index*10,currentLevel:'GOLD',currentThreshold:20,nextLevel:'PLATINUM',nextThreshold:50,percentile:.125,category:'COLLECTION',currentLevelAchievedTime:1792195200000,initValue:1,legacy:false,position:13,playersInLevel:500,friendsAtLevels:[{friends:[secret]}],puuid:secret}));
 playerChallenges.push({id:999001,currentValue:999,category:'EXPERTISE',currentLevel:'DIAMOND'});
 const value=cleanPlayerChallenges({playerChallenges,totalPoints:{level:'GOLD',current:100,max:200,percentile:.5,puuid:secret},categoryPoints:{COLLECTION:{level:'GOLD',current:20,max:30},[secret]:{current:100}},preferences:{title:'123',challengeIds:[505001,510001,504003,504004],secret},puuid:secret});
 assert.deepEqual(value.assets,ids.map((id,index)=>({id,key:['champions','championSkins','chromaSkins','wardSkins','summonerIcons','emotes'][index],label:['英雄','皮肤','炫彩皮肤','守卫皮肤','召唤师图标','表情'][index],total:index*10})));
 assert.equal(value.challenges.length,7);assert.equal(value.challenges.at(-1).id,999001);assert.deepEqual(value.selected,[505001,510001,504003]);
 assert.deepEqual(value.challenges[0],{id:505001,category:'COLLECTION',level:'GOLD',current:0,threshold:20,next:'PLATINUM',nextThreshold:50,percentile:.125,achieved:1792195200000,initial:1,legacy:false,position:13,playersInLevel:500});
 assert.ok(!JSON.stringify(value).includes(secret));assert.deepEqual(Object.keys(value.categories),['COLLECTION']);
 const absent=cleanPlayerChallenges({playerChallenges:[{id:505002,currentValue:800},{id:510002,currentValue:900},{id:510001,currentValue:'80'},{id:504003,currentValue:-1}]});
 assert.ok(absent.assets.every(asset=>asset.total===null));
 assert.ok(cleanPlayerChallenges(null).assets.every(asset=>asset.total===null));
 assert.equal(cleanPlayerChallenges({playerChallenges:[{id:1,percentile:12.5}]}).challenges[0].percentile,null);
 assert.equal(cleanPlayerChallenges({playerChallenges:Array.from({length:1001},(_,index)=>({id:index+1,currentValue:0}))}).challenges.length,1000);
});

test('tools render Chinese ranked peaks, searchable champion portraits, progress, totals and privacy',()=>{
 const tab={filter:{},page:{player:{privacy:'PRIVATE'}},profile:{ranked:normalizePublicRanked({queues:[ranked]}),...normalizePublicMastery({score:19,masteries:[mastery,{championId:86,championLevel:7,championPoints:50000}]})}};
 const html=matchHistoryToolsView(tab,{data,masteryQuery:'九尾'});
 for(const text of ['单双排','翡翠 II','钻石 III','铂金 I','翡翠 IV','总分 19','173,456','阿狸','Ahri.png','本级已获 3,200 点','距下一级 7,800 点','2 枚代币','赛季里程碑 4','S+','2026','私密（PRIVATE）','部分战绩或资料可能受限','显示 1 / 2'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/盖伦/);assert.match(html,/data-history-tool="mastery-query"/);
 assert.match(matchHistoryToolsView({...tab,page:{player:{privacy:'PUBLIC'}}}),/公开（PUBLIC）/);
 assert.match(matchHistoryToolsView(tab,{data,masteryQuery:'86'}),/盖伦/);
 assert.match(matchHistoryToolsView(tab,{data,masteryQuery:'ahri'}),/显示 1 \/ 2/);
 assert.match(matchHistoryToolsView(tab,{data,masteryQuery:'没有的英雄'}),/没有匹配的英雄/);
 for(const action of ['history-collect-filtered','history-analysis-details','history-challenges','history-note-save','history-copy-id'])assert.ok(html.includes(action));
 assert.doesNotMatch(matchHistoryToolsView(tab,{data,masteryQuery:'"><script>bad</script>',note:'<script>bad</script>'}),/<script>/);
});

test('challenge view labels exact assets, retains other rows and describes percentage fractions correctly',()=>{
 const challenges=cleanPlayerChallenges({playerChallenges:[{id:505001,currentValue:170,percentile:.125},{id:999001,currentValue:42,percentile:0},{id:999002,currentValue:0,percentile:1}]});
 const html=matchHistoryToolsView({filter:{},challenges});
 for(const value of ['英雄','皮肤','炫彩皮肤','守卫皮肤','召唤师图标','表情','999,001','12.50%','0.00%','100.00%','达到该挑战等级的玩家比例','0–1','官方字段说明','未读取'])assert.ok(html.includes(value),value);
 assert.doesNotMatch(html,/1250\.00%|NaN|Infinity/);
});

test('private history masks identity rules and nested JSON, all errors/notices and notes without mutating queries',()=>{
 const name=secret+'#1234',player={puuid:'mock-public-player-1234',name,privacy:'PUBLIC'},other={puuid:'mock-public-player-5678',name:'队友原名#5678'};
 const game={id:1,self:player,participants:[player,other]},tree={type:'scope',scope:'named',player:name,child:{type:'and',children:[{field:'player',operator:'=',value:player.puuid},{field:'kills',operator:'>=',value:0}]}};
 player.kills=5;
 const state={streamer:true,query:name,error:name,notice:name,searchResults:[player],tabs:[{id:1,masteryQuery:name,error:name,analysisError:name,challengesError:name,notice:name,filter:{advanced:{mode:'all',rules:[{field:'player',operator:'=',value:name}],tree}},options:{query:name,puuid:player.puuid},note:name,page:{player,games:[game],notice:name},profile:{notice:name},details:{1:{game,error:name,notice:name,replay:{state:name}}}}]};
 const original=JSON.stringify(state),safe=privateHistoryState(state);
 assert.doesNotMatch(JSON.stringify(safe),new RegExp(secret+'|队友原名'));
 assert.equal(JSON.stringify(state),original);assert.equal(state.tabs[0].filter.advanced.tree.player,name);
 assert.equal(safe.tabs[0].filter.advanced.tree.player,safe.tabs[0].page.player.name);
 assert.equal(safe.tabs[0].filter.advanced.tree.child.children[0].value,safe.tabs[0].page.player.name);
 assert.equal(filterMatches([game],state.tabs[0].filter).length,1);assert.equal(filterMatches(safe.tabs[0].page.games,safe.tabs[0].filter).length,1);
 const controls=privateHistoryFilterTab(safe.tabs[0]),advanced=advancedHistoryFilters(controls),tools=matchHistoryToolsView(safe.tabs[0],{streamer:true,note:name,masteryQuery:name,data});
 for(const html of [advanced,tools])assert.doesNotMatch(html,new RegExp(secret+'|队友原名|mock-public-player-1234'));
 assert.match(advanced,/data-history-tool="filter-tree"/);assert.match(advanced,/玩家 1/);assert.match(tools,/data-history-tool="note"[^>]*value="" disabled/);
 assert.equal(safe.tabs[0].page.player.puuid,player.puuid);assert.equal(controls.page.player.puuid,'');
 assert.equal(privateHistoryState({...state,streamer:false}).tabs,state.tabs);
});

test('private state masks filter-only identities and leaves their source trees unchanged',()=>{
 const tree={type:'scope',scope:'enemy',player:secret,child:{field:'player',operator:'=',value:'未加载玩家#0101'}};
 const state={streamer:true,tabs:[{filter:{advanced:{rules:[],tree}},filterPresets:[{name:'另一个未加载玩家#2222',filter:{advanced:{tree:{field:'player',operator:'=',value:'预设玩家#3333'},rules:[]}}}],page:null,details:{}}]};
 const safe=privateHistoryState(state),html=advancedHistoryFilters(safe.tabs[0]);
 assert.doesNotMatch(html,new RegExp(secret+'|未加载玩家|预设玩家'));assert.doesNotMatch(JSON.stringify(safe),new RegExp(secret+'|未加载玩家|预设玩家'));
 assert.equal(tree.player,secret);assert.equal(tree.child.value,'未加载玩家#0101');
});
