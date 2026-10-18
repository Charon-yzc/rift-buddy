import {number,text} from '../src/core/match-history/model.mjs';

// Public fields adapted from League Akari 60f1584c (MIT): ranked.ts,
// champion-mastery.ts, challenges-client.ts and player-tab/constants.ts.
const TIERS=new Set(['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER','UNRANKED','NONE','NA']);
const CATEGORIES=['COLLECTION','IMAGINATION','EXPERTISE','TEAMWORK','VETERANCY','LEGACY','NONE'];
const GRADES=new Set(['S+','S','S-','A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-']);
const QUEUES=new Set(['RANKED_SOLO_5x5','RANKED_FLEX_SR','RANKED_TEAM_5x5','RANKED_TEAM_3x3','RANKED_FLEX_TT','RANKED_TFT','RANKED_TFT_DOUBLE_UP','RANKED_TFT_PAIRS','RANKED_TFT_TURBO','RANKED_CHERRY','CHERRY']);
const ASSETS=[
 [505001,'champions','英雄'],[510001,'championSkins','皮肤'],[510011,'chromaSkins','炫彩皮肤'],
 [504003,'wardSkins','守卫皮肤'],[504002,'summonerIcons','召唤师图标'],[504004,'emotes','表情']
];
const tier=value=>TIERS.has(value)?value:'';
const division=value=>['I','II','III','IV','V','NA'].includes(value)?value:'';
const grade=value=>GRADES.has(value)?value:'';
const positiveId=value=>Number.isSafeInteger(value)&&value>0?value:null;
const boolean=value=>typeof value==='boolean'?value:null;
const fraction=value=>number(value)!==null&&value<=1?value:null;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const sum=(values,available)=>available&&values.every(value=>value!==null)?number(values.reduce((total,value)=>total+value,0)):null;

export function normalizePublicRanked(raw){
 const entries=Array.isArray(raw?.queues)?raw.queues:object(raw?.queueMap)?Object.entries(raw.queueMap).map(([queue,value])=>({...value,queueType:value?.queueType||queue})):[];
 return entries.slice(0,12).filter(object).map(q=>({
  queue:QUEUES.has(q.queueType)?q.queueType:'',tier:tier(q.tier),division:division(q.division),lp:number(q.leaguePoints),wins:number(q.wins),losses:number(q.losses),
  peak:tier(q.highestTier),peakDivision:division(q.highestDivision),previousTier:tier(q.previousSeasonEndTier),previousDivision:division(q.previousSeasonEndDivision),
  previousPeak:tier(q.previousSeasonHighestTier),previousPeakDivision:division(q.previousSeasonHighestDivision),previousAchievedTier:tier(q.previousSeasonAchievedTier),previousAchievedDivision:division(q.previousSeasonAchievedDivision),
  rating:number(q.ratedRating),ratedTier:['NONE','GRAY','GREEN','BLUE','PURPLE','ORANGE'].includes(q.ratedTier)?q.ratedTier:'',provisional:boolean(q.isProvisional),provisionalRemaining:number(q.provisionalGamesRemaining),provisionalThreshold:number(q.provisionalGameThreshold),
  climbing:boolean(q.climbingIndicatorActive),rewardWins:number(q.currentSeasonWinsForRewards),previousRewardWins:number(q.previousSeasonWinsForRewards),miniSeries:typeof q.miniSeriesProgress==='string'&&/^[WLN-]{0,10}$/.test(q.miniSeriesProgress)?q.miniSeriesProgress:''
 }));
}

// Spread the result into a public profile: {ranked, ...normalizePublicMastery(raw)}.
// Riot defines mastery score as the sum of individual champion mastery levels:
// https://developer.riotgames.com/apis#champion-mastery-v4/GET_getChampionMasteryScoreByPUUID
// A returned score is authoritative; derived totals require every row.
export function normalizePublicMastery(raw){
 const source=Array.isArray(raw)?raw:Array.isArray(raw?.masteries)?raw.masteries:null;
 const mastery=(source||[]).slice(0,300).filter(m=>object(m)&&positiveId(m.championId)!==null).map(m=>({
  champion:positiveId(m.championId),level:number(m.championLevel),points:number(m.championPoints),sinceLastLevel:number(m.championPointsSinceLastLevel),untilNextLevel:number(m.championPointsUntilNextLevel),
  tokens:number(m.tokensEarned),marksRequired:number(m.markRequiredForNextLevel),milestone:number(m.championSeasonMilestone),lastPlay:number(m.lastPlayTime),grade:grade(m.highestGrade),
  milestoneGrades:(Array.isArray(m.milestoneGrades)?m.milestoneGrades:[]).slice(0,20).map(grade).filter(Boolean),
  nextMilestone:object(m.nextSeasonMilestone)?{
   bonus:boolean(m.nextSeasonMilestone.bonus),rewardMarks:number(m.nextSeasonMilestone.rewardMarks),
   requireGrades:Object.fromEntries([...GRADES].filter(key=>Object.hasOwn(m.nextSeasonMilestone.requireGradeCounts||{},key)).map(key=>[key,number(m.nextSeasonMilestone.requireGradeCounts[key])])),
   reward:object(m.nextSeasonMilestone.rewardConfig)?{maximum:number(m.nextSeasonMilestone.rewardConfig.maximumReward),value:text(m.nextSeasonMilestone.rewardConfig.rewardValue)}:null
  }:null
 }));
 const complete=!!source&&source.length<=300&&mastery.length===source.length;
 const levels=sum(mastery.map(m=>m.level),complete);
 return {mastery,masteryTotals:{score:number(raw?.score)??levels,champions:complete?mastery.length:null,points:sum(mastery.map(m=>m.points),complete),levels}};
}

export function cleanPlayerChallenges(raw){
 const points=value=>object(value)?{level:tier(value.level),current:number(value.current),max:number(value.max),percentile:fraction(value.percentile)}:null;
 const challenges=(Array.isArray(raw?.playerChallenges)?raw.playerChallenges:[]).slice(0,1000).filter(value=>object(value)&&positiveId(value.id)!==null).map(value=>({
  id:positiveId(value.id),category:CATEGORIES.includes(value.category)?value.category:'',level:tier(value.currentLevel),current:number(value.currentValue),threshold:number(value.currentThreshold),next:tier(value.nextLevel),nextThreshold:number(value.nextThreshold),percentile:fraction(value.percentile),achieved:number(value.currentLevelAchievedTime),initial:number(value.initValue),legacy:boolean(value.legacy),position:number(value.position),playersInLevel:number(value.playersInLevel)
 }));
 return {
  total:points(raw?.totalPoints),categories:Object.fromEntries(CATEGORIES.filter(key=>Object.hasOwn(raw?.categoryPoints||{},key)).map(key=>[key,points(raw.categoryPoints[key])])),
  challenges,assets:ASSETS.map(([id,key,label])=>({id,key,label,total:challenges.find(value=>value.id===id)?.current??null})),
  title:text(raw?.preferences?.title),selected:(Array.isArray(raw?.preferences?.challengeIds)?raw.preferences.challengeIds:[]).slice(0,3).map(positiveId).filter(v=>v!==null)
 };
}
export function cleanPlayerProfile(raw){return {backgroundSkin:number(raw?.backgroundSkinId),backgroundSkinAugments:text(raw?.backgroundSkinAugments),regalia:text(raw?.regalia)};}
